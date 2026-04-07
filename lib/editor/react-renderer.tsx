import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';

export class ReactRenderer {
  static render(component: ReactElement, dom: HTMLElement) {
    const root = createRoot(dom);
    // React 19 types vs @types/react 18: Root#render expects a narrower ReactNode.
    root.render(component as Parameters<ReturnType<typeof createRoot>['render']>[0]);

    return {
      destroy: () => root.unmount(),
    };
  }
}
