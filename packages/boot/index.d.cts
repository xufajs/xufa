// Ported from avvio (index.d.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import { EventEmitter } from 'node:events';
import { XufaErrorConstructor } from '@xufa/errors';

declare function boot(done?: Function): boot.Boot<null>;
declare function boot<I>(instance: I, options?: boot.Options, done?: Function): boot.Boot<I>;

/**
 * Typescript cannot manage changes related to options "expose"
 * because undefined before runtime
 */
declare namespace boot {
  /** The function itself, by name. */
  const Boot: typeof boot;
  /** The errors of loading plugins. */
  const errors: {
    BOOT_ERR_EXPOSE_ALREADY_DEFINED: XufaErrorConstructor<{ code: 'BOOT_ERR_EXPOSE_ALREADY_DEFINED' }>;
    BOOT_ERR_ATTRIBUTE_ALREADY_DEFINED: XufaErrorConstructor<{ code: 'BOOT_ERR_ATTRIBUTE_ALREADY_DEFINED' }>;
    BOOT_ERR_CALLBACK_NOT_FN: XufaErrorConstructor<{ code: 'BOOT_ERR_CALLBACK_NOT_FN' }>;
    BOOT_ERR_PLUGIN_NOT_VALID: XufaErrorConstructor<{ code: 'BOOT_ERR_PLUGIN_NOT_VALID' }>;
    BOOT_ERR_ROOT_PLG_BOOTED: XufaErrorConstructor<{ code: 'BOOT_ERR_ROOT_PLG_BOOTED' }>;
    BOOT_ERR_PARENT_PLG_LOADED: XufaErrorConstructor<{ code: 'BOOT_ERR_PARENT_PLG_LOADED' }>;
    BOOT_ERR_READY_TIMEOUT: XufaErrorConstructor<{ code: 'BOOT_ERR_READY_TIMEOUT' }>;
    BOOT_ERR_PLUGIN_EXEC_TIMEOUT: XufaErrorConstructor<{ code: 'BOOT_ERR_PLUGIN_EXEC_TIMEOUT' }>;
  };
  /** The key of the instance of Boot on the object it was given. */
  const kBoot: unique symbol;
  /** The key of the metadata of a plugin (its name, dependencies...). */
  const kPluginMeta: unique symbol;

  type context<I> = I extends null ? Boot<I> : mixedInstance<I>;
  type mixedInstance<I> = I & Server<I>;

  interface Options {
    expose?: {
      use?: string;
      after?: string;
      ready?: string;
      close?: string;
      onClose?: string;
    };
    autostart?: boolean;
    timeout?: number;
  }

  interface Plugin<O, I> {
    (server: context<I>, options: O, done: (err?: Error) => void): unknown;
  }

  interface Server<I> {
    use: Use<I>;
    after: After<I>;
    ready: Ready<I>;
    close: Close<I>;
    onClose: OnClose<I>;
  }

  interface Boot<I> extends EventEmitter, Server<I> {
    on(event: 'start', listener: () => void): this;
    on(event: 'preReady', listener: () => void): this;
    on(event: 'close', listener: () => void): this;

    start(): this;

    toJSON(): Object;

    prettyPrint(): string;

    override: (server: context<I>, fn: Plugin<any, I>, options: any) => context<I>;

    started: boolean;
    booted: boolean;

    /** Alias for {@linkcode Boot.close} */
    [Symbol.asyncDispose](): Promise<void>;
  }

  // Boot methods
  interface After<I, C = context<I>> {
    (fn: (err: Error) => void): C;
    (fn: (err: Error, done: Function) => void): C;
    (fn: (err: Error, context: C, done: Function) => void): C;
  }

  interface Use<I, C = context<I>> {
    <O>(fn: boot.Plugin<O, I>, options?: O | ((server: C) => O)): C;
  }

  interface Ready<I, C = context<I>> {
    (): Promise<C>;
    (callback: (err?: Error) => void): void;
    (callback: (err: Error, done: Function) => void): void;
    (callback: (err: Error, context: C, done: Function) => void): void;
  }

  interface Close<I, C = context<I>> {
    (fn: (err: Error) => void): void;
    (fn: (err: Error, done: Function) => void): void;
    (fn: (err: Error, context: C, done: Function) => void): void;
  }

  interface OnClose<I, C = context<I>> {
    (fn: (context: C, done: Function) => void): C;
  }
}

export = boot;
