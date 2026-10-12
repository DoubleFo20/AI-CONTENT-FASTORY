import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PublishingPlanError, publishingPlanDigest, preparePublishingPlan, preparePublishingRecovery,
  type PublishingPreparationInput, type PublishingApprovalEvidence,
} from '../server/publishing/plans.js';

const now = Date.parse('2026-10-12T09:00:00+07:00');
const future = '2026-10-12T10:00:00+07:00';
const youtube = (): PublishingPreparationInput => ({
  platform: 'youtube', draftId: '00000000-0000-4000-8000-000000000001', revision: 1,
  destinationRef: '00000000-0000-4000-8000-000000000002', mediaSha256: 'a'.repeat(64),
  captions: { th: 'เรื่องสั้นภาษาไทย', en: 'A short story' }, selectedLocale: 'th', visibility: 'private',
  neverPublished: true, titles: { th: 'เรื่องสั้น', en: 'Short story' }, categoryId: '22',
  selfDeclaredMadeForKids: false, containsSyntheticMedia: true,
});
const facebook = (): PublishingPreparationInput => {
  const { draftId, revision, destinationRef, mediaSha256, captions, selectedLocale } = youtube();
  return { platform: 'facebook_page', draftId, revision, destinationRef, mediaSha256, captions, selectedLocale, visibility: 'unpublished' };
};
const errorIs = (code: string) => (error: unknown) => error instanceof PublishingPlanError && error.code === code && error.message === code;
function approval(input: PublishingPreparationInput): PublishingApprovalEvidence {
  return { planDigest: publishingPlanDigest(input), platform: input.platform,
    action: input.scheduledAt ? 'scheduled_publication' : 'private_upload',
    approvedAt: '2026-10-12T08:59:00+07:00', expiresAt: '2026-10-12T11:00:00+07:00', firstPublicationApproved: true };
}

test('YouTube preparation explicitly sets private visibility and preserves TH/EN metadata', () => {
  const input = youtube(); const plan = preparePublishingPlan(input, now);
  assert.equal(plan.status, 'PREPARED'); assert.equal(plan.executionAllowed, false);
  assert.equal(plan.uploadStatus, 'NOT_STARTED'); assert.equal(plan.api.version, 'v3');
  assert.equal(plan.api.endpoint, 'https://www.googleapis.com/upload/youtube/v3/videos');
  assert.deepEqual(plan.api.requiredScopes, ['https://www.googleapis.com/auth/youtube.upload']);
  assert.ok(plan.api.request);
  assert.equal(plan.api.request.body.status.privacyStatus, 'private');
  assert.equal(plan.api.request.body.snippet.description, input.captions.th);
  assert.equal(plan.api.request.body.localizations.en.description, input.captions.en);
  assert.equal(plan.api.request.query.uploadType, 'resumable');
  assert.equal(plan.api.request.query.notifySubscribers, false);
  assert.equal('publishAt' in plan.api.request.body.status, false);
  assert.equal(plan.approvalGate.externalWrite, 'OWNER_APPROVAL_REQUIRED');
  assert.equal(plan.approvalGate.firstPublication, 'OWNER_APPROVAL_REQUIRED');
});

test('English default uses Thai localization without guessing audience or synthetic-media disclosure', () => {
  const plan = preparePublishingPlan({ ...youtube(), selectedLocale: 'en', selfDeclaredMadeForKids: true, containsSyntheticMedia: false }, now);
  assert.ok(plan.api.request);
  assert.equal(plan.api.request.body.snippet.defaultLanguage, 'en');
  assert.equal(plan.api.request.body.localizations.th.title, 'เรื่องสั้น');
  assert.equal(plan.api.request.body.status.selfDeclaredMadeForKids, true);
  assert.equal(plan.api.request.body.status.containsSyntheticMedia, false);
});

test('Facebook keeps an unpublished local draft with no verified API request or version', () => {
  const plan = preparePublishingPlan(facebook(), now);
  assert.equal(plan.api.version, null); assert.equal(plan.api.endpoint, null); assert.equal(plan.api.request, null);
  assert.deepEqual(plan.api.allowedRequestFields, []); assert.deepEqual(plan.api.requiredScopes, []);
  assert.ok(plan.blockers.includes('META_OFFICIAL_DOCUMENTATION_UNVERIFIED'));
  assert.deepEqual(plan.captions, facebook().captions); assert.equal(plan.executionAllowed, false);
});

