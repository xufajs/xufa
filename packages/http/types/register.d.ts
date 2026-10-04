// Ported from fastify (types/register.d.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import { XufaPluginOptions, XufaPluginCallback, XufaPluginAsync } from './plugin';
import { LogLevel } from './logger';
import { XufaInstance } from './instance';
import { RawServerBase } from './utils';
import { XufaBaseLogger, XufaTypeProvider, RawServerDefault } from '../index';

export interface RegisterOptions {
  prefix?: string;
  logLevel?: LogLevel;
  logSerializers?: Record<string, (value: any) => string>;
}

export type XufaRegisterOptions<Options> =
  (RegisterOptions & Options) | ((instance: XufaInstance) => RegisterOptions & Options);

/**
 * XufaRegister
 *
 * Function for adding a plugin to xufa. The options are inferred from the passed in XufaPlugin parameter.
 */
export interface XufaRegister<
  T = void,
  RawServer extends RawServerBase = RawServerDefault,
  TypeProviderDefault extends XufaTypeProvider = XufaTypeProvider,
  LoggerDefault extends XufaBaseLogger = XufaBaseLogger,
> {
  <
    Server extends RawServerBase = RawServer,
    TypeProvider extends XufaTypeProvider = TypeProviderDefault,
    Logger extends XufaBaseLogger = LoggerDefault,
  >(
    plugin: XufaPluginCallback<XufaPluginOptions, Server, TypeProvider, Logger>
  ): T;
  <
    Options extends XufaPluginOptions,
    Server extends RawServerBase = RawServer,
    TypeProvider extends XufaTypeProvider = TypeProviderDefault,
    Logger extends XufaBaseLogger = LoggerDefault,
  >(
    plugin: XufaPluginCallback<Options, Server, TypeProvider, Logger>,
    opts: XufaRegisterOptions<Options>
  ): T;
  <
    Server extends RawServerBase = RawServer,
    TypeProvider extends XufaTypeProvider = TypeProviderDefault,
    Logger extends XufaBaseLogger = LoggerDefault,
  >(
    plugin: XufaPluginAsync<XufaPluginOptions, Server, TypeProvider, Logger>
  ): T;
  <
    Options extends XufaPluginOptions,
    Server extends RawServerBase = RawServer,
    TypeProvider extends XufaTypeProvider = TypeProviderDefault,
    Logger extends XufaBaseLogger = LoggerDefault,
  >(
    plugin: XufaPluginAsync<Options, Server, TypeProvider, Logger>,
    opts: XufaRegisterOptions<Options>
  ): T;
  <
    Server extends RawServerBase = RawServer,
    TypeProvider extends XufaTypeProvider = TypeProviderDefault,
    Logger extends XufaBaseLogger = LoggerDefault,
  >(
    plugin:
      | XufaPluginCallback<XufaPluginOptions, Server, TypeProvider, Logger>
      | XufaPluginAsync<XufaPluginOptions, Server, TypeProvider, Logger>
      | Promise<{
          default: XufaPluginCallback<XufaPluginOptions, Server, TypeProvider, Logger>;
        }>
      | Promise<{ default: XufaPluginAsync<XufaPluginOptions, Server, TypeProvider, Logger> }>
  ): T;
  <
    Options extends XufaPluginOptions,
    Server extends RawServerBase = RawServer,
    TypeProvider extends XufaTypeProvider = TypeProviderDefault,
    Logger extends XufaBaseLogger = LoggerDefault,
  >(
    plugin:
      | XufaPluginCallback<Options, Server, TypeProvider, Logger>
      | XufaPluginAsync<Options, Server, TypeProvider, Logger>
      | Promise<{ default: XufaPluginCallback<Options, Server, TypeProvider, Logger> }>
      | Promise<{ default: XufaPluginAsync<Options, Server, TypeProvider, Logger> }>,
    opts: XufaRegisterOptions<Options>
  ): T;
}
