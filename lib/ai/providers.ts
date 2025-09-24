import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from 'ai';

import { createAzure } from '@ai-sdk/azure';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { isTestEnvironment } from '../constants';
import {
  artifactModel,
  chatModel,
  reasoningModel,
  titleModel,
} from './models.test';

const azure = createAzure({
  resourceName: process.env.NEXT_PUBLIC_OPENAI_RESOURCE_NAME || '',
  apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY || '',
});

const bedrock = createAmazonBedrock({
  region: process.env.NEXT_PUBLIC_AWS_REGION || 'us-east-2',
  accessKeyId: process.env.NEXT_PUBLIC_AWS_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY || '',
  sessionToken: process.env.NEXT_PUBLIC_AWS_SESSION_TOKEN || undefined,
});

// Debug logging for Bedrock configuration
console.log('Bedrock Configuration Debug:');
console.log('Region:', process.env.NEXT_PUBLIC_AWS_REGION);
console.log('Access Key ID:', process.env.NEXT_PUBLIC_AWS_ACCESS_KEY_ID);
console.log(
  'Secret Access Key:',
  process.env.NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY,
);
console.log('Model ID:', process.env.NEXT_PUBLIC_AWS_MODEL_ID);
console.log('Is Test Environment:', isTestEnvironment);

export const myProvider = isTestEnvironment
  ? customProvider({
      languageModels: {
        'chat-model': chatModel,
        'chat-model-reasoning': reasoningModel,
        'title-model': titleModel,
        'artifact-model': artifactModel,
      },
      textEmbeddingModels: {
        'embeddings-model': azure.textEmbedding(
          process.env.NEXT_PUBLIC_AZURE_EMBEDDING_DEPLOYMENT || '',
        ),
      },
    })
  : customProvider({
      languageModels: {
        'chat-model': bedrock(process.env.NEXT_PUBLIC_AWS_MODEL_ID || ''),
        'chat-model-reasoning': wrapLanguageModel({
          model: bedrock(process.env.NEXT_PUBLIC_AWS_MODEL_ID || ''),
          middleware: extractReasoningMiddleware({ tagName: 'think' }),
        }),
        'title-model': azure('Innovation-gpt4o-mini'),
        'artifact-model': azure('Innovation-gpt4o-mini'),
      },
      imageModels: {
        'small-model': azure.image('dall-e-3'),
      },
      textEmbeddingModels: {
        'embeddings-model': azure.textEmbedding(
          process.env.NEXT_PUBLIC_AZURE_EMBEDDING_DEPLOYMENT || '',
        ),
      },
    });
