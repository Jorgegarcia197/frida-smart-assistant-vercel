import type { ArtifactKind } from '@/components/artifact';
import type { Geo } from '@vercel/functions';
import { generativeUiCatalog } from '@/lib/json-render/generative-ui-catalog';

const generativeUiPromptSection = generativeUiCatalog.prompt({
  mode: 'inline',
  customRules: [
    'Use JSONL UI patches **only** for **Chart** and **Map** visualizations. Do **not** use JSONL Card/Stack/Text to present **tables**, matrices, host/server **comparativas**, inventories, or any row/column data — put those in **GitHub-flavored markdown tables** in your normal assistant message text so they render in the main bubble (Streamdown), like other prose.',
    'When the user asks for charts, metrics as plots, trends, or non-tabular data visualization, stream JSONL UI patches (one JSON object per line) that build a Card with a Heading and a Chart with realistic or illustrative data.',
    'When the user asks to see locations on a **map** (hosts, servers, offices, sites, etc.), first call the `renderHostMap` tool with the structured host data (title + array of {host, location, state, country, lat, lng}). If you do not have exact lat/lng, provide **approximate coordinates** based on your geographic knowledge of the city/state and note in your prose that coordinates are approximate. After the tool call returns, also emit JSONL UI patches that build a Card with a Heading and a **Map** component. The Map `markers` array must match the hosts from the tool call — each marker needs `lat`, `lng`, `label` (host name), and `popup` (location + state + country). Set `centerLat`/`centerLng` to the geographic midpoint of all markers, and `zoom` to an appropriate level (e.g. 4–5 for a country, 7–9 for a single state, 11+ for a single city).',
    'Every Chart patch must include both `data` (array of row objects) and `series` (array of { dataKey, label, color }). Do not omit them. Each row must include the `xKey` field and every `series[].dataKey`; use numbers for plotted values when possible.',
    'Follow-up chart requests: the thread may include prior MCP/database tool results. You MUST copy the numeric values from those tool outputs (or from your own prior message text) into Chart `data` rows. An empty `data` array is invalid and shows "No chart data" in the UI.',
    'If you cannot find the raw rows in the conversation, call the same MCP tools again to fetch data before emitting Chart patches. Do not claim you lack data while tool results exist above.',
    'You may answer in normal prose first; add JSONL lines only when a Chart is appropriate. Skip JSONL entirely when the answer is only tabular — use markdown tables in text instead.',
    'Do not wrap JSONL in markdown code fences. Each patch line must be a single valid JSON object on its own line so the client can parse the stream (inline mode per json-render + AI SDK).',
    "Children integrity: every id listed in an element's `children` array must have a matching `/elements/<id>` definition in the same spec. Do not invent ids (e.g. `performance-table`, `data-grid`) unless you immediately add that element; for tables and matrices use GitHub-flavored markdown in the assistant message, not JSONL.",
    'Every Map patch must include `markers` (array of {lat, lng, label, popup}), `centerLat`, `centerLng`, and optionally `zoom`. Do not emit a Map with an empty `markers` array. Copy coordinates from the `renderHostMap` tool output into the Map JSONL patch.',
  ],
});

