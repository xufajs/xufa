// A clock for the tests: its time moves by advance(ms), running the timers due on the way, in order, and letting the
// promises they start settle (those of a database too) before the next one.
const flush = () => new Promise((resolve) => setImmediate(resolve));

async function settle() {
  for (let i = 0; i < 5; i += 1) await flush();
}

function fakeClock(start = 0) {
  let now = start;
  let seq = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout(fn, ms) {
      seq += 1;
      timers.set(seq, { at: now + Math.max(0, ms), fn, id: seq, ms });
      return seq;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        await settle();
        let due = null;
        for (const timer of timers.values()) {
          if (timer.at <= end && (due === null || timer.at < due.at || (timer.at === due.at && timer.id < due.id))) {
            due = timer;
          }
        }
        if (due === null) break;
        now = due.at;
        timers.delete(due.id);
        due.fn();
      }
      now = end;
      await settle();
    },
    sleep(ms) {
      return new Promise((resolve) => this.setTimeout(resolve, ms));
    },
  };
}

export { fakeClock, settle };
