# xufa

**Documentation: [xufajs.github.io/xufa](https://xufajs.github.io/xufa/)**

A framework for Node.js in the spirit of Django: the parts a web application needs, built to work together, with no
dependencies outside its own packages.

```sh
npm install xufa
```

```js
const xufa = require('xufa');
// or: import xufa from 'xufa'

const app = xufa({ logger: true });
app.get('/', async () => ({ hello: 'world' }));
await app.listen({ port: 3000 });
```

## For now

xufa is its HTTP layer: this package gives [`@xufa/http`](../http) (the API of fastify) as it is, and its ORM as
`xufa/orm` ([`@xufa/orm`](../orm)). The rest of the framework will be given from here as it is built; the packages
it is made of can be used alone:

- [`@xufa/http`](../http): the HTTP framework
- [`@xufa/orm`](../orm): the ORM, over SQLite, PostgreSQL ([`@xufa/pg`](../pg)), MongoDB ([`@xufa/mongo`](../mongo)) and memory
- [`@xufa/logger`](../logger), [`@xufa/router`](../router), [`@xufa/serializer`](../serializer),
  [`@xufa/inject`](../inject), [`@xufa/boot`](../boot), [`@xufa/errors`](../errors): its parts

## License

MIT.
