// @xufa/router: an HTTP router with the API of find-my-way.
//
// Routes live in a radix tree per method (static parts, parameters, regular expressions, wildcards, with
// backtracking), and the routes without parameters are also kept in a Map per method: most requests are found with a
// single lookup by path.
const { METHODS } = require('node:http');
const { StaticNode, NODE_TYPES } = require('./lib/node');
const { compileTree } = require('./lib/compile');
const { Constrainer, NullObject } = require('./lib/constraints');
const { prettyPrintTree } = require('./lib/pretty-print');
const { isSafeRegex } = require('./lib/safe-regex');
const strategies = require('./lib/strategies');
const url = require('./lib/url');

const { splitEncoded, decodeParam, pathFromAbsoluteURL, removeDuplicateSlashes, trimLastSlash } = url;
const { deepEqualConstraints } = strategies;

const httpMethods = [...new Set([...METHODS, 'QUERY'])].sort();
const OPTIONAL_PARAM = /(\/:[^/()]*?)\?(\/?)/;
const ESCAPE_REGEXP = /[.*+?^${}()|[\]\\]/g;

const escapeRegExp = (string) => string.replace(ESCAPE_REGEXP, '\\$&');

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.code = 'ERR_ASSERTION';
    throw err;
  }
}

function closingParenthesis(path, index) {
  let depth = 1;
  let i = index;
  while (i < path.length) {
    i += 1;
    if (path.charCodeAt(i) === 92) {
      i += 1; // escaped character
    } else if (path.charCodeAt(i) === 41) {
      depth -= 1;
    } else if (path.charCodeAt(i) === 40) {
      depth += 1;
    }
    if (depth === 0) return i;
  }
  throw new TypeError(`Invalid regexp expression in "${path}"`);
}

// Drops the ^ and $ of a regular expression of a parameter: it is a part of the expression of its node.
function trimRegExp(source) {
  let out = source;
  if (out.charCodeAt(1) === 94) out = out.slice(0, 1) + out.slice(2);
  if (out.charCodeAt(out.length - 2) === 36) out = out.slice(0, out.length - 2) + out.slice(out.length - 1);
  return out;
}

function defaultBuildPrettyMeta(route) {
  if (!route || !route.store) return {};
  return { ...route.store };
}

// Routes whose walk in the tree costs less than this many steps are not put in the map of static routes.
const STATIC_INDEX_MIN_COST = 4;

const FOUND = 0;
const BAD_URL = 1;
const MAX_PARAM_LENGTH = 2;

class Router {
  constructor(opts = {}) {
    this._opts = opts;
    if (opts.defaultRoute) assert(typeof opts.defaultRoute === 'function', 'The default route must be a function');
    if (opts.onBadUrl) assert(typeof opts.onBadUrl === 'function', 'The bad url handler must be a function');
    if (opts.buildPrettyMeta) assert(typeof opts.buildPrettyMeta === 'function', 'buildPrettyMeta must be a function');
    if (opts.querystringParser) {
      assert(typeof opts.querystringParser === 'function', 'querystringParser must be a function');
    }
    this.defaultRoute = opts.defaultRoute || null;
    this.onBadUrl = opts.onBadUrl || null;
    this.buildPrettyMeta = opts.buildPrettyMeta || defaultBuildPrettyMeta;
    this.querystringParser = opts.querystringParser || defaultQuerystringParser;
    this.caseSensitive = opts.caseSensitive === undefined ? true : opts.caseSensitive;
    this.ignoreTrailingSlash = opts.ignoreTrailingSlash || false;
    this.ignoreDuplicateSlashes = opts.ignoreDuplicateSlashes || false;
    this.maxParamLength = opts.maxParamLength || 100;
    this.onMaxParamLength = opts.onMaxParamLength || null;
    this.allowUnsafeRegex = opts.allowUnsafeRegex || false;
    this.useSemicolonDelimiter = opts.useSemicolonDelimiter || false;
    this.constrainer = new Constrainer(opts.constraints);
    this.routes = [];
    this.trees = Object.create(null);
    this.staticRoutes = Object.create(null);
    this.treeGET = null;
    this.staticGET = null;
    this.staticIndexDirty = false;
    // The compiled walks of the trees (lib/compile.js), by method: compiled once a tree is walked COMPILE_AFTER times.
    this.tiers = Object.create(null);
    this.tierGET = null;
    // What match() returns, reused for every request.
    this.result = { status: FOUND, handler: null, store: null, params: null, querystring: '', path: '' };
  }