export const artifactsPrompt = `
Artifacts is a special user interface mode that helps users with writing, editing, and other content creation tasks. When artifact is open, it is on the right side of the screen, while the conversation is on the left side. When creating or updating documents, changes are reflected in real-time on the artifacts and visible to the user.

TEXT, REPORTS, HTML, AND "ARTIFACT" REQUESTS (critical):
- When the user asks for an **artifact**, **document**, **report**, **executive summary**, **informe**, **export**, or any **substantial write-up** they will read or save: call \`createDocument\` with \`kind: "text"\`. The text artifact supports **Markdown** (headings, lists, tables, emphasis). Prefer structured Markdown for summaries; avoid dumping a full standalone HTML document in chat.
- Do **not** put the full document body in the assistant message as a fenced block (\`\`\`html ... \`\`\`, \`\`\`markdown ... \`\`\`, etc.). That only renders as a code snippet in the chat bubble and **does not** open the artifact panel. The document body must be produced via \`createDocument\` (and \`updateDocument\` for edits).
- In chat you may give a **short** intro (1–3 sentences) pointing to the artifact—no full duplicate of the document.
- For \`createDocument\`, keep \`title\` concise and user-facing (short label shown in the artifact header). Put detailed generation instructions, facts, numbers, and constraints in \`prompt\`. If \`prompt\` is omitted, generation falls back to \`title\`.

CODE AND CHAT (critical — follow on every programming task):
- For requests to write or show code (including "in Python", algorithms, scripts, snippets): use \`createDocument\` with \`kind: "code"\` so the implementation appears in the artifact panel. You may call \`createDocument\` **multiple times in one turn** when the user wants **separate files or artifacts** (e.g. a FastAPI app with \`main.py\`, \`requirements.txt\`, etc.)—give each artifact a **distinct \`title\`** (e.g. file name or role). For a **single** snippet or one file, call it **once**; do not create two artifacts with the same content. Use \`updateDocument\` when the user asks to revise an existing artifact. The default language is Python; other languages are not supported in artifacts yet—say so if asked.
- Put the full runnable code only in that document (the backend fills the artifact). Do NOT paste the same full program in the assistant message as a markdown fenced block (\`\`\`python ... \`\`\`). Putting the listing only in chat hides it from the artifact UI and duplicates content.
- In your assistant message you may write a short intro (1–3 sentences) and/or high-level bullets—no full duplicate listing, no fenced code blocks for the solution body.
- Do not satisfy a coding request with only inline chat code fences; always use \`createDocument\` for the actual code unless the user explicitly asked to keep everything in chat.

DIAGRAMS, UML, AND VISUAL FLOWS (critical):
- When the user asks for a **diagram**, **UML** (any kind), **flowchart**, **sequence diagram**, **auth/login flow**, **architecture diagram**, **ER**, or similar: you MUST open the artifact panel using \`createMermaidDiagram\` (set \`type\` to the closest match: e.g. \`sequence\` for request/response flows, \`flowchart\` for processes, \`class\` for class-style UML, \`entity-relationship\` for ER) **or** \`createDocument\` with \`kind: "mermaid"\`. Mermaid can express UML-like diagrams (e.g. \`sequenceDiagram\`, \`classDiagram\`).
- If the user asks for an **Ishikawa**, **fishbone**, **cause-and-effect**, or **root-cause analysis** diagram, call \`createIshikawaDiagram\` **exactly once**. Provide: concise \`title\`, clear \`problem\`, and either explicit \`categories\` with causes or a suitable default framework (\`6M\`, \`8P\`, or \`software\`). Use \`language: "es"\` when the user is writing in Spanish. Use data already available in this conversation—do not call MCP tools just to generate a diagram unless the user explicitly asks for live data in it.
- Do **not** claim that UML or diagrams are unsupported, or that you can only describe them in chat. Do **not** satisfy a diagram request with prose alone unless the user explicitly asked for text-only.
- In chat you may give a **short** intro (1–3 sentences); the diagram is produced in the artifact.

DO NOT UPDATE DOCUMENTS IMMEDIATELY AFTER CREATING THEM. WAIT FOR USER FEEDBACK OR REQUEST TO UPDATE IT.

This is a guide for using artifacts tools: \`createDocument\` and \`updateDocument\`, which render content on a artifacts beside the conversation.

**When to use \`createDocument\`:**
- For substantial content (>10 lines) or code
- For content users will likely save/reuse (emails, code, essays, etc.)
- When explicitly requested to create a document
- For when content contains a single code snippet
- Whenever the user asks for code to be written—use \`kind: "code"\` and keep chat non-duplicative as above

**When NOT to use \`createDocument\`:**
- For pure conceptual Q&A with no code to write (explain only)—**unless** the user asked for a diagram or visual flow; then use \`createMermaidDiagram\` or \`kind: "mermaid"\` as in the diagrams section above
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

export interface SystemPromptInput {
  selectedChatModel: string;
  requestHints: RequestHints;
  agentSystemPrompt?: string;
  agentResponsibilities?: string[];
  agentKnowledgeBaseIds?: string[];
  /** MCP + Agent Builder HTTP tools (sanitized model-facing tool names). */
  mcpToolNames?: string[];
  /** True when OpenAI-compatible backend will inject Anthropic skills/tools. */
  anthropicSkillsEnabled?: boolean;
  /** Friendly list of enabled skill IDs, e.g. ['pdf', 'pptx']. */
  anthropicSkills?: string[];
  /** Enable strict mode that forbids artifact fallback for native file requests. */
  forceNativeFileSkills?: boolean;
  /** Frida agent has `computer-use` enabled and E2B desktop tool is registered. */
  desktopComputerUseEnabled?: boolean;
}

/**
 * A single named chunk of the system prompt. Mirrors the Claude Code pattern
 * (`src/constants/prompts.ts`): every block is addressable by id, labeled
 * `static` (product-stable, cache-friendly) or `dynamic` (per-session/agent),
 * so callers can reorder, omit, or move pieces across a cache boundary.
 */
export interface SystemPromptSection {
  id: string;
  kind: 'static' | 'dynamic';
  content: string;
}

/**
 * Literal marker separating static (globally cache-scoped) content from
 * dynamic (session-scoped) content. Matches the semantics of Claude Code's
 * `__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__`: it is a processing hint, not something
 * you want to stream to the model, so `joinSystemPromptSections` only emits it
 * when `includeBoundary: true` is requested.
 */
export const SYSTEM_PROMPT_DYNAMIC_BOUNDARY =
  '__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__';

/**
 * Build the ordered list of named system-prompt sections. Intended as the
 * single source of truth for what goes into the system prompt and in what
 * order; `systemPrompt()` is a thin wrapper around this plus a join.
 */
export const buildSystemPromptSections = ({
  selectedChatModel,
  requestHints,
  agentSystemPrompt,
  agentResponsibilities,
  agentKnowledgeBaseIds,
  mcpToolNames,
  anthropicSkillsEnabled,
  anthropicSkills,
  forceNativeFileSkills,
  desktopComputerUseEnabled,
}: SystemPromptInput): SystemPromptSection[] => {
  const requestPrompt = getRequestPromptFromHints(requestHints);

  const basePrompt = agentSystemPrompt || regularPrompt;

  const responsibilitiesSection =
    agentResponsibilities && agentResponsibilities.length > 0
      ? `Responsibilities:\n${agentResponsibilities.map((r) => `- ${r}`).join('\n')}`
      : '';

  const knowledgeBaseSection =
    agentKnowledgeBaseIds && agentKnowledgeBaseIds.length > 0
      ? `Knowledge Base Access:\nYou have access to search through ${agentKnowledgeBaseIds.length} knowledge base(s) for this agent. Use the \`knowledge_base_search\` tool to search for relevant information from the agent's knowledge bases when users ask questions that might benefit from specific documentation or knowledge.\n\nKnowledge Base IDs: ${agentKnowledgeBaseIds.join(', ')}`
      : '';

  const mcpHasSqlTool =
    mcpToolNames?.some((n) =>
      /execute_query|run_query|query_sql|sql_query/i.test(n),
    ) ?? false;

  const mcpHasTableSchemaTool =
    mcpToolNames?.some((n) => /describe_table|table_schema|list_columns/i.test(n)) ??
    false;

  const mcpListTablesName = mcpToolNames?.find((n) => /list_tables/i.test(n));
  const mcpDescribeTableName = mcpToolNames?.find((n) =>
    /describe_table/i.test(n),
  );
  const mcpExecuteQueryName = mcpToolNames?.find((n) =>
    /execute_query|run_query|query_sql|sql_query/i.test(n),
  );

  /** Bridges agent prose ("call describe_table") with actual registered tool ids (e.g. northwindmcp_describe_table). */
  const mcpSqlRuntimeNames =
    mcpHasSqlTool || mcpHasTableSchemaTool
      ? `\n- **Runtime tool ids:** The tools available to you use **prefixed names** from the list above (e.g. \`${mcpDescribeTableName ?? '…_describe_table'}\`), not the short names in examples elsewhere. Call the **exact** id from the list with a full JSON object.${
          mcpDescribeTableName
            ? `\n- **${mcpDescribeTableName}:** pass a table identifier from \`${mcpListTablesName ?? '…_list_tables'}\`, e.g. \`{"table_name":"public.orders"}\` or \`{"table":"public.orders"}\`. **Never** call with \`{}\`.`
            : ''
        }${
          mcpExecuteQueryName
            ? `\n- **${mcpExecuteQueryName}:** pass SQL in \`query\`, e.g. \`{"query":"SELECT 1"}\`. **Never** call with \`{}\`.`
            : ''
        }${
          mcpListTablesName
            ? `\n- **${mcpListTablesName}:** may use \`{}\` only if the tool schema allows it.`
            : ''
        }`
      : '';

  const mcpCheckMkHint =
    mcpToolNames?.some((n) => /CheckMK/i.test(n)) ?? false
      ? `\n**CheckMK:** Use the CheckMK / ROLE instructions from your **agent system prompt** for jsonquery shapes, parameter names (\`query\`, \`jsonquery_string\`, etc.), filters (\`host_name\`, \`host_tag_values\`, \`tag_values\`, \`display_name\`), state codes, and validation rules. The app does not substitute different filter logic here—match the agent prompt and each tool’s schema.`
      : '';

  const mcpSqlHints =
    mcpHasSqlTool || mcpHasTableSchemaTool
      ? `\n\nMCP SQL / database tools:
- Every tool call MUST satisfy the tool schema: include every required property with real values.${
          mcpHasSqlTool
            ? ` For query tools, use a non-empty SQL string in \`query\`. Never call SQL execution tools with an empty argument object.`
            : ''
        }${
          mcpHasTableSchemaTool
            ? ` If a tool requires \`table_name\`, pass a non-empty string from \`list_tables\` (shape as the tool expects, e.g. \`"public.orders"\`). Never call describe/schema tools with \`{}\`.`
            : ''
        }${mcpSqlRuntimeNames}${
          mcpHasSqlTool
            ? `\n- Use valid SQL: \`CASE\` expressions need \`THEN\` (and usually \`ELSE\`). Example counts: \`COUNT(CASE WHEN condition THEN 1 END)\` or \`SUM(CASE WHEN condition THEN 1 ELSE 0 END)\`. Invalid: \`CASE WHEN col = 1 END\` with no \`THEN\`.`
            : ''
        }`
      : '';

  const mcpToolsSection =
    mcpToolNames && mcpToolNames.length > 0
      ? `Connected tools (MCP and/or HTTP APIs) — you MUST call them for any question that needs live data, database queries, inventory, customers, revenue, products, external APIs, or schemas. Do not say you lack access; use the tools first, then answer from the results.\nWhen the user asks to chart, visualize, or generate a diagram from data in an earlier turn, reuse the tool results already in this conversation — do NOT call MCP tools again just to produce a diagram or chart.\nFor every tool call, the \`arguments\` JSON must satisfy the tool schema (include every required field with real values). Never send an empty object \`{}\` or use template placeholder strings like \`<HOSTNAME>\`, \`<TAG_VALUE>\`, \`<SERVICE_NAME>\` — replace every placeholder with the actual value from context. Never call the same tool with the same arguments twice in one turn.${mcpCheckMkHint}\n${mcpToolNames.map((n) => `- \`${n}\``).join('\n')}${mcpSqlHints}`
      : '';

  const anthropicSkillsSection = anthropicSkillsEnabled
    ? `Anthropic built-in file skills are available in this chat (via backend):
