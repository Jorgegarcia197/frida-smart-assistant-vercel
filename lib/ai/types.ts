import type { InferUITool } from 'ai';
import type {
  createDocument,
  createIshikawaDiagram,
  createMermaidDiagram,
  getWeather,
  renderHostMap,
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
type createIshikawaDiagramTool = InferUITool<
  ReturnType<typeof createIshikawaDiagram>
>;
type updateAgentTasksTool = InferUITool<typeof updateAgentTasks>;
type renderHostMapTool = InferUITool<typeof renderHostMap>;

export type ChatTools = {
  getWeather: weatherTool;
  createDocument: createDocumentTool;
  updateDocument: updateDocumentTool;
  requestSuggestions: requestSuggestionsTool;
  createMermaidDiagram: createMermaidDiagramTool;
  createIshikawaDiagram: createIshikawaDiagramTool;
  updateAgentTasks: updateAgentTasksTool;
  renderHostMap: renderHostMapTool;
};