  on(method, path, opts, handler, store) {
    let options = opts;
    let fn = handler;
    let data = store;
    if (typeof opts === 'function') {
      if (handler !== undefined) data = handler;
      fn = opts;
      options = {};
    }
    assert(typeof path === 'string', 'Path should be a string');
    assert(path.length > 0, 'The path could not be empty');
    assert(path[0] === '/' || path[0] === '*', 'The first character of a path should be `/` or `*`');
    assert(typeof fn === 'function', 'Handler should be a function');

    const optional = path.match(OPTIONAL_PARAM);
    if (optional) {
      assert(
        path.length === optional.index + optional[0].length,
        'Optional Parameter needs to be the last parameter of the path'
      );
      this.on(method, path.replace(OPTIONAL_PARAM, '$1$2'), options, fn, data);
      this.on(method, path.replace(OPTIONAL_PARAM, '$2') || '/', options, fn, data);
      return;
    }

    let normalized = path;
    if (this.ignoreDuplicateSlashes) normalized = removeDuplicateSlashes(normalized);
    if (this.ignoreTrailingSlash) normalized = trimLastSlash(normalized);

    const methods = Array.isArray(method) ? method : [method];
    for (const m of methods) {
      assert(typeof m === 'string', 'Method should be a string');
      assert(httpMethods.includes(m), `Method '${m}' is not an http method.`);
      this.insert(m, normalized, options || {}, fn, data);
    }
  }

  insert(method, path, opts, handler, store) {
    let constraints = {};
    if (opts.constraints !== undefined) {
      assert(typeof opts.constraints === 'object' && opts.constraints !== null, 'Constraints should be an object');
      if (Object.keys(opts.constraints).length !== 0) constraints = opts.constraints;
    }
    this.constrainer.validateConstraints(constraints);
    this.constrainer.noteUsage(constraints);

    if (this.trees[method] === undefined) {
      this.trees[method] = new StaticNode('/');
      this.staticRoutes[method] = { map: new Map(), lengths: new Uint8Array(256) };
    }
    if (path === '*' && this.trees[method].prefix.length !== 0) {
      const root = this.trees[method];
      this.trees[method] = new StaticNode('');
      this.trees[method].setStaticChild('/', root);
    }
    if (method === 'GET') {
      this.treeGET = this.trees.GET;
      this.staticGET = this.staticRoutes.GET;
    }

    const walk = this.walkPattern(path, this.trees[method], true);
    let { pattern } = walk;
    if (!this.caseSensitive) pattern = pattern.toLowerCase();
    if (pattern === '*') pattern = '/*';

    for (const existing of this.routes) {
      if (
        existing.method === method &&
        existing.pattern === pattern &&
        deepEqualConstraints(existing.opts.constraints || {}, constraints)
      ) {
        throw new Error(
          `Method '${method}' already declared for route '${pattern}' with constraints '${JSON.stringify(constraints)}'`
        );
      }
    }

    const route = { method, path, pattern, params: walk.params, opts, handler, store };
    this.routes.push(route);
    walk.node.addRoute(route, this.constrainer);
    if (walk.params.length === 0 && walk.node.kind === NODE_TYPES.STATIC && path !== '*') {
      route.staticKey = walk.staticKey;
    }
    this.staticIndexDirty = true;
    this.tiers = Object.create(null);
    this.tierGET = null;
  }

