import { tool } from 'ai';
import { z } from 'zod';

const taskStatusSchema = z.enum([
  'pending',
  'in_progress',
  'completed',
  'failed',
]);

const taskItemSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1),
  status: taskStatusSchema,
});

export const updateAgentTasks = tool({
  description:
    'Publish a concise checklist of current tasks and their statuses for the user interface.',
  inputSchema: z.object({
    title: z
      .string()
      .min(1)
      .optional()
      .describe('Optional short title for the task checklist.'),
    items: z
      .array(taskItemSchema)
      .min(1)
      .max(12)
      .describe('Ordered task items with progress status.'),
  }),
  execute: async ({ title, items }) => {
    return {
      title: title?.trim() || 'Working plan',
      items: items.map((item, index) => ({
        id: item.id?.trim() || `task-${index + 1}`,
        title: item.title.trim(),
        status: item.status,
      })),
    };
  },
});
