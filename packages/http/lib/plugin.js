// plugin(fn, options): marks a plugin to run in the instance registering it (no encapsulation), with its metadata
// (name, the xufa versions it needs, decorators and plugins it depends on). What fastify-plugin does.
import { XUFA_ERR_PLUGIN_NOT_VALID } from './errors.js';

let count = 0;

// The name of the file calling plugin() ("plugin.2.test" for plugin.2.test.js), for plugins without a name.
function callerFileName() {
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = 10;
  const { stack } = new Error();
  Error.stackTraceLimit = limit;
  // 0: Error, 1: callerFileName, 2: plugin, 3: its caller
  const frame = (stack || '').split('\n')[3] || '';
  const location = /\(([^()]+)\)\s*$/.exec(frame) || /at\s+(\S+)\s*$/.exec(frame);
  if (!location) return 'anonymous';
  const file = location[1].split(/[/\\]/).pop();
  const match = /(\w*(?:\.\w*)*)\..*/.exec(file);
  return match ? match[1] : 'anonymous';
}

function plugin(fn, options = {}) {
  let func = fn;
  if (func && typeof func.default === 'function' && typeof func !== 'function') func = func.default;
  if (typeof func !== 'function') {
    throw new XUFA_ERR_PLUGIN_NOT_VALID(`plugin expects a function, instead got a '${typeof func}'`);
  }
  const opts = typeof options === 'string' ? { xufa: options } : { ...options };
  if (opts.encapsulate !== true) func[Symbol.for('skip-override')] = true;
  const name = opts.name || func.name || `${callerFileName()}-auto-${count++}`;
  func[Symbol.for('xufa.display-name')] = name;
  func[Symbol.for('fastify.display-name')] = name;
  func[Symbol.for('plugin-meta')] = { ...opts, name };
  // Bundlers and TypeScript may give the module object: the plugin is its default export too.
  if (!func.default) func.default = func;
  return func;
}

export default plugin;

// What require() gives (the tests of fastify are CommonJS).
export { plugin as 'module.exports' };
