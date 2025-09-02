import { generateUUID } from '@/lib/utils';
import { DataStreamWriter, tool } from 'ai';
import { z } from 'zod/v3';
import { Session } from 'next-auth';
import {
  artifactKinds,
  documentHandlersByArtifactKind,
} from '@/lib/artifacts/server';

interface CreateMermaidDiagramProps {
  session: Session;
  dataStream: DataStreamWriter;
}

export const createMermaidDiagram = ({ session, dataStream }: CreateMermaidDiagramProps) =>
  tool({
    description:
      'Create a Mermaid diagram for visualizing processes, relationships, and data structures. This tool will generate streaming Mermaid diagram content based on the provided description and diagram type.',
    inputSchema: z.object({
      title: z.string().describe('The title of the diagram'),
      description: z.string().describe('Description of what the diagram should represent'),
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
        'type': 'data',

        'value': [{
          type: 'kind',
          content: 'mermaid',
        }]
      });

      dataStream.write({
        'type': 'data',

        'value': [{
          type: 'id',
          content: id,
        }]
      });

      dataStream.write({
        'type': 'data',

        'value': [{
          type: 'title',
          content: title,
        }]
      });

      dataStream.write({
        'type': 'data',

        'value': [{
          type: 'mermaid-type',
          content: type,
        }]
      });

      dataStream.write({
        'type': 'data',

        'value': [{
          type: 'mermaid-description',
          content: description,
        }]
      });

      dataStream.write({
        'type': 'data',

        'value': [{
          type: 'clear',
          content: '',
        }]
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

      dataStream.write({
        'type': 'data',
        'value': [{ type: 'finish', content: '' }]
      });

      return {
        id,
        title,
        kind: 'mermaid',
        content: 'A Mermaid diagram was created and is now visible to the user.',
      };
    },
  }); 