  // Walks the pattern of a route through the tree, creating its nodes when `create`. Gives the last node, the names
  // of the parameters and the canonical pattern (parameters without names) used to find duplicated routes.
  walkPattern(path, root, create) {
    let pattern = path;
    let node = root;
    let parentIndex = node.prefix.length;
    const params = [];
    let staticKey = root.prefix;
    for (let i = 0; i <= pattern.length; i += 1) {
      if (pattern.charCodeAt(i) === 58 && pattern.charCodeAt(i + 1) === 58) {
        i += 1; // :: is a literal colon
        continue;
      }
      const isParam = pattern.charCodeAt(i) === 58 && pattern.charCodeAt(i + 1) !== 58;
      const isWildcard = pattern.charCodeAt(i) === 42;
      if (isParam || isWildcard || (i === pattern.length && i !== parentIndex)) {
        let staticPath = pattern.slice(parentIndex, i);
        if (!this.caseSensitive) staticPath = staticPath.toLowerCase();
        staticPath = staticPath.replaceAll('::', ':').replaceAll('%', '%25');
        node = create ? node.createStaticChild(staticPath) : node.getStaticChild(staticPath);
        if (node === null) return null;
        staticKey += staticPath;
      }
      if (isParam) {
        let isRegexNode = false;
        let paramSafe = true;
        let backtrack = '';
        const regexps = [];
        let nodePatternParts = '';
        let lastParamStart = i + 1;
        for (let j = lastParamStart; ; j += 1) {
          const code = pattern.charCodeAt(j);
          const isRegexParam = code === 40;
          const isStaticPart = code === 45 || code === 46;
          const isEndOfNode = code === 47 || j === pattern.length;
          if (isRegexParam || isStaticPart || isEndOfNode) {
            params.push(pattern.slice(lastParamStart, j));
            isRegexNode = isRegexNode || isRegexParam || isStaticPart;
            if (isRegexParam) {
              const end = closingParenthesis(pattern, j);
              const source = pattern.slice(j, end + 1);
              if (!this.allowUnsafeRegex) assert(isSafeRegex(new RegExp(source)), `The regex '${source}' is not safe!`);
              regexps.push(trimRegExp(source));
              j = end + 1;
              paramSafe = true;
            } else {
              regexps.push(paramSafe ? '(.*?)' : `(${backtrack}|(?:(?!${backtrack}).)*)`);
              paramSafe = false;
            }
            const staticStart = j;
            for (; j < pattern.length; j += 1) {
              const c = pattern.charCodeAt(j);
              if (c === 47) break;
              if (c === 58) {
                if (pattern.charCodeAt(j + 1) === 58) j += 1;
                else break;
              }
            }
            let staticPart = pattern.slice(staticStart, j);
            if (staticPart) {
              staticPart = staticPart.replaceAll('::', ':').replaceAll('%', '%25');
              backtrack = escapeRegExp(staticPart);
              regexps.push(backtrack);
            }
            lastParamStart = j + 1;
            nodePatternParts += `()${staticPart}`;
            if (isEndOfNode || pattern.charCodeAt(j) === 47 || j === pattern.length) {
              const nodePattern = isRegexNode ? nodePatternParts : staticPart;
              const nodePath = pattern.slice(i, j);
              pattern = pattern.slice(0, i + 1) + nodePattern + pattern.slice(j);
              i += nodePattern.length;
              const regex = isRegexNode ? new RegExp(`^${regexps.join('')}$`) : null;
              node = create
                ? node.createParametricChild(regex, staticPart || null, nodePath)
                : node.getParametricChild(regex, staticPart || null, nodePath);
              if (node === null) return null;
              parentIndex = i + 1;
              break;
            }
          }
        }
      } else if (isWildcard) {
        params.push('*');
        node = create ? node.createWildcardChild() : node.getWildcardChild();
        if (node === null) return null;
        parentIndex = i + 1;
        if (i !== pattern.length - 1) throw new Error('Wildcard must be the last character in the route');
      }
    }
    return { node, params, pattern, staticKey };
  }

