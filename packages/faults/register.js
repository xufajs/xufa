'use strict';

// require('@xufa/faults/register') in the setup files of a runner (setupFiles of Jest, Vitest, vyntra; --require of
// Mocha): every fault is cleared after each test.
require('.').useFaults();
