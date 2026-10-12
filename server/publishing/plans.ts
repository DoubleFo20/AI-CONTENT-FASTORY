import { createHash } from 'node:crypto';
import { z } from 'zod';

/** Preparation only. No credentials, HTTP, persistence, queue or external mutations.
 * Approval evidence must come from a trusted Owner approval store, never request JSON. */
export const PUBLISHING_DOCUMENTATION_DATE = '2026-10-12';
export const PUBLISHING_SOURCES = {
  youtubeInsert: 'https://developers.google.com/youtube/v3/docs/videos/insert',
  youtubeResource: 'https://developers.google.com/youtube/v3/docs/videos',
  youtubeResumable: 'https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol',
  youtubeStatus: 'https://developers.google.com/youtube/v3/docs/videos/list',
  youtubeQuota: 'https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits',
  facebookVideo: 'https://developers.facebook.com/docs/graph-api/reference/page/videos/',
  facebookPublishing: 'https://developers.facebook.com/docs/video-api/guides/publishing/',
  facebookVersions: 'https://developers.facebook.com/docs/graph-api/changelog/',
} as const;

const Text = z.string().trim().min(1).max(5000).refine(value => [...value].every(character =>
  character.charCodeAt(0) >= 32 || [9, 10, 13].includes(character.charCodeAt(0))));
const Captions = z.strictObject({ th: Text, en: Text });
const VideoTitle = Text.refine(value => [...value].length <= 100 && !/[<>]/u.test(value));
const Timestamp = z.iso.datetime({ offset: true });
const Fingerprint = z.string().regex(/^[a-f0-9]{64}$/u);
const common = {
  draftId: z.uuid(), revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  // An opaque internal destination reference, not a Page/profile/channel ID or token.
  destinationRef: z.uuid(), mediaSha256: Fingerprint, captions: Captions,
  selectedLocale: z.enum(['th', 'en']), scheduledAt: Timestamp.optional(),
};
export const PublishingPreparationInputSchema = z.discriminatedUnion('platform', [
  z.strictObject({ ...common, platform: z.literal('facebook_page'), visibility: z.literal('unpublished') }),
  z.strictObject({ ...common, platform: z.literal('youtube'), visibility: z.literal('private'),
    neverPublished: z.literal(true), titles: z.strictObject({ th: VideoTitle, en: VideoTitle }),
    categoryId: z.string().regex(/^[1-9][0-9]{0,9}$/u),
    selfDeclaredMadeForKids: z.boolean(), containsSyntheticMedia: z.boolean(),
  }).refine(value => [value.captions.th, value.captions.en].every(text =>
    Buffer.byteLength(text, 'utf8') <= 5000 && !/[<>]/u.test(text))),
]);
export type PublishingPreparationInput = z.infer<typeof PublishingPreparationInputSchema>;

const ApprovalSchema = z.strictObject({
  planDigest: Fingerprint, platform: z.enum(['facebook_page', 'youtube']),
  action: z.enum(['private_upload', 'scheduled_publication']),
  approvedAt: Timestamp, expiresAt: Timestamp,
  firstPublicationApproved: z.boolean(),
});
export type PublishingApprovalEvidence = z.infer<typeof ApprovalSchema>;
export type PublishingPlanErrorCode = 'PUBLISHING_INVALID_INPUT' | 'PUBLISHING_OWNER_APPROVAL_REQUIRED' |
  'PUBLISHING_SCHEDULE_INVALID' | 'PUBLISHING_PLATFORM_RULES_UNVERIFIED';
export class PublishingPlanError extends Error {
  constructor(public readonly code: PublishingPlanErrorCode) { super(code); this.name = 'PublishingPlanError'; }
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new PublishingPlanError('PUBLISHING_INVALID_INPUT');
  return parsed.data;
}
function checkedNow(now: number): void {
  if (!Number.isSafeInteger(now) || now < 0 || !Number.isFinite(new Date(now).getTime())) {
    throw new PublishingPlanError('PUBLISHING_INVALID_INPUT');
  }
}

/** Binds approval to the normalized content, media, destination, revision and exact time.
 * This digest is not authentication, an idempotency record or evidence of Owner consent. */
