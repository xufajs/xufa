// The messages of the API of the admin that users read (in the page), by key, in English; a translator
// (setTranslator(), as i18n.translateAdmin(admin) of @xufa/i18n installs) gives them in the language of the request,
// as admin.<key>. Those of logins and accounts are of @xufa/auth (auth.<key>), and those of the validation of values
// of @xufa/orm (orm.<key>). The errors of a wrong setup (an option of the admin) stay in English: they are for the
// developer.
const MESSAGES = {
  logInFirst: 'Log in first',
  logInAdmin: 'Log in to the admin first',
  forbidden: 'You cannot do this ({permission})',
  noRoles: 'The admin is not for you (no roles)',
  tenantForbidden: 'You cannot use the tenant {tenant}',
  noTenantForYou: 'There is no tenant for you',
  noTenant: 'No tenant {tenant}',
  noModel: 'The admin has no model {model}',
  notFound: 'Not found',
  noHistory: '{model} has no history (its database has no audit log)',
  validation: 'Validation failed',
  body: 'The body is an object of values',
  readOnly: '{model} is read only in the admin',
  noRelation: '{model} has no relation {relation}',
  noAction: '{model} has no action {action}',
  actionPks: 'An action needs pks: the keys of the objects selected',
  actionLimit: 'An action runs on {limit} objects at most',
  badKey: 'Not a key of {model}: {value}',
  badOrder: 'Not a field to order by: {field}',
  // Runs, jobs and work.
  noRun: 'No run {id}',
  runStatus: 'Not a status of runs: {status}',
  retryRuns: 'Only failed or cancelled runs are tried again',
  cancelRuns: 'Only running runs are cancelled',
  choosePipeline: 'Choose a pipeline',
  noPipeline: 'No pipeline named {name}',
  delay: 'A time as 30s, 10m, 2h or 1h30m',
  delayOrAt: 'Start in some time, or at a date: not both',
  notDate: 'Not a date',
  wholeNumber: 'A whole number',
  keyLength: 'Text of 200 characters at most',
  workStatus: 'Not a status of work: {status}',
  noSchedule: 'No schedule {name}',
  scheduleRunning: 'The schedule {name} is running: it does not run twice at once',
  noJob: 'No job {id}',
  jobStatus: 'Not a status of jobs: {status}',
  jobOfStep: 'A job of the step {step} of the run {run}: retry its run',
  retryJobs: 'Only failed jobs are tried again',
  deleteRunning: 'A job that runs is not deleted (it ends first)',
  // Sessions.
  sessionInUse: 'This is the session you are using: log out to end it',
  noSession: 'No such session',
};

let translator = null;

const fill = (text, params) =>
  text.replace(/\{(\w+)\}/g, (whole, name) => (params && params[name] !== undefined ? String(params[name]) : whole));

// The message of a key (admin.<key> for the translator), with its parameters.
function message(key, params = {}) {
  if (!Object.hasOwn(MESSAGES, key)) throw new TypeError(`No message of @xufa/admin named ${key}`);
  const english = fill(MESSAGES[key], params);
  if (!translator) return english;
  const translated = translator(`admin.${key}`, params, english);
  return typeof translated === 'string' ? translated : english;
}

// The translator of the messages: fn(key, params, english) giving the text, or null to stop translating.
function setTranslator(fn) {
  if (fn !== null && typeof fn !== 'function') throw new TypeError('setTranslator(fn): a function, or null');
  translator = fn;
}

export { MESSAGES, message, setTranslator };
