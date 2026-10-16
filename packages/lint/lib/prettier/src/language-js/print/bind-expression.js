function printBindExpressionCallee(path, options, print) {
  return ['::', print('callee')];
}

export { printBindExpressionCallee };
