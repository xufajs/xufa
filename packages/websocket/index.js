// @xufa/websocket: WebSockets (RFC 6455, with permessage-deflate) with the API of ws, and its tests, with no
// dependencies. The code is the one of ws 8.22.0 (MIT, LICENSE.ws), for Node.js 22 and later: utf-8-validate is left
// out (buffer.isUtf8 is native); bufferutil is used when the application has installed it, as ws does.

const createWebSocketStream = require('./lib/stream');
const extension = require('./lib/extension');
const PerMessageDeflate = require('./lib/permessage-deflate');
const Receiver = require('./lib/receiver');
const Sender = require('./lib/sender');
const subprotocol = require('./lib/subprotocol');
const WebSocket = require('./lib/websocket');
const WebSocketServer = require('./lib/websocket-server');

WebSocket.createWebSocketStream = createWebSocketStream;
WebSocket.extension = extension;
WebSocket.PerMessageDeflate = PerMessageDeflate;
WebSocket.Receiver = Receiver;
WebSocket.Sender = Sender;
WebSocket.Server = WebSocketServer;
WebSocket.subprotocol = subprotocol;
WebSocket.WebSocket = WebSocket;
WebSocket.WebSocketServer = WebSocketServer;

module.exports = WebSocket;
