// Ported from helmet's test/x-frame-options.test.ts (MIT License) by tools/port-helmet/port.js: do not edit, change the tool.
import assert from "node:assert/strict";
import { describe, it } from '@xufa/test';
import { xFrameOptions } from '../../../lib/helmet.js';
import { check } from './helpers.js';
describe("X-Frame-Options middleware", () => {
    it('sets "X-Frame-Options: SAMEORIGIN" when passed no action', async () => {
        await check(xFrameOptions(), {
            "x-frame-options": "SAMEORIGIN",
        });
        await check(xFrameOptions({}), {
            "x-frame-options": "SAMEORIGIN",
        });
        await check(xFrameOptions(Object.create(null)), {
            "x-frame-options": "SAMEORIGIN",
        });
        await check(xFrameOptions({ action: undefined }), {
            "x-frame-options": "SAMEORIGIN",
        });
    });
    it('can set "X-Frame-Options: DENY"', async () => {
        await check(xFrameOptions({ action: "deny" }), {
            "x-frame-options": "DENY",
        });
        // These are not allowed by the types, but are supported.
        await check(xFrameOptions({ action: "DENY" }), {
            "x-frame-options": "DENY",
        });
        await check(xFrameOptions({ action: "deNY" }), {
            "x-frame-options": "DENY",
        });
    });
    it('can set "X-Frame-Options: SAMEORIGIN" when specified', async () => {
        await check(xFrameOptions({ action: "sameorigin" }), {
            "x-frame-options": "SAMEORIGIN",
        });
        // These are not allowed by the types, but are supported.
        await check(xFrameOptions({ action: "SAMEORIGIN" }), {
            "x-frame-options": "SAMEORIGIN",
        });
        await check(xFrameOptions({ action: "sameORIGIN" }), {
            "x-frame-options": "SAMEORIGIN",
        });
        await check(xFrameOptions({ action: "SAME-ORIGIN" }), {
            "x-frame-options": "SAMEORIGIN",
        });
        await check(xFrameOptions({ action: "same-origin" }), {
            "x-frame-options": "SAMEORIGIN",
        });
    });
    it("throws when passed invalid actions", () => {
        for (const action of [
            "",
            "foo",
            " deny",
            "allow-from",
            "ALLOW-FROM",
            123,
            null,
            new String("SAMEORIGIN"),
        ]) {
            assert.throws(() => xFrameOptions({ action: action }), {
                message: /^X-Frame-Options received an invalid action /,
            });
        }
    });
});
