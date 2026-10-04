const createError = require('..');

const { XufaError } = createError;

describe('createError', () => {
  it('creates errors with code, status code and message', () => {
    const NotFound = createError('app_not_found', 'Not found', 404);
    const err = new NotFound();
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(NotFound);
    expect(err).toBeInstanceOf(XufaError);
    expect(err.code).toBe('APP_NOT_FOUND');
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('Not found');
    expect(err.name).toBe('XufaError');
    expect(err.toString()).toBe('XufaError [APP_NOT_FOUND]: Not found');
    expect(Object.prototype.toString.call(err)).toBe('[object Error]');
    expect(err.stack).toContain('errors.test.js');
  });

  it('works without new', () => {
    const E = createError('CODE', 'msg');
    expect(E()).toBeInstanceOf(E);
    expect(E().statusCode).toBe(500);
  });

  it('formats the message with the arguments', () => {
    const E = createError('CODE', 'Hello %s, you are %d');
    expect(new E('ada', 36).message).toBe('Hello ada, you are 36');
    const Plain = createError('CODE', 'Plain');
    expect(new Plain('extra').message).toBe('Plain extra');
  });

  it('takes a cause as the last argument', () => {
    const E = createError('CODE', 'Failed %s');
    const cause = new Error('root');
    const err = new E('x', { cause });
    expect(err.cause).toBe(cause);
    expect(err.message).toBe('Failed x');
  });

  it('extends other bases', () => {
    const E = createError('CODE', 'msg', 400, TypeError);
    expect(new E()).toBeInstanceOf(TypeError);
  });

  it('distinguishes errors with different codes', () => {
    const A = createError('A', 'a');
    const B = createError('B', 'b');
    expect(new A()).not.toBeInstanceOf(B);
    expect(new Error('x')).not.toBeInstanceOf(XufaError);
    expect(null instanceof A).toBe(false);
  });

  it('may skip the stack trace', () => {
    const E = createError('CODE', 'msg', 400, Error, false);
    expect(new E().stack).toBeUndefined();
  });

  it('leaves undefined a status code of 0', () => {
    expect(new (createError('CODE', 'msg', 0))().statusCode).toBeUndefined();
  });

  it('requires code and message', () => {
    expect(() => createError()).toThrow('Error code must not be empty');
    expect(() => createError('CODE')).toThrow('Error message must not be empty');
  });
});
