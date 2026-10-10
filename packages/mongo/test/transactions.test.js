// withTransaction() as the drivers of MongoDB (the Convenient API for Transactions), with a client of its own that
// answers what each case needs: the whole transaction again on a TransientTransactionError (of the server, or a
// network error inside it), the commit again on an UnknownTransactionCommitResult (with a majority write concern), not
// on other errors, nor after its timeout; and the commands it sends. Against a replica set: replicaset.test.js.
import { ClientSession, MongoError, MongoNetworkError, MongoServerError } from '../index.js';

// A client whose commands are answered by `answer(command)` (an error to throw, or nothing), and kept.
function fakeClient(answer) {
  const commands = [];
  return {
    commands,
    async run(db, command) {
      commands.push(command);
      const failure = answer(command, commands);
      if (failure) throw failure;
      return { ok: 1 };
    },
  };
}

const serverError = (codeName, labels) =>
  new MongoServerError({ ok: 0, errmsg: codeName, codeName, errorLabels: labels });
const names = (commands) =>
  commands.map((command) => Object.keys(command).find((key) => !['lsid', 'txnNumber', 'autocommit'].includes(key)));

// fn writes once in the transaction (a command that starts it).
const write = (session) => session.client.run('db', Object.assign({ insert: 'books' }, applied(session)));
function applied(session) {
  const command = {};
  session.apply(command);
  return command;
}

describe('withTransaction', () => {
  it('commits what fn did, and gives its result', async () => {
    const client = fakeClient(() => null);
    const session = new ClientSession(client);
    const result = await session.withTransaction(async (s) => {
      await write(s);
      return 'done';
    });
    expect(result).toBe('done');
    expect(names(client.commands)).toEqual(['insert', 'commitTransaction']);
    expect(client.commands[0].startTransaction).toBe(true);
  });

  it('runs the whole transaction again on a TransientTransactionError (a write conflict), with a new txnNumber', async () => {
    let conflicts = 1;
    const client = fakeClient((command) =>
      command.insert && conflicts-- > 0 ? serverError('WriteConflict', ['TransientTransactionError']) : null
    );
    const session = new ClientSession(client);
    let runs = 0;
    await session.withTransaction(async (s) => {
      runs += 1;
      await write(s);
    });
    expect(runs).toBe(2);
    expect(names(client.commands)).toEqual(['insert', 'abortTransaction', 'insert', 'commitTransaction']);
    expect([client.commands[0].txnNumber, client.commands[2].txnNumber]).toEqual([1n, 2n]);
  });

  it('a network error inside the transaction is transient: it runs again', async () => {
    let fails = 1;
    const client = fakeClient((command) =>
      command.insert && fails-- > 0 ? new MongoNetworkError('socket closed') : null
    );
    const session = new ClientSession(client);
    let runs = 0;
    await session.withTransaction(async (s) => {
      runs += 1;
      await write(s);
    });
    expect(runs).toBe(2);
  });

  it('commits again on an UnknownTransactionCommitResult (majority), without running fn again', async () => {
    let unknown = 2;
    const client = fakeClient((command) =>
      command.commitTransaction && unknown-- > 0 ? new MongoNetworkError('the primary stepped down') : null
    );
    const session = new ClientSession(client);
    let runs = 0;
    await session.withTransaction(async (s) => {
      runs += 1;
      await write(s);
    });
    expect(runs).toBe(1);
    expect(names(client.commands)).toEqual(['insert', 'commitTransaction', 'commitTransaction', 'commitTransaction']);
    expect(client.commands[2].writeConcern).toEqual({ w: 'majority', wtimeout: 10000 });
    expect(new Set(client.commands.slice(1).map((command) => command.txnNumber))).toEqual(new Set([1n]));
  });

  it('a TransientTransactionError of the commit runs the transaction again', async () => {
    let fails = 1;
    const client = fakeClient((command) =>
      command.commitTransaction && fails-- > 0 ? serverError('NoSuchTransaction', ['TransientTransactionError']) : null
    );
    const session = new ClientSession(client);
    let runs = 0;
    await session.withTransaction(async (s) => {
      runs += 1;
      await write(s);
    });
    expect(runs).toBe(2);
  });

  it('other errors are thrown at once (fn aborted); a commit that timed out on the server is not retried', async () => {
    const duplicate = serverError('DuplicateKey', []);
    const client = fakeClient((command) => (command.insert ? duplicate : null));
    const session = new ClientSession(client);
    let runs = 0;
    await expect(
      session.withTransaction(async (s) => {
        runs += 1;
        await write(s);
      })
    ).rejects.toBe(duplicate);
    expect([runs, names(client.commands)]).toEqual([1, ['insert', 'abortTransaction']]);
    // An error of fn itself (not of MongoDB).
    await expect(
      new ClientSession(fakeClient(() => null)).withTransaction(async () => {
        throw new Error('not enough stock');
      })
    ).rejects.toThrow('not enough stock');
    const timedOut = serverError('MaxTimeMSExpired', ['UnknownTransactionCommitResult']);
    const slow = fakeClient((command) => (command.commitTransaction ? timedOut : null));
    await expect(new ClientSession(slow).withTransaction((s) => write(s))).rejects.toBe(timedOut);
    expect(names(slow.commands)).toEqual(['insert', 'commitTransaction']);
  });

  it('gives up after its timeout', async () => {
    const client = fakeClient((command) =>
      command.insert ? serverError('WriteConflict', ['TransientTransactionError']) : null
    );
    const session = new ClientSession(client);
    let runs = 0;
    const err = await session
      .withTransaction(
        async (s) => {
          runs += 1;
          await new Promise((resolve) => setTimeout(resolve, 20));
          await write(s);
        },
        { timeout: 100 }
      )
      .catch((error) => error);
    expect(err.codeName).toBe('WriteConflict');
    expect(err.hasErrorLabel('TransientTransactionError')).toBe(true);
    expect(runs).toBeGreaterThan(1);
    expect(runs).toBeLessThan(10);
  });

  it('every error of the driver has its labels', () => {
    expect(new MongoError('x').errorLabels).toEqual([]);
    expect(new MongoNetworkError('x').hasErrorLabel('TransientTransactionError')).toBe(false);
  });
});
