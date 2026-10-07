'use strict';

// The errors of the queue: a wrong job or option, and a job that ran past its timeout (timeout: true).
class QueueError extends Error {
  constructor(message) {
    super(message);
    this.name = 'QueueError';
    this.code = 'XUFA_QUEUE_ERR';
  }
}

module.exports = { QueueError };
