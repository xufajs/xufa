class MarshalError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'MarshalError';
    this.code = code;
  }
}

// A stack that ends before maxDepth (deep callers, a small stack) is the same error as maxDepth.
function guard(fn) {
  return (...args) => {
    try {
      return fn(...args);
    } catch (err) {
      if (err instanceof RangeError && /call stack/.test(err.message)) {
        throw new MarshalError('Too deep for the stack (lower maxDepth)', 'XUFA_MARSHAL_ERR_DEPTH');
      }
      throw err;
    }
  };
}

export { MarshalError, guard };
