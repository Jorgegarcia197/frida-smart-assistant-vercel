import type { Session } from 'next-auth';
import { tool, type UIMessageStreamWriter } from 'ai';
import { z } from 'zod';
import { generateUUID } from '@/lib/utils';
import { saveDocument } from '@/lib/db/queries';
import type { ChatMessage } from '@/lib/types';

interface CreateIshikawaDiagramProps {
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
}

const causeSchema = z.object({
  label: z.string().min(1),
  subCause: z.string().min(1).optional(),
});

const categorySchema = z.object({
  name: z.string().min(1),
  causes: z.array(causeSchema).min(1).max(8),
});

type FishboneCategory = z.infer<typeof categorySchema>;
type FishboneFramework = '6M' | '8P' | 'software';

const SIX_M_CATEGORIES = [
  'Method',
  'Machine',
  'Material',
  'Manpower',
  'Measurement',
  'Mother Nature',
] as const;

const SIX_M_CATEGORIES_ES = [
  'Metodo',
  'Maquina',
  'Material',
  'Mano de obra',
  'Medicion',
  'Medio ambiente',
] as const;

const EIGHT_P_CATEGORIES = [
  'Product',
  'Price',
  'Place',
  'Promotion',
  'People',
  'Process',
  'Physical Evidence',
  'Productivity',
] as const;

const SOFTWARE_CATEGORIES = [
  'Code',
  'Infrastructure',
  'Process',
  'People',
  'Data',
  'External',
] as const;

function quoteIfNeeded(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return 'Unknown';
  // Mermaid mindmap/fishbone labels can break parsing with punctuation like
  // parentheses or plus signs unless quoted.
  if (/[:#%()" +]/.test(trimmed)) {
    return `"${trimmed.replaceAll('"', '\\"')}"`;
  }
  return trimmed;
}

function defaultCausesByCategory(
  framework: FishboneFramework,
  category: string,
): Array<{ label: string; subCause?: string }> {
  if (framework === 'software') {
    switch (category) {
      case 'Code':
        return [
          { label: 'Regression in recent changes', subCause: 'Missing test coverage' },
          { label: 'High code complexity', subCause: 'Insufficient review depth' },
        ];
      case 'Infrastructure':
        return [
          { label: 'Insufficient capacity', subCause: 'Traffic burst not forecasted' },
          { label: 'Configuration drift', subCause: 'Inconsistent environment setup' },
        ];
      case 'Process':
        return [
          { label: 'Unclear deployment checks', subCause: 'No release checklist' },
          { label: 'Slow incident response', subCause: 'Escalation path unclear' },
        ];
      case 'People':
        return [
          { label: 'Knowledge gaps', subCause: 'Limited onboarding' },
          { label: 'Communication delays', subCause: 'Handoffs across teams' },
        ];
      case 'Data':
        return [
          { label: 'Incomplete instrumentation', subCause: 'Missing key metrics' },
          { label: 'Poor data quality', subCause: 'Validation rules too weak' },
        ];
      default:
        return [
          { label: 'Dependency instability', subCause: 'Third-party outage' },
          { label: 'External constraints', subCause: 'Vendor policy changes' },
        ];
    }
  }

  if (framework === '8P') {
    return [
      { label: `${category} mismatch with expectations` },
      { label: `${category} execution inconsistency` },
    ];
  }

  return [
    { label: `${category} variation`, subCause: 'Standard procedure not followed' },
    { label: `${category} instability`, subCause: 'Control checks inconsistent' },
  ];
}

function buildDefaultCategories(
  framework: FishboneFramework,
  language: 'en' | 'es',
): FishboneCategory[] {
  const names =
    framework === '8P'
      ? EIGHT_P_CATEGORIES
      : framework === 'software'
        ? SOFTWARE_CATEGORIES
        : language === 'es'
          ? SIX_M_CATEGORIES_ES
          : SIX_M_CATEGORIES;

  return names.map((name) => ({
    name,
    causes: defaultCausesByCategory(framework, name),
  }));
}

function normalizeCategory(input: FishboneCategory): FishboneCategory {
  return {
    name: input.name.trim(),
    causes: input.causes
      .map((cause) => ({
        label: cause.label.trim(),
        subCause: cause.subCause?.trim(),
      }))
      .filter((cause) => cause.label.length > 0),
  };
}

function buildIshikawaSource({
  problem,
  categories,
}: {
  problem: string;
  categories: FishboneCategory[];
}): string {
  const lines = ['ishikawa', `  ${quoteIfNeeded(problem)}`];

  for (const category of categories) {
    lines.push(`    ${quoteIfNeeded(category.name)}`);

    for (const cause of category.causes) {
      lines.push(`      ${quoteIfNeeded(cause.label)}`);
      if (cause.subCause && cause.subCause.length > 0) {
        lines.push(`        ${quoteIfNeeded(cause.subCause)}`);
      }
    }
  }

  return lines.join('\n');
}

export const createIshikawaDiagram = ({
  session,
  dataStream,
}: CreateIshikawaDiagramProps) =>
  tool({
    description:
      'Create an Ishikawa (fishbone / cause-and-effect) Mermaid diagram artifact for root-cause analysis. If categories are omitted, infer sensible defaults using framework 6M, 8P, or software.',
    inputSchema: z.object({
      title: z.string().min(1).describe('User-facing artifact title'),
      problem: z.string().min(1).describe('Main effect/problem at the fish head'),
      framework: z
        .enum(['6M', '8P', 'software'])
        .optional()
        .default('6M')
        .describe('Default category set when explicit categories are not provided'),
      language: z
        .enum(['en', 'es'])
        .optional()
        .default('en')
        .describe('Label language for default category names'),
      categories: z
        .array(categorySchema)
        .min(2)
        .max(10)
        .optional()
        .describe('Optional explicit categories and causes to render'),
    }),
    execute: async ({ title, problem, framework, language, categories }) => {
      const id = generateUUID();
      const effectiveCategories =
        categories && categories.length > 0
          ? categories.map(normalizeCategory).filter((c) => c.causes.length > 0)
          : buildDefaultCategories(framework, language);

      const ishikawaSource = buildIshikawaSource({
        problem,
        categories: effectiveCategories,
      });

      dataStream.write({
        type: 'data-kind',
        data: 'mermaid',
        transient: true,
      });

      dataStream.write({
        type: 'data-id',
        data: id,
        transient: true,
      });

      dataStream.write({
        type: 'data-title',
        data: title,
        transient: true,
      });

      dataStream.write({
        type: 'data-mermaid-type',
        data: 'ishikawa',
        transient: true,
      });

      dataStream.write({
        type: 'data-mermaid-description',
        data: problem,
        transient: true,
      });

      dataStream.write({
        type: 'data-clear',
        data: null,
        transient: true,
      });

      dataStream.write({
        type: 'data-mermaid-delta',
        data: ishikawaSource,
        transient: true,
      });

      if (session?.user?.id) {
        await saveDocument({
          id,
          title,
          content: ishikawaSource,
          kind: 'mermaid',
          userId: session.user.id,
        });
      }

      dataStream.write({ type: 'data-finish', data: null, transient: true });

      return {
        id,
        title,
        kind: 'mermaid' as const,
        framework,
        categoryCount: effectiveCategories.length,
        sourceFormat: 'ishikawa' as const,
        content: 'An Ishikawa diagram was created and is now visible to the user.',
      };
    },
  });
