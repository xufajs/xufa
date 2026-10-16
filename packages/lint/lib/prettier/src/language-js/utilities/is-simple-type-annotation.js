import { createTypeCheckFunction } from './create-type-check-function.js';

const isSimpleTypeAnnotation = createTypeCheckFunction([
  'TSThisType',
  // literals

  'TSLiteralType',
  'TSTemplateLiteralType',
]);

export { isSimpleTypeAnnotation };
