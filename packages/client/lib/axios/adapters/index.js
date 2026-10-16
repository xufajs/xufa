// The adapters by name ('http', 'fetch'; 'xhr' is of browsers: none here) and getAdapter(): the first of a list the
// environment has.
import { AxiosError } from '../errors.js';
import { getFetch } from './fetch.js';
import { httpAdapter } from './http.js';

const knownAdapters = {
  http: httpAdapter,
  xhr: false,
  fetch: { get: getFetch },
};

for (const [name, adapter] of Object.entries(knownAdapters)) {
  if (!adapter) continue;
  try {
    Object.defineProperty(adapter, 'name', { value: name });
  } catch {
    // A name that cannot be set.
  }
  Object.defineProperty(adapter, 'adapterName', { value: name });
}

const isResolvedHandle = (adapter) => typeof adapter === 'function' || adapter === null || adapter === false;

/** The first adapter of a list (names or functions) the environment supports, or an AxiosError saying why none. */
function getAdapter(adapters, config) {
  adapters = Array.isArray(adapters) ? adapters : [adapters];
  const { length } = adapters;
  let adapter;
  const rejectedReasons = {};
  for (let i = 0; i < length; i++) {
    const nameOrAdapter = adapters[i];
    let id;
    adapter = nameOrAdapter;
    if (!isResolvedHandle(nameOrAdapter)) {
      adapter = knownAdapters[(id = String(nameOrAdapter)).toLowerCase()];
      if (adapter === undefined) throw new AxiosError(`Unknown adapter '${id}'`);
    }
    if (adapter && (typeof adapter === 'function' || (adapter = adapter.get(config)))) break;
    rejectedReasons[id || `#${i}`] = adapter;
  }
  if (!adapter) {
    const reasons = Object.entries(rejectedReasons).map(
      ([id, state]) =>
        `adapter ${id} ${state === false ? 'is not supported by the environment' : 'is not available in the build'}`
    );
    const text = length
      ? reasons.length > 1
        ? `since :\n${reasons.map((reason) => `- ${reason}`).join('\n')}`
        : ` - ${reasons[0]}`
      : 'as no adapter specified';
    throw new AxiosError(`There is no suitable adapter to dispatch the request ${text}`, 'ERR_NOT_SUPPORT');
  }
  return adapter;
}

const adapters = { getAdapter, adapters: knownAdapters };

export { getAdapter, adapters, knownAdapters };
