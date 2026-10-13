// From typescript-estree 8.70.0 (src/getImportClausePhaseModifier.ts, BSD-2-Clause: see NOTICE.md), as @xufa/lint's code.
import ts from '#typescript';
import { isAtLeast59 } from './version.js';
// TODO: Remove when we support TS >= 5.9
export function getImportClausePhaseModifier(node) {
  if (!node) {
    return null;
  }
  if (isAtLeast59) {
    return node.phaseModifier === ts.SyntaxKind.TypeKeyword
      ? 'type'
      : node.phaseModifier === ts.SyntaxKind.DeferKeyword
        ? 'defer'
        : null;
  }
  return node.isTypeOnly ? 'type' : null;
}
