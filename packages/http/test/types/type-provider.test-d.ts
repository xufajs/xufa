// Ported from fastify (test/types/type-provider.tst.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import { IncomingHttpHeaders } from 'node:http'
import { FromSchema, JSONSchema } from 'json-schema-to-ts'
import { Type, TSchema, Static } from 'typebox'
import { expectTypeOf } from '@xufa/test';
import xufa, {
  XufaTypeProvider,
  HookHandlerDoneFunction,
  XufaRequest,
  XufaReply,
  XufaInstance,
  XufaError,
  SafePromiseLike
} from '../..'

const server = xufa()

// -------------------------------------------------------------------
// Default (unknown)
// -------------------------------------------------------------------

server.get('/', (req) => expectTypeOf(req.body).toEqualTypeOf<unknown>())

// -------------------------------------------------------------------
// Remapping
// -------------------------------------------------------------------

interface NumberProvider extends XufaTypeProvider {
  validator: number
  serializer: number
} // remap all schemas to numbers

server.withTypeProvider<NumberProvider>().get(
  '/',
  {
    schema: {
      body: { type: 'string' },
      querystring: { type: 'string' },
      headers: { type: 'string' },
      params: { type: 'string' }
    }
  },
  (req) => {
    expectTypeOf(req.headers).toEqualTypeOf<number & IncomingHttpHeaders>();
    expectTypeOf(req.body).toEqualTypeOf<number>();
    expectTypeOf(req.query).toEqualTypeOf<number>();
    expectTypeOf(req.params).toEqualTypeOf<number>();
  }
)

// -------------------------------------------------------------------
// Override
// -------------------------------------------------------------------

interface OverriddenProvider extends XufaTypeProvider { validator: 'inferenced' }

server.withTypeProvider<OverriddenProvider>().get<{ Body: 'override' }>(
  '/',
  {
    schema: {
      body: Type.Object({
        x: Type.Number(),
        y: Type.Number(),
        z: Type.Number()
      })
    }
  },
  (req) => {
    expectTypeOf(req.body).toEqualTypeOf<'override'>();
  }
)

// -------------------------------------------------------------------
// TypeBox
// -------------------------------------------------------------------

interface TypeBoxProvider extends XufaTypeProvider {
  validator: this['schema'] extends TSchema ? Static<this['schema']> : unknown
  serializer: this['schema'] extends TSchema ? Static<this['schema']> : unknown
}

server.withTypeProvider<TypeBoxProvider>().get(
  '/',
  {
    schema: {
      body: Type.Object({
        x: Type.Number(),
        y: Type.Number(),
        z: Type.Number()
      })
    },
    errorHandler: (error, request, reply) => {
      expectTypeOf(error).toEqualTypeOf<XufaError>();
      expectTypeOf(request).toMatchTypeOf<XufaRequest>();
      expectTypeOf(request.body.x).toEqualTypeOf<number>();
      expectTypeOf(request.body.y).toEqualTypeOf<number>();
      expectTypeOf(request.body.z).toEqualTypeOf<number>();
      expectTypeOf(reply).toMatchTypeOf<XufaReply>();
    }
  },
  (req) => {
    expectTypeOf(req.body.x).toEqualTypeOf<number>();
    expectTypeOf(req.body.y).toEqualTypeOf<number>();
    expectTypeOf(req.body.z).toEqualTypeOf<number>();
  }
)

expectTypeOf(server.withTypeProvider<TypeBoxProvider>()).toMatchTypeOf<XufaInstance>();

// -------------------------------------------------------------------
// JsonSchemaToTs
// -------------------------------------------------------------------

interface JsonSchemaToTsProvider extends XufaTypeProvider {
  validator: this['schema'] extends JSONSchema ? FromSchema<this['schema']> : unknown
  serializer: this['schema'] extends JSONSchema ? FromSchema<this['schema']> : unknown
}

// explicitly setting schema `as const`

server.withTypeProvider<JsonSchemaToTsProvider>().get(
  '/',
  {
    schema: {
      body: {
        type: 'object',
        properties: {
          x: { type: 'number' },
          y: { type: 'string' },
          z: { type: 'boolean' }
        }
      } as const
    },
    errorHandler: (error, request, reply) => {
      expectTypeOf(error).toEqualTypeOf<XufaError>();
      expectTypeOf(request).toMatchTypeOf<XufaRequest>();
      expectTypeOf(request.body.x).toEqualTypeOf<number | undefined>();
      expectTypeOf(request.body.y).toEqualTypeOf<string | undefined>();
      expectTypeOf(request.body.z).toEqualTypeOf<boolean | undefined>();
      expectTypeOf(reply).toMatchTypeOf<XufaReply>();
    }
  },
  (req) => {
    expectTypeOf(req.body.x).toEqualTypeOf<number | undefined>();
    expectTypeOf(req.body.y).toEqualTypeOf<string | undefined>();
    expectTypeOf(req.body.z).toEqualTypeOf<boolean | undefined>();
  }
)

