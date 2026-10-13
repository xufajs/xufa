#!/usr/bin/env node
import { enableCompileCache } from 'node:module';

// Compiled code is kept on disk between runs (TypeScript's parser is most of the start): before the rest loads.
enableCompileCache?.();

const { main } = await import('../lib/cli.js');
process.exitCode = await main();
