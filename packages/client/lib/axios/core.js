// The core of axios: the Axios class (request(), the method aliases, getUri()), its interceptors, dispatchRequest()
// (cancellation checks, transforms, the adapter).
import { getAdapter } from './adapters/index.js';
import { defaults, mergeConfig, transformData, transitionalDefaults, validator } from './config.js';
import { CanceledError, isCancel } from './errors.js';
import { AxiosHeaders } from './headers.js';
import { buildFullPath, buildURL } from './url.js';
import { forEach, isFunction, mergeObjects } from './util.js';

const { validators } = validator;

/** Interceptors: use(fulfilled, rejected, { synchronous, runWhen }) gives an id for eject(id). */
class InterceptorManager {
  constructor() {
    this.handlers = [];
  }

  use(fulfilled, rejected, options) {
    this.handlers.push({
      fulfilled,
      rejected,
      synchronous: options ? options.synchronous : false,
      runWhen: options ? options.runWhen : null,
    });
    return this.handlers.length - 1;
  }

  eject(id) {
    if (this.handlers[id]) this.handlers[id] = null;
  }

  clear() {
    if (this.handlers) this.handlers = [];
  }

  forEach(fn) {
    for (const handler of this.handlers) if (handler !== null) fn(handler);
  }
}

function throwIfCancellationRequested(config) {
  if (config.cancelToken) config.cancelToken.throwIfRequested();
  if (config.signal && config.signal.aborted) throw new CanceledError(null, config);
}

/** The request by its adapter: the data transformed on the way out, and the response's (or error's) on the way back. */
function dispatchRequest(config) {
  throwIfCancellationRequested(config);
  config.headers = AxiosHeaders.from(config.headers);
  config.data = transformData.call(config, config.transformRequest);
  if (['post', 'put', 'patch'].includes(config.method)) {
    config.headers.setContentType('application/x-www-form-urlencoded', false);
  }
  const adapter = getAdapter(config.adapter || defaults.adapter, config);
  return adapter(config).then(
    (response) => {
      throwIfCancellationRequested(config);
      response.data = transformData.call(config, config.transformResponse, response);
      response.headers = AxiosHeaders.from(response.headers);
      return response;
    },
    (reason) => {
      if (!isCancel(reason)) {
        throwIfCancellationRequested(config);
        if (reason && reason.response) {
          reason.response.data = transformData.call(config, config.transformResponse, reason.response);
          reason.response.headers = AxiosHeaders.from(reason.response.headers);
        }
      }
      return Promise.reject(reason);
    }
  );
}

class Axios {
  constructor(instanceConfig) {
    this.defaults = instanceConfig || {};
    this.interceptors = { request: new InterceptorManager(), response: new InterceptorManager() };
  }

  /** request(config) or request(url, config): the response, or an error whose stack has the caller's frames too. */
  async request(configOrUrl, config) {
    try {
      return await this._request(configOrUrl, config);
    } catch (err) {
      if (err instanceof Error) {
        let dummy = {};
        if (Error.captureStackTrace) Error.captureStackTrace(dummy);
        else dummy = new Error();
        const stack = dummy.stack ? dummy.stack.replace(/^.+\n/, '') : '';
        try {
          if (!err.stack) err.stack = stack;
          else if (stack && !String(err.stack).endsWith(stack.replace(/^.+\n.+\n/, ''))) err.stack += `\n${stack}`;
        } catch {
          // A stack that cannot be written.
        }
      }
      throw err;
    }
  }

