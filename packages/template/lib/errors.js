// The errors of templates: their syntax (XUFA_TEMPLATE_ERR_SYNTAX, also for expressions in them), what fails while they
// render (XUFA_TEMPLATE_ERR_RUNTIME, with the ExpressionError as cause) and partials not found or too deep
// (XUFA_TEMPLATE_ERR_PARTIAL). With the template's name, line and column.
const { locate } = require('@xufa/expression');

class TemplateError extends Error {
  constructor(message, { code = 'XUFA_TEMPLATE_ERR_SYNTAX', source, position, name, cause } = {}) {
    const at = source !== undefined && position !== undefined ? locate(source, position) : null;
    const where = [name, at && `line ${at.line}, column ${at.column}`].filter(Boolean).join(', ');
    super(where ? `${message} (${where})` : message, cause ? { cause } : undefined);
    this.name = 'TemplateError';
    this.code = code;
    if (name) this.template = name;
    if (at) {
      this.position = position;
      this.line = at.line;
      this.column = at.column;
    }
  }
}

module.exports = { TemplateError };
