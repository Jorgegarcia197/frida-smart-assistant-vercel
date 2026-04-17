import { extractReasoningMiddleware, wrapLanguageModel } from 'ai';

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { isTestEnvironment } from '../constants';
import {
  artifactModel,
  chatModel,
  reasoningModel,
  titleModel,
} from './models.test';

interface OpenAICompatibleConfig {
  apiKey: string;
  baseUrl: string;
  chatModel: string;
  reasoningModel: string;
  titleModel: string;
  artifactModel: string;
  embeddingModel: string;
}

export interface OpenAICompatibleRuntimeConfig {
  apiKey: string;
  baseUrl: string;
}

const DEBUG_OPENAI_COMPATIBLE = process.env.DEBUG_OPENAI_COMPATIBLE === 'true';
const MAX_DEBUG_BODY_CHARS = 4000;

function truncateForLog(value: string): string {
  return value.length > MAX_DEBUG_BODY_CHARS
    ? `${value.slice(0, MAX_DEBUG_BODY_CHARS)}... [truncated]`
    : value;
}

function parseMaybeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function normalizeOpenAICompatibleProviderOptions(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const existingProviderOptions =
    body.providerOptions &&
    typeof body.providerOptions === 'object' &&
    !Array.isArray(body.providerOptions)
      ? (body.providerOptions as Record<string, unknown>)
      : {};

  const existingOpenAICompatible =
    existingProviderOptions.openaiCompatible &&
    typeof existingProviderOptions.openaiCompatible === 'object' &&
    !Array.isArray(existingProviderOptions.openaiCompatible)
      ? (existingProviderOptions.openaiCompatible as Record<string, unknown>)
      : {};

  const mirroredFields: Record<string, unknown> = {};

  if (
    body.anthropicExtensions !== undefined &&
    existingOpenAICompatible.anthropicExtensions === undefined
  ) {
    mirroredFields.anthropicExtensions = body.anthropicExtensions;
  }

  if (
    body.user !== undefined &&
    existingOpenAICompatible.user === undefined
  ) {
    mirroredFields.user = body.user;
  }

  if (
    body.reasoning_effort !== undefined &&
    existingOpenAICompatible.reasoningEffort === undefined
  ) {
    mirroredFields.reasoningEffort = body.reasoning_effort;
  } else if (
    body.reasoningEffort !== undefined &&
    existingOpenAICompatible.reasoningEffort === undefined
  ) {
    mirroredFields.reasoningEffort = body.reasoningEffort;
  }

  if (
    body.text_verbosity !== undefined &&
    existingOpenAICompatible.textVerbosity === undefined
  ) {
    mirroredFields.textVerbosity = body.text_verbosity;
  } else if (
    body.textVerbosity !== undefined &&
    existingOpenAICompatible.textVerbosity === undefined
  ) {
    mirroredFields.textVerbosity = body.textVerbosity;
  }

  if (
    body.strict_json_schema !== undefined &&
    existingOpenAICompatible.strictJsonSchema === undefined
  ) {
    mirroredFields.strictJsonSchema = body.strict_json_schema;
  } else if (
    body.strictJsonSchema !== undefined &&
    existingOpenAICompatible.strictJsonSchema === undefined
  ) {
    mirroredFields.strictJsonSchema = body.strictJsonSchema;
  }

  if (Object.keys(mirroredFields).length === 0) {
    return body;
  }

  return {
    ...body,
    providerOptions: {
      ...existingProviderOptions,
      openaiCompatible: {
        ...existingOpenAICompatible,
        ...mirroredFields,
      },
    },
  };
}

/** Names the compatible backend injects for Anthropic code execution; must not appear twice in `tools`. */
const ANTHROPIC_BACKEND_CODE_EXECUTION_TOOL_NAMES = new Set([
  'text_editor_code_execution',
  'bash_code_execution',
  'code_execution',
]);

function getOpenAICompatibleToolName(tool: unknown): string | undefined {
  if (!tool || typeof tool !== 'object') return undefined;
  const t = tool as Record<string, unknown>;
  if (t.type === 'function' && t.function && typeof t.function === 'object') {
    const fn = t.function as Record<string, unknown>;
    if (typeof fn.name === 'string') return fn.name;
  }
  if (typeof t.name === 'string') return t.name;
  return undefined;
}

