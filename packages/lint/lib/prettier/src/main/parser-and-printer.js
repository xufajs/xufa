import { getOrInsertComputed } from '../utilities/get-or-insert.js';
import createGetVisitorKeysFunction from './create-get-visitor-keys-function.js';
import { isEmbedFrontMatter, isFrontMatter, printEmbedFrontMatter, printFrontMatter } from './front-matter/index.js';

function normalizePrinterWithoutCache(printer) {
  let { features, getVisitorKeys, embed: originalEmbed, print: originalPrint, ...printerRestProperties } = printer;

  features = normalizePrinterFeatures(features);
  const frontMatterSupport = features.experimental_frontMatterSupport;

  getVisitorKeys = createGetVisitorKeysFunction(
    getVisitorKeys,
    /** frontMatterVisitorKeys */ frontMatterSupport.massageAstNode ||
      frontMatterSupport.embed ||
      frontMatterSupport.print
  );

  let embed = originalEmbed;
  if (originalEmbed) {
    let embedGetVisitorKeys;
    embed = new Proxy(originalEmbed, {
      get(target, property, receiver) {
        if (property === 'getVisitorKeys') {
          embedGetVisitorKeys ??= originalEmbed.getVisitorKeys
            ? createGetVisitorKeysFunction(
                originalEmbed.getVisitorKeys,
                /** frontMatterVisitorKeys */ frontMatterSupport.massageAstNode || frontMatterSupport.embed
              )
            : getVisitorKeys;
          return embedGetVisitorKeys;
        }

        return Reflect.get(target, property, receiver);
      },
      apply: (target, thisArgument, argumentsList) =>
        frontMatterSupport.embed && isEmbedFrontMatter(...argumentsList)
          ? printEmbedFrontMatter
          : Reflect.apply(target, thisArgument, argumentsList),
    });
  }

  let print = originalPrint;
  if (frontMatterSupport.print) {
    print = new Proxy(originalPrint, {
      apply(target, thisArgument, argumentsList) {
        const [path] = argumentsList;
        if (isFrontMatter(path.node)) {
          return printFrontMatter(path);
        }
        return Reflect.apply(target, thisArgument, argumentsList);
      },
    });
  }

  const normalizedPrinter = {
    features,
    getVisitorKeys,
    embed,
    print,
    ...printerRestProperties,
  };

  return normalizedPrinter;
}

const normalizedPrinters = new WeakMap();
function normalizePrinter(printer) {
  return getOrInsertComputed(normalizedPrinters, printer, normalizePrinterWithoutCache);
}

const PRINTER_FRONT_MATTER_SUPPORT_FEATURES = ['clean', 'embed', 'print'];
const PRINTER_FRONT_MATTER_SUPPORT_OFF = Object.fromEntries(
  PRINTER_FRONT_MATTER_SUPPORT_FEATURES.map((feature) => [feature, false])
);
function normalizePrinterFrontMatterSupport(frontMatterSupport) {
  return {
    ...PRINTER_FRONT_MATTER_SUPPORT_OFF,
    ...frontMatterSupport,
  };
}

function normalizePrinterFeatures(features) {
  return {
    experimental_avoidAstMutation: false,
    ...features,
    experimental_frontMatterSupport: normalizePrinterFrontMatterSupport(features?.experimental_frontMatterSupport),
  };
}

export { normalizePrinter };
