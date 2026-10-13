// Regular expressions of ECMAScript: validated (validator.js), parsed into trees (parser.js), walked (visitor.js), as
// the rules of regular expressions read them (with regexpp's API).

import { RegExpValidator, RegExpSyntaxError } from './validator.js';
import { RegExpParser } from './parser.js';
import { visitRegExpAST } from './visitor.js';

const parseRegExpLiteral = (source, options) => new RegExpParser(options).parseLiteral(String(source));
const validateRegExpLiteral = (source, options) => new RegExpValidator(options).validateLiteral(source);

export { RegExpParser, RegExpValidator, RegExpSyntaxError, visitRegExpAST, parseRegExpLiteral, validateRegExpLiteral };
