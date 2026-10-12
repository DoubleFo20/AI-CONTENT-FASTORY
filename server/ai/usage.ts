import { z } from 'zod';
import { AiUsageSchema, type AiUsage } from '../../shared/ai.js';

const RateSchema = z.strictObject({
  provider: z.enum(['openai', 'gemini']), model: AiUsageSchema.shape.model,
  inputUsdPerMillion: z.number().finite().min(0).max(10000),
  outputUsdPerMillion: z.number().finite().min(0).max(10000),
  cachedInputUsdPerMillion: z.number().finite().min(0).max(10000).optional(),
  verifiedAt: z.iso.datetime(),
});

// Estimates require explicit, verified server-side rates. Missing rates are unknown, not free.
export function estimateAiCost(usage: AiUsage, pricingJson = process.env.ACF_AI_PRICING_JSON): { estimatedCostUsd: number | null; rateVerifiedAt: string | null } {
  const unknown = { estimatedCostUsd: null, rateVerifiedAt: null };
  if (!pricingJson || pricingJson.length > 20000) return unknown;
  let rates: z.infer<typeof RateSchema>[];
  try { rates = z.array(RateSchema).max(50).parse(JSON.parse(pricingJson)); }
  catch { return unknown; }
  const matches = rates.filter(rate => rate.provider === usage.provider && rate.model === usage.model);
  if (matches.length !== 1 || Date.parse(matches[0].verifiedAt) > Date.now()) return unknown;
  const rate = matches[0]; const cached = usage.cachedInputTokens ?? 0;
  if (cached > 0 && rate.cachedInputUsdPerMillion === undefined) return unknown;
  const estimatedCostUsd = ((usage.inputTokens - cached) * rate.inputUsdPerMillion
    + cached * (rate.cachedInputUsdPerMillion ?? 0) + usage.outputTokens * rate.outputUsdPerMillion) / 1_000_000;
  return Number.isFinite(estimatedCostUsd) ? { estimatedCostUsd, rateVerifiedAt: rate.verifiedAt } : unknown;
}