/**
 * When `anthropicExtensions` enables code execution, the compatible server injects
 * Anthropic's code-execution tools. The chat route also registers pass-through tools
 * with the same names so the AI SDK accepts tool calls — but the upstream API rejects
 * duplicate tool names. Drop client-sent duplicates for the HTTP request only.
 */
function stripAnthropicBackendDuplicateTools(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const providerOptions = body.providerOptions;
  if (
    !providerOptions ||
    typeof providerOptions !== 'object' ||
    Array.isArray(providerOptions)
  ) {
    return body;
  }
  const po = providerOptions as Record<string, unknown>;
  const oac = po.openaiCompatible;
  if (!oac || typeof oac !== 'object' || Array.isArray(oac)) {
    return body;
  }
  const openaiCompat = oac as Record<string, unknown>;
  const ext = openaiCompat.anthropicExtensions;
  if (!ext || typeof ext !== 'object' || Array.isArray(ext)) {
    return body;
  }
  const anthropicExt = ext as { enableCodeExecution?: boolean };
  if (anthropicExt.enableCodeExecution === false) {
    return body;
  }

  const tools = body.tools;
  if (!Array.isArray(tools) || tools.length === 0) {
    return body;
  }

  const filtered = tools.filter((tool) => {
    const name = getOpenAICompatibleToolName(tool);
    if (!name) return true;
    return !ANTHROPIC_BACKEND_CODE_EXECUTION_TOOL_NAMES.has(name);
  });

  if (filtered.length === tools.length) {
    return body;
  }

  return {
    ...body,
    tools: filtered,
  };
}

function getOpenAICompatibleConfig(): OpenAICompatibleConfig {
  const apiKey =
    process.env.LLMOPS_API_KEY ??
    process.env.LLM_API_KEY ??
    process.env.OPENAI_API_KEY ??
    '';
  const baseUrl =
    process.env.OPENAI_COMPATIBLE_API ?? process.env.LLM_API_BASE_URL ?? '';

  const defaultModel = process.env.LLM_MODEL_NAME ?? 'gpt-4o-mini';

  return {
    apiKey,
    baseUrl,
    chatModel: process.env.CHAT_MODEL ?? defaultModel,
    reasoningModel: process.env.REASONING_MODEL ?? defaultModel,
    titleModel: process.env.TITLE_MODEL ?? defaultModel,
    artifactModel: process.env.ARTIFACT_MODEL ?? defaultModel,
    embeddingModel:
      process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small',
  };
}

export function getOpenAICompatibleRuntimeConfig(): OpenAICompatibleRuntimeConfig {
  const config = getOpenAICompatibleConfig();

  return {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
  };
}

export function resolveConfiguredLanguageModelId(modelId: string): string {
  if (isTestEnvironment) {
    if (modelId === 'chat-model') return 'chat-model';
    if (modelId === 'chat-model-reasoning') return 'chat-model-reasoning';
    if (modelId === 'title-model') return 'title-model';
    if (modelId === 'artifact-model') return 'artifact-model';
    return modelId;
  }

  const config = getOpenAICompatibleConfig();

  if (modelId === 'chat-model') return config.chatModel;
  if (modelId === 'chat-model-reasoning') return config.reasoningModel;
  if (modelId === 'title-model') return config.titleModel;
  if (modelId === 'artifact-model') return config.artifactModel;

  return modelId;
}

let openAICompatibleInstance: ReturnType<typeof createOpenAICompatible> | null =
  null;