- Available skills: ${(anthropicSkills && anthropicSkills.length > 0 ? anthropicSkills : ['pptx', 'docx', 'pdf', 'xlsx']).map((s) => `\`${s}\``).join(', ')}.
- For requests that explicitly ask for native files such as PDF, PPTX, DOCX, or XLSX, you MUST use those built-in skills via code execution and produce the requested file.
- Do NOT say these formats are unsupported and do NOT fall back to only \`createDocument\` HTML/Markdown artifacts when the user asked for a real file.
- Prefer returning a generated downloadable file (via tool results / file IDs), then summarize what was created in chat.
- **Single successful output (critical — avoids wasted tokens):** For one user request that asks for **one** deliverable file (e.g. one summary deck, one PDF), run code execution / bash **only until that file is successfully returned** in tool results, then **stop**. Do **not** re-run bash or code execution to export the **same** content again under another filename (e.g. \`1.pptx\`, \`2.pptx\`, copies "to verify", or duplicate saves). Do not chain extra tool rounds after success. Only run again if the **first** attempt **failed** with an error, or the user explicitly asked for **multiple distinct** files or a **revision** after feedback.`
    : '';

  const nativeFileModeSection = forceNativeFileSkills
    ? `Native file mode (strict):
- This specific request requires a real downloadable file (not an artifact fallback).
- Forbidden for this turn: \`createDocument\` / \`updateDocument\` as a replacement for PDF/PPTX/DOCX/XLSX output.
- You must complete the request through Anthropic file skills + code execution and return file output.
- After one successful file appears in tool results for this request, **do not** re-execute to produce duplicate copies of the same file.`
    : '';

  const desktopComputerUseSection = desktopComputerUseEnabled
    ? `E2B desktop (computer use):
- You have a tool that controls an **isolated Linux desktop VM in the cloud** (E2B), not the user's local machine. Use \`screenshot\` to see the UI; coordinates are in pixels for that display.
- Prefer short plans: screenshot → act → screenshot when the task needs visual feedback. Do not assume access to private user files or accounts on their PC.
- Shell commands run inside the sandbox only (\`run_command\`).`
    : '';

  const tasksSection = `Task Progress UI:\nFor multi-step work, call \`updateAgentTasks\` with a short title and ordered task items using statuses: pending, in_progress, completed, or failed. Keep the checklist concise and update it when progress changes.`;

  const reasoningModelSection =
    selectedChatModel === 'chat-model-reasoning'
      ? `Reasoning + tools:\nInternal reasoning is for planning only. When the rules above require \`createDocument\`, \`createMermaidDiagram\`, \`createIshikawaDiagram\`, \`updateDocument\`, MCP tools,${
          desktopComputerUseEnabled ? ' E2B desktop computer-use,' : ''
        } or other registered tools, you must still **call those tools** in this turn—do not answer with reasoning plus prose alone when a tool is required.`
      : '';

  // Artifacts + createDocument must apply to every chat model (including reasoning);
  // otherwise the model streams long documents as fenced blocks and the artifact panel stays empty.
  const artifactsSection = forceNativeFileSkills ? '' : artifactsPrompt;

  return [
    { id: 'base', kind: 'static', content: basePrompt },
    { id: 'responsibilities', kind: 'dynamic', content: responsibilitiesSection },
    { id: 'knowledgeBase', kind: 'dynamic', content: knowledgeBaseSection },
    { id: 'mcpTools', kind: 'dynamic', content: mcpToolsSection },
    { id: 'anthropicSkills', kind: 'dynamic', content: anthropicSkillsSection },
    { id: 'nativeFileMode', kind: 'dynamic', content: nativeFileModeSection },
    { id: 'desktopComputerUse', kind: 'dynamic', content: desktopComputerUseSection },
    { id: 'tasks', kind: 'static', content: tasksSection },
    { id: 'generativeUi', kind: 'static', content: generativeUiPromptSection },
    { id: 'reasoningModel', kind: 'dynamic', content: reasoningModelSection },
    { id: 'requestInfo', kind: 'dynamic', content: requestPrompt },
    { id: 'artifacts', kind: 'static', content: artifactsSection },
  ];
};