  hasRoute(method, path, constraints) {
    return this.findRoute(method, path, constraints) !== null;
  }

  findRoute(method, path, constraints = {}) {
    if (this.trees[method] === undefined) return null;
    const walk = this.walkPattern(path, this.trees[method], false);
    if (walk === null) return null;
    let { pattern } = walk;
    if (!this.caseSensitive) pattern = pattern.toLowerCase();
    for (const route of this.routes) {
      if (
        route.method === method &&
        route.pattern === pattern &&
        deepEqualConstraints(route.opts.constraints || {}, constraints)
      ) {
        return { handler: route.handler, store: route.store, params: route.params };
      }
    }
    return null;
  }

  hasConstraintStrategy(name) {
    return this.constrainer.hasConstraintStrategy(name);
  }

  addConstraintStrategy(strategy) {
    this.constrainer.addConstraintStrategy(strategy);
    this.rebuild(this.routes);
  }

  reset() {
    this.trees = Object.create(null);
    this.staticRoutes = Object.create(null);
    this.treeGET = null;
    this.staticGET = null;
    this.staticIndexDirty = false;
    this.tiers = Object.create(null);
    this.tierGET = null;
    this.routes = [];
  }

  off(method, path, constraints) {
    assert(typeof path === 'string', 'Path should be a string');
    assert(path.length > 0, 'The path could not be empty');
    assert(path[0] === '/' || path[0] === '*', 'The first character of a path should be `/` or `*`');
    assert(
      constraints === undefined ||
        (typeof constraints === 'object' && !Array.isArray(constraints) && constraints !== null),
      'Constraints should be an object or undefined.'
    );
    const optional = path.match(OPTIONAL_PARAM);
    if (optional) {
      assert(
        path.length === optional.index + optional[0].length,
        'Optional Parameter needs to be the last parameter of the path'
      );
      this.off(method, path.replace(OPTIONAL_PARAM, '$1$2'), constraints);
      this.off(method, path.replace(OPTIONAL_PARAM, '$2') || '/', constraints);
      return;
    }
    let normalized = path;
    if (this.ignoreDuplicateSlashes) normalized = removeDuplicateSlashes(normalized);
    if (this.ignoreTrailingSlash) normalized = trimLastSlash(normalized);
    const methods = Array.isArray(method) ? method : [method];
    for (const m of methods) {
      assert(typeof m === 'string', 'Method should be a string');
      assert(httpMethods.includes(m), `Method '${m}' is not an http method.`);
      const keep = (route) =>
        m !== route.method ||
        normalized !== route.path ||
        (constraints !== undefined && !deepEqualConstraints(constraints, route.opts.constraints || {}));
      this.rebuild(this.routes.filter(keep));
    }
  }

  rebuild(routes) {
    this.reset();
    for (const route of routes) this.insert(route.method, route.path, route.opts, route.handler, route.store);
  }

