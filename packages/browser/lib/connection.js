// The Chrome DevTools Protocol over the pipes of a browser started with --remote-debugging-pipe: messages of JSON,
// each ended by a NUL byte, written to its fd 3 and read from its fd 4. A connection sends commands and gives their
// results; its sessions (one for each page, attached in flat mode) send theirs with their sessionId, and get the
// events of their target.
import { EventEmitter } from 'node:events';

class ProtocolError extends Error {
  constructor(method, error) {
    super(`${method}: ${error.message}${error.data ? ` (${error.data})` : ''}`);
    this.name = 'ProtocolError';
    this.code = error.code;
  }
}

// What a target that is gone answers: its commands fail with this.
class TargetClosedError extends Error {
  constructor(method) {
    super(`${method}: the page or the browser was closed`);
    this.name = 'TargetClosedError';
  }
}

class Session extends EventEmitter {
  constructor(connection, sessionId) {
    super();
    this.connection = connection;
    this.sessionId = sessionId;
    this.closed = false;
  }

  send(method, params = {}) {
    if (this.closed) return Promise.reject(new TargetClosedError(method));
    return this.connection.send(method, params, this.sessionId);
  }
}

class Connection extends EventEmitter {
  constructor(input, output) {
    super();
    this.output = output;
    this.nextId = 1;
    this.pending = new Map();
    this.sessions = new Map();
    this.closed = false;
    this.root = new Session(this, undefined);
    let buffered = [];
    input.on('data', (chunk) => {
      let start = 0;
      let end = chunk.indexOf(0);
      while (end !== -1) {
        buffered.push(chunk.subarray(start, end));
        const text = Buffer.concat(buffered).toString('utf8');
        buffered = [];
        this.dispatch(JSON.parse(text));
        start = end + 1;
        end = chunk.indexOf(0, start);
      }
      if (start < chunk.length) buffered.push(chunk.subarray(start));
    });
    input.on('close', () => this.close());
    output.on('error', () => this.close());
  }

  send(method, params, sessionId) {
    if (this.closed) return Promise.reject(new TargetClosedError(method));
    const id = this.nextId;
    this.nextId += 1;
    const message = { id, method, params };
    if (sessionId) message.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.output.write(`${JSON.stringify(message)}\0`);
    });
  }

  dispatch(message) {
    if (message.id !== undefined) {
      const call = this.pending.get(message.id);
      if (!call) return;
      this.pending.delete(message.id);
      if (message.error) {
        // A session whose target went away: its commands fail as closed.
        const gone = /not found|No session|Target closed|detached/i.test(message.error.message ?? '');
        call.reject(gone ? new TargetClosedError(call.method) : new ProtocolError(call.method, message.error));
      } else {
        call.resolve(message.result);
      }
      return;
    }
    if (message.method === 'Target.detachedFromTarget') {
      const session = this.sessions.get(message.params.sessionId);
      if (session) {
        session.closed = true;
        this.sessions.delete(message.params.sessionId);
        session.emit('detached');
      }
    }
    const session = message.sessionId ? this.sessions.get(message.sessionId) : this.root;
    if (session) session.emit(message.method, message.params);
  }

  session(sessionId) {
    const session = new Session(this, sessionId);
    this.sessions.set(sessionId, session);
    return session;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    for (const { reject, method } of this.pending.values()) reject(new TargetClosedError(method));
    this.pending.clear();
    for (const session of this.sessions.values()) {
      session.closed = true;
      session.emit('detached');
    }
    this.sessions.clear();
    this.emit('close');
  }
}

export { Connection, Session, ProtocolError, TargetClosedError };
