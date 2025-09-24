import { tool } from 'ai';
import { z } from 'zod';
import { Pinecone } from '@pinecone-database/pinecone';
import { generateAzureEmbedding } from '@/lib/embeddings/azure';

// Initialize Pinecone client with error handling
let pinecone: Pinecone;
let index: any;

try {
  if (!process.env.PINECONE_API_KEY || !process.env.PINECONE_INDEX_NAME) {
    throw new Error('Missing required Pinecone environment variables');
  }

  pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
  });

  // Get the index instance
  index = pinecone.index(process.env.PINECONE_INDEX_NAME);

  console.log('✅ Pinecone client initialized successfully');
} catch (error) {
  console.error('❌ Failed to initialize Pinecone client:', error);
  // Set to null so we can handle gracefully in the search function
  index = null;
}

// Vector search function using Pinecone
const search = async (
  query: string,
  options: { topK: number; includeMetadata: boolean; namespace: string },
) => {
  console.log(
    `🔍 Pinecone search for query: "${query}" in namespace: "${options.namespace}"`,
  );

  try {
    // Check if Pinecone is properly initialized
    if (!index) {
      throw new Error(
        'Pinecone client not initialized. Please check your environment variables.',
      );
    }

    // Generate query embedding using Azure
    const queryEmbedding = await generateAzureEmbedding(query);

    // Search in Pinecone
    const searchResponse = await index.namespace(options.namespace).query({
      vector: queryEmbedding,
      topK: options.topK,
      includeMetadata: options.includeMetadata,
    });

    // Transform Pinecone results to our expected format
    return (
      searchResponse.matches?.map((match: any) => ({
        score: match.score || 0,
        metadata: match.metadata || {},
      })) || []
    );
  } catch (error) {
    console.error('❌ Pinecone search error:', error);
    throw error;
  }
};

export const searchKnowledgeBaseTool = (knowledgeBaseIds: string[]) =>
  tool({
    description:
      "Search through the agent's knowledge bases for relevant information",
    inputSchema: z.object({
      query: z.string().describe('The query to search in the knowledge base'),
    }),
    execute: async ({ query }: { query: string }) => {
      try {
        console.log('🔍 Searching knowledge bases for query:', query);
        console.log('🔍 Agent knowledge base IDs:', knowledgeBaseIds);

        if (knowledgeBaseIds.length === 0) {
          return {
            results: [],
            summary: 'No knowledge bases are configured for this agent.',
          };
        }

        // Search across all knowledge bases for this agent
        const searchPromises = knowledgeBaseIds.map(async (namespace) => {
          try {
            const results = await search(query, {
              topK: 5,
              includeMetadata: true,
              namespace,
            });
            return results.map((result: any) => ({ ...result, namespace }));
          } catch (error) {
            console.warn(`⚠️ Search failed for namespace ${namespace}:`, error);
            return [];
          }
        });

        const allResults = await Promise.all(searchPromises);
        const flatResults = allResults.flat();

        console.log('🔍 Total search results:', flatResults.length);

        if (flatResults.length === 0) {
          return {
            results: [],
            summary: `No relevant documents found for query: ${query}`,
          };
        }

        // Take top results
        const topResults = flatResults.slice(0, 4);

        const results = topResults.map((result) => ({
          score: `${(result.score * 100).toFixed(1)}%`,
          id: result.metadata?.title || 'Unknown Source',
          uri: result.metadata?.url?.startsWith('http')
            ? result.metadata.url
            : undefined,
          chunk_number: result.metadata?.chunk_number || 0,
          text: result.metadata?.content || result.metadata?.text || '',
          namespace: result.namespace,
        }));

        return {
          results,
          summary: `Found ${results.length} relevant documents from knowledge base`,
        };
      } catch (error) {
        console.error('❌ Knowledge base search error:', error);
        return {
          results: [],
          summary: `No relevant documents found for query: ${query}`,
        };
      }
    },
  });
