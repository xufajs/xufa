// The error of a configuration: all that is wrong at once (errors: [{ path, message }]), not the first only.
class ConfigError extends Error {
  constructor(message, errors = []) {
    super(
      errors.length
        ? `${message}:\n${errors.map((e) => `  - ${e.path ? `${e.path}: ` : ''}${e.message}`).join('\n')}`
        : message
    );
    this.name = 'ConfigError';
    this.code = 'XUFA_CONFIG_ERR';
    this.errors = errors;
  }
}

export { ConfigError };
