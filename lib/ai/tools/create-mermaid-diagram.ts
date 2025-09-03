import { generateUUID } from '@/lib/utils';
import { tool, type UIMessageStreamWriter } from 'ai';
import { z } from 'zod';
import type { Session } from 'next-auth';
import { documentHandlersByArtifactKind } from '@/lib/artifacts/server';
import type { ChatMessage } from '@/lib/types';

interface CreateMermaidDiagramProps {
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
}

export const createMermaidDiagram = ({
  session,
  dataStream,
}: CreateMermaidDiagramProps) =>
  tool({
    description:
      'Create a Mermaid diagram for visualizing processes, relationships, and data structures. This tool will generate streaming Mermaid diagram content based on the provided description and diagram type.',
    inputSchema: z.object({
      title: z.string().describe('The title of the diagram'),
      description: z
        .string()
        .describe('Description of what the diagram should represent'),
      type: z
        .enum([
          'flowchart',
          'sequence',
          'class',
          'entity-relationship',
          'gantt',
          'state',
          'git',
          'pie',
          'mindmap',
          'other',
        ])
        .describe('The type of diagram to generate'),
    }),
    execute: async ({ title, description, type }) => {
      const id = generateUUID();

      dataStream.write({
        type: 'data-kind',
        data: 'mermaid',
        transient: true,
      });

      dataStream.write({
        type: 'data-id',
        data: id,
        transient: true,
      });

      dataStream.write({
        type: 'data-title',
        data: title,
        transient: true,
      });

      dataStream.write({
        type: 'data-mermaid-type',
        data: type,
        transient: true,
      });

      dataStream.write({
        type: 'data-mermaid-description',
        data: description,
        transient: true,
      });

      dataStream.write({
        type: 'data-clear',
        data: null,
        transient: true,
      });

      const documentHandler = documentHandlersByArtifactKind.find(
        (documentHandlerByArtifactKind) =>
          documentHandlerByArtifactKind.kind === 'mermaid',
      );

      if (!documentHandler) {
        throw new Error(`No document handler found for kind: mermaid`);
      }

      await documentHandler.onCreateDocument({
        id,
        title: `${title} (${type} diagram)`,
        dataStream,
        session,
      });

      dataStream.write({ type: 'data-finish', data: null, transient: true });

      return {
        id,
        title,
        kind: 'mermaid',
        content:
          'A Mermaid diagram was created and is now visible to the user.',
      };
    },
  });
