// Encapsulation: each plugin runs with an instance of its own, made from the one registering it, unless it is
// marked to skip it (plugin() / fastify-plugin). Everything encapsulated is copied here.
import {
  kBoot,
  kChildren,
  kRoutePrefix,
  kLogLevel,
  kLogSerializers,
  kHooks,
  kSchemaController,
  kContentTypeParser,
  kReply,
  kRequest,
  kFourOhFour,
  kPluginNameChain,
  kErrorHandlerAlreadySet,
} from './symbols.js';
import Reply from './reply.js';
import Request from './request.js';
import SchemaController from './schema-controller.js';
import ContentTypeParser from './content-type-parser.js';
import { buildHooks } from './hooks.js';
import * as pluginUtils from './plugin-utils.js';

function buildRoutePrefix(instancePrefix, pluginPrefix) {
  if (!pluginPrefix) return instancePrefix;
  let prefix = pluginPrefix;
  // Exactly one '/' between the prefixes.
  if (instancePrefix.endsWith('/') && prefix[0] === '/') prefix = prefix.slice(1);
  else if (prefix[0] !== '/' && !instancePrefix.endsWith('/')) prefix = `/${prefix}`;
  return instancePrefix + prefix;
}

const __default = function override(old, fn, opts) {
  const skip = pluginUtils.registerPlugin.call(old, fn);
  const fnName = pluginUtils.getPluginName(fn) || pluginUtils.getFuncPreview(fn);
  if (skip) {
    old[kPluginNameChain].push(fnName);
    return old;
  }
  const instance = Object.create(old);
  old[kChildren].push(instance);
  instance.ready = old[kBoot].bind(instance);
  instance[kChildren] = [];
  instance[kReply] = Reply.buildReply(instance[kReply]);
  instance[kRequest] = Request.buildRequest(instance[kRequest]);
  instance[kContentTypeParser] = ContentTypeParser.helpers.buildContentTypeParser(instance[kContentTypeParser]);
  instance[kHooks] = buildHooks(instance[kHooks]);
  instance[kRoutePrefix] = buildRoutePrefix(instance[kRoutePrefix], opts.prefix);
  instance[kLogLevel] = opts.logLevel || instance[kLogLevel];
  instance[kSchemaController] = SchemaController.buildSchemaController(old[kSchemaController]);
  instance.getSchema = instance[kSchemaController].getSchema.bind(instance[kSchemaController]);
  instance.getSchemas = instance[kSchemaController].getSchemas.bind(instance[kSchemaController]);
  // The plugins registered since the root (not the one being registered).
  instance[pluginUtils.kRegisteredPlugins] = Object.create(instance[pluginUtils.kRegisteredPlugins]);
  // The chain of plugin names since the root, extended by the plugins that skip encapsulation.
  instance[kPluginNameChain] = [fnName];
  instance[kErrorHandlerAlreadySet] = false;
  if (instance[kLogSerializers] || opts.logSerializers) {
    instance[kLogSerializers] = Object.assign(Object.create(instance[kLogSerializers]), opts.logSerializers);
  }
  if (opts.prefix) instance[kFourOhFour].arrange404(instance);
  for (const hook of instance[kHooks].onRegister) hook.call(old, instance, opts);
  return instance;
};
export default __default;

__default.buildRoutePrefix = buildRoutePrefix;

export { buildRoutePrefix };

// What require() gives (the tests of fastify are CommonJS).
export { __default as 'module.exports' };
