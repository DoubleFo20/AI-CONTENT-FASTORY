import { z } from 'zod';

export const AiUsageSchema = z.strictObject({
  provider: z.enum(['openai', 'gemini']),
  operation: z.enum(['ideas', 'expand']),
  model: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_.-]+$/),
  inputTokens: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  outputTokens: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  totalTokens: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  cachedInputTokens: z.number().int().min(0).optional(),
  reasoningTokens: z.number().int().min(0).optional(),
}).refine(value => value.totalTokens >= value.inputTokens + value.outputTokens
  && (value.cachedInputTokens ?? 0) <= value.inputTokens
  && (value.reasoningTokens ?? 0) <= value.outputTokens);
export type AiUsage = z.infer<typeof AiUsageSchema>;

export const AiUsageReceiptSchema = AiUsageSchema.safeExtend({
  jobId: z.uuid(), recordedAt: z.iso.datetime(),
  estimatedCostUsd: z.number().finite().min(0).nullable(),
  rateVerifiedAt: z.iso.datetime().nullable(),
});
export type AiUsageReceipt = AiUsage & {
  jobId: string; recordedAt: string; estimatedCostUsd: number | null; rateVerifiedAt: string | null;
};
