#!/usr/bin/env node
'use strict';

// Compiled code is kept on disk between runs (TypeScript's parser is most of the start).
require('node:module').enableCompileCache?.();

require('../lib/format/cli')
  .main()
  .then((code) => {
    process.exitCode = code;
  });