test('scheduled publication requires scoped approval of the exact plan and first publication', () => {
  const input = { ...youtube(), scheduledAt: future };
  assert.throws(() => preparePublishingPlan(input, now), errorIs('PUBLISHING_OWNER_APPROVAL_REQUIRED'));
  assert.throws(() => preparePublishingPlan(input, now, { ...approval(input), firstPublicationApproved: false }), errorIs('PUBLISHING_OWNER_APPROVAL_REQUIRED'));
  const plan = preparePublishingPlan(input, now, approval(input));
  assert.ok(plan.api.request); assert.equal(plan.api.request.body.status.privacyStatus, 'private');
  assert.equal(plan.api.request.body.status.publishAt, '2026-10-12T03:00:00.000Z');
  assert.equal(plan.approvalGate.firstPublication, 'SCOPED_APPROVAL_RECORDED');
  assert.equal(plan.approvalGate.activation, 'BLOCKED_PREPARATION_ONLY'); assert.equal(plan.executionAllowed, false);
});

test('past, current, invalid, fractional and offset-free schedules cannot imply immediate publication', () => {
  for (const scheduledAt of ['2026-10-12T08:59:59+07:00', '2026-10-12T09:00:00+07:00', '2026-10-12T10:00:00.001+07:00']) {
    assert.throws(() => preparePublishingPlan({ ...youtube(), scheduledAt }, now), errorIs('PUBLISHING_SCHEDULE_INVALID'));
  }
  for (const scheduledAt of ['bad-date', '2026-10-12T10:00:00', '2026-02-30T10:00:00Z']) {
    assert.throws(() => preparePublishingPlan({ ...youtube(), scheduledAt }, now), errorIs('PUBLISHING_INVALID_INPUT'));
  }
});

test('Meta schedules fail closed even when local approval exists until official rules are verified', () => {
  const input = { ...facebook(), scheduledAt: future };
  assert.throws(() => preparePublishingPlan(input, now, approval(input)), errorIs('PUBLISHING_PLATFORM_RULES_UNVERIFIED'));
});

test('public, unlisted, already-published and wrong-platform visibility are outside preparation scope', () => {
  for (const visibility of ['public', 'unlisted', 'unpublished']) {
    assert.throws(() => preparePublishingPlan({ ...youtube(), visibility }, now), errorIs('PUBLISHING_INVALID_INPUT'));
  }
  assert.throws(() => preparePublishingPlan({ ...youtube(), neverPublished: false }, now), errorIs('PUBLISHING_INVALID_INPUT'));
  assert.throws(() => preparePublishingPlan({ ...facebook(), visibility: 'public' }, now), errorIs('PUBLISHING_INVALID_INPUT'));
});

test('trusted evidence cannot be reused after content, media, target, revision or schedule changes', () => {
  const input = { ...youtube(), scheduledAt: future }; const evidence = approval(input);
  for (const change of [
    { captions: { th: 'แก้ไขแล้ว', en: 'Changed' } }, { mediaSha256: 'b'.repeat(64) }, { revision: 2 },
    { destinationRef: '00000000-0000-4000-8000-000000000003' }, { scheduledAt: '2026-10-12T10:01:00+07:00' },
    { titles: { th: 'แก้ไข', en: 'Changed title' } }, { selectedLocale: 'en' }, { containsSyntheticMedia: false },
  ]) {
    assert.throws(() => preparePublishingPlan({ ...input, ...change }, now, evidence), errorIs('PUBLISHING_OWNER_APPROVAL_REQUIRED'));
  }
});

test('approval expires and is bound to platform, operation and valid chronology', () => {
  const input = { ...youtube(), scheduledAt: future }; const evidence = approval(input);
  for (const change of [
    { expiresAt: '2026-10-12T09:00:00+07:00' }, { expiresAt: future }, { approvedAt: future },
    { platform: 'facebook_page' }, { action: 'private_upload' }, { planDigest: 'b'.repeat(64) },
  ]) assert.throws(() => preparePublishingPlan(input, now, { ...evidence, ...change }), errorIs('PUBLISHING_OWNER_APPROVAL_REQUIRED'));
});

