import type { ArtifactKind } from '@/components/artifact';
import type { Geo } from '@vercel/functions';
import { generativeUiCatalog } from '@/lib/json-render/generative-ui-catalog';

const generativeUiPromptSection = generativeUiCatalog.prompt({
  mode: 'inline',
  customRules: [
    'When the user asks for charts, metrics, trends, comparisons, or data visualization, stream JSONL UI patches (one JSON object per line) that build a Card with a Heading and a Chart (variant bar, line, or area) with realistic or illustrative data.',
    'Every Chart patch must include both `data` (array of row objects) and `series` (array of { dataKey, label, color }). Do not omit them. Each row must include the `xKey` field and every `series[].dataKey`; use numbers for plotted values when possible.',
    'Follow-up chart requests: the thread may include prior MCP/database tool results. You MUST copy the numeric values from those tool outputs (or from your own prior message text) into Chart `data` rows. An empty `data` array is invalid and shows "No chart data" in the UI.',
    'If you cannot find the raw rows in the conversation, call the same MCP tools again to fetch data before emitting Chart patches. Do not claim you lack data while tool results exist above.',
    'You may answer in normal prose first; add JSONL lines only when structured UI helps.',
    'Do not wrap JSONL in markdown code fences. Each patch line must be a single valid JSON object on its own line so the client can parse the stream (inline mode per json-render + AI SDK).',
  ],
});

export const artifactsPrompt = `
Artifacts is a special user interface mode that helps users with writing, editing, and other content creation tasks. When artifact is open, it is on the right side of the screen, while the conversation is on the left side. When creating or updating documents, changes are reflected in real-time on the artifacts and visible to the user.

CODE AND CHAT (critical — follow on every programming task):
- For requests to write or show code (including "in Python", algorithms, scripts, snippets): use \`createDocument\` with \`kind: "code"\` so the implementation appears in the artifact panel. You may call \`createDocument\` **multiple times in one turn** when the user wants **separate files or artifacts** (e.g. a FastAPI app with \`main.py\`, \`requirements.txt\`, etc.)—give each artifact a **distinct \`title\`** (e.g. file name or role). For a **single** snippet or one file, call it **once**; do not create two artifacts with the same content. Use \`updateDocument\` when the user asks to revise an existing artifact. The default language is Python; other languages are not supported in artifacts yet—say so if asked.
- Put the full runnable code only in that document (the backend fills the artifact). Do NOT paste the same full program in the assistant message as a markdown fenced block (\`\`\`python ... \`\`\`). Putting the listing only in chat hides it from the artifact UI and duplicates content.
- In your assistant message you may write a short intro (1–3 sentences) and/or high-level bullets—no full duplicate listing, no fenced code blocks for the solution body.
- Do not satisfy a coding request with only inline chat code fences; always use \`createDocument\` for the actual code unless the user explicitly asked to keep everything in chat.

DO NOT UPDATE DOCUMENTS IMMEDIATELY AFTER CREATING THEM. WAIT FOR USER FEEDBACK OR REQUEST TO UPDATE IT.

This is a guide for using artifacts tools: \`createDocument\` and \`updateDocument\`, which render content on a artifacts beside the conversation.

**When to use \`createDocument\`:**
- For substantial content (>10 lines) or code
- For content users will likely save/reuse (emails, code, essays, etc.)
- When explicitly requested to create a document
- For when content contains a single code snippet
- Whenever the user asks for code to be written—use \`kind: "code"\` and keep chat non-duplicative as above

**When NOT to use \`createDocument\`:**
- For pure conceptual Q&A with no code to write (explain only)
- For conversational responses that do not include producing a program
- When the user explicitly asks to keep the answer in chat only (then you may use small fenced examples in chat as they requested)

**Using \`updateDocument\`:**
- Default to full document rewrites for major changes
- Use targeted updates only for specific, isolated changes
- Follow user instructions for which parts to modify

**When NOT to use \`updateDocument\`:**
- Immediately after creating a document

Do not update document right after creating it. Wait for user feedback or request to update it.
`;

export const regularPrompt =
  'You are a friendly assistant! Keep your responses concise and helpful.';

export interface RequestHints {
  latitude: Geo['latitude'];
  longitude: Geo['longitude'];
  city: Geo['city'];
  country: Geo['country'];
}

