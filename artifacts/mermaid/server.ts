import { myProvider } from '@/lib/ai/providers';
import { createDocumentHandler } from '@/lib/artifacts/server';
import { streamText } from 'ai';
import { sanitizeMermaidSource } from './sanitize-mermaid-source';

export const mermaidDocumentHandler = createDocumentHandler<'mermaid'>({
  kind: 'mermaid',
  onCreateDocument: async ({ title, dataStream }) => {
    let draftContent = '';

    // Generate Mermaid diagram using AI
    const { fullStream } = streamText({
      model: myProvider.languageModel('artifact-model'),
      system: `You are an expert at creating Mermaid diagrams. Generate a Mermaid diagram based on the user's request. 
      
Guidelines:
- Use proper Mermaid syntax
- Make diagrams clear and well-structured
- Choose the most appropriate diagram type for the content
- Include proper labels and connections
- Ensure the diagram is visually balanced
- Do not include markdown code blocks, just return the raw Mermaid diagram syntax
- **sequenceDiagram:** each arrow/message must be **one line**. Put parentheses, HTTP headers, and extra detail on the **same line** as the message text after \`:\`. Never put \`(args)\` or \`Header: value\` alone on the next line — that breaks the parser.

Examples of diagram types:
- flowchart: For processes and workflows
- sequenceDiagram: For interactions over time
- classDiagram: For object-oriented designs
- erDiagram: For database relationships
- gantt: For project timelines
- stateDiagram-v2: For state transitions
- pie: For data distributions
- mindmap: For hierarchical concepts

Return only the Mermaid diagram syntax, starting with the diagram type.`,
      prompt: title,
    });

    for await (const delta of fullStream) {
      const { type } = delta;

      if (type === 'text-delta') {
        const { text: textDelta } = delta;

        draftContent += textDelta;

        dataStream.write({
          type: 'data-mermaid-delta',
          data: draftContent,
          transient: true,
        });
      }
    }

    return sanitizeMermaidSource(draftContent);
  },
  onUpdateDocument: async ({ document, description, dataStream }) => {
    let draftContent = '';

    const { fullStream } = streamText({
      model: myProvider.languageModel('artifact-model'),
      system: `You are an expert at creating and modifying Mermaid diagrams. 
      
Update the following Mermaid diagram based on the user's request:

Current diagram:
${document.content}

Guidelines:
- Maintain proper Mermaid syntax
- Keep the diagram type consistent unless explicitly asked to change it
- Make requested modifications while preserving the overall structure
- Ensure all connections and labels remain valid
- Do not include markdown code blocks, just return the raw Mermaid diagram syntax
- **sequenceDiagram:** keep each \`A->>B: message\` on a single line; do not wrap message text across lines.

Return the complete updated Mermaid diagram syntax.`,
      prompt: description,
    });

    for await (const delta of fullStream) {
      const { type } = delta;

      if (type === 'text-delta') {
        const { text: textDelta } = delta;

        draftContent += textDelta;

        dataStream.write({
          type: 'data-mermaid-delta',
          data: draftContent,
          transient: true,
        });
      }
    }

    return sanitizeMermaidSource(draftContent);
  },
});
