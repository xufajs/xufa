// The tree of routes as text, in the format of find-my-way.
import { httpMethod, deepEqualConstraints } from './strategies.js';

const treeData = Symbol('treeData');

function printObjectTree(obj, parentPrefix = '') {
  let tree = '';
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const value = obj[key];
    const isLast = i === keys.length - 1;
    const nodePrefix = isLast ? '└── ' : '├── ';
    const childPrefix = isLast ? '    ' : '│   ';
    const nodeData = value[treeData] || '';
    tree += `${parentPrefix}${nodePrefix}${key}${nodeData.replaceAll('\n', `\n${parentPrefix}${childPrefix}`)}\n`;
    tree += printObjectTree(value, parentPrefix + childPrefix);
  }
  return tree;
}

function functionName(fn) {
  const name = (fn.name || '').replace('bound', '').trim();
  return `${name || 'anonymous'}()`;
}

function parseMeta(meta) {
  if (Array.isArray(meta)) return meta.map(parseMeta);
  if (typeof meta === 'symbol') return meta.toString();
  if (typeof meta === 'function') return functionName(meta);
  if (meta instanceof RegExp) return meta.toString();
  return meta;
}

function routeMetaData(route, options) {
  if (!options.includeMeta) return {};
  const meta = options.buildPrettyMeta(route);
  const out = {};
  const keys = Array.isArray(options.includeMeta) ? options.includeMeta : Reflect.ownKeys(meta);
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(meta, key)) continue;
    const value = meta[key];
    if (value !== undefined && value !== null) out[key.toString()] = JSON.stringify(parseMeta(value));
  }
  return out;
}

function serializeMetaData(meta) {
  let out = '';
  for (const [key, value] of Object.entries(meta)) out += `\n• (${key}) ${value}`;
  return out;
}

function normalizeRoute(route) {
  const constraints = { ...route.opts.constraints };
  const method = constraints[httpMethod.name];
  delete constraints[httpMethod.name];
  return { ...route, method, opts: { constraints } };
}

function serializeConstraints(constraints) {
  return JSON.stringify(constraints, (key, value) => (value instanceof RegExp ? value.toString() : value));
}

function serializeRoute(route) {
  let out = ` (${route.method})`;
  const constraints = route.opts.constraints || {};
  if (Object.keys(constraints).length !== 0) out += ` ${serializeConstraints(constraints)}`;
  return out + serializeMetaData(route.metaData);
}

function sameMeta(a, b) {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

function mergeSimilarRoutes(routes) {
  const merged = [];
  for (const route of routes) {
    const same = merged.find(
      (other) =>
        deepEqualConstraints(route.opts.constraints || {}, other.opts.constraints || {}) &&
        sameMeta(route.metaData, other.metaData)
    );
    if (same) same.method += `, ${route.method}`;
    else merged.push(route);
  }
  return merged;
}

function serializeNode(node, prefix, options) {
  let routes = node.routes;
  if (options.method === undefined) routes = routes.map(normalizeRoute);
  routes = routes.map((route) => ({ ...route, metaData: routeMetaData(route, options) }));
  if (options.method === undefined) routes = mergeSimilarRoutes(routes);
  return routes.map(serializeRoute).join(`\n${prefix}`);
}

function buildObjectTree(node, tree, prefix, options) {
  let subtree = tree;
  let childPrefixBase = prefix;
  if (node.isLeafNode || options.commonPrefix !== false) {
    const key = prefix || '(empty root node)';
    subtree = {};
    tree[key] = subtree;
    if (node.isLeafNode) subtree[treeData] = serializeNode(node, key, options);
    childPrefixBase = '';
  }
  if (node.staticChildrenNodes) {
    for (const child of node.staticChildrenNodes)
      buildObjectTree(child, subtree, childPrefixBase + child.prefix, options);
  }
  if (node.parametricChildren) {
    for (const child of node.parametricChildren) {
      buildObjectTree(child, subtree, childPrefixBase + Array.from(child.nodePaths).join('|'), options);
    }
  }
  if (node.wildcardChild) buildObjectTree(node.wildcardChild, subtree, '*', options);
}

function prettyPrintTree(root, options) {
  const tree = {};
  buildObjectTree(root, tree, root.prefix, options);
  return printObjectTree(tree);
}

export { prettyPrintTree };
