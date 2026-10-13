// The tokens and comments of a file, by position: the methods rules find them with (getFirstToken(node),
// getTokenBefore(node, { includeComments: true }), getTokensBetween(a, b)...). Tokens and comments are two arrays in
// the order of the text; an index gives, at the offsets where a token or a comment starts or ends, the index of the
// token there (of the next token for a comment), and finds where a range starts and ends in the tokens. The answers
// are ESLint's, also for ranges that do not start or end at a token.
//
// Options of the methods that give one token: a number (tokens to skip), a filter function, or { includeComments,
// skip, filter }; of those that give many: a number (how many at most), a filter, or { includeComments, count,
// filter }.

const NONE = -1;

const isComment = (token) => token.type === 'Block' || token.type === 'Line' || token.type === 'Shebang';

function check(condition, message) {
  if (!condition) throw new Error(message);
}

// The first index of the items whose start is at or after a location (the length when none).
function search(items, location) {
  let low = 0;
  let high = items.length - 1;
  while (low <= high) {
    const middle = ((low + high) / 2) | 0;
    if (location <= items[middle].range[0]) {
      if (middle === low) return middle;
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  return items.length;
}

// The offsets where tokens and comments start and end (their last character), each with the index of the token there
// or, for a comment, of the token after it.
function createIndex(tokens, comments) {
  const lastEnd = Math.max(tokens.at(-1)?.range[1] ?? 0, comments.at(-1)?.range[1] ?? 0);
  const index = new Int32Array(lastEnd + 1).fill(NONE);
  let tokenIndex = 0;
  let commentIndex = 0;
  while (tokenIndex < tokens.length || commentIndex < comments.length) {
    let nextStart = commentIndex < comments.length ? comments[commentIndex].range[0] : Number.MAX_SAFE_INTEGER;
    while (tokenIndex < tokens.length && tokens[tokenIndex].range[0] < nextStart) {
      const [start, end] = tokens[tokenIndex].range;
      index[start] = tokenIndex;
      index[end - 1] = tokenIndex;
      tokenIndex += 1;
    }
    nextStart = tokenIndex < tokens.length ? tokens[tokenIndex].range[0] : Number.MAX_SAFE_INTEGER;
    while (commentIndex < comments.length && comments[commentIndex].range[0] < nextStart) {
      const [start, end] = comments[commentIndex].range;
      index[start] = tokenIndex;
      index[end - 1] = tokenIndex;
      commentIndex += 1;
    }
  }
  return index;
}

// Options of the methods that give one token, and of those that give many.
function skipOptions(options) {
  let includeComments = false;
  let skip = 0;
  let filter = null;
  if (typeof options === 'number') {
    skip = options | 0;
  } else if (typeof options === 'function') {
    filter = options;
  } else if (options) {
    includeComments = !!options.includeComments;
    skip = options.skip | 0;
    filter = options.filter || null;
  }
  check(skip >= 0, 'options.skip should be zero or a positive integer.');
  check(!filter || typeof filter === 'function', 'options.filter should be a function.');
  return { includeComments, skip, filter };
}

function countOptions(options) {
  let includeComments = false;
  let count = 0;
  let countExists = false;
  let filter = null;
  if (typeof options === 'number') {
    count = options | 0;
    countExists = true;
  } else if (typeof options === 'function') {
    filter = options;
  } else if (options) {
    includeComments = !!options.includeComments;
    count = options.count | 0;
    countExists = typeof options.count === 'number';
    filter = options.filter || null;
  }
  check(count >= 0, 'options.count should be zero or a positive integer.');
  check(!filter || typeof filter === 'function', 'options.filter should be a function.');
  return { includeComments, count: countExists ? count : -1, filter };
}

class TokenStore {
  #tokens;
  #comments;
  #index;

  constructor(tokens, comments) {
    this.#tokens = tokens;
    this.#comments = comments;
    this.#index = createIndex(tokens, comments);
  }

  #at(location) {
    return location >= 0 && location < this.#index.length ? this.#index[location] : NONE;
  }

  // The index of the first token at or after a location.
  #firstIndex(start) {
    const at = this.#at(start);
    if (at !== NONE) return at;
    const before = this.#at(start - 1);
    if (before === NONE) return 0;
    const token = this.#tokens[before];
    if (!token) return this.#tokens.length;
    return token.range[0] >= start ? before : before + 1;
  }

  // The index of the last token that ends at or before a location.
  #lastIndex(end) {
    const at = this.#at(end);
    if (at !== NONE) return at - 1;
    const before = this.#at(end - 1);
    if (before === NONE) return this.#tokens.length - 1;
    const token = this.#tokens[before];
    if (!token) return this.#tokens.length - 1;
    return token.range[1] > end ? before - 1 : before;
  }

  // A function giving the next token (and comment) from start to end (-1: no bound), forward or backward; null at
  // the end.
  #cursor(forward, start, end, includeComments) {
    const tokens = this.#tokens;
    if (!includeComments) {
      if (forward) {
        let i = this.#firstIndex(start);
        const last = this.#lastIndex(end);
        return () => (i <= last ? tokens[i++] : null);
      }
      let i = this.#lastIndex(end);
      const first = this.#firstIndex(start);
      return () => (i >= first ? tokens[i--] : null);
    }
    const comments = this.#comments;
    if (forward) {
      let t = this.#firstIndex(start);
      let c = search(comments, start);
      return () => {
        const token = t < tokens.length ? tokens[t] : null;
        const comment = c < comments.length ? comments[c] : null;
        let current;
        if (token && (!comment || token.range[0] < comment.range[0])) {
          current = token;
          t += 1;
        } else if (comment) {
          current = comment;
          c += 1;
        } else {
          return null;
        }
        return end === -1 || current.range[1] <= end ? current : null;
      };
    }
    let t = this.#lastIndex(end);
    let c = search(comments, end) - 1;
    return () => {
      const token = t >= 0 ? tokens[t] : null;
      const comment = c >= 0 ? comments[c] : null;
      let current;
      if (token && (!comment || token.range[1] > comment.range[1])) {
        current = token;
        t -= 1;
      } else if (comment) {
        current = comment;
        c -= 1;
      } else {
        return null;
      }
      return start === -1 || current.range[0] >= start ? current : null;
    };
  }

  // The first token of a range (after `skip` that pass the filter), or null.
  #one(forward, start, end, options) {
    const { includeComments, skip, filter } = skipOptions(options);
    const next = this.#cursor(forward, start, end, includeComments);
    let skipping = skip;
    for (let token = next(); token; token = next()) {
      if (filter && !filter(token)) continue;
      if (skipping > 0) skipping -= 1;
      else return token;
    }
    return null;
  }

  // The tokens of a range that pass the filter (`count` at most), in the order found.
  #many(forward, start, end, options) {
    const { includeComments, count, filter } = countOptions(options);
    const next = this.#cursor(forward, start, end, includeComments);
    const found = [];
    while (count === -1 || found.length < count) {
      let token = next();
      while (token && filter && !filter(token)) token = next();
      if (!token) break;
      found.push(token);
    }
    return found;
  }

  // The tokens of a range with padding: `before` tokens before it and `after` after it; or, given options, #many.
  #padded(start, end, before, after) {
    if (before === undefined && after === undefined) {
      return this.#tokens.slice(this.#firstIndex(start), this.#lastIndex(end) + 1);
    }
    if (typeof before === 'number' || before === undefined) {
      const first = Math.max(0, this.#firstIndex(start) - (before | 0));
      const last = Math.min(this.#tokens.length - 1, this.#lastIndex(end) + (after | 0));
      return this.#tokens.slice(first, last + 1);
    }
    return this.#many(true, start, end, before);
  }

  /** The token (or with includeComments, comment) that starts at an offset, or null. */
  getTokenByRangeStart(offset, options) {
    const token = this.#cursor(true, offset, -1, options && options.includeComments)();
    return token && token.range[0] === offset ? token : null;
  }

  getFirstToken(node, options) {
    return this.#one(true, node.range[0], node.range[1], options);
  }

  getLastToken(node, options) {
    return this.#one(false, node.range[0], node.range[1], options);
  }

  getTokenBefore(node, options) {
    return this.#one(false, -1, node.range[0], options);
  }

  getTokenAfter(node, options) {
    return this.#one(true, node.range[1], -1, options);
  }

  getFirstTokenBetween(left, right, options) {
    return this.#one(true, left.range[1], right.range[0], options);
  }

  getLastTokenBetween(left, right, options) {
    return this.#one(false, left.range[1], right.range[0], options);
  }

  getTokenOrCommentBefore(node, skip) {
    return this.getTokenBefore(node, { includeComments: true, skip });
  }

  getTokenOrCommentAfter(node, skip) {
    return this.getTokenAfter(node, { includeComments: true, skip });
  }

  getFirstTokens(node, options) {
    return this.#many(true, node.range[0], node.range[1], options);
  }

  getLastTokens(node, options) {
    return this.#many(false, node.range[0], node.range[1], options).reverse();
  }

  getTokensBefore(node, options) {
    return this.#many(false, -1, node.range[0], options).reverse();
  }

  getTokensAfter(node, options) {
    return this.#many(true, node.range[1], -1, options);
  }

  getFirstTokensBetween(left, right, options) {
    return this.#many(true, left.range[1], right.range[0], options);
  }

  getLastTokensBetween(left, right, options) {
    return this.#many(false, left.range[1], right.range[0], options).reverse();
  }

  /** The tokens of a node: getTokens(node, before, after) with padding, or getTokens(node, options). */
  getTokens(node, beforeCount, afterCount) {
    return this.#padded(node.range[0], node.range[1], beforeCount, afterCount);
  }

  getTokensBetween(left, right, padding) {
    return this.#padded(left.range[1], right.range[0], padding, padding);
  }

  commentsExistBetween(left, right) {
    const i = search(this.#comments, left.range[1]);
    return i < this.#comments.length && this.#comments[i].range[1] <= right.range[0];
  }

  /** The comments right before a node or token (none after a token between them). */
  getCommentsBefore(nodeOrToken) {
    const next = this.#cursor(false, -1, nodeOrToken.range[0], true);
    const comments = [];
    for (let token = next(); token && isComment(token); token = next()) comments.push(token);
    return comments.reverse();
  }

  getCommentsAfter(nodeOrToken) {
    const next = this.#cursor(true, nodeOrToken.range[1], -1, true);
    const comments = [];
    for (let token = next(); token && isComment(token); token = next()) comments.push(token);
    return comments;
  }

  getCommentsInside(node) {
    return this.getTokens(node, { includeComments: true, filter: isComment });
  }
}

export { TokenStore };
