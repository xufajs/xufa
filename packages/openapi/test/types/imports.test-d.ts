// Ported from @fastify/swagger (types/imports.tst.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import fastify from '@xufa/http'

import swaggerDefault, { fastifySwagger, SwaggerOptions } from '../..'
import * as fastifySwaggerStar from '../..'
import { minimalOpenApiV3Document } from './minimal-openapiV3-document'

const app = fastify()
const fastifySwaggerOptions: SwaggerOptions = {
  mode: 'static',
  specification: {
    document: minimalOpenApiV3Document,
  }
}

app.register(swaggerDefault, fastifySwaggerOptions)
app.register(fastifySwagger, fastifySwaggerOptions)
app.register(fastifySwaggerStar.default, fastifySwaggerOptions)
app.register(fastifySwaggerStar.fastifySwagger, fastifySwaggerOptions)

app.ready(() => {
  app.swagger()
})
