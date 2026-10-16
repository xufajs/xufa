// Ported from helmet's test/x-powered-by.test.ts (MIT License) by tools/port-helmet/port.js: do not edit, change the tool.
import { describe, it } from '@xufa/test';
import { xPoweredBy } from '../../../lib/helmet.js';
import { check } from './helpers.js';
describe("X-Powered-By middleware", () => {
    it("does nothing if the request was not set earlier in the stack", async () => {
        await check(xPoweredBy(), {
            "x-powered-by": null,
        });
    });
    it("removes the header if it was set earlier in the stack", async () => {
        await check((req, res, next) => {
            res.setHeader("X-POWERED-BY", "should be destroyed");
            xPoweredBy()(req, res, next);
        }, {
            "x-powered-by": null,
        });
    });
});
