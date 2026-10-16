// The http adapter of axios on Node.js: node:http/https (HTTP/2 with httpVersion 2, its sessions shared), redirects,
// proxies (the config's or the environment's, their auth, and again after each redirect), bodies of any kind (strings,
// Buffers, streams, Blobs, FormData of the standard or of form-data's API), gzip/deflate/br answers, maxRate and
// progress events, maxContentLength/maxBodyLength, timeouts, cancellation, data: URLs, and its own DNS lookup.
import { EventEmitter } from 'node:events';
import http from 'node:http';
import http2 from 'node:http2';
import https from 'node:https';
import stream from 'node:stream';
import util from 'node:util';
import zlib from 'node:zlib';
import { VERSION, transitionalDefaults } from '../config.js';
import { fromDataURI, estimateDataURLDecodedBytes } from '../data-url.js';
import { AxiosError, CanceledError } from '../errors.js';
import { formDataToStream, readBlob } from '../form.js';
import { AxiosHeaders } from '../headers.js';
import { httpFollow, httpsFollow, getProxyForUrl } from '../redirects.js';
import { settle } from '../settle.js';
import {
  AxiosTransformStream,
  ZlibHeaderTransformStream,
  asyncDecorator,
  progressEventDecorator,
  progressEventReducer,
} from '../streams.js';
import { buildFullPath, buildURL } from '../url.js';
import * as utils from '../util.js';

const zlibOptions = { flush: zlib.constants.Z_SYNC_FLUSH, finishFlush: zlib.constants.Z_SYNC_FLUSH };
const brotliOptions = {
  flush: zlib.constants.BROTLI_OPERATION_FLUSH,
  finishFlush: zlib.constants.BROTLI_OPERATION_FLUSH,
};

const isHttps = /https:?/;

const supportedProtocols = ['http:', 'https:', 'file:', 'data:'];

const flushOnFinish = (body, [throttled, flush]) => {
  body.on('end', flush).on('error', flush);
  return throttled;
};

// HTTP/2 sessions by authority and options, closed sessionTimeout ms (1000 by default) after their last stream.
class Http2Sessions {
  constructor() {
    this.sessions = Object.create(null);
  }

  getSession(authority, options) {
    options = { sessionTimeout: 1000, ...options };
    let authoritySessions = this.sessions[authority];
    if (authoritySessions) {
      for (const [session, sessionOptions] of authoritySessions) {
        if (!session.destroyed && !session.closed && util.isDeepStrictEqual(sessionOptions, options)) return session;
      }
    }

    const session = http2.connect(authority, options);
    let removed;
    const removeSession = () => {
      if (removed) return;
      removed = true;
      const entries = authoritySessions;
      for (let i = entries.length - 1; i >= 0; i--) {
        if (entries[i][0] !== session) continue;
        if (entries.length === 1) delete this.sessions[authority];
        else entries.splice(i, 1);
        if (!session.closed) session.close();
        return;
      }
    };

    const request = session.request;
    const { sessionTimeout } = options;
    if (sessionTimeout != null) {
      let timer;
      let streams = 0;
      session.request = function () {
        const http2Stream = request.apply(this, arguments);
        streams++;
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        http2Stream.once('close', () => {
          if (!--streams) {
            timer = setTimeout(() => {
              timer = null;
              removeSession();
            }, sessionTimeout);
          }
        });
        return http2Stream;
      };
    }
    session.once('close', removeSession);

    const entry = [session, options];
    if (authoritySessions) authoritySessions.push(entry);
    else authoritySessions = this.sessions[authority] = [entry];
    return session;
  }
}

const http2Sessions = new Http2Sessions();

function dispatchBeforeRedirect(options, responseDetails) {
  if (options.beforeRedirects.proxy) options.beforeRedirects.proxy(options);
  if (options.beforeRedirects.config) options.beforeRedirects.config(options, responseDetails);
}

