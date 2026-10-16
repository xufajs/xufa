// The fetch adapter of axios: the fetch of Node.js (or of config.env: { fetch, Request, Response }), with progress
// events by streams of the body, timeout and cancellation as one signal, and responseType text, json, arraybuffer,
// blob, formData, stream or response.
import { resolveConfig } from '../resolve-config.js';
import { AxiosError } from '../errors.js';
import { AxiosHeaders } from '../headers.js';
import { settle } from '../settle.js';
import {
  asyncDecorator,
  composeSignals,
  progressEventDecorator,
  progressEventReducer,
  trackStream,
} from '../streams.js';
import * as utils from '../util.js';

const DEFAULT_CHUNK_SIZE = 64 * 1024;
const ORIGIN = 'http://localhost';

const test = (fn) => {
  try {
    return !!fn();
  } catch {
    return false;
  }
};

// An adapter for an environment of fetch, Request and Response (the global ones for what it does not give), or false.
function factory(env) {
  env = utils.mergeWith({ skipUndefined: true }, { Request: globalThis.Request, Response: globalThis.Response }, env);
  const { fetch: envFetch, Request, Response } = env;
  const isFetchSupported = envFetch ? utils.isFunction(envFetch) : typeof fetch === 'function';
  if (!isFetchSupported) return false;
  const isRequestSupported = utils.isFunction(Request);
  const isResponseSupported = utils.isFunction(Response);
  const isReadableStreamSupported = utils.isFunction(globalThis.ReadableStream);
  const encoder = new TextEncoder();

  // Request bodies as streams (duplex: 'half'), which progress events of uploads need.
  const supportsRequestStream =
    isRequestSupported &&
    isReadableStreamSupported &&
    test(() => {
      let duplexAccessed = false;
      const body = new ReadableStream();
      const hasContentType = new Request(ORIGIN, {
        body,
        method: 'POST',
        get duplex() {
          duplexAccessed = true;
          return 'half';
        },
      }).headers.has('Content-Type');
      body.cancel();
      return duplexAccessed && !hasContentType;
    });

  const supportsResponseStream =
    isResponseSupported && isReadableStreamSupported && test(() => utils.isReadableStream(new Response('').body));

  const resolvers = { stream: supportsResponseStream && ((res) => res.body) };
  for (const type of ['text', 'arrayBuffer', 'blob', 'formData', 'stream']) {
    if (resolvers[type]) continue;
    resolvers[type] = (res, config) => {
      const method = res && res[type];
      if (method) return method.call(res);
      throw new AxiosError(`Response type '${type}' is not supported`, AxiosError.ERR_NOT_SUPPORT, config);
    };
  }

  async function getBodyLength(body) {
    if (body == null) return 0;
    if (utils.isBlob(body)) return body.size;
    if (utils.isSpecCompliantForm(body)) {
      return (await new Request(ORIGIN, { method: 'POST', body }).arrayBuffer()).byteLength;
    }
    if (utils.isArrayBufferView(body) || utils.isArrayBuffer(body)) return body.byteLength;
    if (utils.isURLSearchParams(body)) body = `${body}`;
    if (utils.isString(body)) return encoder.encode(body).byteLength;
    return undefined;
  }

  const resolveBodyLength = async (headers, body) => {
    const length = utils.toFiniteNumber(headers.getContentLength());
    return length == null ? getBodyLength(body) : length;
  };

  return async (config) => {
    let {
      url,
      method,
      data,
      signal,
      cancelToken,
      timeout,
      onDownloadProgress,
      onUploadProgress,
      responseType,
      headers,
      withCredentials = 'same-origin',
      fetchOptions,
    } = resolveConfig(config);
    const fetch_ = envFetch || fetch;
    responseType = responseType ? `${responseType}`.toLowerCase() : 'text';
    const composedSignal = composeSignals([signal, cancelToken && cancelToken.toAbortSignal()], timeout);
    let request = null;
    const unsubscribe = composedSignal && composedSignal.unsubscribe && (() => composedSignal.unsubscribe());
    let requestContentLength;

    try {
      if (
        onUploadProgress &&
        supportsRequestStream &&
        method !== 'get' &&
        method !== 'head' &&
        (requestContentLength = await resolveBodyLength(headers, data)) !== 0
      ) {
        const probe = new Request(url, { method: 'POST', body: data, duplex: 'half' });
        let contentTypeHeader;
        if (utils.isFormData(data) && (contentTypeHeader = probe.headers.get('content-type'))) {
          headers.setContentType(contentTypeHeader);
        }
        if (probe.body) {
          const [onProgress, flush] = progressEventDecorator(
            requestContentLength,
            progressEventReducer(asyncDecorator(onUploadProgress))
          );
          data = trackStream(probe.body, DEFAULT_CHUNK_SIZE, onProgress, flush);
        }
      }

      if (!utils.isString(withCredentials)) withCredentials = withCredentials ? 'include' : 'omit';
      // Cloudflare Workers throw when credentials are given.
      const isCredentialsSupported = isRequestSupported && 'credentials' in Request.prototype;
      const resolvedOptions = {
        ...fetchOptions,
        signal: composedSignal,
        method: method.toUpperCase(),
        headers: headers.normalize().toJSON(),
        body: data,
        duplex: 'half',
        credentials: isCredentialsSupported ? withCredentials : undefined,
      };
      request = isRequestSupported && new Request(url, resolvedOptions);
      let response = await (isRequestSupported ? fetch_(request, fetchOptions) : fetch_(url, resolvedOptions));

      const isStreamResponse = supportsResponseStream && (responseType === 'stream' || responseType === 'response');
      if (supportsResponseStream && (onDownloadProgress || (isStreamResponse && unsubscribe))) {
        const options = { status: response.status, statusText: response.statusText, headers: response.headers };
        const responseContentLength = utils.toFiniteNumber(response.headers.get('content-length'));
        const [onProgress, flush] =
          (onDownloadProgress &&
            progressEventDecorator(
              responseContentLength,
              progressEventReducer(asyncDecorator(onDownloadProgress), true)
            )) ||
          [];
        response = new Response(
          trackStream(response.body, DEFAULT_CHUNK_SIZE, onProgress, () => {
            if (flush) flush();
            if (unsubscribe) unsubscribe();
          }),
          options
        );
      }

      responseType = responseType || 'text';
      const responseData = await resolvers[utils.findKey(resolvers, responseType) || 'text'](response, config);
      if (!isStreamResponse && unsubscribe) unsubscribe();

      return await new Promise((resolve, reject) => {
        settle(resolve, reject, {
          data: responseData,
          headers: AxiosHeaders.from(response.headers),
          status: response.status,
          statusText: response.statusText,
          config,
          request,
        });
      });
    } catch (err) {
      if (unsubscribe) unsubscribe();
      if (err && err.name === 'TypeError' && /Load failed|fetch/i.test(err.message)) {
        throw Object.assign(
          new AxiosError('Network Error', AxiosError.ERR_NETWORK, config, request, err && err.response),
          { cause: err.cause || err }
        );
      }
      throw AxiosError.from(err, err && err.code, config, request, err && err.response);
    }
  };
}

// An adapter for each environment, by its Request, Response and fetch.
const seedCache = new Map();

/** The fetch adapter for a config's env (cached by its fetch, Request and Response). */
function getFetch(config) {
  const env = (config && config.env) || {};
  const { fetch: envFetch, Request, Response } = env;
  const seeds = [Request, Response, envFetch];
  let map = seedCache;
  let target;
  for (let i = seeds.length - 1; i >= 0; i--) {
    const seed = seeds[i];
    target = map.get(seed);
    if (target === undefined) map.set(seed, (target = i ? new Map() : factory(env)));
    map = target;
  }
  return target;
}

const fetchAdapter = getFetch();

export { getFetch, fetchAdapter };