  // Finds the route of a request. Returns null when there is none, or this.result (reused: read it before the next
  // call) with `status` FOUND, BAD_URL (a malformed path) or MAX_PARAM_LENGTH, and the unparsed `querystring`.
  match(method, rawUrl, derivedConstraints) {
    let root;
    let statics;
    if (method === 'GET') {
      root = this.treeGET;
      statics = this.staticGET;
    } else {
      root = this.trees[method];
      statics = this.staticRoutes[method];
    }
    if (root == null) return null;
    // The root (/), the most common route: found before any work on the URL.
    if (rawUrl === '/' && root.prefixLength === 1 && root.isLeafNode) {
      const handle = root.handlerStorage.getMatchingHandler(derivedConstraints);
      if (handle !== null) return this.found(handle, '');
    }
    if (this.staticIndexDirty) {
      this.buildStaticIndex();
      statics = this.staticRoutes[method];
    }

    let path = rawUrl;
    if (path.charCodeAt(0) !== 47) {
      path = pathFromAbsoluteURL(path);
      if (path === null) return this.badUrl(rawUrl);
    }
    if (this.ignoreDuplicateSlashes) path = removeDuplicateSlashes(path);

    // The query string starts at the first ?, # (or ; when asked); a % before it means the path has to be decoded.
    let querystring = '';
    let decodeParams = false;
    const urlLength = path.length;
    let i = 1;
    if (urlLength < NATIVE_SCAN_LENGTH) {
      for (; i < urlLength; i += 1) {
        const code = path.charCodeAt(i);
        if (code === 63 || code === 35 || code === 37 || (code === 59 && this.useSemicolonDelimiter)) break;
      }
    } else {
      // indexOf is faster on long paths, and its cost of a call is lost on short ones.
      i = firstDelimiter(path, this.useSemicolonDelimiter);
    }
    if (i < urlLength) {
      if (path.charCodeAt(i) === 37) {
        const split = splitEncoded(path, this.useSemicolonDelimiter, i);
        if (split === null) return this.badUrl(path);
        path = split.path;
        querystring = split.querystring;
        decodeParams = split.decodeParams;
      } else {
        querystring = path.slice(i + 1);
        path = path.slice(0, i);
      }
    }
    if (this.ignoreTrailingSlash) path = trimLastSlash(path);
    const originPath = path;
    if (!this.caseSensitive) path = path.toLowerCase();

    const result = this.result;
    const pathLength = path.length;
    // The root (/): found here, without the call of the compiled walk, which is too large to be inlined.
    if (pathLength === root.prefixLength && root.isLeafNode) {
      const handle = root.handlerStorage.getMatchingHandler(derivedConstraints);
      if (handle !== null) return this.found(handle, querystring);
    }
    const staticNode = pathLength > 255 || statics.lengths[pathLength] === 1 ? statics.map.get(path) : undefined;
    if (staticNode !== undefined) {
      const handle = staticNode.handlerStorage.getMatchingHandler(derivedConstraints);
      if (handle !== null) return this.found(handle, querystring);
    }

    let tier = method === 'GET' ? this.tierGET : this.tiers[method];
    if (tier == null) tier = this.newTier(method);
    const status =
      tier.walk !== null || ((tier.walks += 1) > Router.COMPILE_AFTER && this.compileTier(tier, root))
        ? tier.walk(path, originPath, pathLength, derivedConstraints, decodeParams, result)
        : this.walkTree(root, path, originPath, derivedConstraints, decodeParams, result);
    if (status === 0) {
      result.status = FOUND;
      result.querystring = querystring;
      return result;
    }
    return this.notFound(status === 2, originPath);
  }

