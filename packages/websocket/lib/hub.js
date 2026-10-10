// Rooms of sockets, and messages to them wherever they are: in this process, in the other workers of a cluster
// (through the bus of @xufa/cluster) and in other machines (through the publish of @xufa/netcache).
//
//   const hub = new Hub({ bus, cache });     // bus and cache as there are: none in one process of one machine
//   app.get('/chat', { websocket: true }, (socket, request) => {
//     hub.add(socket, { rooms: ['lobby', `user:${request.user.id}`] });
//     socket.on('message', (text) => hub.to('lobby').except(socket).send({ from: request.user.id, text: String(text) }));
//   });
//   hub.to('user:42').send({ notice: 'You have mail' });   // every socket of user 42, in any worker of any machine
//
// A message is serialized once, where it is sent (strings and Buffers as they are, other values by `serialize`,
// JSON.stringify by default), and each process sends it to its sockets of the rooms. In a cluster, the primary
// relays: what a worker sends goes to the primary, which sends it to the other workers and, with a cache, to the
// other machines; what comes from other machines it sends to every worker. Delivery to other processes is as
// reliable as their channel: the bus between the processes of a machine, and the pub/sub of the cache (only the
// machines connected at that moment) between machines.
import crypto from 'node:crypto';
import { WebSocket } from '../index.js';

const kId = Symbol('xufa.hub.id');

class Target {
  constructor(hub, rooms) {
    this.hub = hub;
    this.rooms = rooms;
    this.excepted = [];
  }

  // Sockets (or their ids) left out.
  except(...sockets) {
    for (const socket of sockets.flat()) this.excepted.push(typeof socket === 'string' ? socket : socket[kId]);
    return this;
  }

  send(data, options) {
    return this.hub.publish(this.rooms, this.excepted, data, options);
  }
}

class Hub {
  constructor({ name = 'default', bus, cache, serialize = JSON.stringify } = {}) {
    this.name = name;
    this.serialize = serialize;
    this.sockets = new Map(); // id => { socket, rooms }
    this.byRoom = new Map(); // room => Set of ids
    this.up = `xufa:hub:${name}:up`;
    this.down = `xufa:hub:${name}:down`;
    this.channel = `xufa:hub:${name}`;
    this.bus = bus || null;
    this.cache = cache || null;
    if (this.bus) {
      // In the primary: from a worker, to this process, the other workers and the other machines.
      this.bus.on(this.up, (message, worker) => {
        this.deliver(message);
        if (this.bus.clustered) this.bus.broadcast(this.down, message, { except: worker ? worker.id : undefined });
        if (this.cache) this.cache.publish(this.channel, message);
      });
      // In a worker: from the primary.
      this.bus.on(this.down, (message) => this.deliver(message));
    }
    if (this.cache) {
      this.onPublish = (channel, message) => {
        if (channel !== this.channel) return;
        this.deliver(message);
        if (this.bus && this.bus.clustered && this.bus.isPrimary) this.bus.broadcast(this.down, message);
      };
      this.cache.on('publish', this.onPublish);
    }
  }

  // A socket in the hub (and its rooms), until it closes. Its id: for except() from other processes.
  add(socket, { rooms = [], id = crypto.randomUUID() } = {}) {
    if (socket[kId]) return socket[kId];
    socket[kId] = id;
    this.sockets.set(id, { socket, rooms: new Set() });
    this.join(socket, ...rooms);
    socket.once('close', () => this.remove(socket));
    return id;
  }

  remove(socket) {
    const entry = this.sockets.get(socket[kId]);
    if (!entry) return;
    this.leave(socket, ...entry.rooms);
    this.sockets.delete(socket[kId]);
  }

  join(socket, ...rooms) {
    const entry = this.sockets.get(socket[kId]) || this.sockets.get(this.add(socket));
    for (const room of rooms.flat()) {
      entry.rooms.add(room);
      if (!this.byRoom.has(room)) this.byRoom.set(room, new Set());
      this.byRoom.get(room).add(socket[kId]);
    }
  }

  leave(socket, ...rooms) {
    const entry = this.sockets.get(socket[kId]);
    if (!entry) return;
    for (const room of rooms.flat()) {
      entry.rooms.delete(room);
      const members = this.byRoom.get(room);
      if (members) {
        members.delete(socket[kId]);
        if (members.size === 0) this.byRoom.delete(room);
      }
    }
  }

  // The rooms of a socket; the ids of the sockets of this process in a room.
  roomsOf(socket) {
    const entry = this.sockets.get(socket[kId]);
    return entry ? [...entry.rooms] : [];
  }

  idOf(socket) {
    return socket[kId];
  }

  local(room) {
    return [...(this.byRoom.get(room) || [])];
  }

  to(...rooms) {
    return new Target(this, rooms.flat());
  }

  // To every socket.
  send(data, options) {
    return this.publish(null, [], data, options);
  }

  publish(rooms, except, data, { binary } = {}) {
    const isBytes = Buffer.isBuffer(data) || data instanceof ArrayBuffer || ArrayBuffer.isView(data);
    const payload = typeof data === 'string' || isBytes ? data : this.serialize(data);
    const message = {
      rooms,
      except,
      payload: isBytes && !Buffer.isBuffer(payload) ? Buffer.from(payload) : payload,
      binary: binary === undefined ? isBytes : binary,
    };
    this.deliver(message);
    if (this.bus && this.bus.clustered) {
      if (this.bus.isPrimary) {
        this.bus.broadcast(this.down, message);
        if (this.cache) this.cache.publish(this.channel, message);
      } else {
        this.bus.send(this.up, message);
      }
    } else if (this.cache) {
      this.cache.publish(this.channel, message);
    }
  }

  // Sends a message to the sockets of this process it is for.
  deliver({ rooms, except, payload, binary }) {
    const excepted = new Set(except);
    let ids;
    if (rooms === null) ids = this.sockets.keys();
    else {
      ids = new Set();
      for (const room of rooms) for (const id of this.byRoom.get(room) || []) ids.add(id);
    }
    for (const id of ids) {
      if (excepted.has(id)) continue;
      const entry = this.sockets.get(id);
      if (entry && entry.socket.readyState === WebSocket.OPEN) entry.socket.send(payload, { binary });
    }
  }

  close() {
    if (this.cache && this.onPublish) this.cache.off('publish', this.onPublish);
  }
}

export { Hub };
