// dotenv's API (as of dotenv 17.2.3), xufa's own implementation: config() reads .env files into process.env (or
// another object), parse() reads the text of one, populate() sets what was read, decrypt() and the .env.vault of
// DOTENV_KEY. Its behavior is dotenv's, to be a drop-in (dotenv's own tests pass on it: tools/port-dotenv), but for its
// log line: it says what was injected and has no tips (dotenv's are ads of dotenvx).
//
// The functions call each other through the `dotenv` object, and Node's modules through theirs (fs.readFileSync,
// os.homedir, path.relative, crypto.createDecipheriv), as dotenv does: tests replace them there.
//
// (This is the format dotenv users have; the strict reader of loadConfig(), with errors by line, is ./dotenv.js.)
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// A line of a .env file: `export ` allowed, KEY= or `KEY: `, then a value quoted (' " or `, on several lines) or not
// (to a #), and maybe a comment. (dotenv's grammar, kept as it is: its quirks are what .env files rely on.)
const ENTRY =
  /^\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?$/gm;
const QUOTED = /^(['"`])([\s\S]*)\1$/gm;

// A flag of the options or of a variable: 'false', '0', 'no', 'off' and '' are false.
function flag(value) {
  if (typeof value === 'string') return !['false', '0', 'no', 'off', ''].includes(value.toLowerCase());
  return Boolean(value);
}

function log(message) {
  console.log(`[dotenv] ${message}`);
}

function debugLog(message) {
  console.log(`[dotenv][DEBUG] ${message}`);
}

function warn(message) {
  console.error(`[dotenv][WARN] ${message}`);
}

function codedError(code, message) {
  const err = new Error(`${code}: ${message}`);
  err.code = code;
  return err;
}

// ~ at the start of a path is the home folder.
function homePath(file) {
  return file[0] === '~' ? path.join(os.homedir(), file.slice(1)) : file;
}

// The key of .env.vault: the option, else the variable DOTENV_KEY; '' if none.
function vaultKey(options) {
  if (options && options.DOTENV_KEY && options.DOTENV_KEY.length > 0) return options.DOTENV_KEY;
  if (process.env.DOTENV_KEY && process.env.DOTENV_KEY.length > 0) return process.env.DOTENV_KEY;
  return '';
}

// The .env.vault next to the file (the last that exists of a list) or of the working folder, or null.
function vaultPath(options) {
  let candidate = null;
  if (options && options.path && options.path.length > 0) {
    if (Array.isArray(options.path)) {
      for (const file of options.path) {
        if (fs.existsSync(file)) candidate = file.endsWith('.vault') ? file : `${file}.vault`;
      }
    } else candidate = options.path.endsWith('.vault') ? options.path : `${options.path}.vault`;
  } else candidate = path.resolve(process.cwd(), '.env.vault');
  return fs.existsSync(candidate) ? candidate : null;
}

// The key and the ciphertext of the environment a DOTENV_KEY names (dotenv://:key_<hex>@host/vault/.env.vault?environment=x).
function vaultEntry(result, key) {
  let uri;
  try {
    uri = new URL(key);
  } catch (err) {
    if (err.code === 'ERR_INVALID_URL') {
      throw codedError(
        'INVALID_DOTENV_KEY',
        'Wrong format. Must be in valid uri format like dotenv://:key_1234@dotenvx.com/vault/.env.vault?environment=development'
      );
    }
    throw err;
  }
  if (!uri.password) throw codedError('INVALID_DOTENV_KEY', 'Missing key part');
  const environment = uri.searchParams.get('environment');
  if (!environment) throw codedError('INVALID_DOTENV_KEY', 'Missing environment part');
  const name = `DOTENV_VAULT_${environment.toUpperCase()}`;
  const ciphertext = result.parsed[name];
  if (!ciphertext) {
    throw codedError('NOT_FOUND_DOTENV_ENVIRONMENT', `Cannot locate environment ${name} in your .env.vault file.`);
  }
  return { ciphertext, key: uri.password };
}

const dotenv = {
  // The variables of a .env text (a string or a Buffer).
  parse(src) {
    const out = {};
    const text = src.toString().replace(/\r\n?/gm, '\n');
    ENTRY.lastIndex = 0;
    for (let match = ENTRY.exec(text); match !== null; match = ENTRY.exec(text)) {
      let value = (match[2] || '').trim();
      const quote = value[0];
      value = value.replace(QUOTED, '$2');
      // (Only double quotes expand \n and \r.)
      if (quote === '"') value = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r');
      out[match[1]] = value;
    }
    return out;
  },

  // Sets in processEnv what parsed has that it does not (all with override); what it set.
  populate(processEnv, parsed, options = {}) {
    const debug = Boolean(options && options.debug);
    const override = Boolean(options && options.override);
    const populated = {};
    if (typeof parsed !== 'object') {
      throw codedError('OBJECT_REQUIRED', 'Please check the processEnv argument being passed to populate');
    }
    for (const key of Object.keys(parsed)) {
      if (Object.prototype.hasOwnProperty.call(processEnv, key)) {
        if (override === true) {
          processEnv[key] = parsed[key];
          populated[key] = parsed[key];
        }
        if (debug) debugLog(`"${key}" is already defined and ${override === true ? 'WAS' : 'was NOT'} overwritten`);
      } else {
        processEnv[key] = parsed[key];
        populated[key] = parsed[key];
      }
    }
    return populated;
  },

  // Reads the .env files (options.path: one, a list where the first wins, a URL; .env of the working folder by
  // default) into processEnv: { parsed } and, if a file failed, { error } (the last).
  configDotenv(options) {
    const processEnv = options && options.processEnv != null ? options.processEnv : process.env;
    let debug = flag(processEnv.DOTENV_CONFIG_DEBUG || (options && options.debug));
    let quiet = flag(processEnv.DOTENV_CONFIG_QUIET || (options && options.quiet));
    let encoding = 'utf8';
    if (options && options.encoding) encoding = options.encoding;
    else if (debug) debugLog('No encoding is specified. UTF-8 is used by default');

    let files = [path.resolve(process.cwd(), '.env')];
    if (options && options.path) {
      files = Array.isArray(options.path) ? options.path.map(homePath) : [homePath(options.path)];
    }
    let lastError;
    const parsedAll = {};
    for (const file of files) {
      try {
        dotenv.populate(parsedAll, dotenv.parse(fs.readFileSync(file, { encoding })), options);
      } catch (err) {
        if (debug) debugLog(`Failed to load ${file} ${err.message}`);
        lastError = err;
      }
    }
    const populated = dotenv.populate(processEnv, parsedAll, options);

    // (The files may set DOTENV_CONFIG_DEBUG and DOTENV_CONFIG_QUIET themselves.)
    debug = flag(processEnv.DOTENV_CONFIG_DEBUG || debug);
    quiet = flag(processEnv.DOTENV_CONFIG_QUIET || quiet);
    if (debug || !quiet) {
      const shown = [];
      for (const file of files) {
        try {
          shown.push(path.relative(process.cwd(), file));
        } catch (err) {
          if (debug) debugLog(`Failed to load ${file} ${err.message}`);
          lastError = err;
        }
      }
      log(`injecting env (${Object.keys(populated).length}) from ${shown.join(',')}`);
    }
    return lastError ? { parsed: parsedAll, error: lastError } : { parsed: parsedAll };
  },

  // The variables of the .env.vault, decrypted by the DOTENV_KEY (keys separated by commas are tried in turn).
  _parseVault(options) {
    options = options || {};
    const file = vaultPath(options);
    options.path = file;
    const result = dotenv.configDotenv(options);
    if (!result.parsed) throw codedError('MISSING_DATA', `Cannot parse ${file} for an unknown reason`);
    const keys = vaultKey(options).split(',');
    let decrypted;
    for (let i = 0; i < keys.length; i += 1) {
      try {
        const entry = vaultEntry(result, keys[i].trim());
        decrypted = dotenv.decrypt(entry.ciphertext, entry.key);
        break;
      } catch (err) {
        if (i + 1 >= keys.length) throw err;
      }
    }
    return dotenv.parse(decrypted);
  },

  _configVault(options) {
    const debug = flag(process.env.DOTENV_CONFIG_DEBUG || (options && options.debug));
    const quiet = flag(process.env.DOTENV_CONFIG_QUIET || (options && options.quiet));
    if (debug || !quiet) log('Loading env from encrypted .env.vault');
    const parsed = dotenv._parseVault(options);
    const processEnv = options && options.processEnv != null ? options.processEnv : process.env;
    dotenv.populate(processEnv, parsed, options);
    return { parsed };
  },

  // configDotenv(), or the .env.vault when there is a DOTENV_KEY.
  config(options) {
    if (vaultKey(options).length === 0) return dotenv.configDotenv(options);
    const file = vaultPath(options);
    if (!file) {
      warn(`You set DOTENV_KEY but you are missing a .env.vault file at ${file}. Did you forget to build it?`);
      return dotenv.configDotenv(options);
    }
    return dotenv._configVault(options);
  },

  // A value of .env.vault: base64 of nonce (12 bytes), AES-256-GCM ciphertext and tag (16); the key, its last 64 hex.
  decrypt(encrypted, keyStr) {
    const key = Buffer.from(keyStr.slice(-64), 'hex');
    const bytes = Buffer.from(encrypted, 'base64');
    const nonce = bytes.subarray(0, 12);
    const tag = bytes.subarray(-16);
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
      decipher.setAuthTag(tag);
      return `${decipher.update(bytes.subarray(12, -16))}${decipher.final()}`;
    } catch (err) {
      if (err instanceof RangeError || err.message === 'Invalid key length') {
        throw codedError('INVALID_DOTENV_KEY', 'It must be 64 characters long (or more)');
      }
      if (err.message === 'Unsupported state or unable to authenticate data') {
        throw codedError('DECRYPTION_FAILED', 'Please check your DOTENV_KEY');
      }
      throw err;
    }
  },
};

// The options of config() in variables of the environment (DOTENV_CONFIG_PATH, ...), for the preload.
function envOptions(env = process.env) {
  const options = {};
  const names = { encoding: 'ENCODING', path: 'PATH', quiet: 'QUIET', debug: 'DEBUG', override: 'OVERRIDE' };
  for (const [option, name] of Object.entries(names)) {
    if (env[`DOTENV_CONFIG_${name}`] != null) options[option] = env[`DOTENV_CONFIG_${name}`];
  }
  if (env.DOTENV_CONFIG_DOTENV_KEY != null) options.DOTENV_KEY = env.DOTENV_CONFIG_DOTENV_KEY;
  return options;
}

// The options of config() in arguments of the command (dotenv_config_path=...), for the preload: quiet unless said.
function cliOptions(args) {
  const options = {};
  for (const arg of args) {
    const match = /^dotenv_config_(encoding|path|quiet|debug|override|DOTENV_KEY)=(.+)$/.exec(arg);
    if (match) options[match[1]] = match[2];
  }
  if (!('quiet' in options)) options.quiet = 'true';
  return options;
}

export { dotenv, envOptions, cliOptions };
