'use client';

import { useEffect, useRef } from 'react';
import { artifactDefinitions, type ArtifactKind } from './artifact';
import { initialArtifactData, useArtifact } from '@/hooks/use-artifact';
import { useDataStream } from './data-stream-provider';

export function DataStreamHandler() {
  const { dataStream } = useDataStream();

  const { artifact, setArtifact, setMetadata } = useArtifact();
  const lastProcessedIndex = useRef(-1);
  /** Must track kind synchronously: one useEffect run can process many deltas while React state stays stale. */
  const streamingKindRef = useRef<ArtifactKind>(artifact.kind);

  useEffect(() => {
    streamingKindRef.current = artifact.kind;
  }, [artifact.kind]);

  useEffect(() => {
    if (!dataStream?.length) return;

    const newDeltas = dataStream.slice(lastProcessedIndex.current + 1);
    lastProcessedIndex.current = dataStream.length - 1;

    newDeltas.forEach((delta) => {
      if (delta.type === 'data-kind') {
        streamingKindRef.current = delta.data;
      }

      const artifactDefinition = artifactDefinitions.find(
        (def) => def.kind === streamingKindRef.current,
      );

      if (artifactDefinition?.onStreamPart) {
        artifactDefinition.onStreamPart({
          streamPart: delta,
          setArtifact,
          setMetadata,
        });
      }

      setArtifact((draftArtifact) => {
        if (!draftArtifact) {
          return { ...initialArtifactData, status: 'streaming' };
        }

        switch (delta.type) {
          case 'data-id':
            return {
              ...draftArtifact,
              documentId: delta.data,
              status: 'streaming',
            };

          case 'data-title':
            return {
              ...draftArtifact,
              title: delta.data,
              status: 'streaming',
            };

          case 'data-kind':
            return {
              ...draftArtifact,
              kind: delta.data,
              status: 'streaming',
            };

          case 'data-clear':
            return {
              ...draftArtifact,
              content: '',
              status: 'streaming',
            };

          case 'data-finish':
            return {
              ...draftArtifact,
              status: 'idle',
            };

          default:
            return draftArtifact;
        }
      });
    });
  }, [dataStream, setArtifact, setMetadata]);

  return null;
}
