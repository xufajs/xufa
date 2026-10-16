// Types of @xufa/config/dotenv: dotenv's API (the names of dotenv's own types, for code that uses them).
/// <reference types="node" />
import type { URL } from 'node:url';

declare namespace dotenv {
  /** The variables read: name -> value. */
  interface DotenvParseOutput {
    [name: string]: string;
  }

  interface DotenvPopulateOutput {
    [name: string]: string;
  }

  interface DotenvPopulateInput {
    [name: string]: string;
  }

  interface DotenvPopulateOptions {
    /** Says which variables were kept or replaced. */
    debug?: boolean;
    /** Replace the variables already set (by default they are kept). */
    override?: boolean;
  }

  interface DotenvConfigOptions extends DotenvPopulateOptions {
    /** The file (`~` is the home folder), or files where the first that sets a variable wins; `.env` by default. */
    path?: string | string[] | URL;
    /** Of the files; 'utf8' by default. */
    encoding?: string;
    /** No log line of what was injected. */
    quiet?: boolean;
    /** Where to set the variables; process.env by default. */
    processEnv?: DotenvPopulateInput;
    /** The key of .env.vault (else the variable DOTENV_KEY). */
    DOTENV_KEY?: string;
  }

  type DotenvError = Error & {
    code:
      'MISSING_DATA' | 'INVALID_DOTENV_KEY' | 'NOT_FOUND_DOTENV_ENVIRONMENT' | 'DECRYPTION_FAILED' | 'OBJECT_REQUIRED';
  };

  interface DotenvConfigOutput {
    /** The last error reading a file (a missing file too): the rest were still read. */
    error?: DotenvError;
    parsed?: DotenvParseOutput;
  }

  /** The variables of a .env text. */
  function parse<T extends DotenvParseOutput = DotenvParseOutput>(src: string | Buffer): T;
  /** Reads the .env files (or the .env.vault of DOTENV_KEY) into process.env. */
  function config(options?: DotenvConfigOptions): DotenvConfigOutput;
  /** config() without .env.vault. */
  function configDotenv(options?: DotenvConfigOptions): DotenvConfigOutput;
  /** Sets in processEnv the variables of parsed it does not have (all with override); those it set. */
  function populate(
    processEnv: DotenvPopulateInput,
    parsed: DotenvPopulateInput,
    options?: DotenvConfigOptions
  ): DotenvPopulateOutput;
  /** A value of .env.vault decrypted (AES-256-GCM) by a key of 64 hex digits. */
  function decrypt(encrypted: string, keyStr: string): string;
}

export = dotenv;
