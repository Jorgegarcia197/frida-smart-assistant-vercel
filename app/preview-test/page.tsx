import { AuthFlowPreview } from '@/components/auth-flow-preview';

export default function PreviewTestPage() {
  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-center">Authentication Flow Preview</h1>
        
        <div className="grid gap-8">
          <div>
            <h2 className="text-xl font-semibold mb-4">UML Sequence Diagram Preview</h2>
            <AuthFlowPreview />
          </div>
          
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h2 className="text-xl font-semibold mb-4">About This Preview</h2>
            <p className="text-gray-600 mb-4">
              This is a visual preview of what your UML sequence diagram for the authentication flow should look like. 
              The diagram shows the interaction between four main components:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-600">
              <li><strong>User:</strong> The person trying to authenticate</li>
              <li><strong>Client App:</strong> The application (web/mobile app)</li>
              <li><strong>Auth Server:</strong> The authentication/authorization server</li>
              <li><strong>Resource Server:</strong> The server hosting protected resources</li>
            </ul>
            
            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <h3 className="font-semibold text-blue-800 mb-2">Why the original diagram might not be showing:</h3>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• Mermaid library might not be properly initialized</li>
                <li>• The diagram syntax might have errors</li>
                <li>• There could be a rendering issue with the mermaid component</li>
                <li>• The diagram content might be empty or malformed</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 