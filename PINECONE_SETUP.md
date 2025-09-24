# Pinecone Vector Search Setup

This guide explains how to set up Pinecone vector search for the knowledge base functionality.

## Environment Variables

Add these environment variables to your `.env.local` file:

```env
# Pinecone Configuration
PINECONE_API_KEY=your_pinecone_api_key_here
PINECONE_INDEX_NAME=your_index_name_here

# OpenAI Configuration (for embeddings)
OPENAI_API_KEY=your_openai_api_key_here
```

## Getting Your Pinecone Credentials

1. **Sign up for Pinecone**: Go to [pinecone.io](https://pinecone.io) and create an account
2. **Get your API key**:
   - Go to your Pinecone dashboard
   - Navigate to "API Keys" section
   - Copy your API key
3. **Create an index**:
   - Go to "Indexes" in your Pinecone dashboard
   - Create a new index with appropriate dimensions (1536 for OpenAI embeddings)
   - Note the index name

## Index Configuration

Your Pinecone index should be configured with:

- **Dimensions**: 1536 (for OpenAI text-embedding-3-small model)
- **Metric**: cosine (recommended for text embeddings)
- **Cloud**: Choose your preferred region
- **Environment**: Select based on your needs

## Data Structure

The knowledge base search expects your Pinecone vectors to have metadata with these fields:

- `title`: Document title
- `content` or `text`: Document content
- `url`: Document URL (optional)
- `chunk_number`: Chunk number if document is split (optional)

## Usage

Once configured, agents with `knowledgeBaseIds` will automatically have access to search through their assigned knowledge bases using the `knowledge_base_search` tool.

The tool will:

1. Generate embeddings for user queries using OpenAI
2. Search through the specified Pinecone namespaces
3. Return relevant documents with scores and metadata
4. Present results to the AI for context-aware responses

## Testing

To test the integration:

1. Ensure all environment variables are set
2. Select an agent with `knowledgeBaseIds` configured
3. Ask a question that would benefit from knowledge base search
4. The AI should automatically search and use relevant information

## Troubleshooting

- **"Pinecone client not initialized"**: Check your environment variables
- **"OpenAI API error"**: Verify your OpenAI API key and quota
- **No results**: Ensure your Pinecone index has data and the namespace exists
- **Embedding errors**: Check that your OpenAI API key has access to embeddings
