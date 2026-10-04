// Ported from fastify (types/plugin.d.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import { XufaInstance } from './instance';
import { RawServerBase, RawRequestDefaultExpression, RawReplyDefaultExpression, RawServerDefault } from './utils';
import { XufaTypeProvider, XufaTypeProviderDefault } from './type-provider';
import { XufaBaseLogger } from './logger';

export type XufaPluginOptions = Record<string, any>;

/**
 * XufaPluginCallback
 *
 * Xufa allows the user to extend its functionalities with plugins. A plugin can be a set of routes, a server decorator or whatever. To activate plugins, use the `xufa.register()` method.
 */
export type XufaPluginCallback<
  Options extends XufaPluginOptions = Record<never, never>,
  Server extends RawServerBase = RawServerDefault,
  TypeProvider extends XufaTypeProvider = XufaTypeProviderDefault,
  Logger extends XufaBaseLogger = XufaBaseLogger,
> = (
  instance: XufaInstance<
    Server,
    RawRequestDefaultExpression<Server>,
    RawReplyDefaultExpression<Server>,
    Logger,
    TypeProvider
  >,
  opts: Options,
  done: (err?: Error) => void
) => void;

/**
 * XufaPluginAsync
 *
 * Xufa allows the user to extend its functionalities with plugins. A plugin can be a set of routes, a server decorator or whatever. To activate plugins, use the `xufa.register()` method.
 */
export type XufaPluginAsync<
  Options extends XufaPluginOptions = Record<never, never>,
  Server extends RawServerBase = RawServerDefault,
  TypeProvider extends XufaTypeProvider = XufaTypeProviderDefault,
  Logger extends XufaBaseLogger = XufaBaseLogger,
> = (
  instance: XufaInstance<
    Server,
    RawRequestDefaultExpression<Server>,
    RawReplyDefaultExpression<Server>,
    Logger,
    TypeProvider
  >,
  opts: Options
) => Promise<void>;
