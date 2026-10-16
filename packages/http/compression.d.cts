// Types of @xufa/http/compression: compression's API (1.8): a middleware of node:http that compresses answers.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { BrotliOptions, ZlibOptions } from 'node:zlib';

declare function compression(options?: compression.CompressionOptions): compression.RequestHandler;

declare namespace compression {
  type RequestHandler = (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => void;

  /** Whether an answer is compressed (the default: compressible types). */
  type CompressionFilter = (req: IncomingMessage, res: ServerResponse) => boolean;

  interface CompressionOptions extends ZlibOptions {
    /** Answers under this size are not compressed: bytes, or a text such as '1kb' (1kb by default). */
    threshold?: number | string;
    /** Which answers are compressed; compression.filter is the default. */
    filter?: CompressionFilter;
    /** The options of brotli (its quality 4 by default). */
    brotli?: BrotliOptions;
    /** The encoding of requests without Accept-Encoding ('identity': none, by default). */
    enforceEncoding?: 'gzip' | 'deflate' | 'br' | 'identity';
  }

  /** The default filter: a Content-Type mime-db says is compressible (or text/*, +json, +text, +xml). */
  const filter: CompressionFilter;
}

declare module 'node:http' {
  interface ServerResponse {
    /** Sends what is compressed so far (@xufa/http/compression). */
    flush(): void;
  }
}

export = compression;
