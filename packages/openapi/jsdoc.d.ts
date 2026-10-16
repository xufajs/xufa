// @xufa/openapi/jsdoc: an OpenAPI (or Swagger 2) document from the @openapi / @swagger comments of source files, as
// swagger-jsdoc 6 makes it.

declare namespace jsdoc {
  export interface Options {
    /** The document to start from (OpenAPI 3: { openapi, info, ... }; without openapi, Swagger 2). */
    definition?: Record<string, unknown>;
    /** The same, as swagger-jsdoc also names it. */
    swaggerDefinition?: Record<string, unknown>;
    /** Files or glob patterns (*, ?, **, [...]): .js and the like (their /** *\/ comments), .yaml / .yml (whole). */
    apis: string[];
    /** The encoding of the files ('utf8'). */
    encoding?: BufferEncoding;
    /** Throw when a comment's YAML is wrong (else it is left out and reported on the console). */
    failOnErrors?: boolean;
    /** The report includes each wrong comment. */
    verbose?: boolean;
    /** '.yaml' or '.yml': the document as YAML text. */
    format?: '.json' | '.yaml' | '.yml';
  }

  /** The files a pattern matches, sorted, as glob 7 finds them. */
  export function globSync(pattern: string): string[];
  /** The texts of the @openapi and @swagger tags of a comment. */
  export function yamlOfComment(comment: string): string[];
  /** lodash's merge of two objects, null keeping what was there. */
  export function mergeDeep<T extends object>(first: T | undefined, second: object | undefined): T;
}

declare function jsdoc(options: jsdoc.Options & { format: '.yaml' | '.yml' }): string;
declare function jsdoc(options: jsdoc.Options): Record<string, any>;

export = jsdoc;
