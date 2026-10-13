// Interrupting a run of xufa-test as Ctrl+C does: SIGINT, but on Windows (where a signal sent to a process ends it at
// once, with nothing cleaned up) the message of an IPC channel, which the run is spawned with there (`stdio`).
const WINDOWS = process.platform === 'win32';

const stdio = WINDOWS ? ['pipe', 'pipe', 'pipe', 'ipc'] : 'pipe';

// (Once the run has ended, nothing: as kill() of a process that is gone.)
const interrupt = (child) => {
  if (!WINDOWS) child.kill('SIGINT');
  else if (child.connected) child.send({ xufaTest: 'interrupt' });
};

module.exports = { stdio, interrupt };