server.withTypeProvider<JsonSchemaToTsProvider>().route({
  url: '/',
  method: 'POST',
  schema: {
    body: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'string' },
        z: { type: 'boolean' }
      }
    }
  } as const,
  errorHandler: (error, request, reply) => {
    expectTypeOf(error).toEqualTypeOf<XufaError>();
    expectTypeOf(request).toMatchTypeOf<XufaRequest>();
    expectTypeOf(request.body.x).toEqualTypeOf<number | undefined>();
    expectTypeOf(request.body.y).toEqualTypeOf<string | undefined>();
    expectTypeOf(request.body.z).toEqualTypeOf<boolean | undefined>();
    expectTypeOf(reply).toMatchTypeOf<XufaReply>();
  },
  handler: (req) => {
    expectTypeOf(req.body.x).toEqualTypeOf<number | undefined>();
    expectTypeOf(req.body.y).toEqualTypeOf<string | undefined>();
    expectTypeOf(req.body.z).toEqualTypeOf<boolean | undefined>();
  }
})

// inferring schema `as const`

server.withTypeProvider<JsonSchemaToTsProvider>().get(
  '/',
  {
    schema: {
      body: {
        type: 'object',
        properties: {
          x: { type: 'number' },
          y: { type: 'string' },
          z: { type: 'boolean' }
        }
      }
    },
    errorHandler: (error, request, reply) => {
      expectTypeOf(error).toEqualTypeOf<XufaError>();
      expectTypeOf(request).toMatchTypeOf<XufaRequest>();
      expectTypeOf(request.body.x).toEqualTypeOf<number | undefined>();
      expectTypeOf(request.body.y).toEqualTypeOf<string | undefined>();
      expectTypeOf(request.body.z).toEqualTypeOf<boolean | undefined>();
      expectTypeOf(reply).toMatchTypeOf<XufaReply>();
    }
  },
  (req) => {
    expectTypeOf(req.body.x).toEqualTypeOf<number | undefined>();
    expectTypeOf(req.body.y).toEqualTypeOf<string | undefined>();
    expectTypeOf(req.body.z).toEqualTypeOf<boolean | undefined>();
  }
)

server.withTypeProvider<JsonSchemaToTsProvider>().route({
  url: '/',
  method: 'POST',
  schema: {
    body: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'string' },
        z: { type: 'boolean' }
      }
    }
  },
  errorHandler: (error, request, reply) => {
    expectTypeOf(error).toEqualTypeOf<XufaError>();
    expectTypeOf(request).toMatchTypeOf<XufaRequest>();
    expectTypeOf(request.body.x).toEqualTypeOf<number | undefined>();
    expectTypeOf(request.body.y).toEqualTypeOf<string | undefined>();
    expectTypeOf(request.body.z).toEqualTypeOf<boolean | undefined>();
    expectTypeOf(reply).toMatchTypeOf<XufaReply>();
  },
  handler: (req) => {
    expectTypeOf(req.body.x).toEqualTypeOf<number | undefined>();
    expectTypeOf(req.body.y).toEqualTypeOf<string | undefined>();
    expectTypeOf(req.body.z).toEqualTypeOf<boolean | undefined>();
  }
})

expectTypeOf(server.withTypeProvider<JsonSchemaToTsProvider>()).toMatchTypeOf<XufaInstance>();

// -------------------------------------------------------------------
// Instance Type Remappable
// -------------------------------------------------------------------

server.withTypeProvider<TypeBoxProvider>().withTypeProvider<JsonSchemaToTsProvider>().get(
  '/',
  {
    schema: {
      body: {
        type: 'object',
        properties: {
          x: { type: 'number' },
          y: { type: 'string' },
          z: { type: 'boolean' }
        }
      } as const
    },
    errorHandler: (error, request, reply) => {
      expectTypeOf(error).toEqualTypeOf<XufaError>();
      expectTypeOf(request).toMatchTypeOf<XufaRequest>();
      expectTypeOf(request.body.x).toEqualTypeOf<number | undefined>();
      expectTypeOf(request.body.y).toEqualTypeOf<string | undefined>();
      expectTypeOf(request.body.z).toEqualTypeOf<boolean | undefined>();
      expectTypeOf(reply).toMatchTypeOf<XufaReply>();
    }
  },
  (req) => {
    expectTypeOf(req.body.x).toEqualTypeOf<number | undefined>();
    expectTypeOf(req.body.y).toEqualTypeOf<string | undefined>();
    expectTypeOf(req.body.z).toEqualTypeOf<boolean | undefined>();
  }
)