test('private upload approval never grants first-publication approval or activation', () => {
  const input = youtube(); const plan = preparePublishingPlan(input, now, approval(input));
  assert.equal(plan.approvalGate.externalWrite, 'SCOPED_APPROVAL_RECORDED');
  assert.equal(plan.approvalGate.firstPublication, 'OWNER_APPROVAL_REQUIRED'); assert.equal(plan.executionAllowed, false);
});

test('credential/account/URL/approval injection is rejected with safe fixed errors', () => {
  for (const change of [{ accessToken: 'synthetic-secret' }, { apiKey: 'synthetic-secret' }, { accountId: 'synthetic-account' },
    { endpoint: 'https://example.invalid' }, { ownerApproved: true }, { trustedApproval: {} }, { execute: true },
    { captions: { ...youtube().captions, accessToken: 'synthetic-secret' } }]) {
    assert.throws(() => preparePublishingPlan({ ...youtube(), ...change }, now), errorIs('PUBLISHING_INVALID_INPUT'));
  }
  const input = youtube(); const json = JSON.stringify(preparePublishingPlan(input, now, approval(input)));
  for (const value of [input.destinationRef, input.draftId, input.mediaSha256, 'accessToken', 'apiKey', 'accountId', 'expiresAt']) assert.equal(json.includes(value), false);
});

test('UTF-8 description byte limits and title/metadata requirements are validated', () => {
  for (const change of [
    { captions: { th: 'ก'.repeat(1667), en: 'Valid' } }, { captions: { th: 'ไทย', en: 'Invalid <text>' } },
    { captions: { th: ' ', en: 'Valid' } }, { titles: { th: 'ก'.repeat(101), en: 'Valid' } },
    { titles: { th: 'ไทย', en: 'Invalid > title' } }, { categoryId: 'invalid' },
    { selfDeclaredMadeForKids: undefined }, { containsSyntheticMedia: undefined },
  ]) assert.throws(() => preparePublishingPlan({ ...youtube(), ...change }, now), errorIs('PUBLISHING_INVALID_INPUT'));
  assert.equal(preparePublishingPlan({ ...youtube(), captions: { th: 'ก'.repeat(1666), en: 'Valid' } }, now).status, 'PREPARED');
});

test('approval digest is deterministic after normalization and equivalent timezone offsets', () => {
  const input = { ...youtube(), scheduledAt: future };
  assert.equal(publishingPlanDigest(input), publishingPlanDigest({ ...input, scheduledAt: '2026-10-12T03:00:00Z' }));
  assert.equal(publishingPlanDigest(youtube()), publishingPlanDigest({ ...youtube(), captions: { th: ' เรื่องสั้นภาษาไทย ', en: ' A short story ' } }));
  assert.deepEqual(preparePublishingPlan(youtube(), now), preparePublishingPlan(youtube(), now));
});

test('invalid clock and invalid input reject without performing external calls', () => {
  for (const clock of [NaN, Infinity, -1, 0.1, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => preparePublishingPlan(youtube(), clock), errorIs('PUBLISHING_INVALID_INPUT'));
  }
  for (const input of [null, {}, [], { ...youtube(), platform: 'personal_profile' }]) {
    assert.throws(() => preparePublishingPlan(input, now), errorIs('PUBLISHING_INVALID_INPUT'));
  }
});

test('ambiguous upload/publication status never authorizes retry; all recovery stays guidance only', () => {
  const plan = preparePublishingRecovery('ambiguous');
  assert.equal(plan.nextAction, 'RECONCILE_EXISTING_SESSION_OR_REMOTE_ID_NO_REUPLOAD');
  assert.equal(preparePublishingRecovery('published').nextAction, 'VERIFY_EXISTING_PUBLICATION_NO_REUPLOAD');
  assert.equal(preparePublishingRecovery('quota_exhausted').nextAction, 'STOP_FOR_QUOTA');
  for (const status of ['not_started', 'uploading', 'processing', 'private_ready', 'scheduled', 'published', 'ambiguous',
    'rejected', 'quota_exhausted', 'authorization_required', 'failed_confirmed']) {
    assert.equal(preparePublishingRecovery(status).automaticRetry, false);
    assert.equal(preparePublishingRecovery(status).executionAllowed, false);
  }
  assert.throws(() => preparePublishingRecovery({ status: 'published', token: 'synthetic-secret' }), errorIs('PUBLISHING_INVALID_INPUT'));
});