  // The walk of a tree before it is compiled: the same as the compiled one (lib/compile.js), and the same results.
  walkTree(root, path, originPath, derivedConstraints, decodeParams, result) {
    const maxParamLength = this.maxParamLength;
    let currentNode = root;
    let pathIndex = currentNode.prefix.length;
    const params = [];
    const pathLen = path.length;
    const stack = [];
    let maxParamLengthExceeded = false;

    for (;;) {
      if (pathIndex === pathLen && currentNode.isLeafNode) {
        const handle = currentNode.handlerStorage.getMatchingHandler(derivedConstraints);
        if (handle !== null) {
          result.handler = handle.handler;
          result.store = handle.store;
          result.params = handle.createParams(params);
          return 0;
        }
      }

      let node = currentNode.getNextNode(path, pathIndex, stack, params.length);
      if (node === null) {
        if (stack.length === 0) return maxParamLengthExceeded ? 2 : 1;
        params.length = stack.pop();
        pathIndex = stack.pop();
        node = stack.pop();
      }
      currentNode = node;

      for (;;) {
        if (currentNode.kind === NODE_TYPES.STATIC) {
          pathIndex += currentNode.prefixLength;
          break;
        }
        if (currentNode.kind === NODE_TYPES.WILDCARD) {
          const param = originPath.slice(pathIndex);
          params.push(decodeParams ? decodeParam(param) : param);
          pathIndex = pathLen;
          break;
        }
        let paramEnd = originPath.indexOf('/', pathIndex);
        if (paramEnd === -1) paramEnd = pathLen;
        let param = originPath.slice(pathIndex, paramEnd);
        if (decodeParams) param = decodeParam(param);

        let failed = false;
        if (currentNode.isRegex) {
          const matched = currentNode.regex.exec(param);
          if (matched === null) {
            failed = true;
          } else {
            for (let i = 1; i < matched.length; i += 1) {
              if ((matched[i] ?? '').length > maxParamLength) {
                maxParamLengthExceeded = true;
                failed = true;
                break;
              }
            }
            if (!failed) for (let i = 1; i < matched.length; i += 1) params.push(matched[i] ?? '');
          }
        } else if (param.length > maxParamLength) {
          maxParamLengthExceeded = true;
          failed = true;
        } else {
          params.push(param);
        }

        if (failed) {
          if (stack.length === 0) return maxParamLengthExceeded ? 2 : 1;
          params.length = stack.pop();
          pathIndex = stack.pop();
          currentNode = stack.pop();
          continue;
        }
        pathIndex = paramEnd;
        break;
      }
    }
  }

  newTier(method) {
    const tier = { walks: 0, walk: null };
    this.tiers[method] = tier;
    if (method === 'GET') this.tierGET = tier;
    return tier;
  }

  // Compiles the walk of a tree; false (and not tried again) when the tree is too large for it.
  compileTier(tier, root) {
    tier.walk = compileTree(root, this.maxParamLength);
    if (tier.walk !== null) return true;
    tier.walks = -Infinity;
    return false;
  }

  // The static routes reached faster by their path than by the tree: the ones whose walk goes through several nodes
  // or by nodes with parameters, which the walk would push to try later.
  buildStaticIndex() {
    this.staticIndexDirty = false;
    for (const method of Object.keys(this.staticRoutes)) {
      this.staticRoutes[method] = { map: new Map(), lengths: new Uint8Array(256) };
    }
    for (const route of this.routes) {
      if (route.staticKey === undefined || this.trees[route.method] === undefined) continue;
      const key = route.staticKey;
      let node = this.trees[route.method];
      let index = node.prefixLength;
      let cost = 0;
      while (node !== null && index < key.length) {
        if (node.parametricChildren && (node.parametricChildren.length > 0 || node.wildcardChild !== null)) cost += 2;
        node = node.findStaticMatchingChild(key, index);
        if (node !== null) index += node.prefixLength;
        cost += 1;
      }
      if (node === null || cost < STATIC_INDEX_MIN_COST) continue;
      const statics = this.staticRoutes[route.method];
      statics.map.set(key, node);
      if (key.length < 256) statics.lengths[key.length] = 1;
    }
    this.staticGET = this.staticRoutes.GET || null;
  }

  // The result of a static route: no parameters.
  found(handle, querystring) {
    const result = this.result;
    result.status = FOUND;
    result.handler = handle.handler;
    result.store = handle.store;
    result.params = handle.createParams(EMPTY);
    result.querystring = querystring;
    return result;
  }

  badUrl(path) {
    const result = this.result;
    result.status = BAD_URL;
    result.handler = null;
    result.store = null;
    result.params = null;
    result.querystring = '';
    result.path = path;
    return result;
  }

  notFound(maxParamLengthExceeded, path) {
    if (!maxParamLengthExceeded || this.onMaxParamLength === null) return null;
    const result = this.badUrl(path);
    result.status = MAX_PARAM_LENGTH;
    return result;
  }

