'use strict';

// @xufa/schema: schemas of data. Written as code with s (plain JSON Schemas, with their TypeScript types), as JSON
// Schema (draft-04 to 2020-12), or with the builder of types (new Schema({ name: String() })); compiled into
// functions that check values (the validator of the routes of @xufa/http), written as standalone code, or inferred
// from samples. No dependencies.
//
//   const { s, compileJsonSchema } = require('@xufa/schema');
//   const Book = s.object({ title: s.string({ minLength: 1 }), pages: s.optional(s.integer({ minimum: 1 })) });
//   const validate = compileJsonSchema(Book);
//   validate({ pages: 0 }); // ['title is mandatory', 'pages must be at least 1']
module.exports = require('./src');
