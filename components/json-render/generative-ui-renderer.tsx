'use client';

import { defineRegistry, JSONUIProvider, Renderer } from '@json-render/react';
import { shadcnComponents } from '@json-render/shadcn';
import { generativeUiCatalog } from '@/lib/json-render/generative-ui-catalog';
import { JsonRenderChart } from '@/components/json-render/json-render-chart';
import { JsonRenderMap } from '@/components/json-render/json-render-map';
import type { Spec } from '@json-render/core';

export const { registry } = defineRegistry(generativeUiCatalog, {
  components: {
    Card: shadcnComponents.Card,
    Stack: shadcnComponents.Stack,
    Heading: shadcnComponents.Heading,
    Text: shadcnComponents.Text,
    Chart: JsonRenderChart,
    Map: JsonRenderMap,
  },
});

export function GenerativeUIRenderer({
  spec,
  loading,
}: {
  spec: Spec | null;
  loading?: boolean;
}) {
  if (!spec?.root) {
    return null;
  }

  return (
    <JSONUIProvider registry={registry} initialState={{}}>
      <div
        className="json-render-root w-full max-w-full rounded-lg border bg-card/30 p-3"
        data-testid="json-render-panel"
      >
        <Renderer spec={spec} registry={registry} loading={loading} />
      </div>
    </JSONUIProvider>
  );
}