/** Points the options of a request to its proxy (the config's, or the environment's for `location`), and again on redirects. */
function setProxy(options, configProxy, location) {
  let proxy = configProxy;
  if (!proxy && proxy !== false) {
    const proxyUrl = getProxyForUrl(location);
    if (proxyUrl) proxy = new URL(proxyUrl);
  }
  if (proxy) {
    if (proxy.username) proxy.auth = `${proxy.username || ''}:${proxy.password || ''}`;
    if (proxy.auth) {
      if (proxy.auth.username || proxy.auth.password) {
        proxy.auth = `${proxy.auth.username || ''}:${proxy.auth.password || ''}`;
      } else if (typeof proxy.auth === 'object') {
        throw new AxiosError('Invalid proxy authorization', AxiosError.ERR_BAD_OPTION, { proxy });
      }
      options.headers['Proxy-Authorization'] = `Basic ${Buffer.from(proxy.auth, 'utf8').toString('base64')}`;
    }
    options.headers.host = options.hostname + (options.port ? `:${options.port}` : '');
    const proxyHost = proxy.hostname || proxy.host;
    options.hostname = proxyHost;
    options.host = proxyHost;
    options.port = proxy.port;
    options.path = location;
    if (proxy.protocol) options.protocol = proxy.protocol.includes(':') ? proxy.protocol : `${proxy.protocol}:`;
  }
  // The same rules for the request of a redirect.
  options.beforeRedirects.proxy = (redirectOptions) => setProxy(redirectOptions, configProxy, redirectOptions.href);
}

// A promise of an async executor that also hears when it settles (onDone), once.
function wrapAsync(asyncExecutor) {
  return new Promise((resolve, reject) => {
    let onDone;
    let isDone;
    const done = (value, isRejected) => {
      if (isDone) return;
      isDone = true;
      if (onDone) onDone(value, isRejected);
    };
    const resolve_ = (value) => {
      done(value);
      resolve(value);
    };
    const reject_ = (reason) => {
      done(reason, true);
      reject(reason);
    };
    asyncExecutor(resolve_, reject_, (handler) => (onDone = handler)).catch(reject_);
  });
}

function resolveFamily({ address, family }) {
  if (!utils.isString(address)) throw TypeError('address must be a string');
  return { address, family: family || (address.indexOf('.') < 0 ? 6 : 4) };
}

const buildAddressEntry = (address, family) => resolveFamily(utils.isObject(address) ? address : { address, family });

// A lookup function of the config (callbacks or async; one address or many) as Node.js calls it (with opt.all).
function callbackify(fn, reducer) {
  if (!utils.isAsyncFunction(fn)) return fn;
  return function (...args) {
    const cb = args.pop();
    fn.apply(this, args).then((value) => {
      try {
        if (reducer) cb(null, ...reducer(value));
        else cb(null, value);
      } catch (err) {
        cb(err);
      }
    }, cb);
  };
}

// HTTP/2 as a transport of the http adapter: a stream of its session, with headers and statusCode as a response's.
const http2Transport = {
  request(options, cb) {
    const authority = `${options.protocol}//${options.hostname}:${options.port || (options.protocol === 'https:' ? 443 : 80)}`;
    const { http2Options, headers } = options;
    const session = http2Sessions.getSession(authority, http2Options);
    const { HTTP2_HEADER_SCHEME, HTTP2_HEADER_METHOD, HTTP2_HEADER_PATH, HTTP2_HEADER_STATUS } = http2.constants;
    const http2Headers = {
      [HTTP2_HEADER_SCHEME]: options.protocol.replace(':', ''),
      [HTTP2_HEADER_METHOD]: options.method,
      [HTTP2_HEADER_PATH]: options.path,
    };
    utils.forEach(headers, (header, name) => {
      if (name.charAt(0) !== ':') http2Headers[name] = header;
    });
    const req = session.request(http2Headers);
    req.once('response', (responseHeaders) => {
      const response = req;
      responseHeaders = { ...responseHeaders };
      const status = responseHeaders[HTTP2_HEADER_STATUS];
      delete responseHeaders[HTTP2_HEADER_STATUS];
      response.headers = responseHeaders;
      response.statusCode = +status;
      cb(response);
    });
    return req;
  },
};

