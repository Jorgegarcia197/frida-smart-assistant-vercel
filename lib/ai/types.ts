import type { InferUITool } from 'ai';
import type {
  createDocument,
  createMermaidDiagram,
  getWeather,
  requestSuggestions,
  updateAgentTasks,
  updateDocument,
} from './tools';

type weatherTool = InferUITool<typeof getWeather>;
type createDocumentTool = InferUITool<ReturnType<typeof createDocument>>;
type updateDocumentTool = InferUITool<ReturnType<typeof updateDocument>>;
type requestSuggestionsTool = InferUITool<
  ReturnType<typeof requestSuggestions>
>;
type createMermaidDiagramTool = InferUITool<
  ReturnType<typeof createMermaidDiagram>
>;
type updateAgentTasksTool = InferUITool<typeof updateAgentTasks>;

export type ChatTools = {
  getWeather: weatherTool;
  createDocument: createDocumentTool;
  updateDocument: updateDocumentTool;
  requestSuggestions: requestSuggestionsTool;
  createMermaidDiagram: createMermaidDiagramTool;
  updateAgentTasks: updateAgentTasksTool;
};
