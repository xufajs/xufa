import { group } from '../../document/index.js';
import { printClassMemberSemicolon } from './class.js';
import { printFunctionParameters, shouldGroupFunctionParameters } from './function-parameters.js';
import { printAbstractToken } from './miscellaneous.js';
import { printTypeAnnotationProperty } from './type-annotation.js';

/**
 * @import {Doc} from "../../document/index.js"
 */

/*
- `TSFunctionType` (TypeScript)
- `TSCallSignatureDeclaration` (TypeScript)
- `TSConstructorType` (TypeScript)
- `TSConstructSignatureDeclaration` (TypeScript)
- `FunctionTypeAnnotation` (Flow)
*/
function printFunctionType(path, options, print) {
  const { node } = path;
  /** @type {Doc[]} */
  const parts = [
    // `TSConstructorType` only
    printAbstractToken(path),
  ];

  if (node.type === 'TSConstructorType' || node.type === 'TSConstructSignatureDeclaration') {
    parts.push('new ');
  }

  let parametersDoc = printFunctionParameters(
    path,
    options,
    print,
    /* shouldExpandParameters */ false,
    /* shouldPrintTypeParameters */ true
  );

  const returnTypeDoc = [];
  // `flow` doesn't wrap the `returnType` with `TypeAnnotation`, so the colon
  // needs to be added separately.
  {
    returnTypeDoc.push(printTypeAnnotationProperty(path, print, 'returnType'));
  }

  if (shouldGroupFunctionParameters(node, returnTypeDoc)) {
    parametersDoc = group(parametersDoc);
  }

  parts.push(parametersDoc, returnTypeDoc);

  return [
    group(parts),
    node.type === 'TSConstructSignatureDeclaration' || node.type === 'TSCallSignatureDeclaration'
      ? printClassMemberSemicolon(path, options)
      : '',
  ];
}

export { printFunctionType };
