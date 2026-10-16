// Types of @xufa/http/multer: multer's API (the shape of @types/multer), read by @xufa/http's parser.
import type { IncomingMessage } from 'node:http';
import type { Readable } from 'node:stream';

declare namespace multer {
  /** A file of the request. */
  interface File {
    /** The name of its field. */
    fieldname: string;
    /** Its name on the computer it came from ('latin1' decoded unless defParamCharset: 'utf8'). */
    originalname: string;
    encoding: string;
    mimetype: string;
    size: number;
    /** memoryStorage: its bytes. */
    buffer: Buffer;
    /** diskStorage: where it was written. */
    destination: string;
    filename: string;
    path: string;
    /** While a storage reads it. */
    stream: Readable;
  }

  interface Field {
    name: string;
    maxCount?: number;
  }

  type FileFilterCallback = {
    (error: Error): void;
    (error: null, acceptFile: boolean): void;
  };

  /** A request with what the middleware gives (Express's, or any IncomingMessage). */
  interface Request extends IncomingMessage {
    body?: any;
    file?: File;
    files?: File[] | Record<string, File[]>;
  }

  type Middleware = (req: any, res: any, next: (err?: any) => void) => void;

  interface StorageEngine {
    _handleFile(req: Request, file: File, callback: (error?: any, info?: Partial<File>) => void): void;
    _removeFile(req: Request, file: File, callback: (error: Error | null) => void): void;
  }

  interface DiskStorageOptions {
    /** A folder (made if missing), or where each file goes; the system's temporary folder by default. */
    destination?:
      string | ((req: Request, file: File, callback: (error: Error | null, destination: string) => void) => void);
    /** The name of each file; 32 random hex digits by default. */
    filename?(req: Request, file: File, callback: (error: Error | null, filename: string) => void): void;
  }

  interface Options {
    /** Where files go (diskStorage, memoryStorage, your own); memory by default. */
    storage?: StorageEngine;
    /** A folder: diskStorage of it. */
    dest?: string;
    limits?: {
      /** The longest name of a field (100). */
      fieldNameSize?: number;
      /** The longest value of a field, in bytes (1 MiB). */
      fieldSize?: number;
      fields?: number;
      /** The largest file, in bytes (no limit). */
      fileSize?: number;
      files?: number;
      parts?: number;
      headerPairs?: number;
    };
    /** Keep the folders in the names of files. */
    preservePath?: boolean;
    /** The charset of names of files: 'latin1' (multer's default) or 'utf8' (as browsers send them). */
    defParamCharset?: string;
    fileFilter?(req: Request, file: File, callback: FileFilterCallback): void;
  }

  interface Multer {
    /** One file of a field: req.file. */
    single(fieldName: string): Middleware;
    /** Files of a field: req.files. */
    array(fieldName: string, maxCount?: number): Middleware;
    /** Files of fields: req.files by field. */
    fields(fields: readonly Field[]): Middleware;
    /** Any files: req.files. */
    any(): Middleware;
    /** Fields only (a file is LIMIT_UNEXPECTED_FILE). */
    none(): Middleware;
  }

  type ErrorCode =
    | 'LIMIT_PART_COUNT'
    | 'LIMIT_FILE_SIZE'
    | 'LIMIT_FILE_COUNT'
    | 'LIMIT_FIELD_KEY'
    | 'LIMIT_FIELD_VALUE'
    | 'LIMIT_FIELD_COUNT'
    | 'LIMIT_UNEXPECTED_FILE'
    | 'MISSING_FIELD_NAME';

  class MulterError extends Error {
    constructor(code: ErrorCode, field?: string);
    name: 'MulterError';
    code: ErrorCode;
    field?: string;
    /** Errors of the storage while it removed the files of a request that failed. */
    storageErrors?: Error[];
  }

  function diskStorage(options: DiskStorageOptions): StorageEngine;
  function memoryStorage(): StorageEngine;
}

declare function multer(options?: multer.Options): multer.Multer;

export = multer;
