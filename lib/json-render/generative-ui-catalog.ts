import { defineCatalog } from '@json-render/core';
import { schema } from '@json-render/react/schema';
import { shadcnComponentDefinitions } from '@json-render/shadcn/catalog';
import { z } from 'zod';

const chartSeriesSchema = z.object({
  dataKey: z.string(),
  label: z.string().nullable(),
  color: z.string().nullable(),
});

const mapMarkerSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  label: z.string().nullable(),
  popup: z.string().nullable(),
});

/**
 * Catalog for inline generative UI (charts + layout) streamed via json-render + AI SDK.
 * Tabular / comparison content belongs in markdown in the assistant message — not Stack/Text in JSONL.
 * @see https://json-render.dev/docs/ai-sdk
 */
export const generativeUiCatalog = defineCatalog(schema, {
  components: {
    Card: shadcnComponentDefinitions.Card,
    Stack: shadcnComponentDefinitions.Stack,
    Heading: shadcnComponentDefinitions.Heading,
    Text: shadcnComponentDefinitions.Text,
    Chart: {
      props: z.object({
        title: z.string().nullable(),
        description: z.string().nullable(),
        variant: z.enum(['bar', 'line', 'area']),
        data: z.array(
          z.record(
            z.string(),
            z.union([z.string(), z.number(), z.boolean()]),
          ),
        ),
        xKey: z.string(),
        series: z.array(chartSeriesSchema),
      }),
      description:
        'Recharts chart (bar, line, or area) using shadcn Chart primitives. Put inside a Card with a Heading when appropriate. Each row in `data` must include `xKey` and every `series[].dataKey`. Always provide at least one row — copy values from MCP/tool results or query output; never emit an empty `data` array.',
    },
    Map: {
      props: z.object({
        title: z.string().nullable(),
        centerLat: z.number(),
        centerLng: z.number(),
        zoom: z.number().nullable(),
        markers: z.array(mapMarkerSchema),
      }),
      description:
        'Interactive Leaflet map with markers. Use inside a Card with a Heading when appropriate. `markers` must contain at least one entry with `lat`, `lng`, and optionally `label`/`popup`. `centerLat`/`centerLng` should be the geographic midpoint of all markers. `zoom` defaults to 5 if null.',
    },
  },
  actions: {},
});
