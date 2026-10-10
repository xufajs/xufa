// ConsoleMailBackend ('console-mail'): messages written to the console as they would be sent, as Django's console
// EmailBackend: for development. They are kept in memory too (as memory-mail), so the queries of their model read
// them. `write(text)` writes somewhere else (a logger, a list in tests); `separator` follows each message.
import { MemoryMailBackend } from './memory.js';

class ConsoleMailBackend extends MemoryMailBackend {
  constructor(options = {}) {
    super(options);
    this.write = typeof options.write === 'function' ? options.write : (text) => process.stdout.write(text);
    this.separator = options.separator === undefined ? `\n${'-'.repeat(79)}\n` : String(options.separator);
  }

  get name() {
    return 'console-mail';
  }

  // The message as it is sent (RFC 5322, with its headers), after it is kept.
  sent(built) {
    this.write(`${built.raw.toString('utf8')}${this.separator}`);
  }
}

export { ConsoleMailBackend };
