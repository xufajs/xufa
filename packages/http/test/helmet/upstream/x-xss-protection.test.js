// Ported from helmet's test/x-xss-protection.test.ts (MIT License) by tools/port-helmet/port.js: do not edit, change the tool.
import { describe, it } from '@xufa/test';
import { xXssProtection } from '../../../lib/helmet.js';
import { check } from './helpers.js';
describe("X-XSS-Protection middleware", () => {
    it('sets "X-XSS-Protection: 0"', async () => {
        await check(xXssProtection(), {
            "x-xss-protection": "0",
        });
    });
});
