import { myProvider } from '@/lib/ai/providers';

// Embeddings helper using the configured AI provider
export async function generateAzureEmbedding(text: string): Promise<number[]> {
  try {
    const embeddingModel = myProvider.textEmbeddingModel('embeddings-model');
    const result = await embeddingModel.doEmbed({ values: [text] });
    return result.embeddings[0];
  } catch (error) {
    console.error('❌ Embedding generation error:', error);
    throw new Error(
      `Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}
