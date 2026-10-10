# @xufa/websocket

WebSockets for Node.js, with no dependencies: the client and server of [ws](https://github.com/websockets/ws)
(RFC 6455, permessage-deflate), WebSocket routes for [@xufa/http](../http) (and fastify), and rooms of sockets that
reach every worker of a cluster and every machine.

```sh
npm install @xufa/websocket
```

## WebSocket routes

```js
import xufa from 'xufa';
import websocketPlugin from '@xufa/websocket/plugin';

const app = xufa();
app.register(websocketPlugin);

app.get('/chat', { websocket: true }, (socket, request) => {
  socket.on('message', (message) => socket.send(`echo: ${message}`));
});
```

The upgrade of a request goes through the routing like any request: its hooks run first (authentication, rate
limits, `preValidation` answering 401), and only then is the socket handed to the route. `request.ws` says whether a
request is an upgrade; `app.injectWS('/chat')` opens a socket in tests without a network. The options and behavior
are those of [@fastify/websocket](https://github.com/fastify/fastify-websocket): `options` (of the server of ws),
`errorHandler`, `preClose`, `wsHandler` for routes that answer HTTP and WebSockets.

## Rooms in a cluster and between machines

```js
import { Hub } from '@xufa/websocket/hub';

const hub = new Hub({ bus, cache }); // the bus of @xufa/cluster, a NetCache of @xufa/netcache: as there are

app.get('/chat', { websocket: true }, (socket, request) => {
  hub.add(socket, { rooms: ['lobby', `user:${request.user.id}`] }); // until it closes
  socket.on('message', (text) =>
    hub
      .to('lobby')
      .except(socket)
      .send({ from: request.user.id, text: String(text) })
  );
});

hub.to('user:42').send({ notice: 'You have mail' }); // every socket of user 42, in any worker of any machine
```

A message is serialized once where it is sent (strings and bytes as they are, other values with JSON), and every
process sends it to its sockets of the rooms. In a cluster, give the primary a hub too: it relays what a worker sends
to the other workers and, with a `cache`, to the other machines (their pub/sub: the machines connected at that
moment), and what comes from other machines to every worker. `join()`, `leave()`, `roomsOf()`, `local(room)` (the
ids of the sockets of this process) and `hub.send()` (to every socket) complete it.

## The client and server of ws

```js
import { WebSocket, WebSocketServer } from '@xufa/websocket';

const wss = new WebSocketServer({ port: 8080, perMessageDeflate: true });
wss.on('connection', (socket) => socket.on('message', (data) => socket.send(data)));

const ws = new WebSocket('ws://localhost:8080');
ws.on('open', () => ws.send('hello'));
```

`ws` can be replaced by `@xufa/websocket` (in imports or requires) (and `import { WebSocketServer } from
'@xufa/websocket'`): the code is the one of ws 8.22.0, for Node.js 22 and later. UTF-8 is validated by
`buffer.isUtf8`, native, so `utf-8-validate` is left out. `bufferutil` is used as ws uses it: when the application has
installed it (`npm i bufferutil`), unless `WS_NO_BUFFER_UTIL` is set. It is not a dependency; without it, frames are
masked 8 bytes at a time in JavaScript.

## Tests

`test/ws` and `test/fastify` are the suites of ws and @fastify/websocket (438 and 62 tests), ported to vyntra by
`tools/port-ws` from checkouts of their repositories; `test/xufa` tests the hub in one process, between two machines
(NetCaches) and in a cluster of two workers.

## TypeScript

The declarations of ws (`@types/ws`), of @fastify/websocket for @xufa/http (`@xufa/websocket/plugin`: `{ websocket:
true }` routes, `request.ws`, `app.websocketServer`) and of the hub.

## License

MIT. The code of ws (LICENSE.ws) and of @fastify/websocket is MIT; the declarations are from DefinitelyTyped (MIT).
