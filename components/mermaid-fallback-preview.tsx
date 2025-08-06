import React from 'react';
import { AuthFlowPreview } from './auth-flow-preview';

interface MermaidFallbackPreviewProps {
  title?: string;
  type?: string;
  description?: string;
  className?: string;
}

export function MermaidFallbackPreview({ 
  title = "Authentication Flow - UML Sequence Diagram",
  type = "sequence",
  description,
  className = "" 
}: MermaidFallbackPreviewProps) {
  // If it's an authentication flow sequence diagram, show our custom preview
  if (type === 'sequence' && title.toLowerCase().includes('authentication')) {
    return <AuthFlowPreview className={className} />;
  }

  // Generic fallback for other diagram types
  return (
    <div className={`bg-white border rounded-lg p-4 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">{title}</h3>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
          <span className="text-sm text-gray-500">Preview Mode</span>
        </div>
      </div>
      
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center bg-gray-50">
        <div className="mb-4">
          <svg className="w-16 h-16 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <h4 className="text-lg font-medium text-gray-700 mb-2">Diagram Preview</h4>
        <p className="text-gray-500 mb-4">
          This is a preview of your {type} diagram. The actual diagram rendering may be temporarily unavailable.
        </p>
        {description && (
          <div className="text-sm text-gray-600 bg-white p-3 rounded border">
            <strong>Description:</strong> {description}
          </div>
        )}
        <div className="mt-4 text-xs text-gray-400">
          <p>Diagram Type: {type}</p>
          <p>Title: {title}</p>
        </div>
      </div>
    </div>
  );
} 