// -------------------------------------------------------------------
// Request Hooks
// -------------------------------------------------------------------

// Sync handlers

server.withTypeProvider<TypeBoxProvider>().get(
  '/',
  {
    schema: {
      body: Type.Object({
        x: Type.Number(),
        y: Type.String(),
        z: Type.Boolean()
      })
    },
    preHandler: (req, reply, done) => {
      expectTypeOf(req.body.x).toEqualTypeOf<number>();
      expectTypeOf(req.body.y).toEqualTypeOf<string>();
      expectTypeOf(req.body.z).toEqualTypeOf<boolean>();
    },
    preParsing: (req, reply, payload, done) => {
      expectTypeOf(req.body.x).toEqualTypeOf<number>();
      expectTypeOf(req.body.y).toEqualTypeOf<string>();
      expectTypeOf(req.body.z).toEqualTypeOf<boolean>();
    },
    preSerialization: (req, reply, payload, done) => {
      expectTypeOf(req.body.x).toEqualTypeOf<number>();
      expectTypeOf(req.body.y).toEqualTypeOf<string>();
      expectTypeOf(req.body.z).toEqualTypeOf<boolean>();
    },
    preValidation: (req, reply, done) => {
      expectTypeOf(req.body.x).toEqualTypeOf<number>();
      expectTypeOf(req.body.y).toEqualTypeOf<string>();
      expectTypeOf(req.body.z).toEqualTypeOf<boolean>();
    },
    onError: (req, reply, error, done) => {
      expectTypeOf(req.body.x).toEqualTypeOf<number>();
      expectTypeOf(req.body.y).toEqualTypeOf<string>();
      expectTypeOf(req.body.z).toEqualTypeOf<boolean>();
    },
    onRequest: (req, reply, done) => {
      expectTypeOf(req.body.x).toEqualTypeOf<number>();
      expectTypeOf(req.body.y).toEqualTypeOf<string>();
      expectTypeOf(req.body.z).toEqualTypeOf<boolean>();
    },
    onResponse: (req, reply, done) => {
      expectTypeOf(req.body.x).toEqualTypeOf<number>();
      expectTypeOf(req.body.y).toEqualTypeOf<string>();
      expectTypeOf(req.body.z).toEqualTypeOf<boolean>();
    },
    onTimeout: (req, reply, done) => {
      expectTypeOf(req.body.x).toEqualTypeOf<number>();
      expectTypeOf(req.body.y).toEqualTypeOf<string>();
      expectTypeOf(req.body.z).toEqualTypeOf<boolean>();
    },
    onSend: (req, reply, payload, done) => {
      expectTypeOf(req.body.x).toEqualTypeOf<number>();
      expectTypeOf(req.body.y).toEqualTypeOf<string>();
      expectTypeOf(req.body.z).toEqualTypeOf<boolean>();
    }
  },
  req => {
    expectTypeOf(req.body.x).toEqualTypeOf<number>();
    expectTypeOf(req.body.y).toEqualTypeOf<string>();
    expectTypeOf(req.body.z).toEqualTypeOf<boolean>();
  }
)

// Async handlers