  _request(configOrUrl, config) {
    if (typeof configOrUrl === 'string') {
      config = config || {};
      config.url = configOrUrl;
    } else {
      config = configOrUrl || {};
    }
    config = mergeConfig(this.defaults, config);
    const { transitional, paramsSerializer, headers } = config;

    if (transitional !== undefined) {
      validator.assertOptions(
        transitional,
        {
          silentJSONParsing: validators.transitional(validators.boolean),
          forcedJSONParsing: validators.transitional(validators.boolean),
          clarifyTimeoutError: validators.transitional(validators.boolean),
          legacyInterceptorReqResOrdering: validators.transitional(validators.boolean),
        },
        false
      );
    }
    if (paramsSerializer != null) {
      if (isFunction(paramsSerializer)) {
        config.paramsSerializer = { serialize: paramsSerializer };
      } else {
        validator.assertOptions(
          paramsSerializer,
          { encode: validators.function, serialize: validators.function },
          true
        );
      }
    }
    if (config.allowAbsoluteUrls === undefined) {
      config.allowAbsoluteUrls = this.defaults.allowAbsoluteUrls !== undefined ? this.defaults.allowAbsoluteUrls : true;
    }
    validator.assertOptions(
      config,
      { baseUrl: validators.spelling('baseURL'), withXsrfToken: validators.spelling('withXSRFToken') },
      true
    );

    config.method = (config.method || this.defaults.method || 'get').toLowerCase();

    // The headers of every method and of this one, then the request's own.
    const contextHeaders = headers && mergeObjects(false, false, [headers.common, headers[config.method]]);
    if (headers) {
      for (const method of ['delete', 'get', 'head', 'post', 'put', 'patch', 'common']) delete headers[method];
    }
    config.headers = AxiosHeaders.concat(contextHeaders, headers);

    // Request interceptors: the last added runs first (legacyInterceptorReqResOrdering, the default), or in order.
    const requestChain = [];
    let synchronous = true;
    this.interceptors.request.forEach((interceptor) => {
      if (typeof interceptor.runWhen === 'function' && interceptor.runWhen(config) === false) return;
      synchronous = synchronous && interceptor.synchronous;
      const settings = config.transitional || transitionalDefaults;
      if (settings && settings.legacyInterceptorReqResOrdering) {
        requestChain.unshift(interceptor.fulfilled, interceptor.rejected);
      } else {
        requestChain.push(interceptor.fulfilled, interceptor.rejected);
      }
    });
    const responseChain = [];
    this.interceptors.response.forEach((interceptor) => {
      responseChain.push(interceptor.fulfilled, interceptor.rejected);
    });

    let promise;
    let i = 0;
    if (!synchronous) {
      const chain = [...requestChain, dispatchRequest.bind(this), undefined, ...responseChain];
      promise = Promise.resolve(config);
      while (i < chain.length) promise = promise.then(chain[i++], chain[i++]);
      return promise;
    }

    // Synchronous request interceptors run now, in this call.
    let newConfig = config;
    while (i < requestChain.length) {
      const onFulfilled = requestChain[i++];
      const onRejected = requestChain[i++];
      try {
        newConfig = onFulfilled(newConfig);
      } catch (error) {
        onRejected.call(this, error);
        break;
      }
    }
    try {
      promise = dispatchRequest.call(this, newConfig);
    } catch (error) {
      return Promise.reject(error);
    }
    i = 0;
    while (i < responseChain.length) promise = promise.then(responseChain[i++], responseChain[i++]);
    return promise;
  }

  /** The URL a config would call (base, url and params). */
  getUri(config) {
    config = mergeConfig(this.defaults, config);
    const fullPath = buildFullPath(config.baseURL, config.url, config.allowAbsoluteUrls);
    return buildURL(fullPath, config.params, config.paramsSerializer);
  }
}

forEach(['delete', 'get', 'head', 'options'], (method) => {
  Axios.prototype[method] = function (url, config) {
    return this.request(mergeConfig(config || {}, { method, url, data: (config || {}).data }));
  };
});

forEach(['post', 'put', 'patch'], (method) => {
  const generate = (isForm) =>
    function (url, data, config) {
      return this.request(
        mergeConfig(config || {}, {
          method,
          headers: isForm ? { 'Content-Type': 'multipart/form-data' } : {},
          url,
          data,
        })
      );
    };
  Axios.prototype[method] = generate(false);
  Axios.prototype[`${method}Form`] = generate(true);
});

export { Axios, InterceptorManager, dispatchRequest };
