import * as indexModule from './index.js';

// require('@xufa/faults/register-strict') in the setup files of a runner: every fault is cleared after each test, and
// a test that ends with faults still set fails (useFaults({ strict: true })).
indexModule.useFaults({ strict: true });
