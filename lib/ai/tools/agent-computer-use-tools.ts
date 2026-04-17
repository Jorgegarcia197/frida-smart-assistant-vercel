import { dynamicTool } from 'ai';
import { z } from 'zod/v3';
import {
  DEFAULT_DESKTOP_RESOLUTION,
  getOrCreateDesktopSandbox,
  type DesktopSessionOptions,
} from '@/lib/e2b/desktop-session';

/** Frida Agent Builder `tools` entry for E2B Desktop (custom tool type `computer-use`). */
export type AgentComputerUseToolEntry = {
  enabled?: boolean;
  description?: string;
  type?: string;
  id?: string;
  name?: string;
  config?: {
    resolution?: [number, number];
    timeoutMs?: number;
    dpi?: number;
  };
};

/**
 * Single root object schema so JSON Schema has `type: "object"` (Anthropic rejects
 * bare `oneOf` / discriminated-union roots without `input_schema.type`).
 */
const computerUseActionEnum = z.enum([
  'screenshot',
  'left_click',
  'right_click',
  'double_click',
  'middle_click',
  'move_mouse',
  'scroll',
  'drag',
  'write',
  'press',
  'run_command',
  'cursor_position',
  'screen_size',
  'wait',
  'open',
  'launch',
]);

const computerUseInputSchema = z
  .object({
    action: computerUseActionEnum.describe('Desktop action to perform'),
    x: z.number().optional(),
    y: z.number().optional(),
    x1: z.number().optional(),
    y1: z.number().optional(),
    x2: z.number().optional(),
    y2: z.number().optional(),
    direction: z.enum(['up', 'down']).optional(),
    amount: z.number().min(1).max(50).optional(),
    text: z.string().optional(),
    key: z.union([z.string(), z.array(z.string())]).optional(),
    command: z.string().optional(),
    ms: z.number().min(0).max(120_000).optional(),
    target: z.string().optional(),
    application: z.string().optional(),
    uri: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const need = (field: keyof typeof data, label?: string) => {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label ?? String(field)} is required for action "${data.action}"`,
        path: [field as string],
      });
    };

    switch (data.action) {
      case 'screenshot':
      case 'cursor_position':
      case 'screen_size':
        return;
      case 'left_click':
      case 'right_click':
      case 'double_click':
      case 'middle_click':
      case 'move_mouse':
        if (data.x === undefined) need('x');
        if (data.y === undefined) need('y');
        return;
      case 'scroll':
        if (data.direction === undefined) need('direction');
        return;
      case 'drag':
        if (data.x1 === undefined) need('x1');
        if (data.y1 === undefined) need('y1');
        if (data.x2 === undefined) need('x2');
        if (data.y2 === undefined) need('y2');
        return;
      case 'write':
        if (data.text === undefined || data.text.length === 0) need('text');
        return;
      case 'press':
        if (data.key === undefined) need('key');
        return;
      case 'run_command':
        if (data.command === undefined || data.command.length === 0) {
          need('command');
        }
        return;
      case 'wait':
        if (data.ms === undefined) need('ms');
        return;
      case 'open':
        if (data.target === undefined || data.target.length === 0) {
          need('target');
        }
        return;
      case 'launch':
        if (data.application === undefined || data.application.length === 0) {
          need('application');
        }
        return;
    }
  });

export type ComputerUseInput =
  | { action: 'screenshot' }
  | { action: 'left_click'; x: number; y: number }
  | { action: 'right_click'; x: number; y: number }
  | { action: 'double_click'; x: number; y: number }
  | { action: 'middle_click'; x: number; y: number }
  | { action: 'move_mouse'; x: number; y: number }
  | { action: 'scroll'; direction: 'up' | 'down'; amount?: number }
  | { action: 'drag'; x1: number; y1: number; x2: number; y2: number }
  | { action: 'write'; text: string }
  | { action: 'press'; key: string | string[] }
  | { action: 'run_command'; command: string }
  | { action: 'cursor_position' }
  | { action: 'screen_size' }
  | { action: 'wait'; ms: number }
  | { action: 'open'; target: string }
  | { action: 'launch'; application: string; uri?: string };

function toComputerUseInput(
  d: z.infer<typeof computerUseInputSchema>,
): ComputerUseInput {
  switch (d.action) {
    case 'screenshot':
      return { action: 'screenshot' };
    case 'left_click':
    case 'right_click':
    case 'double_click':
    case 'middle_click':
    case 'move_mouse': {
      if (d.x === undefined || d.y === undefined) {
        throw new Error('computer-use: missing x/y after validation');
      }
      return {
        action: d.action,
        x: d.x,
        y: d.y,
      };
    }
    case 'scroll': {
      if (d.direction === undefined) {
        throw new Error('computer-use: missing direction after validation');
      }
      return {
        action: 'scroll',
        direction: d.direction,
        amount: d.amount,
      };
    }
    case 'drag': {
      if (
        d.x1 === undefined ||
        d.y1 === undefined ||
        d.x2 === undefined ||
        d.y2 === undefined
      ) {
        throw new Error('computer-use: missing drag coords after validation');
      }
      return {
        action: 'drag',
        x1: d.x1,
        y1: d.y1,
        x2: d.x2,
        y2: d.y2,
      };
    }
    case 'write': {
      if (d.text === undefined) {
        throw new Error('computer-use: missing text after validation');
      }
      return { action: 'write', text: d.text };
    }
    case 'press': {
      if (d.key === undefined) {
        throw new Error('computer-use: missing key after validation');
      }
      return { action: 'press', key: d.key };
    }
    case 'run_command': {
      if (d.command === undefined) {
        throw new Error('computer-use: missing command after validation');
      }
      return { action: 'run_command', command: d.command };
    }
    case 'cursor_position':
      return { action: 'cursor_position' };
    case 'screen_size':
      return { action: 'screen_size' };
    case 'wait': {
      if (d.ms === undefined) {
        throw new Error('computer-use: missing ms after validation');
      }
      return { action: 'wait', ms: d.ms };
    }
    case 'open': {
      if (d.target === undefined) {
        throw new Error('computer-use: missing target after validation');
      }
      return { action: 'open', target: d.target };
    }
    case 'launch': {
      if (d.application === undefined) {
        throw new Error('computer-use: missing application after validation');
      }
      return {
        action: 'launch',
        application: d.application,
        uri: d.uri,
      };
    }
    default: {
      const _e: never = d.action;
      throw new Error(`Unhandled action: ${_e}`);
    }
  }
}

function desktopOptsFromEntry(
  entry: AgentComputerUseToolEntry,
): DesktopSessionOptions {
  const c = entry.config;
  if (!c) return {};
  return {
    resolution: c.resolution,
    timeoutMs: c.timeoutMs,
    dpi: c.dpi,
  };
}

async function runComputerUseAction(
  chatId: string,
  sessionOpts: DesktopSessionOptions,
  input: ComputerUseInput,
): Promise<Record<string, unknown>> {
  const sandbox = await getOrCreateDesktopSandbox(chatId, sessionOpts);

  switch (input.action) {
    case 'screenshot': {
      const bytes = await sandbox.screenshot();
      const buf = Buffer.from(bytes);
      const dataBase64 = buf.toString('base64');
      return {
        ok: true,
        action: 'screenshot',
        mimeType: 'image/png',
        dataBase64,
        note:
          'PNG screenshot of the remote E2B desktop (not the user local machine). Interpret coordinates relative to this display.',
      };
    }
    case 'left_click':
      await sandbox.leftClick(input.x, input.y);
      return { ok: true, action: input.action, x: input.x, y: input.y };
    case 'right_click':
      await sandbox.rightClick(input.x, input.y);
      return { ok: true, action: input.action, x: input.x, y: input.y };
    case 'double_click':
      await sandbox.doubleClick(input.x, input.y);
      return { ok: true, action: input.action, x: input.x, y: input.y };
    case 'middle_click':
      await sandbox.middleClick(input.x, input.y);
      return { ok: true, action: input.action, x: input.x, y: input.y };
    case 'move_mouse':
      await sandbox.moveMouse(input.x, input.y);
      return { ok: true, action: input.action, x: input.x, y: input.y };
    case 'scroll':
      await sandbox.scroll(input.direction, input.amount ?? 3);
      return {
        ok: true,
        action: input.action,
        direction: input.direction,
        amount: input.amount ?? 3,
      };
    case 'drag':
      await sandbox.drag(
        [input.x1, input.y1],
        [input.x2, input.y2],
      );
      return { ok: true, action: input.action };
    case 'write':
      await sandbox.write(input.text);
      return { ok: true, action: input.action };
    case 'press':
      await sandbox.press(input.key);
      return { ok: true, action: input.action };
    case 'run_command': {
      const result = await sandbox.commands.run(input.command);
      return {
        ok: true,
        action: input.action,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    }
    case 'cursor_position': {
      const pos = await sandbox.getCursorPosition();
      return { ok: true, action: input.action, ...pos };
    }
    case 'screen_size': {
      const size = await sandbox.getScreenSize();
      return { ok: true, action: input.action, ...size };
    }
    case 'wait':
      await sandbox.wait(input.ms);
      return { ok: true, action: input.action, ms: input.ms };
    case 'open':
      await sandbox.open(input.target);
      return { ok: true, action: input.action, target: input.target };
    case 'launch':
      await sandbox.launch(input.application, input.uri);
      return {
        ok: true,
        action: input.action,
        application: input.application,
        uri: input.uri,
      };
  }
}

/** True if any Frida tool entry enables computer-use (for system prompt / step limits). */
export function agentToolsIncludeComputerUse(raw: unknown): boolean {
  if (raw == null || typeof raw !== 'object') return false;
  for (const entry of Object.values(raw as Record<string, unknown>)) {
    if (!entry || typeof entry !== 'object') continue;
    const t = entry as AgentComputerUseToolEntry;
    if (t.type === 'computer-use' && t.enabled !== false) return true;
  }
  return false;
}

/**
 * Registers one dynamic tool for the first enabled `computer-use` agent tool entry.
 * Requires `E2B_API_KEY` unless disabled via `E2B_DESKTOP_DISABLED=true`.
 */
export function buildAgentComputerUseTools(
  raw: unknown,
  chatId: string,
  sanitizeModelToolName: (raw: string, used: Set<string>) => string,
  usedModelToolNames: Set<string>,
): {
  tools: Record<string, ReturnType<typeof dynamicTool>>;
  activeNames: string[];
  computerUseRegistered: boolean;
} {
  const tools: Record<string, ReturnType<typeof dynamicTool>> = {};
  const activeNames: string[] = [];

  if (process.env.E2B_DESKTOP_DISABLED === 'true') {
    return { tools, activeNames, computerUseRegistered: false };
  }

  if (!process.env.E2B_API_KEY) {
    if (agentToolsIncludeComputerUse(raw)) {
      console.warn(
        '⚠️ Agent has computer-use enabled but E2B_API_KEY is missing; desktop tool omitted.',
      );
    }
    return { tools, activeNames, computerUseRegistered: false };
  }

  if (raw == null || typeof raw !== 'object') {
    return { tools, activeNames, computerUseRegistered: false };
  }

  let picked: { mapKey: string; entry: AgentComputerUseToolEntry } | undefined;
  for (const [mapKey, entry] of Object.entries(
    raw as Record<string, unknown>,
  )) {
    const tool = entry as AgentComputerUseToolEntry;
    if (tool.enabled === false) continue;
    if (tool.type !== 'computer-use') continue;
    picked = { mapKey, entry: tool };
    break;
  }

  if (!picked) {
    return { tools, activeNames, computerUseRegistered: false };
  }

  const { mapKey, entry } = picked;
  const label = entry.name || entry.id || mapKey;
  const internalKey = `ComputerUse_${label}_${mapKey}`.replace(/\s+/g, '_');
  const toolName = sanitizeModelToolName(internalKey, usedModelToolNames);
  const sessionOpts = desktopOptsFromEntry(entry);

  const resolution =
    sessionOpts.resolution ?? DEFAULT_DESKTOP_RESOLUTION;

  const description =
    [
      entry.description?.trim() ||
        'Control an isolated Linux desktop VM (E2B): mouse, keyboard, screenshots, and shell.',
      `Display is approximately ${resolution[0]}x${resolution[1]} pixels; use screen_size if unsure.`,
      'This is a cloud sandbox, not the user\'s physical PC.',
      'Use one action per tool call. For multi-step tasks, call repeatedly with screenshot between steps when you need to see the UI.',
    ].join(' ');

  tools[toolName] = dynamicTool({
    description,
    inputSchema: computerUseInputSchema,
    execute: async (args: unknown) => {
      const parsed = computerUseInputSchema.safeParse(args);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'invalid_arguments',
          issues: parsed.error.flatten(),
        };
      }
      try {
        const normalized = toComputerUseInput(parsed.data);
        return await runComputerUseAction(chatId, sessionOpts, normalized);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        console.error('❌ E2B computer-use tool failed:', error);
        return { ok: false, error: message };
      }
    },
  });

  activeNames.push(toolName);

  return {
    tools,
    activeNames,
    computerUseRegistered: true,
  };
}
