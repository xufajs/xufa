// Ported from helmet's test/origin-agent-cluster.test.ts (MIT License) by tools/port-helmet/port.js: do not edit, change the tool.
import { describe, it } from '@xufa/test';
import { originAgentCluster } from '../../../lib/helmet.js';
import { check } from './helpers.js';
describe("Origin-Agent-Cluster middleware", () => {
    it('sets "Origin-Agent-Cluster: ?1"', async () => {
        await check(originAgentCluster(), {
            "origin-agent-cluster": "?1",
        });
    });
});
