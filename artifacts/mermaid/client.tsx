import { Artifact } from '@/components/create-artifact';
import { CopyIcon, DownloadIcon, RedoIcon, UndoIcon } from '@/components/icons';
import { RotateCcw, FileImage } from 'lucide-react';
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
import { Download } from 'lucide-react';

// Loading component for streaming Mermaid diagrams
function MermaidStreamingLoader({ isInline = false }: { isInline?: boolean }) {
  if (isInline) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="p-4">
          <div className="flex justify-between items-center">
            <div className="flex-1">
              <div className="animate-pulse rounded-lg h-6 bg-muted-foreground/20 w-48 mb-2" />
              <div className="animate-pulse rounded-lg h-4 bg-muted-foreground/20 w-64" />
            </div>
            <div className="flex gap-2">
              <div className="animate-pulse rounded-md h-8 w-8 bg-muted-foreground/20" />
              <div className="animate-pulse rounded-md h-8 w-8 bg-muted-foreground/20" />
              <div className="animate-pulse rounded-md h-8 w-8 bg-muted-foreground/20" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="border rounded p-4 bg-white min-h-[300px] flex flex-col items-center justify-center gap-4">
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
              <span className="text-sm text-gray-600">
                Generating diagram...
              </span>
            </div>
            <div className="flex flex-col gap-2 w-full max-w-md">
              <div className="animate-pulse rounded-lg h-4 bg-muted-foreground/20 w-full" />
              <div className="animate-pulse rounded-lg h-4 bg-muted-foreground/20 w-3/4" />
              <div className="animate-pulse rounded-lg h-4 bg-muted-foreground/20 w-1/2" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="h-full w-full flex flex-col items-center justify-center p-8 bg-white">
      <div className="flex flex-col items-center gap-4 max-w-md w-full">
        <div className="flex items-center gap-3 mb-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          <span className="text-lg text-gray-700">Generating diagram...</span>
        </div>
        <div className="w-full space-y-3">
          <div className="animate-pulse rounded-lg h-6 bg-muted-foreground/20 w-full" />
          <div className="animate-pulse rounded-lg h-6 bg-muted-foreground/20 w-4/5" />
          <div className="animate-pulse rounded-lg h-6 bg-muted-foreground/20 w-3/5" />
          <div className="animate-pulse rounded-lg h-6 bg-muted-foreground/20 w-4/5" />
          <div className="animate-pulse rounded-lg h-6 bg-muted-foreground/20 w-2/5" />
        </div>
      </div>
    </div>
  );
}

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
      if (!diagram || !containerRef.current) {
        console.log('Mermaid: Missing diagram or container', {
          diagram: !!diagram,
          container: !!containerRef.current,
        });
        return;
      }

      try {
        setError(null);
        setRenderedContent(null); // Clear previous content

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
        setError(
          `Error rendering diagram: ${err instanceof Error ? err.message : 'Unknown error'}`,
        );

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
      a.download = 'diagram.svg';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Diagram SVG downloaded!');
    }
  };

  // Function to download the diagram as PNG
  const downloadPNG = () => {
    if (renderedContent && !error) {
      try {
        // Create a new image element
        const img = new Image();

        // Set crossOrigin to avoid CORS issues
        img.crossOrigin = 'anonymous';

        // Create a data URL from the SVG content to avoid tainted canvas
        const svgDataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(renderedContent)))}`;

        img.onload = () => {
          // Create a canvas element
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            toast.error('Canvas not supported');
            return;
          }

          // Set canvas dimensions to match the image
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;

          // Fill canvas with white background (optional, for transparency)
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // Draw the image onto the canvas
          ctx.drawImage(img, 0, 0);

          // Convert canvas to PNG blob and download
          canvas.toBlob((blob) => {
            if (blob) {
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'diagram.png';
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
              toast.success('Diagram PNG downloaded!');
            } else {
              toast.error('Failed to create PNG');
            }
          }, 'image/png');

          // No cleanup needed for data URL
        };

        img.onerror = () => {
          toast.error('Failed to load SVG for PNG conversion');
        };

        img.src = svgDataUrl;
      } catch (error) {
        console.error('Error converting SVG to PNG:', error);
        toast.error('Failed to convert diagram to PNG');
      }
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
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
                title="Download diagram code (.mmd)"
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={downloadSVG}
                title="Download as SVG"
                disabled={!renderedContent || !!error}
              >
                <FileImage className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={downloadPNG}
                title="Download as PNG"
                disabled={!renderedContent || !!error}
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

export const mermaidArtifact = new Artifact<'mermaid', MermaidArtifactMetadata>(
  {
    kind: 'mermaid',
    description:
      'Useful for creating diagrams, flowcharts, and visualizations using Mermaid syntax.',
    initialize: async ({ setMetadata }) => {
      setMetadata({
        type: 'flowchart',
        description: '',
      });
    },
    onStreamPart: ({ streamPart, setMetadata, setArtifact }) => {
      if (streamPart.type === 'data-mermaid-type') {
        setMetadata((metadata) => ({
          ...metadata,
          type: streamPart.data,
        }));
      }

      if (streamPart.type === 'data-mermaid-description') {
        setMetadata((metadata) => ({
          ...metadata,
          description: streamPart.data,
        }));
      }

      if (streamPart.type === 'data-mermaid-delta') {
        setArtifact((draftArtifact) => ({
          ...draftArtifact,
          content: streamPart.data,
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
    content: ({ content, title, isLoading, status, metadata, isInline }) => {
      if (isLoading || status === 'streaming') {
        return <MermaidStreamingLoader isInline={isInline} />;
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
        description: 'Download diagram code (.mmd)',
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
      {
        icon: <FileImage size={18} />,
        description: 'Download as SVG',
        onClick: ({ content, metadata }) => {
          // We need to render the mermaid content to SVG first
          import('mermaid').then((mermaid) => {
            mermaid.default.initialize({
              startOnLoad: false,
              theme: 'default',
              securityLevel: 'loose',
              fontFamily: 'arial',
            });

            const diagramId = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            mermaid.default
              .render(diagramId, content)
              .then(({ svg }) => {
                const blob = new Blob([svg], { type: 'image/svg+xml' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'diagram.svg';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                toast.success('Diagram SVG downloaded!');
              })
              .catch((error) => {
                console.error('Error rendering SVG:', error);
                toast.error('Failed to render diagram as SVG');
              });
          });
        },
      },
      {
        icon: <DownloadIcon size={18} />,
        description: 'Download as PNG',
        onClick: ({ content, metadata }) => {
          // We need to render the mermaid content to SVG first, then convert to PNG
          import('mermaid').then((mermaid) => {
            mermaid.default.initialize({
              startOnLoad: false,
              theme: 'default',
              securityLevel: 'loose',
              fontFamily: 'arial',
            });

            const diagramId = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            mermaid.default
              .render(diagramId, content)
              .then(({ svg }) => {
                // Convert SVG to PNG
                const img = new Image();
                img.crossOrigin = 'anonymous';
                const svgDataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;

                img.onload = () => {
                  const canvas = document.createElement('canvas');
                  const ctx = canvas.getContext('2d');

                  if (!ctx) {
                    toast.error('Canvas not supported');
                    return;
                  }

                  canvas.width = img.naturalWidth || img.width;
                  canvas.height = img.naturalHeight || img.height;

                  ctx.fillStyle = 'white';
                  ctx.fillRect(0, 0, canvas.width, canvas.height);
                  ctx.drawImage(img, 0, 0);

                  canvas.toBlob((blob) => {
                    if (blob) {
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'diagram.png';
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                      toast.success('Diagram PNG downloaded!');
                    } else {
                      toast.error('Failed to create PNG');
                    }
                  }, 'image/png');

                  // No cleanup needed for data URL
                };

                img.onerror = () => {
                  toast.error('Failed to load SVG for PNG conversion');
                };

                img.src = svgDataUrl;
              })
              .catch((error) => {
                console.error('Error rendering diagram:', error);
                toast.error('Failed to render diagram');
              });
          });
        },
      },
    ],
    toolbar: [
      {
        icon: <RotateCcw />,
        description: 'Regenerate diagram',
        onClick: ({ sendMessage }) => {
          sendMessage({
            role: 'user',
            parts: [
              {
                type: 'text',
                text: 'Please regenerate this diagram with improvements.',
              },
            ],
          });
        },
      },
    ],
  },
);