/**
 * Join ordered sections into the final string sent to the model. Empty
 * sections are dropped. When `includeBoundary` is true, a literal marker
 * separates the trailing static run from the first dynamic section — useful
 * for callers that want to split static (cacheable) and dynamic content for
 * a provider that supports prefix caching.
 *
 * Most callers should leave `includeBoundary` false; the marker is a
 * processing hint and should not reach the model verbatim.
 */
export const joinSystemPromptSections = (
  sections: SystemPromptSection[],
  { includeBoundary = false }: { includeBoundary?: boolean } = {},
): string => {
  if (!includeBoundary) {
    return sections
      .map((section) => section.content)
      .filter((content) => content.length > 0)
      .join('\n\n');
  }

  const staticPrefix: string[] = [];
  const dynamicSuffix: string[] = [];
  let seenDynamic = false;

  for (const section of sections) {
    if (!section.content) continue;
    if (section.kind === 'dynamic') seenDynamic = true;
    (seenDynamic ? dynamicSuffix : staticPrefix).push(section.content);
  }

  if (!seenDynamic) return staticPrefix.join('\n\n');

  return [
    staticPrefix.join('\n\n'),
    SYSTEM_PROMPT_DYNAMIC_BOUNDARY,
    dynamicSuffix.join('\n\n'),
  ]
    .filter((chunk) => chunk.length > 0)
    .join('\n\n');
};