server.withTypeProvider<TypeBoxProvider>().get(
  '/',
  {
    schema: {
      body: Type.Object({
        x: Type.Number(),
        y: Type.String(),
        z: Type.Boolean()
      })
    },
    preHandler: async (req, reply, done) => {
      expectTypeOf(req.body.x).toEqualTypeOf<number>();
      expectTypeOf(req.body.y).toEqualTypeOf<string>();
      expectTypeOf(req.body.z).toEqualTypeOf<boolean>();
    },
    preParsing: async (req, reply, payload, done) => {
      expectTypeOf(req.body.x).toEqualTypeOf<number>();
      expectTypeOf(req.body.y).toEqualTypeOf<string>();
      expectTypeOf(req.body.z).toEqualTypeOf<boolean>();
    },
    preSerialization: async (req, reply, payload, done) => {
      expectTypeOf(req.body.x).toEqualTypeOf<number>();
      expectTypeOf(req.body.y).toEqualTypeOf<string>();
      expectTypeOf(req.body.z).toEqualTypeOf<boolean>();
    },
    preValidation: async (req, reply, done) => {
      expectTypeOf(req.body.x).toEqualTypeOf<number>();
      expectTypeOf(req.body.y).toEqualTypeOf<string>();
      expectTypeOf(req.body.z).toEqualTypeOf<boolean>();
    },
    onError: async (req, reply, error, done) => {
      expectTypeOf(req.body.x).toEqualTypeOf<number>();
      expectTypeOf(req.body.y).toEqualTypeOf<string>();
      expectTypeOf(req.body.z).toEqualTypeOf<boolean>();
    },
    onRequest: async (req, reply, done) => {
      expectTypeOf(req.body.x).toEqualTypeOf<number>();
      expectTypeOf(req.body.y).toEqualTypeOf<string>();
      expectTypeOf(req.body.z).toEqualTypeOf<boolean>();
    },
    onResponse: async (req, reply, done) => {
      expectTypeOf(req.body.x).toEqualTypeOf<number>();
      expectTypeOf(req.body.y).toEqualTypeOf<string>();
      expectTypeOf(req.body.z).toEqualTypeOf<boolean>();
    },
    onTimeout: async (req, reply, done) => {
      expectTypeOf(req.body.x).toEqualTypeOf<number>();
      expectTypeOf(req.body.y).toEqualTypeOf<string>();
      expectTypeOf(req.body.z).toEqualTypeOf<boolean>();
    },
    onSend: async (req, reply, payload, done) => {
      expectTypeOf(req.body.x).toEqualTypeOf<number>();
      expectTypeOf(req.body.y).toEqualTypeOf<string>();
      expectTypeOf(req.body.z).toEqualTypeOf<boolean>();
    }
  },
  req => {
    expectTypeOf(req.body.x).toEqualTypeOf<number>();
    expectTypeOf(req.body.y).toEqualTypeOf<string>();
    expectTypeOf(req.body.z).toEqualTypeOf<boolean>();
  }
)

// -------------------------------------------------------------------
// Request headers
// -------------------------------------------------------------------

// JsonSchemaToTsProvider
server.withTypeProvider<JsonSchemaToTsProvider>().get(
  '/',
  {
    schema: {
      headers: {
        type: 'object',
        properties: {
          lowercase: { type: 'string' },
          UPPERCASE: { type: 'number' },
          camelCase: { type: 'boolean' },
          'KEBAB-case': { type: 'boolean' },
          PRESERVE_OPTIONAL: { type: 'number' }
        },
        required: ['lowercase', 'UPPERCASE', 'camelCase', 'KEBAB-case']
      } as const
    }
  },
  (req) => {
    expectTypeOf(req.headers.lowercase).toEqualTypeOf<string>();
    expectTypeOf(req.headers.UPPERCASE).toEqualTypeOf<string | string[] | undefined>();
    expectTypeOf(req.headers.uppercase).toEqualTypeOf<number>();
    expectTypeOf(req.headers.camelcase).toEqualTypeOf<boolean>();
    expectTypeOf(req.headers['kebab-case']).toEqualTypeOf<boolean>();
    expectTypeOf(req.headers.preserve_optional).toEqualTypeOf<number | undefined>();
  }
)

// TypeBoxProvider
server.withTypeProvider<TypeBoxProvider>().get(
  '/',
  {
    schema: {
      headers: Type.Object({
        lowercase: Type.String(),
        UPPERCASE: Type.Number(),
        camelCase: Type.Boolean(),
        'KEBAB-case': Type.Boolean(),
        PRESERVE_OPTIONAL: Type.Optional(Type.Number())
      })
    }
  },
  (req) => {
    expectTypeOf(req.headers.lowercase).toEqualTypeOf<string>();
    expectTypeOf(req.headers.UPPERCASE).toEqualTypeOf<string | string[] | undefined>();
    expectTypeOf(req.headers.uppercase).toEqualTypeOf<number>();
    expectTypeOf(req.headers.camelcase).toEqualTypeOf<boolean>();
    expectTypeOf(req.headers['kebab-case']).toEqualTypeOf<boolean>();
    expectTypeOf(req.headers.preserve_optional).toEqualTypeOf<number | undefined>();
  }
)

// -------------------------------------------------------------------
// TypeBox Reply Type
// -------------------------------------------------------------------

server.withTypeProvider<TypeBoxProvider>().get(
  '/',
  {
    schema: {
      response: {
        200: Type.String(),
        400: Type.Number(),
        500: Type.Object({
          error: Type.String()
        })
      }
    }
  },
  async (_, res) => {
    res.send('hello')
    res.send(42)
    res.send({ error: 'error' })
    expectTypeOf(res.code(200).send).toEqualTypeOf<((...args: [payload: string]) => typeof res)>();
    expectTypeOf(res.code(400).send).toEqualTypeOf<((...args: [payload: number]) => typeof res)>();
    expectTypeOf(res.code(500).send).toEqualTypeOf<((...args: [payload: { error: string }]) => typeof res)>();
  }
)

