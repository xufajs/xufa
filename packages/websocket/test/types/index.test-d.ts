import { expectTypeOf } from '@xufa/test';
import WebSocket, { WebSocketServer, createWebSocketStream, type RawData } from '../..';
import xufaWebsocket from '@xufa/websocket/plugin';
import { Hub } from '../../hub';
import xufa from '@xufa/http';

// The API of ws.
const wss = new WebSocketServer({ port: 0, perMessageDeflate: true, maxPayload: 1024 });
wss.on('connection', (socket, request) => {
  expectTypeOf(socket).toEqualTypeOf<WebSocket>();
  socket.on('message', (data, isBinary) => {
    expectTypeOf(data).toEqualTypeOf<RawData>();
    expectTypeOf(isBinary).toEqualTypeOf<boolean>();
  });
  socket.send('text', { binary: false });
});
const client = new WebSocket('ws://localhost:1', ['chat'], { handshakeTimeout: 1000 });
expectTypeOf(client.readyState).toEqualTypeOf<0 | 1 | 2 | 3>();
createWebSocketStream(client);
// @ts-expect-error
client.send(Symbol('no'));

// The plugin, on @xufa/http.
const app = xufa();
app.register(xufaWebsocket, { options: { maxPayload: 1024 } });
app.get('/ws', { websocket: true }, (socket, request) => {
  expectTypeOf(socket).toEqualTypeOf<WebSocket>();
  expectTypeOf(request.ws).toEqualTypeOf<boolean>();
});
app.get('/http', async (request) => ({ ws: request.ws }));
expectTypeOf(app.websocketServer).toEqualTypeOf<WebSocketServer>();

// The hub.
const hub = new Hub({ name: 'chat' });
const id = hub.add(client, { rooms: ['lobby'] });
expectTypeOf(id).toEqualTypeOf<string>();
hub.to('lobby', 'admins').except(client, 'other-id').send({ text: 'hi' });
hub.send(Buffer.from('bytes'), { binary: true });
expectTypeOf(hub.local('lobby')).toEqualTypeOf<string[]>();
