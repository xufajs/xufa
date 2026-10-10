// The errors of the scheduler: a wrong schedule or job (SchedulerError), and a run that went over its timeout
// (TimeoutError, the reason its signal is aborted with).
class SchedulerError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SchedulerError';
    this.code = 'XUFA_SCHEDULER_ERR';
  }
}

class TimeoutError extends Error {
  constructor(name, ms) {
    super(`The job ${name} went over its timeout of ${ms} ms`);
    this.name = 'TimeoutError';
    this.code = 'XUFA_SCHEDULER_TIMEOUT';
  }
}

export { SchedulerError, TimeoutError };