// -------------------------------------------------------------------
// TypeBox Reply Type (Different Content-types)
// -------------------------------------------------------------------

server.withTypeProvider<TypeBoxProvider>().get(
  '/',
  {
    schema: {
      response: {
        200: {
          content: {
            'text/string': {
              schema: Type.String()
            },
            'application/json': {
              schema: Type.Object({
                msg: Type.String()
              })
            }
          }
        },
        500: Type.Object({
          error: Type.String()
        })
      }
    }
  },
  async (_, res) => {
    res.send('hello')
    res.send({ msg: 'hello' })
    res.send({ error: 'error' })
  }
)

// -------------------------------------------------------------------
// TypeBox Reply Type: Non Assignable
// -------------------------------------------------------------------

server.withTypeProvider<TypeBoxProvider>().get(
  '/',
  {
    schema: {
      response: {
        200: Type.String(),
        400: Type.Number(),
        500: Type.Object({
          error: Type.String()
        })
      }
    }
  },
  async (_, res) => {
    // @ts-expect-error
    res.send(false);
  }
)

// -------------------------------------------------------------------
// TypeBox Reply Type: Non Assignable (Different Content-types)
// -------------------------------------------------------------------

server.withTypeProvider<TypeBoxProvider>().get(
  '/',
  {
    schema: {
      response: {
        200: {
          content: {
            'text/string': {
              schema: Type.String()
            },
            'application/json': {
              schema: Type.Object({
                msg: Type.String()
              })
            }
          }
        },
        500: Type.Object({
          error: Type.String()
        })
      }
    }
  },
  async (_, res) => {
    // @ts-expect-error
    res.send(false);
  }
)

// -------------------------------------------------------------------
// TypeBox Reply Return Type
// -------------------------------------------------------------------

server.withTypeProvider<TypeBoxProvider>().get(
  '/',
  {
    schema: {
      response: {
        200: Type.String(),
        400: Type.Number(),
        500: Type.Object({
          error: Type.String()
        })
      }
    }
  },
  async (_, res) => {
    const option = 1 as 1 | 2 | 3
    switch (option) {
      case 1: return 'hello'
      case 2: return 42
      case 3: return { error: 'error' }
    }
  }
)

// -------------------------------------------------------------------
// TypeBox Reply Return Type (Different Content-types)
// -------------------------------------------------------------------

server.withTypeProvider<TypeBoxProvider>().get(
  '/',
  {
    schema: {
      response: {
        200: {
          content: {
            'text/string': {
              schema: Type.String()
            },
            'application/json': {
              schema: Type.Object({
                msg: Type.String()
              })
            }
          }
        },
        500: Type.Object({
          error: Type.String()
        })
      }
    }
  },
  async (_, res) => {
    const option = 1 as 1 | 2 | 3
    switch (option) {
      case 1: return 'hello'
      case 2: return { msg: 'hello' }
      case 3: return { error: 'error' }
    }
  }
)

// -------------------------------------------------------------------
// TypeBox Reply Return Type: Non Assignable
// -------------------------------------------------------------------

server.withTypeProvider<TypeBoxProvider>().get(
  '/',
  {
    schema: {
      response: {
        200: Type.String(),
        400: Type.Number(),
        500: Type.Object({
          error: Type.String()
        })
      }
    }
  },
  // @ts-expect-error  Type 'boolean' is not assignable to type 'string | number | void | { error: string; }'.
  async (_, res) => {
    return false
  }
)

// -------------------------------------------------------------------
// TypeBox Reply Return Type: Non Assignable (Different Content-types)
// -------------------------------------------------------------------

server.withTypeProvider<TypeBoxProvider>().get(
  '/',
  {
    schema: {
      response: {
        200: {
          content: {
            'text/string': {
              schema: Type.String()
            },
            'application/json': {
              schema: Type.Object({
                msg: Type.String()
              })
            }
          }
        },
        500: Type.Object({
          error: Type.String()
        })
      }
    }
  },
  // @ts-expect-error  Type 'boolean' is not assignable to type 'string | void | { msg: string; } | { error: string; }'.
  async (_, res) => {
    return false
  }
)

// -------------------------------------------------------------------
// JsonSchemaToTs Reply Type
// -------------------------------------------------------------------

