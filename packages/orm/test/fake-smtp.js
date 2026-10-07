// A server of SMTP for the tests of the smtp backend: EHLO and HELO, STARTTLS (or TLS from the start), AUTH (PLAIN,
// LOGIN, XOAUTH2), MAIL, RCPT (recipients with "refuse" in them are refused: 550; with "later": 451), DATA (its dots
// undoubled), RSET, NOOP and QUIT. The messages received are in `messages` ({ from, to, raw, secure, user,
// connection }), the commands in `log`; dropAfter closes each connection after that many messages (a server that
// closes idle connections).
const net = require('node:net');
const tls = require('node:tls');

function fakeSmtp({
  tlsOptions = null,
  secure = false,
  users = null,
  auth = ['PLAIN', 'LOGIN', 'XOAUTH2'],
  smtputf8 = true,
  starttls = true,
  dropAfter = 0,
} = {}) {
  const messages = [];
  const log = [];
  let connections = 0;

  function session(socket, number) {
    let state = { secure, user: null, from: null, to: [], helo: false };
    let text = '';
    let data = null;
    let pending = null; // an AUTH LOGIN or XOAUTH2 that waits for a line
    let sent = 0;
    const write = (line) => socket.write(`${line}\r\n`);

    function extensions() {
      const list = ['SIZE 10485760', '8BITMIME'];
      if (smtputf8) list.push('SMTPUTF8');
      if (tlsOptions && starttls && !state.secure) list.push('STARTTLS');
      if (users && auth.length) list.push(`AUTH ${auth.join(' ')}`);
      return list;
    }

    function received(raw) {
      const unstuffed = raw.replace(/(^|\r\n)\.\./g, '$1.');
      messages.push({ from: state.from, to: state.to, raw: unstuffed, secure: state.secure, user: state.user, connection: number });
      state.from = null;
      state.to = [];
      sent += 1;
      write(`250 2.0.0 Ok: queued as M${messages.length}`);
      if (dropAfter && sent >= dropAfter) setImmediate(() => socket.destroy());
    }

    function login(user, pass) {
      if (users && users[user] === pass) {
        state.user = user;
        write('235 2.7.0 Authentication successful');
      } else write('535 5.7.8 Authentication credentials invalid');
    }

    function line(input) {
      if (data !== null) {
        if (input === '.') {
          const raw = data;
          data = null;
          received(raw);
        } else data += `${input}\r\n`;
        return;
      }
      log.push(input);
      if (pending) {
        const step = pending;
        pending = null;
        step(input);
        return;
      }
      const [verb, ...rest] = input.split(' ');
      const argument = rest.join(' ');
      switch (verb.toUpperCase()) {
        case 'EHLO': {
          state.helo = true;
          const list = extensions();
          if (list.length === 0) write('250 fake');
          else {
            write('250-fake greets you');
            list.forEach((item, i) => write(`250${i === list.length - 1 ? ' ' : '-'}${item}`));
          }
          return;
        }
        case 'HELO':
          state.helo = true;
          return write('250 fake');
        case 'STARTTLS': {
          if (!tlsOptions || state.secure) return write('502 5.5.1 Not now');
          write('220 2.0.0 Ready to start TLS');
          socket.removeAllListeners('data');
          const secured = new tls.TLSSocket(socket, { isServer: true, ...tlsOptions });
          secured.on('error', () => {});
          state = { ...state, secure: true, helo: false };
          attach(secured);
          return;
        }
        case 'AUTH': {
          const [method, initial] = argument.split(' ');
          const name = (method || '').toUpperCase();
          if (!users || !auth.includes(name)) return write('504 5.5.4 Unrecognized authentication type');
          if (name === 'PLAIN') {
            const [, user, pass] = Buffer.from(initial || '', 'base64').toString().split('\0');
            return login(user, pass);
          }
          if (name === 'LOGIN') {
            write(`334 ${Buffer.from('Username:').toString('base64')}`);
            pending = (user64) => {
              write(`334 ${Buffer.from('Password:').toString('base64')}`);
              pending = (pass64) => login(Buffer.from(user64, 'base64').toString(), Buffer.from(pass64, 'base64').toString());
            };
            return;
          }
          // XOAUTH2: user=<user>^Aauth=Bearer <token>^A^A, the token being the password of the user.
          const [userPart, authPart] = Buffer.from(initial || '', 'base64').toString().split('\x01');
          const user = (userPart || '').replace(/^user=/, '');
          const token = (authPart || '').replace(/^auth=Bearer /, '');
          if (users[user] === token) {
            state.user = user;
            return write('235 2.7.0 Accepted');
          }
          write(`334 ${Buffer.from(JSON.stringify({ status: '401' })).toString('base64')}`);
          pending = () => write('535 5.7.8 Username and Password not accepted');
          return;
        }
        case 'MAIL': {
          if (!state.helo) return write('503 5.5.1 EHLO first');
          if (users && !state.user) return write('530 5.7.0 Authentication required');
          const match = /^FROM:<([^>]*)>(.*)$/i.exec(argument);
          if (!match) return write('501 5.5.4 Syntax error');
          if (/[^\x20-\x7e]/.test(match[1]) && !/SMTPUTF8/i.test(match[2])) return write('553 5.6.7 SMTPUTF8 needed');
          state.from = match[1];
          state.to = [];
          return write('250 2.1.0 Ok');
        }
        case 'RCPT': {
          if (state.from === null) return write('503 5.5.1 MAIL first');
          const match = /^TO:<([^>]*)>$/i.exec(argument);
          if (!match) return write('501 5.5.4 Syntax error');
          if (/refuse/.test(match[1])) return write(`550 5.1.1 <${match[1]}>: Recipient address rejected`);
          if (/later/.test(match[1])) return write('451 4.7.1 Try again later');
          state.to.push(match[1]);
          return write('250 2.1.5 Ok');
        }
        case 'DATA':
          if (state.to.length === 0) return write('554 5.5.1 No valid recipients');
          data = '';
          return write('354 End data with <CR><LF>.<CR><LF>');
        case 'RSET':
          state.from = null;
          state.to = [];
          return write('250 2.0.0 Ok');
        case 'NOOP':
          return write('250 2.0.0 Ok');
        case 'QUIT':
          write('221 2.0.0 Bye');
          return socket.end();
        default:
          return write('502 5.5.2 Error: command not recognized');
      }
    }

    function attach(stream) {
      socket = stream;
      stream.on('data', (chunk) => {
        text += chunk.toString('latin1');
        let end = text.indexOf('\r\n');
        while (end >= 0) {
          const input = text.slice(0, end);
          text = text.slice(end + 2);
          line(input);
          end = text.indexOf('\r\n');
        }
      });
      stream.on('error', () => {});
    }

    attach(socket);
    write('220 fake ESMTP ready');
  }

  const onConnection = (socket) => {
    connections += 1;
    session(socket, connections);
  };
  const server = secure ? tls.createServer(tlsOptions, onConnection) : net.createServer(onConnection);

  const fake = {
    messages,
    log,
    port: null,
    get connections() {
      return connections;
    },
    async start() {
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      fake.port = server.address().port;
      return fake;
    },
    close: () =>
      new Promise((resolve) => {
        server.close(resolve);
        if (server.closeAllConnections) server.closeAllConnections();
      }),
  };
  server.on('connection', (socket) => {
    fake.sockets = fake.sockets || new Set();
    fake.sockets.add(socket);
    socket.on('close', () => fake.sockets.delete(socket));
  });
  fake.close = () =>
    new Promise((resolve) => {
      for (const socket of fake.sockets || []) socket.destroy();
      server.close(resolve);
    });
  return fake;
}

module.exports = { fakeSmtp };
