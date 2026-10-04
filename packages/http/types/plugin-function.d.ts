// Ported from fastify-plugin (types/plugin.d.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import {
  XufaPluginCallback,
  XufaPluginAsync,
  XufaPluginOptions,
  RawServerBase,
  RawServerDefault,
  XufaTypeProvider,
  XufaTypeProviderDefault,
  XufaBaseLogger,
} from '../index';

type PluginFunction = typeof plugin;

declare namespace plugin {
  export interface PluginMetadata {
    /** Bare-minimum version of Xufa for your plugin, just add the semver range that you need. */
    xufa?: string;
    /** The range of fastify versions of a plugin written for fastify: accepted, not checked. */
    fastify?: string;
    name?: string;
    /** Decorator dependencies for this plugin */
    decorators?: {
      xufa?: (string | symbol)[];
      /** The same as `xufa`, for plugins written for fastify. */
      fastify?: (string | symbol)[];
      reply?: (string | symbol)[];
      request?: (string | symbol)[];
    };
    /** The plugin dependencies */
    dependencies?: string[];
    encapsulate?: boolean;
  }
  // Exporting PluginOptions for backward compatibility after renaming it to PluginMetadata
  /**
   * @deprecated Use PluginMetadata instead
   */
  export interface PluginOptions extends PluginMetadata {}

  export const plugin: PluginFunction;
  export { plugin as default };
}

/**
 * This function does three things for you:
 *   1. Add the `skip-override` hidden property
 *   2. Check bare-minimum version of Xufa
 *   3. Pass some custom metadata of the plugin to Xufa
 * @param fn Xufa plugin function
 * @param options Optional plugin options
 */

declare function plugin<
  Options extends XufaPluginOptions = Record<never, never>,
  RawServer extends RawServerBase = RawServerDefault,
  TypeProvider extends XufaTypeProvider = XufaTypeProviderDefault,
  Logger extends XufaBaseLogger = XufaBaseLogger,
  Fn extends
    | XufaPluginCallback<Options, RawServer, TypeProvider, Logger>
    | XufaPluginAsync<Options, RawServer, TypeProvider, Logger> = XufaPluginCallback<
    Options,
    RawServer,
    TypeProvider,
    Logger
  >,
>(
  fn: Fn extends unknown
    ? Fn extends (...args: any) => Promise<any>
      ? XufaPluginAsync<Options, RawServer, TypeProvider, Logger>
      : XufaPluginCallback<Options, RawServer, TypeProvider, Logger>
    : Fn,
  options?: plugin.PluginMetadata | string
): Fn;

export = plugin;
