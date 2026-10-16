// Ported from helmet's test/x-download-options.test.ts (MIT License) by tools/port-helmet/port.js: do not edit, change the tool.
import { describe, it } from '@xufa/test';
import { xDownloadOptions } from '../../../lib/helmet.js';
import { check } from './helpers.js';
describe("X-Download-Options middleware", () => {
    it('sets "X-Download-Options: noopen"', async () => {
        await check(xDownloadOptions(), {
            "x-download-options": "noopen",
        });
    });
});
