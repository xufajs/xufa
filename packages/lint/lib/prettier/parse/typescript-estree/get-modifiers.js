// From typescript-estree 8.70.0 (src/getModifiers.ts, BSD-2-Clause: see NOTICE.md), as @xufa/lint's code.
import ts from '#typescript';
import { isAtLeast48 } from './version.js';
export function getModifiers(node, includeIllegalModifiers = false) {
  if (node == null) {
    return undefined;
  }
  if (isAtLeast48) {
    if (includeIllegalModifiers || ts.canHaveModifiers(node)) {
      const modifiers = ts.getModifiers(node);
      return modifiers ? [...modifiers] : undefined;
    }
    return undefined;
  }
  return (
    // @ts-expect-error intentional fallback for older TS versions
    node.modifiers?.filter((m) => !ts.isDecorator(m))
  );
}
export function getDecorators(node, includeIllegalDecorators = false) {
  if (node == null) {
    return undefined;
  }
  if (isAtLeast48) {
    if (includeIllegalDecorators || ts.canHaveDecorators(node)) {
      const decorators = ts.getDecorators(node);
      return decorators ? [...decorators] : undefined;
    }
    return undefined;
  }
  return (
    // @ts-expect-error intentional fallback for older TS versions
    node.decorators?.filter(ts.isDecorator)
  );
}
