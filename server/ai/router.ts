import { AiModeSchema, type AiMode, type AiRuntimeStatus } from '../../shared/integrations.js';
import type { Idea, ProjectInput } from '../../shared/contracts.js';
import { AiProviderError, createOpenAiProvider } from './provider.js';
import { createMockProvider } from './mock.js';
import type { AiProvider } from './types.js';

interface ConfiguredProviderOptions {
  mode?: AiMode;
  apiKey?: string;
  openai?: AiProvider;
}

interface ConfiguredAiProvider {
  provider: AiProvider;
  status: () => AiRuntimeStatus;
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
  const mode = configuredMode(options.mode);
  const hasApiKey = Boolean((options.apiKey ?? process.env.OPENAI_API_KEY)?.trim());
  const openai = options.openai ?? createOpenAiProvider({ apiKey: options.apiKey });
  const mock = createMockProvider();
  let active: AiRuntimeStatus['active'] = mode === 'mock' || mode === 'auto' && !hasApiKey ? 'mock' : 'openai';
  let fallbackReason: AiRuntimeStatus['fallbackReason'] = mode === 'auto' && !hasApiKey ? 'not_configured' : null;

  function status(): AiRuntimeStatus {
    return { mode, active, fallbackReason };
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
      generateIdeas(input) {
        const brief = briefFields(input);
        return run((provider) => provider.generateIdeas(brief));
      },
      expandStory(input, selectedIdea) {
        const brief = briefFields(input);
        const selection = selectedFields(selectedIdea);
        return run((provider) => provider.expandStory(brief, selection));
      },
    },
    status,
  };
}
