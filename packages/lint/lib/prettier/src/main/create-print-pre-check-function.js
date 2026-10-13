import noop from '../utilities/noop.js';

// What prettier checks of each node printed is for its development: nothing here.
const createPrintPreCheckFunction = () => noop;

export default createPrintPreCheckFunction;