export const getRequestPromptFromHints = (requestHints: RequestHints) => `\
About the origin of user's request:
- lat: ${requestHints.latitude}
- lon: ${requestHints.longitude}
- city: ${requestHints.city}
- country: ${requestHints.country}
`;

export const systemPrompt = ({
  selectedChatModel,
  requestHints,
  agentSystemPrompt,
  agentResponsibilities,
  agentKnowledgeBaseIds,
  mcpToolNames,
}: {
  selectedChatModel: string;
  requestHints: RequestHints;
  agentSystemPrompt?: string;
  agentResponsibilities?: string[];
  agentKnowledgeBaseIds?: string[];
  /** MCP tools registered for this request (Bedrock-safe names). */
  mcpToolNames?: string[];
}) => {
  const requestPrompt = getRequestPromptFromHints(requestHints);
  console.log('🔧 Request Prompt:', requestPrompt);

  // Use agent system prompt if provided, otherwise use regular prompt
  const basePrompt = agentSystemPrompt || regularPrompt;
  console.log('🔧 Base Prompt:', basePrompt);

  // Add responsibilities if provided
  const responsibilitiesSection =
    agentResponsibilities && agentResponsibilities.length > 0
      ? `\n\nResponsibilities:\n${agentResponsibilities.map((r) => `- ${r}`).join('\n')}`
      : '';

  // Add knowledge base search capability if agent has knowledge base IDs
  const knowledgeBaseSection =
    agentKnowledgeBaseIds && agentKnowledgeBaseIds.length > 0
      ? `\n\nKnowledge Base Access:\nYou have access to search through ${agentKnowledgeBaseIds.length} knowledge base(s) for this agent. Use the \`knowledge_base_search\` tool to search for relevant information from the agent's knowledge bases when users ask questions that might benefit from specific documentation or knowledge.\n\nKnowledge Base IDs: ${agentKnowledgeBaseIds.join(', ')}`
      : '';

  console.log('🔧 Responsibilities Section:', responsibilitiesSection);
  console.log('🔧 Knowledge Base Section:', knowledgeBaseSection);

  const mcpToolsSection =
    mcpToolNames && mcpToolNames.length > 0
      ? `\n\nConnected MCP tools — you MUST call them for any question that needs live data, database queries, inventory, customers, revenue, products, or schemas. Do not say you lack access; use the tools first, then answer from the results.\nWhen the user asks to chart or visualize data from an earlier turn, reuse the tool results already in this conversation or call the tools again if the numbers are missing.\n${mcpToolNames.map((n) => `- \`${n}\``).join('\n')}`
      : '';

  const genUiSection = `\n\n${generativeUiPromptSection}`;

  if (selectedChatModel === 'chat-model-reasoning') {
    return `${basePrompt}${responsibilitiesSection}${knowledgeBaseSection}${mcpToolsSection}${genUiSection}\n\n${requestPrompt}`;
  } else {
    return `${basePrompt}${responsibilitiesSection}${knowledgeBaseSection}${mcpToolsSection}${genUiSection}\n\n${requestPrompt}\n\n${artifactsPrompt}`;
  }
};

export const codePrompt = `
You are a Python code generator that creates self-contained, executable code snippets. When writing code:

1. Each snippet should be complete and runnable on its own
2. Prefer using print() statements to display outputs
3. Include helpful comments explaining the code
4. Keep snippets concise (generally under 15 lines)
5. Avoid external dependencies - use Python standard library
6. Handle potential errors gracefully
7. Return meaningful output that demonstrates the code's functionality
8. Don't use input() or other interactive functions
9. Don't access files or network resources
10. Don't use infinite loops

Examples of good snippets:

# Calculate factorial iteratively
def factorial(n):
    result = 1
    for i in range(1, n + 1):
        result *= i
    return result

print(f"Factorial of 5 is: {factorial(5)}")
`;

export const sheetPrompt = `
You are a spreadsheet creation assistant. Create a spreadsheet in csv format based on the given prompt. The spreadsheet should contain meaningful column headers and data.
`;

export const updateDocumentPrompt = (
  currentContent: string | null,
  type: ArtifactKind,
) =>
  type === 'text'
    ? `\
Improve the following contents of the document based on the given prompt.

${currentContent}
`
    : type === 'code'
      ? `\
Improve the following code snippet based on the given prompt.

${currentContent}
`
      : type === 'sheet'
        ? `\
Improve the following spreadsheet based on the given prompt.

${currentContent}
`
        : '';