function getOpenAICompatibleInstance() {
  if (!openAICompatibleInstance) {
    const config = getOpenAICompatibleConfig();
    openAICompatibleInstance = createOpenAICompatible({
      name: 'openaiCompatible',
      baseURL: config.baseUrl,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
      supportsStructuredOutputs: true,
      transformRequestBody: (body) => {
        const normalizedBody = normalizeOpenAICompatibleProviderOptions(
          body as Record<string, unknown>,
        );
        const requestBody = stripAnthropicBackendDuplicateTools(normalizedBody);

        if (DEBUG_OPENAI_COMPATIBLE) {
          try {
            const serialized = JSON.stringify(requestBody);
            console.log(
              '🔍 [openai-compatible] transformed request body',
              parseMaybeJson(truncateForLog(serialized)),
            );
          } catch (error) {
            console.warn(
              '⚠️ [openai-compatible] failed to serialize transformed request body',
              error,
            );
          }
        }
        return requestBody;
      },
      fetch: async (input, init) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method =
          init?.method ??
          (typeof input !== 'string' && input instanceof Request
            ? input.method
            : 'GET');

        if (DEBUG_OPENAI_COMPATIBLE) {
          let bodyPreview: unknown = null;
          const body =
            typeof init?.body === 'string'
              ? init.body
              : init?.body
                ? '[non-string body]'
                : null;

          if (typeof body === 'string') {
            bodyPreview = parseMaybeJson(truncateForLog(body));
          } else {
            bodyPreview = body;
          }

          console.log('🔍 [openai-compatible] outgoing HTTP request', {
            method,
            url,
            body: bodyPreview,
          });
        }

        const response = await fetch(input, init);

        if (DEBUG_OPENAI_COMPATIBLE) {
          const contentType = response.headers.get('content-type') ?? '';
          const logBase = {
            method,
            url,
            status: response.status,
            statusText: response.statusText,
            contentType,
          };

          if (contentType.includes('application/json')) {
            try {
              const responseText = await response.clone().text();
              console.log('🔍 [openai-compatible] HTTP response', {
                ...logBase,
                body: parseMaybeJson(truncateForLog(responseText)),
              });
            } catch (error) {
              console.warn(
                '⚠️ [openai-compatible] failed to read JSON response body for logging',
                error,
              );
              console.log('🔍 [openai-compatible] HTTP response', logBase);
            }
          } else {
            console.log('🔍 [openai-compatible] HTTP response', logBase);
          }
        }

        return response;
      },
    });
  }

  return openAICompatibleInstance;
}

const testEmbeddingModel = {
  doEmbed: async ({ values }: { values: string[] }) => ({
    embeddings: values.map(() => [0, 0, 0]),
    usage: {
      tokens: 0,
    },
  }),
};

interface ProductionModels {
  chatModel: ReturnType<ReturnType<typeof createOpenAICompatible>['chatModel']>;
  reasoningModel: ReturnType<typeof wrapLanguageModel>;
  titleModel: ReturnType<ReturnType<typeof createOpenAICompatible>['chatModel']>;
  artifactModel: ReturnType<ReturnType<typeof createOpenAICompatible>['chatModel']>;
  embeddingModel: ReturnType<
    ReturnType<typeof createOpenAICompatible>['textEmbeddingModel']
  >;
}

let productionModels: ProductionModels | null = null;

function getProductionModels(): ProductionModels {
  if (!productionModels) {
    const config = getOpenAICompatibleConfig();
    const openAICompatible = getOpenAICompatibleInstance();

    productionModels = {
      chatModel: openAICompatible.chatModel(config.chatModel),
      reasoningModel: wrapLanguageModel({
        model: openAICompatible.chatModel(config.reasoningModel),
        middleware: extractReasoningMiddleware({ tagName: 'think' }),
      }),
      titleModel: openAICompatible.chatModel(config.titleModel),
      artifactModel: openAICompatible.chatModel(config.artifactModel),
      embeddingModel: openAICompatible.textEmbeddingModel(config.embeddingModel),
    };
  }

  return productionModels;
}

export const myProvider = {
  languageModel(modelId: string) {
    if (isTestEnvironment) {
      if (modelId === 'chat-model') return chatModel;
      if (modelId === 'chat-model-reasoning') return reasoningModel;
      if (modelId === 'title-model') return titleModel;
      if (modelId === 'artifact-model') return artifactModel;
      throw new Error(`Unknown language model id: ${modelId}`);
    }

    const models = getProductionModels();

    if (modelId === 'chat-model') return models.chatModel;
    if (modelId === 'chat-model-reasoning') return models.reasoningModel;
    if (modelId === 'title-model') return models.titleModel;
    if (modelId === 'artifact-model') return models.artifactModel;
    throw new Error(`Unknown language model id: ${modelId}`);
  },
  textEmbeddingModel(modelId: string) {
    if (modelId !== 'embeddings-model') {
      throw new Error(`Unknown embedding model id: ${modelId}`);
    }

    if (isTestEnvironment) {
      return testEmbeddingModel as any;
    }

    return getProductionModels().embeddingModel;
  },
};