server.withTypeProvider<JsonSchemaToTsProvider>().get(
  '/',
  {
    schema: {
      response: {
        200: { type: 'string' },
        400: { type: 'number' },
        500: { type: 'object', properties: { error: { type: 'string' } } }
      } as const
    }
  },
  (_, res) => {
    res.send('hello')
    res.send(42)
    res.send({ error: 'error' })
    expectTypeOf(res.code(200).send).toEqualTypeOf<((...args: [payload: string]) => typeof res)>();
    expectTypeOf(res.code(400).send).toEqualTypeOf<((...args: [payload: number]) => typeof res)>();
    expectTypeOf(res.code(500).send).toEqualTypeOf<((...args: [payload: { [x: string]: unknown; error?: string }]) => typeof res)>();
  }
)

// -------------------------------------------------------------------
// JsonSchemaToTs Reply Type (Different Content-types)
// -------------------------------------------------------------------

server.withTypeProvider<JsonSchemaToTsProvider>().get(
  '/',
  {
    schema: {
      response: {
        200: {
          content: {
            'text/string': {
              schema: { type: 'string' }
            },
            'application/json': {
              schema: { type: 'object', properties: { msg: { type: 'string' } } }
            }
          }
        },
        500: { type: 'object', properties: { error: { type: 'string' } } }
      } as const
    }
  },
  (_, res) => {
    res.send('hello')
    res.send({ msg: 'hello' })
    res.send({ error: 'error' })
  }
)

// -------------------------------------------------------------------
// JsonSchemaToTs Reply Type: Non Assignable
// -------------------------------------------------------------------

server.withTypeProvider<JsonSchemaToTsProvider>().get(
  '/',
  {
    schema: {
      response: {
        200: { type: 'string' },
        400: { type: 'number' },
        500: { type: 'object', properties: { error: { type: 'string' } } }
      } as const
    }
  },
  async (_, res) => {
    // @ts-expect-error
    res.send(false);
  }
)

// -------------------------------------------------------------------
// JsonSchemaToTs Reply Type: Non Assignable (Different Content-types)
// -------------------------------------------------------------------

server.withTypeProvider<JsonSchemaToTsProvider>().get(
  '/',
  {
    schema: {
      response: {
        200: {
          content: {
            'text/string': {
              schema: { type: 'string' }
            },
            'application/json': {
              schema: { type: 'object', properties: { msg: { type: 'string' } } }
            }
          }
        },
        500: { type: 'object', properties: { error: { type: 'string' } } }
      } as const
    }
  },
  async (_, res) => {
    // @ts-expect-error
    res.send(false);
  }
)

// -------------------------------------------------------------------
// JsonSchemaToTs Reply Type Return
// -------------------------------------------------------------------

server.withTypeProvider<JsonSchemaToTsProvider>().get(
  '/',
  {
    schema: {
      response: {
        200: { type: 'string' },
        400: { type: 'number' },
        500: { type: 'object', properties: { error: { type: 'string' } } }
      } as const
    }
  },
  async (_, res) => {
    const option = 1 as 1 | 2 | 3
    switch (option) {
      case 1: return 'hello'
      case 2: return 42
      case 3: return { error: 'error' }
    }
  }
)

// -------------------------------------------------------------------
// JsonSchemaToTs Reply Type Return (Different Content-types)
// -------------------------------------------------------------------

server.withTypeProvider<JsonSchemaToTsProvider>().get(
  '/',
  {
    schema: {
      response: {
        200: {
          content: {
            'text/string': {
              schema: { type: 'string' }
            },
            'application/json': {
              schema: { type: 'object', properties: { msg: { type: 'string' } } }
            }
          }
        },
        500: { type: 'object', properties: { error: { type: 'string' } } }
      } as const
    }
  },
  async (_, res) => {
    const option = 1 as 1 | 2 | 3
    switch (option) {
      case 1: return 'hello'
      case 2: return { msg: 'hello' }
      case 3: return { error: 'error' }
    }
  }
)

// -------------------------------------------------------------------
// JsonSchemaToTs Reply Type Return: Non Assignable
// -------------------------------------------------------------------

server.withTypeProvider<JsonSchemaToTsProvider>().get(
  '/',
  {
    schema: {
      response: {
        200: { type: 'string' },
        400: { type: 'number' },
        500: { type: 'object', properties: { error: { type: 'string' } } }
      } as const
    }
  },
  // @ts-expect-error  Type 'boolean' is not assignable to type 'string | number | void | { [x: string]: unknown; error?: string | undefined; }'.
  async (_, res) => {
    return false
  }
)

