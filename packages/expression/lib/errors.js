// The errors of expressions: of their syntax (XUFA_EXPR_ERR_SYNTAX), of what they cannot reach (XUFA_EXPR_ERR_FORBIDDEN)
// and of what fails while they run (XUFA_EXPR_ERR_RUNTIME), with where in the source they are.

// The line and column (both from 1) of a position of a source.
function locate(source, position) {
  let line = 1;
  let column = 1;
  for (let i = 0; i < position && i < source.length; i += 1) {
    if (source[i] === '\n') {
      line += 1;
      column = 1;
    } else column += 1;
  }
  return { line, column };
}

class ExpressionError extends Error {
  constructor(message, { code = 'XUFA_EXPR_ERR_SYNTAX', source, position } = {}) {
    const at = source !== undefined && position !== undefined ? locate(source, position) : null;
    super(at ? `${message} (line ${at.line}, column ${at.column})` : message);
    this.name = 'ExpressionError';
    this.code = code;
    if (at) {
      this.position = position;
      this.line = at.line;
      this.column = at.column;
    }
  }
}

export { ExpressionError, locate };
