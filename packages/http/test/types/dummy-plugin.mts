// Ported from fastify (test/types/dummy-plugin.mts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import { XufaPluginAsync } from '../..'

export interface DummyPluginOptions {
  foo?: number
}

declare const DummyPlugin: XufaPluginAsync<DummyPluginOptions>

export default DummyPlugin
