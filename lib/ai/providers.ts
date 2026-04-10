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
