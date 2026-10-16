import { printTypeAnnotationProperty } from './type-annotation.js';

/*
- `TSTypePredicate` (TypeScript)
- `TypePredicate` (flow)
*/
function printTypePredicate(path, print) {
  const { node } = path;
  const prefix = node.type === 'TSTypePredicate' && node.asserts ? 'asserts ' : '';
  return [
    prefix,
    print('parameterName'),
    node.typeAnnotation ? [' is ', printTypeAnnotationProperty(path, print)] : '',
  ];
}

export { printTypePredicate };