  // find-my-way's find(): a new object, with the query string parsed.
  find(method, path, derivedConstraints) {
    // The root, the most common route, found here: match() is too large to be inlined, and its call costs as much.
    if (path === '/' && this.querystringParser === defaultQuerystringParser) {
      const root = method === 'GET' ? this.treeGET : this.trees[method];
      if (root != null && root.prefixLength === 1 && root.isLeafNode) {
        const handle = root.handlerStorage.getMatchingHandler(derivedConstraints);
        if (handle !== null) {
          return {
            handler: handle.handler,
            store: handle.store,
            params: handle.createParams(EMPTY),
            searchParams: new NullObject(),
          };
        }
      }
    }
    const result = this.match(method, path, derivedConstraints);
    if (result === null) return null;
    if (result.status === BAD_URL) {
      if (this.onBadUrl === null) return null;
      const { onBadUrl } = this;
      const badPath = result.path;
      return { handler: (req, res) => onBadUrl(badPath, req, res), params: {}, store: null };
    }
    if (result.status === MAX_PARAM_LENGTH) {
      const { onMaxParamLength } = this;
      const longPath = result.path;
      return { handler: (req, res) => onMaxParamLength(longPath, req, res), params: {}, store: null };
    }
    return {
      handler: result.handler,
      store: result.store,
      params: result.params,
      searchParams:
        result.querystring.length === 0 && this.querystringParser === defaultQuerystringParser
          ? new NullObject()
          : this.querystringParser(result.querystring),
    };
  }

  lookup(req, res, ctx, done) {
    let context = ctx;
    let callback = done;
    if (typeof ctx === 'function') {
      callback = ctx;
      context = undefined;
    }
    if (callback === undefined) {
      const constraints = this.constrainer.deriveConstraints(req, context);
      return this.callHandler(this.find(req.method, req.url, constraints), req, res, context);
    }
    this.constrainer.deriveConstraints(req, context, (err, constraints) => {
      if (err !== null) {
        callback(err);
        return;
      }
      try {
        const handle = this.find(req.method, req.url, constraints);
        callback(null, this.callHandler(handle, req, res, context));
      } catch (error) {
        callback(error);
      }
    });
    return undefined;
  }

  callHandler(handle, req, res, ctx) {
    if (handle === null) {
      if (this.defaultRoute !== null) {
        return ctx === undefined ? this.defaultRoute(req, res) : this.defaultRoute.call(ctx, req, res);
      }
      res.statusCode = 404;
      res.end();
      return undefined;
    }
    return ctx === undefined
      ? handle.handler(req, res, handle.params, handle.store, handle.searchParams)
      : handle.handler.call(ctx, req, res, handle.params, handle.store, handle.searchParams);
  }

  prettyPrint(options = {}) {
    const opts = { ...options, buildPrettyMeta: this.buildPrettyMeta.bind(this) };
    let tree = null;
    if (opts.method === undefined) {
      const { version, host, ...custom } = this.constrainer.strategies;
      custom[strategies.httpMethod.name] = strategies.httpMethod;
      const merged = new Router({ ...this._opts, constraints: custom });
      const routes = this.routes.map((route) => ({
        ...route,
        method: 'MERGED',
        opts: { constraints: { ...route.opts.constraints, [strategies.httpMethod.name]: route.method } },
      }));
      // The merged tree is built without the checks of the methods.
      for (const route of routes) merged.insertMerged(route);
      tree = merged.trees.MERGED;
    } else {
      tree = this.trees[opts.method];
    }
    if (tree == null) return '(empty tree)';
    return prettyPrintTree(tree, opts);
  }