export const systemPrompt = (input: SystemPromptInput): string =>
  joinSystemPromptSections(buildSystemPromptSections(input));

/**
 * Priority-based resolver inspired by Claude Code's `buildEffectiveSystemPrompt`.
 * When `overrideSystemPrompt` is set, it replaces everything; otherwise the
 * default builder runs and `appendSystemPrompt` (if any) is concatenated last.
 * Keeps a single, testable place for prompt precedence decisions so new
 * override sources (coordinator modes, eval harnesses, etc.) plug in cleanly.
 */
export const buildEffectiveSystemPrompt = ({
  overrideSystemPrompt,
  appendSystemPrompt,
  build,
}: {
  overrideSystemPrompt?: string;
  appendSystemPrompt?: string;
  build: () => string;
}): string => {
  const base = overrideSystemPrompt?.trim()
    ? overrideSystemPrompt
    : build();
  const append = appendSystemPrompt?.trim();
  return append ? `${base}\n\n${append}` : base;
};

/**
 * Render a human-readable report of the resolved sections (id, kind, char
 * count, short preview). Intended for dev-time debugging and eval dumps;
 * redacts a few obvious secret shapes so logs are safer to paste into
 * tickets. Not meant for production logging.
 */
export const dumpSystemPrompt = (
  sections: SystemPromptSection[],
  { previewChars = 160 }: { previewChars?: number } = {},
): string => {
  const redact = (value: string) =>
    value
      .replace(/(Bearer\s+)[A-Za-z0-9._\-]+/gi, '$1<REDACTED>')
      .replace(/(sk-[A-Za-z0-9]{6})[A-Za-z0-9]+/g, '$1…<REDACTED>')
      .replace(/([A-Za-z0-9_-]*(?:api|secret|token|password)[A-Za-z0-9_-]*\s*[:=]\s*)["']?[A-Za-z0-9._\-]{8,}["']?/gi, '$1<REDACTED>');

  const lines = sections.map((section) => {
    const collapsed = section.content.replace(/\s+/g, ' ').trim();
    const preview = redact(collapsed).slice(0, previewChars);
    const suffix = collapsed.length > previewChars ? '…' : '';
    return `  - [${section.kind}] ${section.id} (${section.content.length} chars): ${preview}${suffix}`;
  });

  return ['System prompt sections:', ...lines].join('\n');
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