function httpAdapter(config) {
  return wrapAsync(async (resolve, reject, onDone) => {
    let { data, lookup, family, httpVersion = 1, http2Options } = config;
    const { responseType, responseEncoding } = config;
    const method = config.method.toUpperCase();
    let isDone;
    let rejected = false;
    let req;

    httpVersion = +httpVersion;
    if (Number.isNaN(httpVersion)) throw TypeError(`Invalid protocol version: '${config.httpVersion}' is not a number`);
    if (httpVersion !== 1 && httpVersion !== 2) throw TypeError(`Unsupported protocol version '${httpVersion}'`);
    const isHttp2 = httpVersion === 2;

    if (lookup) {
      const lookup_ = callbackify(lookup, (value) => (Array.isArray(value) ? value : [value]));
      lookup = (hostname, opt, cb) => {
        lookup_(hostname, opt, (err, arg0, arg1) => {
          if (err) return cb(err);
          const addresses = Array.isArray(arg0)
            ? arg0.map((address) => buildAddressEntry(address))
            : [buildAddressEntry(arg0, arg1)];
          if (opt.all) cb(err, addresses);
          else cb(err, addresses[0].address, addresses[0].family);
          return undefined;
        });
      };
    }

    // Cancellation (signal, cancelToken), timeouts and limits all abort through this.
    const abortEmitter = new EventEmitter();
    function abort(reason) {
      try {
        abortEmitter.emit('abort', !reason || reason.type ? new CanceledError(null, config, req) : reason);
      } catch (err) {
        console.warn('emit error', err);
      }
    }
    abortEmitter.once('abort', reject);

    const onFinished = () => {
      if (config.cancelToken) config.cancelToken.unsubscribe(abort);
      if (config.signal) config.signal.removeEventListener('abort', abort);
      abortEmitter.removeAllListeners();
    };
    if (config.cancelToken) config.cancelToken.subscribe(abort);
    if (config.signal) {
      if (config.signal.aborted) abort();
      else config.signal.addEventListener('abort', abort);
    }

    onDone((response, isRejected) => {
      isDone = true;
      if (isRejected) {
        rejected = true;
        onFinished();
        return;
      }
      // A stream answer: cancellable until it ends.
      const { data: body } = response;
      if (body instanceof stream.Readable || body instanceof stream.Duplex) {
        const off = stream.finished(body, () => {
          off();
          onFinished();
        });
      } else {
        onFinished();
      }
    });

    const fullPath = buildFullPath(config.baseURL, config.url, config.allowAbsoluteUrls);
    const parsed = new URL(fullPath, undefined);
    const protocol = parsed.protocol || supportedProtocols[0];

    if (protocol === 'data:') {
      if (config.maxContentLength > -1) {
        const estimated = estimateDataURLDecodedBytes(String(config.url || fullPath || ''));
        if (estimated > config.maxContentLength) {
          return reject(
            new AxiosError(
              `maxContentLength size of ${config.maxContentLength} exceeded`,
              AxiosError.ERR_BAD_RESPONSE,
              config
            )
          );
        }
      }
      if (method !== 'GET') {
        return settle(resolve, reject, { status: 405, statusText: 'method not allowed', headers: {}, config });
      }
      let convertedData;
      try {
        convertedData = fromDataURI(config.url, responseType === 'blob', { Blob: config.env && config.env.Blob });
      } catch (err) {
        throw AxiosError.from(err, AxiosError.ERR_BAD_REQUEST, config);
      }
      if (responseType === 'text') {
        convertedData = convertedData.toString(responseEncoding);
        if (!responseEncoding || responseEncoding === 'utf8') convertedData = utils.stripBOM(convertedData);
      } else if (responseType === 'stream') {
        convertedData = stream.Readable.from(convertedData);
      }
      return settle(resolve, reject, {
        data: convertedData,
        status: 200,
        statusText: 'OK',
        headers: new AxiosHeaders(),
        config,
      });
    }

    if (!supportedProtocols.includes(protocol)) {
      return reject(new AxiosError(`Unsupported protocol ${protocol}`, AxiosError.ERR_BAD_REQUEST, config));
    }

    const headers = AxiosHeaders.from(config.headers).normalize();
    // Some servers want a User-Agent; one set in the config (false: none) wins.
    headers.set('User-Agent', `axios/${VERSION}`, false);

    const { onUploadProgress, onDownloadProgress, maxRate } = config;
    let maxUploadRate;
    let maxDownloadRate;

    if (utils.isSpecCompliantForm(data)) {
      const userBoundary = headers.getContentType(/boundary=([-_\w\d]{10,70})/i);
      data = formDataToStream(data, (formHeaders) => headers.set(formHeaders), {
        tag: `axios-${VERSION}-boundary`,
        boundary: (userBoundary && userBoundary[1]) || undefined,
      });
    } else if (utils.isFormData(data) && utils.isFunction(data.getHeaders)) {
      // form-data's API: its headers, and its length when it can tell.
      headers.set(data.getHeaders());
      if (!headers.hasContentLength()) {
        try {
          const knownLength = await util.promisify(data.getLength).call(data);
          if (Number.isFinite(knownLength) && knownLength >= 0) headers.setContentLength(knownLength);
        } catch {
          // A length it cannot tell: chunked.
        }
      }
    } else if (utils.isBlob(data) || utils.isFile(data)) {
      if (data.size) headers.setContentType(data.type || 'application/octet-stream');
      headers.setContentLength(data.size || 0);
      data = stream.Readable.from(readBlob(data));
    } else if (data && !utils.isStream(data)) {
      if (Buffer.isBuffer(data)) {
        // As it is.
      } else if (utils.isArrayBuffer(data)) {
        data = Buffer.from(new Uint8Array(data));
      } else if (utils.isString(data)) {
        data = Buffer.from(data, 'utf-8');
      } else {
        return reject(
          new AxiosError(
            'Data after transformation must be a string, an ArrayBuffer, a Buffer, or a Stream',
            AxiosError.ERR_BAD_REQUEST,
            config
          )
        );
      }
      headers.setContentLength(data.length, false);
      if (config.maxBodyLength > -1 && data.length > config.maxBodyLength) {
        return reject(
          new AxiosError('Request body larger than maxBodyLength limit', AxiosError.ERR_BAD_REQUEST, config)
        );
      }
    }

    const contentLength = utils.toFiniteNumber(headers.getContentLength());

    if (Array.isArray(maxRate)) {
      [maxUploadRate, maxDownloadRate] = maxRate;
    } else {
      maxUploadRate = maxDownloadRate = maxRate;
    }

    if (data && (onUploadProgress || maxUploadRate)) {
      if (!utils.isStream(data)) data = stream.Readable.from(data, { objectMode: false });
      data = stream.pipeline(
        [data, new AxiosTransformStream({ maxRate: utils.toFiniteNumber(maxUploadRate) })],
        utils.noop
      );
      if (onUploadProgress) {
        data.on(
          'progress',
          flushOnFinish(
            data,
            progressEventDecorator(contentLength, progressEventReducer(asyncDecorator(onUploadProgress), false, 3))
          )
        );
      }
    }

    // Basic auth: of the config, or of the URL.
    let auth;
    if (config.auth) auth = `${config.auth.username || ''}:${config.auth.password || ''}`;
    if (!auth && parsed.username) auth = `${parsed.username}:${parsed.password}`;
    if (auth) headers.delete('authorization');

    let path;
    try {
      path = buildURL(parsed.pathname + parsed.search, config.params, config.paramsSerializer).replace(/^\?/, '');
    } catch (err) {
      const customErr = new Error(err.message);
      customErr.config = config;
      customErr.url = config.url;
      customErr.exists = true;
      return reject(customErr);
    }

    headers.set('Accept-Encoding', 'gzip, compress, deflate, br', false);

    const options = {
      path,
      method,
      headers: headers.toJSON(),
      agents: { http: config.httpAgent, https: config.httpsAgent },
      auth,
      protocol,
      family,
      beforeRedirect: dispatchBeforeRedirect,
      beforeRedirects: {},
      http2Options,
    };
    if (lookup !== undefined) options.lookup = lookup;

    if (config.socketPath) {
      options.socketPath = config.socketPath;
    } else {
      options.hostname = parsed.hostname.startsWith('[') ? parsed.hostname.slice(1, -1) : parsed.hostname;
      options.port = parsed.port;
      setProxy(
        options,
        config.proxy,
        `${protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}${options.path}`
      );
    }

    let transport;
    const isHttpsRequest = isHttps.test(options.protocol);
    options.agent = isHttpsRequest ? config.httpsAgent : config.httpAgent;
    if (isHttp2) {
      transport = http2Transport;
    } else if (config.transport) {
      transport = config.transport;
    } else if (config.maxRedirects === 0) {
      transport = isHttpsRequest ? https : http;
    } else {
      if (config.maxRedirects) options.maxRedirects = config.maxRedirects;
      if (config.beforeRedirect) options.beforeRedirects.config = config.beforeRedirect;
      transport = isHttpsRequest ? httpsFollow : httpFollow;
    }

    // -1 (no limit) is Infinity for the redirects' own check.
    options.maxBodyLength = config.maxBodyLength > -1 ? config.maxBodyLength : Infinity;
    if (config.insecureHTTPParser) options.insecureHTTPParser = config.insecureHTTPParser;

    req = transport.request(options, function handleResponse(res) {
      if (req.destroyed) return;
      const streams = [res];
      const responseLength = utils.toFiniteNumber(res.headers['content-length']);

      if (onDownloadProgress || maxDownloadRate) {
        const transformStream = new AxiosTransformStream({ maxRate: utils.toFiniteNumber(maxDownloadRate) });
        if (onDownloadProgress) {
          transformStream.on(
            'progress',
            flushOnFinish(
              transformStream,
              progressEventDecorator(responseLength, progressEventReducer(asyncDecorator(onDownloadProgress), true, 3))
            )
          );
        }
        streams.push(transformStream);
      }

      // The last request, after redirects.
      const lastRequest = res.req || req;

      // Decompressed unless decompress is false; the content-encoding header then removed.
      if (config.decompress !== false && res.headers['content-encoding']) {
        if (method === 'HEAD' || res.statusCode === 204) delete res.headers['content-encoding'];
        switch ((res.headers['content-encoding'] || '').toLowerCase()) {
          case 'gzip':
          case 'x-gzip':
          case 'compress':
          case 'x-compress':
            streams.push(zlib.createUnzip(zlibOptions));
            delete res.headers['content-encoding'];
            break;
          case 'deflate':
            streams.push(new ZlibHeaderTransformStream());
            streams.push(zlib.createUnzip(zlibOptions));
            delete res.headers['content-encoding'];
            break;
          case 'br':
            streams.push(zlib.createBrotliDecompress(brotliOptions));
            delete res.headers['content-encoding'];
            break;
          default:
        }
      }

      const responseStream = streams.length > 1 ? stream.pipeline(streams, utils.noop) : streams[0];
      const response = {
        status: res.statusCode,
        statusText: res.statusMessage,
        headers: new AxiosHeaders(res.headers),
        config,
        request: lastRequest,
      };

      if (responseType === 'stream') {
        response.data = responseStream;
        settle(resolve, reject, response);
      } else {
        const chunks = [];
        let totalResponseBytes = 0;
        responseStream.on('data', (chunk) => {
          chunks.push(chunk);
          totalResponseBytes += chunk.length;
          if (config.maxContentLength > -1 && totalResponseBytes > config.maxContentLength) {
            rejected = true;
            responseStream.destroy();
            abort(
              new AxiosError(
                `maxContentLength size of ${config.maxContentLength} exceeded`,
                AxiosError.ERR_BAD_RESPONSE,
                config,
                lastRequest
              )
            );
          }
        });
        responseStream.on('aborted', () => {
          if (rejected) return;
          const err = new AxiosError('stream has been aborted', AxiosError.ERR_BAD_RESPONSE, config, lastRequest);
          responseStream.destroy(err);
          reject(err);
        });
        responseStream.on('error', (err) => {
          if (req.destroyed) return;
          reject(AxiosError.from(err, null, config, lastRequest));
        });
        responseStream.on('end', () => {
          try {
            let responseData = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks);
            if (responseType !== 'arraybuffer') {
              responseData = responseData.toString(responseEncoding);
              if (!responseEncoding || responseEncoding === 'utf8') responseData = utils.stripBOM(responseData);
            }
            response.data = responseData;
          } catch (err) {
            return reject(AxiosError.from(err, null, config, response.request, response));
          }
          settle(resolve, reject, response);
          return undefined;
        });
      }

      abortEmitter.once('abort', (err) => {
        if (!responseStream.destroyed) {
          responseStream.emit('error', err);
          responseStream.destroy();
        }
      });
    });

    abortEmitter.once('abort', (err) => {
      if (req.close) req.close();
      else req.destroy(err);
    });

    req.on('error', (err) => reject(AxiosError.from(err, null, config, req)));

    // Keep-alive packets, so that peers do not drop the connection.
    req.on('socket', (socket) => socket.setKeepAlive(true, 1000 * 60));

    if (config.timeout) {
      const timeout = parseInt(config.timeout, 10);
      if (Number.isNaN(timeout)) {
        abort(
          new AxiosError('error trying to parse `config.timeout` to int', AxiosError.ERR_BAD_OPTION_VALUE, config, req)
        );
        return undefined;
      }
      // The request's own timer: it starts with the connection, so an event loop that is busy does not abort a
      // request before it connects.
      req.setTimeout(timeout, () => {
        if (isDone) return;
        let message = config.timeout ? `timeout of ${config.timeout}ms exceeded` : 'timeout exceeded';
        const transitional = config.transitional || transitionalDefaults;
        if (config.timeoutErrorMessage) message = config.timeoutErrorMessage;
        abort(
          new AxiosError(
            message,
            transitional.clarifyTimeoutError ? AxiosError.ETIMEDOUT : AxiosError.ECONNABORTED,
            config,
            req
          )
        );
      });
    } else {
      // A keep-alive socket may have a timeout of a request before.
      req.setTimeout(0);
    }

    if (utils.isStream(data)) {
      let ended = false;
      let errored = false;
      data.on('end', () => {
        ended = true;
      });
      data.once('error', (err) => {
        errored = true;
        req.destroy(err);
      });
      data.on('close', () => {
        if (!ended && !errored) abort(new CanceledError('Request stream has been aborted', config, req));
      });
      data.pipe(req);
    } else {
      if (data) req.write(data);
      req.end();
    }
    return undefined;
  });
}

export { httpAdapter, setProxy };
