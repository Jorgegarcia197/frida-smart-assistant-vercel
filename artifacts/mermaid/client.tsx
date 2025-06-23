import { Artifact } from '@/components/create-artifact';
import { DocumentSkeleton } from '@/components/document-skeleton';
import {
  CopyIcon,
  DownloadIcon,
  RedoIcon,
  UndoIcon,
} from '@/components/icons';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { useEffect, useState, useRef } from 'react';
import mermaid from 'mermaid';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Maximize2 } from 'lucide-react';

// Interface for the Mermaid tool props
export interface MermaidToolProps {
  diagram: string;
  title?: string;
  description?: string;
  type?:
    | 'flowchart'
    | 'sequence'
    | 'class'
    | 'entity-relationship'
    | 'gantt'
    | 'state'
    | 'git'
    | 'pie'
    | 'mindmap'
    | 'other';
}

function MermaidRenderer({
  diagram,
  title,
  description,
  type = 'other',
  isInline = false,
}: MermaidToolProps & { isInline?: boolean }) {
  const [renderedContent, setRenderedContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const renderDiagram = async () => {
      if (!diagram || !containerRef.current) return;

      try {
        setError(null);
        
        // Initialize mermaid with configuration
        mermaid.initialize({
          startOnLoad: false,
          theme: 'default',
          securityLevel: 'loose',
          fontFamily: 'arial',
        });

        // Generate unique ID for this diagram
        const diagramId = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Render the diagram to SVG
        const { svg } = await mermaid.render(diagramId, diagram);
        
        setRenderedContent(svg);
      } catch (err) {
        console.error('Mermaid rendering error:', err);
        setError(`Error rendering diagram: ${err instanceof Error ? err.message : 'Unknown error'}`);
        
        // Fallback to showing code if rendering fails
        const fallbackContent = `
<div style="background: #fef2f2; padding: 1rem; border-radius: 4px; border: 1px solid #fecaca;">
  <h4 style="margin: 0 0 0.5rem 0; color: #dc2626; font-size: 0.9rem;">Diagram Rendering Failed</h4>
  <p style="margin: 0 0 0.5rem 0; font-size: 0.8rem; color: #991b1b;">${err instanceof Error ? err.message : 'Unknown error'}</p>
  <details>
    <summary style="cursor: pointer; font-size: 0.8rem; color: #7c2d12;">Show diagram code</summary>
    <pre style="margin: 0.5rem 0 0 0; font-family: monospace; font-size: 0.7rem; white-space: pre-wrap; color: #555; background: #f9f9f9; padding: 0.5rem; border-radius: 2px;">${diagram}</pre>
  </details>
</div>`;
        setRenderedContent(fallbackContent);
      }
    };

    renderDiagram();
  }, [diagram, type]);

  // Function to download the diagram code
  const downloadCode = () => {
    const blob = new Blob([diagram], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'diagram'}.mmd`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Diagram code downloaded!');
  };

  // Function to download the rendered SVG
  const downloadSVG = () => {
    if (renderedContent && !error) {
      const blob = new Blob([renderedContent], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title || 'diagram'}.svg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Diagram SVG downloaded!');
    }
  };

  const renderDiagramContent = () => {
    if (error) {
      return (
        <div className="text-red-500 p-4 bg-red-50 rounded border border-red-200">
          <h4 className="font-semibold">Error processing diagram</h4>
          <p className="text-sm mt-1">{error}</p>
        </div>
      );
    }

    if (renderedContent) {
      return <div dangerouslySetInnerHTML={{ __html: renderedContent }} />;
    }

    return (
      <div className="flex justify-center items-center h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  };

  if (isInline) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="p-4">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>
                {title ||
                  `${type.charAt(0).toUpperCase() + type.slice(1)} Diagram`}
              </CardTitle>
              {description && <CardDescription>{description}</CardDescription>}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={downloadCode}
                title="Download diagram code"
              >
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div
            ref={containerRef}
            className="mermaid-container overflow-auto max-h-[400px] border rounded p-4 bg-white"
            style={{
              /* Ensure proper styling for Mermaid diagrams */
              fontSize: '14px',
              lineHeight: '1.4',
            }}
          >
            {renderDiagramContent()}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="h-full w-full flex flex-col">
      <div 
        ref={containerRef}
        className="flex-grow overflow-auto p-4 bg-white"
        style={{
          /* Ensure proper styling for Mermaid diagrams */
          fontSize: '14px',
          lineHeight: '1.4',
        }}
      >
        {renderDiagramContent()}
      </div>
    </div>
  );
}

interface MermaidArtifactMetadata {
  type?: string;
  description?: string;
}

export const mermaidArtifact = new Artifact<'mermaid', MermaidArtifactMetadata>({
  kind: 'mermaid',
  description: 'Useful for creating diagrams, flowcharts, and visualizations using Mermaid syntax.',
  initialize: async ({ setMetadata }) => {
    setMetadata({
      type: 'flowchart',
      description: '',
    });
  },
  onStreamPart: ({ streamPart, setMetadata, setArtifact }) => {
    if (streamPart.type === 'mermaid-type') {
      setMetadata((metadata) => ({
        ...metadata,
        type: streamPart.content as string,
      }));
    }

    if (streamPart.type === 'mermaid-description') {
      setMetadata((metadata) => ({
        ...metadata,
        description: streamPart.content as string,
      }));
    }

    if (streamPart.type === 'mermaid-delta') {
      setArtifact((draftArtifact) => ({
        ...draftArtifact,
        content: streamPart.content as string,
        isVisible:
          draftArtifact.status === 'streaming' &&
          draftArtifact.content.length > 50 &&
          draftArtifact.content.length < 60
            ? true
            : draftArtifact.isVisible,
        status: 'streaming',
      }));
    }
  },
  content: ({
    content,
    title,
    isLoading,
    metadata,
    isInline,
  }) => {
    if (isLoading) {
      return <DocumentSkeleton artifactKind="mermaid" />;
    }

    return (
      <MermaidRenderer
        diagram={content}
        title={title}
        description={metadata?.description}
        type={metadata?.type as any}
        isInline={isInline}
      />
    );
  },
  actions: [
    {
      icon: <UndoIcon size={18} />,
      description: 'View Previous version',
      onClick: ({ handleVersionChange }) => {
        handleVersionChange('prev');
      },
      isDisabled: ({ currentVersionIndex }) => {
        return currentVersionIndex === 0;
      },
    },
    {
      icon: <RedoIcon size={18} />,
      description: 'View Next version',
      onClick: ({ handleVersionChange }) => {
        handleVersionChange('next');
      },
      isDisabled: ({ isCurrentVersion }) => {
        return isCurrentVersion;
      },
    },
    {
      icon: <CopyIcon size={18} />,
      description: 'Copy diagram code',
      onClick: ({ content }) => {
        navigator.clipboard.writeText(content);
        toast.success('Diagram code copied to clipboard!');
      },
    },
    {
      icon: <DownloadIcon size={18} />,
      description: 'Download diagram code',
      onClick: ({ content, metadata }) => {
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'diagram.mmd';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success('Diagram code downloaded!');
      },
    },
  ],
  toolbar: [
    {
      icon: <RotateCcw />,
      description: 'Regenerate diagram',
      onClick: ({ appendMessage }) => {
        appendMessage({
          role: 'user',
          content: 'Please regenerate this diagram with improvements.',
        });
      },
    },
  ],
}); 