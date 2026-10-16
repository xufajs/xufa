// Types of @xufa/http/form-data: the API of the form-data package (the names of its own types, for code that uses them).
/// <reference types="node" />
import * as stream from 'node:stream';
import * as http from 'node:http';

declare namespace FormData {
  interface Headers {
    [key: string]: any;
  }

  interface AppendOptions {
    /** Headers to add to the part's, or the whole header of the part as a string. */
    header?: string | Headers;
    /** The length of a stream, so getLengthSync() knows it. */
    knownLength?: number;
    filename?: string;
    /** A filename with its folders. */
    filepath?: string;
    contentType?: string;
  }

  interface SubmitOptions extends http.RequestOptions {
    protocol?: 'https:' | 'http:';
  }

  interface Options {
    /** What streams may say before their turn (2 MiB). */
    maxDataSize?: number;
    /** Streams appended are paused until their turn (true). */
    pauseStreams?: boolean;
    [option: string]: any;
  }
}

declare class FormData extends stream.Readable {
  static readonly LINE_BREAK: '\r\n';
  static readonly DEFAULT_CONTENT_TYPE: 'application/octet-stream';
  constructor(options?: FormData.Options);
  maxDataSize: number;
  /** A part: a text, a Buffer or a stream; a string as options is its filename. */
  append(key: string, value: any, options?: FormData.AppendOptions | string): void;
  /** Its Content-Type with the boundary, and the headers given. */
  getHeaders(userHeaders?: FormData.Headers): FormData.Headers;
  /** A POST of the form; callback(err, response). */
  submit(
    params: string | FormData.SubmitOptions,
    callback?: (error: Error | null, response: http.IncomingMessage) => void
  ): http.ClientRequest;
  /** The form at once, of its texts and Buffers. */
  getBuffer(): Buffer;
  setBoundary(boundary: string): void;
  getBoundary(): string;
  getLength(callback: (err: Error | null, length: number) => void): void;
  /** Without the lengths of streams (an 'error' says so when there are some of unknown length). */
  getLengthSync(): number;
  hasKnownLength(): boolean;
}

export = FormData;
