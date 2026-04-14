import { validateSpec, type Spec } from '@json-render/core';

/**
 * True when the spec references a child id in `children` that is not yet in
 * `elements` (common while JSON Patch lines are still streaming). Passing this
 * to json-render's `loading` suppresses repeated console.warn spam; see
 * ElementRenderer in @json-render/react.
 */
export function specHasMissingChildReferences(
  spec: Spec | null | undefined,
): boolean {
  if (!spec?.elements || !spec.root) {
    return false;
  }
  const { issues } = validateSpec(spec);
  return issues.some((i) => i.code === 'missing_child');
}
