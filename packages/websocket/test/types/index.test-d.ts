import { expectType, expectError } from 'tsd';
import WebSocket, { WebSocketServer, createWebSocketStream, type RawData } from '../..';
import xufaWebsocket from '../../plugin';
import { Hub } from '../../hub';
import xufa from '@xufa/http';

// The API of ws.
const wss = new WebSocketServer({ port: 0, perMessageDeflate: true, maxPayload: 1024 });
wss.on('connection', (socket, request) => {
  expectType<WebSocket>(socket);
  socket.on('message', (data, isBinary) => {
    expectType<RawData>(data);
    expectType<boolean>(isBinary);
  });
  socket.send('text', { binary: false });
});
const client = new WebSocket('ws://localhost:1', ['chat'], { handshakeTimeout: 1000 });
expectType<0 | 1 | 2 | 3>(client.readyState);
createWebSocketStream(client);
expectError(client.send(Symbol('no')));

// The plugin, on @xufa/http.
const app = xufa();
app.register(xufaWebsocket, { options: { maxPayload: 1024 } });
app.get('/ws', { websocket: true }, (socket, request) => {
  expectType<WebSocket>(socket);
  expectType<boolean>(request.ws);
});
app.get('/http', async (request) => ({ ws: request.ws }));
expectType<WebSocketServer>(app.websocketServer);

// The hub.
const hub = new Hub({ name: 'chat' });
const id = hub.add(client, { rooms: ['lobby'] });
expectType<string>(id);
hub.to('lobby', 'admins').except(client, 'other-id').send({ text: 'hi' });
hub.send(Buffer.from('bytes'), { binary: true });
expectType<string[]>(hub.local('lobby'));