// https://github.com/fastify/fastify/issues/4088
server.withTypeProvider<JsonSchemaToTsProvider>().get('/', {
  schema: {
    response: {
      200: { type: 'string' }
    }
  } as const
  // @ts-expect-error  Type '{ foo: number; }' is not assignable to type 'string | void | Promise<string | void>'.
}, (_, res) => {
  return { foo: 555 }
})

// -------------------------------------------------------------------
// JsonSchemaToTs Reply Type Return: Non Assignable (Different Content-types)
// -------------------------------------------------------------------

server.withTypeProvider<JsonSchemaToTsProvider>().get(
  '/',
  {
    schema: {
      response: {
        200: {
          content: {
            'text/string': {
              schema: { type: 'string' }
            },
            'application/json': {
              schema: { type: 'object', properties: { msg: { type: 'string' } } }
            }
          }
        },
        500: { type: 'object', properties: { error: { type: 'string' } } }
      } as const
    }
  },
  // @ts-expect-error  Type 'Promise<boolean>' is not assignable to type 'string | void | { [x: string]: unknown; msg?: string | undefined; } | { [x: string]: unknown; error?: string | undefined; } | Promise<string | void | { [x: string]: unknown; msg?: string | undefined; } | { [x: string]: unknown; error?: string | undefined; }>'.
  async (_, res) => {
    return false
  }
)

// -------------------------------------------------------------------
// Reply Type Override
// -------------------------------------------------------------------

server.withTypeProvider<JsonSchemaToTsProvider>().get<{ Reply: boolean }>(
  '/',
  {
    schema: {
      response: {
        200: { type: 'string' },
        400: { type: 'number' },
        500: { type: 'object', properties: { error: { type: 'string' } } }
      } as const
    }
  },
  async (_, res) => {
    res.send(true)
  }
)

// -------------------------------------------------------------------
// Reply Type Override (Different Content-types)
// -------------------------------------------------------------------

server.withTypeProvider<JsonSchemaToTsProvider>().get<{ Reply: boolean }>(
  '/',
  {
    schema: {
      response: {
        200: {
          content: {
            'text/string': {
              schema: { type: 'string' }
            },
            'application/json': {
              schema: { type: 'object', properties: { msg: { type: 'string' } } }
            }
          }
        },
        500: { type: 'object', properties: { error: { type: 'string' } } }
      } as const
    }
  },
  async (_, res) => {
    res.send(true)
  }
)

// -------------------------------------------------------------------
// Reply Type Return Override
// -------------------------------------------------------------------

server.withTypeProvider<JsonSchemaToTsProvider>().get<{ Reply: boolean }>(
  '/',
  {
    schema: {
      response: {
        200: { type: 'string' },
        400: { type: 'number' },
        500: { type: 'object', properties: { error: { type: 'string' } } }
      } as const
    }
  },
  async (_, res) => {
    return true
  }
)

// -------------------------------------------------------------------
// Reply Type Return Override (Different Content-types)
// -------------------------------------------------------------------

server.withTypeProvider<JsonSchemaToTsProvider>().get<{ Reply: boolean }>(
  '/',
  {
    schema: {
      response: {
        200: {
          content: {
            'text/string': {
              schema: { type: 'string' }
            },
            'application/json': {
              schema: { type: 'object', properties: { msg: { type: 'string' } } }
            }
          }
        },
        500: { type: 'object', properties: { error: { type: 'string' } } }
      } as const
    }
  },
  async (_, res) => {
    return true
  }
)

// -------------------------------------------------------------------
// Reply Status Code (Different Status Codes)
// -------------------------------------------------------------------

server.withTypeProvider<JsonSchemaToTsProvider>().get(
  '/',
  {
    schema: {
      response: {
        200: {
          content: {
            'text/string': {
              schema: { type: 'string' }
            },
            'application/json': {
              schema: { type: 'object', properties: { msg: { type: 'string' } } }
            }
          }
        },
        500: { type: 'object', properties: { error: { type: 'string' } } }
      } as const
    }
  },
  async (_, res) => {
    res.code(200)
    res.code(500)
    // @ts-expect-error
    res.code(201);
    // @ts-expect-error
    res.code(400);
  }
)

// -------------------------------------------------------------------
// RouteGeneric Reply Type Return (Different Status Codes)
// -------------------------------------------------------------------

server.get<{
  Reply: {
    200: string | { msg: string }
    400: number
    '5xx': { error: string }
  }
}>(
  '/',
  async (_, res) => {
    const option = 1 as 1 | 2 | 3 | 4
    switch (option) {
      case 1: return 'hello'
      case 2: return { msg: 'hello' }
      case 3: return 400
      case 4: return { error: 'error' }
    }
  }
)

