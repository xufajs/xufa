// @xufa/websocket: WebSockets (RFC 6455, with permessage-deflate) with the API of ws, and its tests, with no
// dependencies. The code is the one of ws 8.22.0 (MIT, LICENSE.ws), for Node.js 22 and later: utf-8-validate is left
// out (buffer.isUtf8 is native); bufferutil is used when the application has installed it, as ws does.

import createWebSocketStream from './lib/stream.js';
import * as extension from './lib/extension.js';
import PerMessageDeflate from './lib/permessage-deflate.js';
import Receiver from './lib/receiver.js';
import Sender from './lib/sender.js';
import * as subprotocol from './lib/subprotocol.js';
import WebSocket from './lib/websocket.js';
import WebSocketServer from './lib/websocket-server.js';

WebSocket.createWebSocketStream = createWebSocketStream;
WebSocket.extension = extension;
WebSocket.PerMessageDeflate = PerMessageDeflate;
WebSocket.Receiver = Receiver;
WebSocket.Sender = Sender;
WebSocket.Server = WebSocketServer;
WebSocket.subprotocol = subprotocol;
WebSocket.WebSocket = WebSocket;
WebSocket.WebSocketServer = WebSocketServer;

export {
  createWebSocketStream,
  extension,
  PerMessageDeflate,
  Receiver,
  Sender,
  subprotocol,
  WebSocket,
  WebSocketServer,
};

export default WebSocket;

export { WebSocket as 'module.exports' };