export function publishingPlanDigest(input: unknown): string {
  const value = parse(PublishingPreparationInputSchema, input);
  const canonical = { ...value, scheduledAt: value.scheduledAt ? new Date(value.scheduledAt).toISOString() : null };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function checkedApproval(input: PublishingPreparationInput, now: number, evidence: unknown): boolean {
  if (evidence === undefined) return false;
  const approval = parse(ApprovalSchema, evidence);
  const scheduled = input.scheduledAt !== undefined;
  if (approval.planDigest !== publishingPlanDigest(input) || approval.platform !== input.platform ||
      approval.action !== (scheduled ? 'scheduled_publication' : 'private_upload') ||
      Date.parse(approval.approvedAt) > now || Date.parse(approval.expiresAt) <= now ||
      Date.parse(approval.expiresAt) <= Date.parse(approval.approvedAt) ||
      (scheduled && (!approval.firstPublicationApproved || Date.parse(approval.expiresAt) <= Date.parse(input.scheduledAt!)))) {
    throw new PublishingPlanError('PUBLISHING_OWNER_APPROVAL_REQUIRED');
  }
  return true;
}

export function preparePublishingPlan(rawInput: unknown, now: number, trustedApproval?: unknown) {
  checkedNow(now);
  const input = parse(PublishingPreparationInputSchema, rawInput);
  if (input.scheduledAt !== undefined) {
    // Require a whole future second; never let a past publishAt become immediate publication.
    const scheduled = Date.parse(input.scheduledAt);
    if (scheduled <= now || scheduled % 1000 !== 0) throw new PublishingPlanError('PUBLISHING_SCHEDULE_INVALID');
    // Meta docs were inaccessible (429); no invented 10-minute/30-day/version policy.
    if (input.platform === 'facebook_page') throw new PublishingPlanError('PUBLISHING_PLATFORM_RULES_UNVERIFIED');
  }
  const approved = checkedApproval(input, now, trustedApproval);
  if (input.scheduledAt && !approved) throw new PublishingPlanError('PUBLISHING_OWNER_APPROVAL_REQUIRED');
  const base = {
    status: 'PREPARED' as const, executionAllowed: false as const, uploadStatus: 'NOT_STARTED' as const,
    platform: input.platform, planDigest: publishingPlanDigest(input),
    captions: input.captions, selectedLocale: input.selectedLocale,
    schedule: input.scheduledAt ? { publishAt: new Date(input.scheduledAt).toISOString(), timezone: 'UTC' as const } : null,
    approvalGate: {
      externalWrite: approved ? 'SCOPED_APPROVAL_RECORDED' as const : 'OWNER_APPROVAL_REQUIRED' as const,
      firstPublication: approved && input.scheduledAt ? 'SCOPED_APPROVAL_RECORDED' as const : 'OWNER_APPROVAL_REQUIRED' as const,
      activation: 'BLOCKED_PREPARATION_ONLY' as const,
    },
    blockers: ['ROOT_ARCHITECTURE_ACCEPTANCE_REQUIRED', 'CREDENTIALS_UNKNOWN', 'DESTINATION_OWNERSHIP_AND_SCOPES_UNKNOWN',
      'ACCOUNT_REVIEW_AND_POLICY_ELIGIBILITY_UNKNOWN', 'QUOTA_UNKNOWN', 'VERIFIED_MEDIA_REQUIRED',
      'DURABLE_APPROVAL_AND_IDEMPOTENCY_REQUIRED', 'RESUMABLE_TRACKING_NOT_IMPLEMENTED'],
    automaticRetry: false as const,
    documentationCheckedOn: PUBLISHING_DOCUMENTATION_DATE,
  };
  if (input.platform === 'facebook_page') return {
    ...base, blockers: [...base.blockers, 'META_OFFICIAL_DOCUMENTATION_UNVERIFIED'],
    api: {
      version: null, endpoint: null, method: null, requiredScopes: [], allowedRequestFields: [], request: null,
      // Reference candidates only; not an accepted API contract until current official docs are read.
      referenceOnly: { endpointTemplate: 'https://graph.facebook.com/{verified-version}/{page-id}/videos',
        scopesToVerify: ['pages_manage_posts', 'pages_read_engagement', 'pages_show_list'],
        fieldsToVerify: ['description', 'title', 'published', 'scheduled_publish_time', 'upload_phase'] },
      sources: [PUBLISHING_SOURCES.facebookVideo, PUBLISHING_SOURCES.facebookPublishing, PUBLISHING_SOURCES.facebookVersions],
    },
  };
  const secondaryLocale = input.selectedLocale === 'th' ? 'en' : 'th';
  return {
    ...base,
    api: {
      version: 'v3', method: 'POST', endpoint: 'https://www.googleapis.com/upload/youtube/v3/videos',
      requiredScopes: ['https://www.googleapis.com/auth/youtube.upload'],
      // Future owner-authorized status polling requires a separately verified read scope.
      statusRead: { method: 'GET', endpoint: 'https://www.googleapis.com/youtube/v3/videos',
        queryFields: ['part', 'id'], parts: ['status', 'processingDetails'],
        scopeToVerify: 'https://www.googleapis.com/auth/youtube.readonly' },
      allowedRequestFields: ['part', 'uploadType', 'notifySubscribers', 'snippet.title', 'snippet.description',
        'snippet.categoryId', 'snippet.defaultLanguage', 'localizations.th.title', 'localizations.th.description',
        'localizations.en.title', 'localizations.en.description', 'status.privacyStatus', 'status.publishAt',
        'status.selfDeclaredMadeForKids', 'status.containsSyntheticMedia'],
      request: {
        query: { part: 'snippet,status,localizations', uploadType: 'resumable', notifySubscribers: false },
        body: {
          snippet: { title: input.titles[input.selectedLocale], description: input.captions[input.selectedLocale],
            categoryId: input.categoryId, defaultLanguage: input.selectedLocale },
          localizations: { [secondaryLocale]: { title: input.titles[secondaryLocale], description: input.captions[secondaryLocale] } },
          status: { privacyStatus: 'private', selfDeclaredMadeForKids: input.selfDeclaredMadeForKids,
            containsSyntheticMedia: input.containsSyntheticMedia,
            ...(input.scheduledAt ? { publishAt: new Date(input.scheduledAt).toISOString() } : {}) },
        },
      },
      sources: [PUBLISHING_SOURCES.youtubeInsert, PUBLISHING_SOURCES.youtubeResource,
        PUBLISHING_SOURCES.youtubeResumable, PUBLISHING_SOURCES.youtubeStatus, PUBLISHING_SOURCES.youtubeQuota],
    },
  };
}

const ObservationSchema = z.enum(['not_started', 'uploading', 'processing', 'private_ready', 'scheduled', 'published',
  'ambiguous', 'rejected', 'quota_exhausted', 'authorization_required', 'failed_confirmed']);
/** Recovery guidance only, not upstream status validation or a job state transition.
 * Never create a new upload after an ambiguous result; reconcile the durable session first. */
export function preparePublishingRecovery(rawObservation: unknown) {
  const observation = parse(ObservationSchema, rawObservation);
  const actions = {
    not_started: 'REQUIRES_ACTIVATION_AND_OWNER_APPROVAL', uploading: 'CHECK_EXISTING_RESUMABLE_SESSION',
    processing: 'CHECK_OWNER_AUTHORIZED_VIDEO_STATUS', private_ready: 'REQUIRES_FIRST_PUBLICATION_APPROVAL',
    scheduled: 'VERIFY_EXISTING_SCHEDULE', published: 'VERIFY_EXISTING_PUBLICATION_NO_REUPLOAD',
    ambiguous: 'RECONCILE_EXISTING_SESSION_OR_REMOTE_ID_NO_REUPLOAD', rejected: 'OWNER_REVIEW_REQUIRED',
    quota_exhausted: 'STOP_FOR_QUOTA', authorization_required: 'OWNER_REAUTHORIZATION_REQUIRED',
    failed_confirmed: 'OWNER_APPROVED_RECOVERY_REQUIRED',
  } as const;
  return { observation, nextAction: actions[observation], automaticRetry: false as const, executionAllowed: false as const };
}
