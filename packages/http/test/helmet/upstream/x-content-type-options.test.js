// Ported from helmet's test/x-content-type-options.test.ts (MIT License) by tools/port-helmet/port.js: do not edit, change the tool.
import { describe, it } from '@xufa/test';
import { xContentTypeOptions } from '../../../lib/helmet.js';
import { check } from './helpers.js';
describe("X-Content-Type-Options middleware", () => {
    it('sets "X-Content-Type-Options: nosniff"', async () => {
        await check(xContentTypeOptions(), {
            "x-content-type-options": "nosniff",
        });
    });
});
