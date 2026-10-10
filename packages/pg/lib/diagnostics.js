// Tracing with node:diagnostics_channel, with the channels and contexts of pg (so the tools written for pg see the
// queries of @xufa/pg too):
//
//   pg:query          TracingChannel: { query: { text, name }, client: { database, host, port, user, processID, ssl },
//                     result: the QueryResult (rowCount, command...) once it ended }
//   pg:connection     TracingChannel: { connection: { database, host, port, user, ssl } }
//   pg:pool:connect   TracingChannel: { pool: { totalCount, idleCount, waitingCount, maxSize }, client: { processID,
//                     reused } once it is given }
//   pg:pool:release   Channel: { client: { processID }, error }
//   pg:pool:remove    Channel: { client: { processID } }
//
// Nothing is made when no one subscribes.
import dc from 'node:diagnostics_channel';

const queryChannel = dc.tracingChannel('pg:query');
const connectionChannel = dc.tracingChannel('pg:connection');
const poolConnectChannel = dc.tracingChannel('pg:pool:connect');
const poolReleaseChannel = dc.channel('pg:pool:release');
const poolRemoveChannel = dc.channel('pg:pool:remove');

// The connection of a context: what pg says of its client.
function describeConnection(options, processID) {
  const user = typeof options.user === 'function' ? undefined : options.user;
  const info = { database: options.database, host: options.host, port: options.port, user, ssl: Boolean(options.ssl) };
  if (processID !== undefined) info.processID = processID;
  return info;
}

// Runs a query traced: the context gets its result (the QueryResult: rowCount, command...) or its error.
function traceQuery(connection, config, run) {
  if (!queryChannel.hasSubscribers) return run();
  const context = {
    query: { text: config.text, name: config.name },
    client: describeConnection(connection.options, connection.processID),
  };
  return queryChannel.tracePromise(run, context);
}

function traceConnect(options, run) {
  if (!connectionChannel.hasSubscribers) return run();
  return connectionChannel.tracePromise(run, { connection: describeConnection(options) });
}

function tracePoolConnect(pool, run) {
  if (!poolConnectChannel.hasSubscribers) return run();
  const context = {
    pool: {
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount,
      maxSize: pool.max,
    },
  };
  return poolConnectChannel.tracePromise(async () => {
    const client = await run();
    context.client = { processID: client.processID, reused: client.connection.uses > 1 };
    return client;
  }, context);
}

function publishRelease(connection, err) {
  if (poolReleaseChannel.hasSubscribers) {
    poolReleaseChannel.publish({ client: { processID: connection.processID }, error: err || undefined });
  }
}

function publishRemove(connection) {
  if (poolRemoveChannel.hasSubscribers) poolRemoveChannel.publish({ client: { processID: connection.processID } });
}

export { traceQuery, traceConnect, tracePoolConnect, publishRelease, publishRemove };
