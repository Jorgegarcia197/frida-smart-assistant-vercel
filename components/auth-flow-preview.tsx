import React from 'react';

interface AuthFlowPreviewProps {
  className?: string;
}

export function AuthFlowPreview({ className = '' }: AuthFlowPreviewProps) {
  return (
    <div className={`bg-white border rounded-lg p-4 ${className}`}>
      <h3 className="text-lg font-semibold mb-4 text-center">Authentication Flow - UML Sequence Diagram</h3>
      
      <svg
        width="100%"
        height="400"
        viewBox="0 0 800 400"
        className="border rounded bg-gray-50"
      >
        {/* Background */}
        <rect width="100%" height="100%" fill="#fafafa" />
        
        {/* Title */}
        <text x="400" y="20" textAnchor="middle" fontSize="14" fontWeight="bold" fill="#333">
          Authentication Flow
        </text>
        
        {/* Lifelines */}
        {/* User Lifeline */}
        <line x1="100" y1="40" x2="100" y2="380" stroke="#666" strokeWidth="2" strokeDasharray="5,5" />
        <rect x="75" y="30" width="50" height="20" fill="#e3f2fd" stroke="#1976d2" strokeWidth="2" rx="3" />
        <text x="100" y="42" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#1976d2">User</text>
        <rect x="75" y="370" width="50" height="20" fill="#e3f2fd" stroke="#1976d2" strokeWidth="2" rx="3" />
        <text x="100" y="382" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#1976d2">User</text>
        
        {/* Client Lifeline */}
        <line x1="250" y1="40" x2="250" y2="380" stroke="#666" strokeWidth="2" strokeDasharray="5,5" />
        <rect x="225" y="30" width="50" height="20" fill="#f3e5f5" stroke="#7b1fa2" strokeWidth="2" rx="3" />
        <text x="250" y="42" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#7b1fa2">Client</text>
        <rect x="225" y="370" width="50" height="20" fill="#f3e5f5" stroke="#7b1fa2" strokeWidth="2" rx="3" />
        <text x="250" y="382" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#7b1fa2">Client</text>
        
        {/* AuthServer Lifeline */}
        <line x1="400" y1="40" x2="400" y2="380" stroke="#666" strokeWidth="2" strokeDasharray="5,5" />
        <rect x="375" y="30" width="50" height="20" fill="#e8f5e8" stroke="#388e3c" strokeWidth="2" rx="3" />
        <text x="400" y="42" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#388e3c">AuthServer</text>
        <rect x="375" y="370" width="50" height="20" fill="#e8f5e8" stroke="#388e3c" strokeWidth="2" rx="3" />
        <text x="400" y="382" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#388e3c">AuthServer</text>
        
        {/* ResourceServer Lifeline */}
        <line x1="550" y1="40" x2="550" y2="380" stroke="#666" strokeWidth="2" strokeDasharray="5,5" />
        <rect x="525" y="30" width="50" height="20" fill="#fff3e0" stroke="#f57c00" strokeWidth="2" rx="3" />
        <text x="550" y="42" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#f57c00">ResourceServer</text>
        <rect x="525" y="370" width="50" height="20" fill="#fff3e0" stroke="#f57c00" strokeWidth="2" rx="3" />
        <text x="550" y="382" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#f57c00">ResourceServer</text>
        
        {/* Messages */}
        {/* 1. User -> Client: Request authentication */}
        <line x1="100" y1="80" x2="250" y2="80" stroke="#333" strokeWidth="2" markerEnd="url(#arrowhead)" />
        <text x="175" y="75" textAnchor="middle" fontSize="10" fill="#333">Request authentication</text>
        
        {/* 2. Client -> AuthServer: Send credentials */}
        <line x1="250" y1="120" x2="400" y2="120" stroke="#333" strokeWidth="2" markerEnd="url(#arrowhead)" />
        <text x="325" y="115" textAnchor="middle" fontSize="10" fill="#333">Send credentials</text>
        
        {/* 3. AuthServer self-message: Validate credentials */}
        <line x1="400" y1="160" x2="450" y2="160" stroke="#333" strokeWidth="2" markerEnd="url(#arrowhead)" />
        <line x1="450" y1="160" x2="450" y2="180" stroke="#333" strokeWidth="2" />
        <line x1="450" y1="180" x2="400" y2="180" stroke="#333" strokeWidth="2" />
        <text x="425" y="175" textAnchor="middle" fontSize="10" fill="#333">Validate credentials</text>
        
        {/* 4. AuthServer -> Client: Provide token (success path) */}
        <line x1="400" y1="220" x2="250" y2="220" stroke="#333" strokeWidth="2" strokeDasharray="5,5" markerEnd="url(#arrowhead)" />
        <text x="325" y="215" textAnchor="middle" fontSize="10" fill="#333">Provide token</text>
        
        {/* 5. Client -> ResourceServer: Request resource with token */}
        <line x1="250" y1="260" x2="550" y2="260" stroke="#333" strokeWidth="2" markerEnd="url(#arrowhead)" />
        <text x="400" y="255" textAnchor="middle" fontSize="10" fill="#333">Request resource with token</text>
        
        {/* 6. ResourceServer self-message: Validate token */}
        <line x1="550" y1="300" x2="600" y2="300" stroke="#333" strokeWidth="2" markerEnd="url(#arrowhead)" />
        <line x1="600" y1="300" x2="600" y2="320" stroke="#333" strokeWidth="2" />
        <line x1="600" y1="320" x2="550" y2="320" stroke="#333" strokeWidth="2" />
        <text x="575" y="315" textAnchor="middle" fontSize="10" fill="#333">Validate token</text>
        
        {/* 7. ResourceServer -> Client: Provide resource */}
        <line x1="550" y1="340" x2="250" y2="340" stroke="#333" strokeWidth="2" strokeDasharray="5,5" markerEnd="url(#arrowhead)" />
        <text x="400" y="335" textAnchor="middle" fontSize="10" fill="#333">Provide resource</text>
        
        {/* Alternative path indicators */}
        <text x="400" y="200" textAnchor="middle" fontSize="10" fill="#666" fontStyle="italic">[Valid credentials]</text>
        
        {/* Arrowhead marker definition */}
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#333" />
          </marker>
        </defs>
      </svg>
      
      <div className="mt-4 text-sm text-gray-600">
        <p className="mb-2"><strong>Flow Description:</strong></p>
        <ol className="list-decimal list-inside space-y-1 text-xs">
          <li>User requests authentication from Client</li>
          <li>Client sends credentials to AuthServer</li>
          <li>AuthServer validates credentials</li>
          <li>AuthServer provides token to Client (success path)</li>
          <li>Client requests resource with token from ResourceServer</li>
          <li>ResourceServer validates token</li>
          <li>ResourceServer provides resource to Client</li>
        </ol>
      </div>
    </div>
  );
} 