  insertMerged(route) {
    if (this.trees.MERGED === undefined) {
      this.trees.MERGED = new StaticNode('/');
      this.staticRoutes.MERGED = { map: new Map(), lengths: new Uint8Array(256) };
    }
    if (route.path === '*' && this.trees.MERGED.prefix.length !== 0) {
      const root = this.trees.MERGED;
      this.trees.MERGED = new StaticNode('');
      this.trees.MERGED.setStaticChild('/', root);
    }
    this.constrainer.noteUsage(route.opts.constraints);
    const walk = this.walkPattern(route.path, this.trees.MERGED, true);
    const merged = { ...route, pattern: walk.pattern, params: walk.params };
    this.routes.push(merged);
    walk.node.addRoute(merged, this.constrainer);
  }

  all(path, handler, store) {
    this.on(httpMethods, path, handler, store);
  }
}

const EMPTY = [];

const NATIVE_SCAN_LENGTH = 12;

// The index of the first ?, #, % (or ; when asked) of a path, or its length.
function firstDelimiter(path, semicolon) {
  let end = path.length;
  let index = path.indexOf('?', 1);
  if (index !== -1) end = index;
  index = path.indexOf('%', 1);
  if (index !== -1 && index < end) end = index;
  index = path.indexOf('#', 1);
  if (index !== -1 && index < end) end = index;
  if (semicolon) {
    index = path.indexOf(';', 1);
    if (index !== -1 && index < end) end = index;
  }
  return end;
}

function addQueryValue(out, key, value) {
  const existing = out[key];
  if (existing === undefined) out[key] = value;
  else if (Array.isArray(existing)) existing.push(value);
  else out[key] = [existing, value];
}

// The query string as an object, as URLSearchParams reads it. Most query strings have nothing to decode: they are
// split here, much faster; the others (%, +, a leading ?, text that is not well formed) go to URLSearchParams.
function defaultQuerystringParser(query) {
  const out = new NullObject();
  const length = query.length;
  if (length === 0) return out;
  if (query.charCodeAt(0) === 63 || query.indexOf('%') !== -1 || query.indexOf('+') !== -1 || !query.isWellFormed()) {
    for (const [key, value] of new URLSearchParams(query)) addQueryValue(out, key, value);
    return out;
  }
  let start = 0;
  while (start <= length) {
    let end = query.indexOf('&', start);
    if (end === -1) end = length;
    if (end > start) {
      const equals = query.indexOf('=', start);
      if (equals === -1 || equals > end) addQueryValue(out, query.slice(start, end), '');
      else addQueryValue(out, query.slice(start, equals), query.slice(equals + 1, end));
    }
    start = end + 1;
  }
  return out;
}

for (const method of httpMethods) {
  Router.prototype[method.toLowerCase()] = function shorthand(path, handler, store) {
    return this.on(method, path, handler, store);
  };
}

function createRouter(opts) {
  return new Router(opts);
}

Router.sanitizeUrlPath = function sanitizeUrlPath(rawUrl, useSemicolonDelimiter) {
  const decoded = url.safeDecodeURI(rawUrl, useSemicolonDelimiter);
  return decoded.shouldDecodeParam ? decodeParam(decoded.path) : decoded.path;
};

// Walks of a tree by match() before it is compiled: compiling costs more than a few walks.
Router.COMPILE_AFTER = 16;

module.exports = createRouter;
module.exports.Router = Router;
module.exports.httpMethods = httpMethods;
module.exports.FOUND = FOUND;
module.exports.BAD_URL = BAD_URL;
module.exports.MAX_PARAM_LENGTH = MAX_PARAM_LENGTH;
module.exports.sanitizeUrlPath = Router.sanitizeUrlPath;
module.exports.removeDuplicateSlashes = removeDuplicateSlashes;
module.exports.trimLastSlash = trimLastSlash;
module.exports.safeDecodeURI = url.safeDecodeURI;
module.exports.safeDecodeURIComponent = url.safeDecodeURIComponent;
module.exports.isSafeRegex = isSafeRegex;
module.exports.NullObject = NullObject;
