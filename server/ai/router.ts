import { AiModeSchema, type AiMode, type AiRuntimeStatus } from '../../shared/integrations.js';
import type { Idea, ProjectInput } from '../../shared/contracts.js';
import { AiProviderError, createOpenAiProvider } from './provider.js';
import { createMockProvider } from './mock.js';
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AiProvider } from './types.js';

interface ConfiguredProviderOptions {
  mode?: AiMode;
  apiKey?: string;
  openai?: AiProvider;
  stateFile?: string;
}

interface ConfiguredAiProvider {
  provider: AiProvider;
  status: () => AiRuntimeStatus;
  setMode: (mode: 'mock' | 'openai') => AiRuntimeStatus;
}

const FALLBACK_CODES: Readonly<Record<string, AiRuntimeStatus['fallbackReason']>> = {
  AI_NOT_CONFIGURED: 'not_configured',
  AI_QUOTA_EXCEEDED: 'quota',
  AI_ACCESS_DENIED: 'access',
};

function briefFields(input: ProjectInput): ProjectInput {
  return {
    name: input.name,
    brief: input.brief,
    genre: input.genre,
    audience: input.audience,
    aspectRatio: input.aspectRatio,
    ...(input.targetDurationSeconds !== undefined ? { targetDurationSeconds: input.targetDurationSeconds } : {}),
  };
}

function selectedFields(idea: Idea): Idea {
  return {
    id: idea.id,
    title: { th: idea.title.th, en: idea.title.en },
    logline: { th: idea.logline.th, en: idea.logline.en },
    hook: { th: idea.hook.th, en: idea.hook.en },
  };
}

function parseMode(value: unknown): AiMode {
  const parsed = AiModeSchema.safeParse(value);
  if (!parsed.success) throw new AiProviderError('AI_NOT_CONFIGURED');
  return parsed.data;
}

function configuredMode(mode?: AiMode): AiMode {
  if (mode !== undefined) return parseMode(mode);
  const environmentMode = process.env.ACF_AI_MODE;
  return environmentMode === undefined ? 'openai' : parseMode(environmentMode);
}

function isProviderError(error: unknown): error is AiProviderError {
  return error instanceof AiProviderError;
}

export function createConfiguredAiProvider(options: ConfiguredProviderOptions = {}): ConfiguredAiProvider {
  let mode = configuredMode(options.mode);
  if (options.stateFile && existsSync(options.stateFile)) {
    const saved: unknown = JSON.parse(readFileSync(options.stateFile, 'utf8'));
    if (saved && typeof saved === 'object' && 'mode' in saved && (saved.mode === 'mock' || saved.mode === 'openai')) mode = saved.mode;
    else throw new AiProviderError('AI_NOT_CONFIGURED');
  }
  const hasApiKey = Boolean((options.apiKey ?? process.env.OPENAI_API_KEY)?.trim());
  const openai = options.openai ?? createOpenAiProvider({ apiKey: options.apiKey });
  const mock = createMockProvider();
  let active: AiRuntimeStatus['active'] = mode === 'mock' || mode === 'auto' && !hasApiKey ? 'mock' : 'openai';
  let fallbackReason: AiRuntimeStatus['fallbackReason'] = mode === 'auto' && !hasApiKey ? 'not_configured' : null;

  function status(): AiRuntimeStatus {
    return { mode, active, fallbackReason };
  }

  function setMode(next: 'mock' | 'openai'): AiRuntimeStatus {
    if (next !== 'mock' && next !== 'openai') throw new AiProviderError('AI_NOT_CONFIGURED');
    if (next === 'openai' && !hasApiKey) throw new AiProviderError('AI_NOT_CONFIGURED');
    if (options.stateFile) {
      mkdirSync(dirname(options.stateFile), { recursive: true });
      const temporary = `${options.stateFile}.${randomUUID()}.tmp`;
      writeFileSync(temporary, JSON.stringify({ mode: next }), { mode: 0o600, flag: 'wx' });
      renameSync(temporary, options.stateFile);
    }
    mode = next; active = next; fallbackReason = null;
    return status();
  }

  async function run<T>(operation: (provider: AiProvider) => Promise<T>): Promise<T> {
    if (mode === 'mock' || mode === 'auto' && active === 'mock') return operation(mock);
    try {
      return await operation(openai);
    } catch (error) {
      if (!isProviderError(error)) throw new AiProviderError('AI_REQUEST_FAILED');
      const reason = FALLBACK_CODES[error.code];
      if (mode === 'auto' && reason) {
        active = 'mock';
        fallbackReason = reason;
        return operation(mock);
      }
      throw error;
    }
  }

  return {
    provider: {
      generateIdeas(input, requestOptions) {
        const brief = briefFields(input);
        return run((provider) => provider.generateIdeas(brief, requestOptions));
      },
      expandStory(input, selectedIdea, requestOptions) {
        const brief = briefFields(input);
        const selection = selectedFields(selectedIdea);
        return run((provider) => provider.expandStory(brief, selection, requestOptions));
      },
    },
    status,
    setMode,
  };
}
