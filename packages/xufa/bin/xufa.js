#!/usr/bin/env node

// xufa: the command line of an app of xufa, as Django's manage.py, Rails' rails and Laravel's artisan.
import { run } from '../lib/cli/index.js';

run(process.argv.slice(2)).then(
  (code) => {
    if (typeof code === 'number') process.exitCode = code;
  },
  (err) => {
    console.error(err && err.message ? `xufa: ${err.message}` : err);
    process.exitCode = 1;
  }
);