// -------------------------------------------------------------------
// RouteGeneric Status Code (Different Status Codes)
// -------------------------------------------------------------------

server.get<{
  Reply: {
    200: string | { msg: string }
    400: number
    '5xx': { error: string }
  }
}>(
  '/',
  async (_, res) => {
    res.code(200)
    res.code(400)
    res.code(500)
    res.code(502)
    // @ts-expect-error
    res.code(201);
    // @ts-expect-error
    res.code(300);
    // @ts-expect-error
    res.code(404);
    return 'hello'
  }
)

// -------------------------------------------------------------------
// RouteGeneric Reply Type Return: Non Assignable (Different Status Codes)
// -------------------------------------------------------------------

server.get<{
  Reply: {
    200: string | { msg: string }
    400: number
    '5xx': { error: string }
  }
}>(
  '/',
  // @ts-expect-error  Type 'boolean' is not assignable to type 'string | number | void | { msg: string; } | { error: string; } | { 200: string | { msg: string; }; 400: number; '5xx': { error: string; }; }'.
  async (_, res) => {
    return true
  }
)

// -------------------------------------------------------------------
// XufaPlugin: Auxiliary
// -------------------------------------------------------------------

interface AuxiliaryPluginProvider extends XufaTypeProvider { validator: 'plugin-auxiliary' }

// Auxiliary plugins may have varying server types per application. Recommendation would be to explicitly remap instance provider context within plugin if required.
function plugin<T extends XufaInstance> (instance: T) {
  instance.withTypeProvider<AuxiliaryPluginProvider>().get(
    '/',
    {
      schema: { body: null }
    },
    (req) => {
      expectTypeOf(req.body).toEqualTypeOf<'plugin-auxiliary'>();
    }
  )
}

server.withTypeProvider<AuxiliaryPluginProvider>().register(plugin).get(
  '/',
  {
    schema: { body: null }
  },
  (req) => {
    expectTypeOf(req.body).toEqualTypeOf<'plugin-auxiliary'>();
  }
)

// -------------------------------------------------------------------
// Handlers: Inline
// -------------------------------------------------------------------

interface InlineHandlerProvider extends XufaTypeProvider { validator: 'handler-inline' }

// Inline handlers should infer for the request parameters (non-shared)
server.withTypeProvider<InlineHandlerProvider>().get(
  '/',
  {
    onRequest: (req, res, done) => {
      expectTypeOf(req.body).toEqualTypeOf<'handler-inline'>();
    },
    schema: { body: null }
  },
  (req) => {
    expectTypeOf(req.body).toEqualTypeOf<'handler-inline'>();
  }
)

// -------------------------------------------------------------------
// Handlers: Auxiliary
// -------------------------------------------------------------------

interface AuxiliaryHandlerProvider extends XufaTypeProvider { validator: 'handler-auxiliary' }

// Auxiliary handlers are likely shared for multiple routes and thus should infer as unknown due to potential varying parameters
function auxiliaryHandler (request: XufaRequest, reply: XufaReply, done: HookHandlerDoneFunction): void {
  expectTypeOf(request.body).toEqualTypeOf<unknown>();
}

server.withTypeProvider<AuxiliaryHandlerProvider>().get(
  '/',
  {
    onRequest: auxiliaryHandler,
    schema: { body: 'handler-auxiliary' }
  },
  (req) => {
    expectTypeOf(req.body).toEqualTypeOf<'handler-auxiliary'>();
  }
)

// -------------------------------------------------------------------
// SafePromiseLike
// -------------------------------------------------------------------
const safePromiseLike = {
  then: new Promise<string>(resolve => resolve('')).then,
  __linterBrands: 'SafePromiseLike' as const
}
expectTypeOf(safePromiseLike).toMatchTypeOf<SafePromiseLike<string>>();
expectTypeOf(safePromiseLike).toMatchTypeOf<PromiseLike<string>>();
expectTypeOf(safePromiseLike).not.toMatchTypeOf<Promise<string>>();

// -------------------------------------------------------------------
// Separate Providers
// -------------------------------------------------------------------

interface SeparateProvider extends XufaTypeProvider {
  validator: string
  serializer: Date
}

server.withTypeProvider<SeparateProvider>().get(
  '/',
  {
    schema: {
      body: null,
      response: {
        200: { type: 'string' }
      }
    }
  },
  (req, res) => {
    expectTypeOf(req.body).toEqualTypeOf<string>();

    res.send(new Date())
  }
)
