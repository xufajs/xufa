import { hasJsxIgnoreComment } from './has-jsx-ignore-comment.js';
import { hasNodeIgnoreComment } from './has-node-ignore-comment.js';
import { isJsxElement } from './node-types.js';

function isIgnored(path) {
  const { node } = path;
  // @xufa/lint: most nodes have no comments, no prettierIgnore and are no JSX element: nothing to look up (this runs
  // twice for every node printed).
  if (node && node.comments === undefined && node.prettierIgnore === undefined && !isJsxElement(node)) {
    return false;
  }
  return hasNodeIgnoreComment(node) || hasJsxIgnoreComment(path);
}

export default isIgnored;
