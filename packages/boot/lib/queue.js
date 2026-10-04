// A queue of tasks run by a worker with a limit of concurrency, that can be paused (the semantics of fastq that the
// loading order of plugins depends on). A task is handed to the worker synchronously when the queue is free; when the
// worker calls back, the callback of the task runs and then the next task starts, still synchronously.

function noop() {}

function createQueue(context, worker, concurrency = 1) {
  let head = null;
  let tail = null;
  let running = 0;

  const queue = {
    paused: false,
    drain: noop,
    empty: noop,
    saturated: noop,
    push,
    unshift,
    pause,
    resume,
    length,
    running: () => running,
    idle: () => running === 0 && head === null,
    getQueue,
  };

  function createTask(value, done) {
    const task = { value, callback: done || noop, next: null };
    task.worked = function worked(err, result) {
      const { callback } = task;
      task.callback = noop;
      callback.call(context, err, result);
      release();
    };
    return task;
  }

  function enqueue(task, atHead) {
    if (running >= concurrency || queue.paused) {
      if (head === null) {
        head = task;
        tail = task;
        queue.saturated();
      } else if (atHead) {
        task.next = head;
        head = task;
      } else {
        tail.next = task;
        tail = task;
      }
      return;
    }
    running += 1;
    worker.call(context, task.value, task.worked);
  }

  function push(value, done) {
    enqueue(createTask(value, done), false);
  }

  function unshift(value, done) {
    enqueue(createTask(value, done), true);
  }

  function pause() {
    queue.paused = true;
  }

  function resume() {
    if (!queue.paused) return;
    queue.paused = false;
    if (head === null) {
      running += 1;
      release();
      return;
    }
    while (head !== null && running < concurrency) {
      running += 1;
      release();
    }
  }

  function release() {
    const next = head;
    if (next !== null && running <= concurrency) {
      if (queue.paused) {
        running -= 1;
        return;
      }
      if (tail === head) tail = null;
      head = next.next;
      next.next = null;
      worker.call(context, next.value, next.worked);
      if (tail === null) queue.empty();
      return;
    }
    running -= 1;
    if (running === 0) queue.drain();
  }

  function length() {
    let count = 0;
    for (let task = head; task !== null; task = task.next) count += 1;
    return count;
  }

  function getQueue() {
    const tasks = [];
    for (let task = head; task !== null; task = task.next) tasks.push(task.value);
    return tasks;
  }

  return queue;
}

module.exports = { createQueue };
