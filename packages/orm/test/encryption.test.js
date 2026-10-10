// The keyring of encrypted fields, and what encrypted fields can be.
import { Keyring, setEncryptionKeys, generateEncryptionKey, isEncrypted, fields, Model, Database } from '../index.js';
import { EncryptionError } from '../index.js';

describe('keyring', () => {
  const key = generateEncryptionKey();

  afterEach(() => {
    setEncryptionKeys(null);
    delete process.env.XUFA_ENCRYPTION_KEYS;
  });

  it('encrypts and decrypts in a context', () => {
    const keyring = new Keyring(key);
    const text = keyring.seal(Buffer.from('secret'), 'users.ssn');
    expect(isEncrypted(text)).toBe(true);
    expect(text.startsWith('$xenc$1$k1$')).toBe(true);
    expect(keyring.open(text, 'users.ssn').toString()).toBe('secret');
    expect(keyring.seal(Buffer.from('secret'), 'users.ssn')).not.toBe(text);
    expect(() => keyring.open(text, 'users.notes')).toThrow('of another field');
    expect(() => keyring.open('plain', 'users.ssn')).toThrow('not an encrypted value');
    expect(() => keyring.open('$xenc$1$k1$AAAA$AAAA', 'users.ssn')).toThrow('malformed');
  });

  it('makes deterministic values the same for the same value, key and context', () => {
    const keyring = new Keyring(key);
    const a = keyring.seal(Buffer.from('ada@example.com'), 'users.email', true);
    expect(keyring.seal(Buffer.from('ada@example.com'), 'users.email', true)).toBe(a);
    expect(keyring.seal(Buffer.from('grace@example.com'), 'users.email', true)).not.toBe(a);
    expect(keyring.seal(Buffer.from('ada@example.com'), 'admins.email', true)).not.toBe(a);
    expect(new Keyring(generateEncryptionKey()).seal(Buffer.from('ada@example.com'), 'users.email', true)).not.toBe(a);
    expect(keyring.open(a, 'users.email').toString()).toBe('ada@example.com');
  });

  it('takes keys of 32 bytes in base64, base64url, hex or Buffers', () => {
    const bytes = Buffer.from(key, 'base64');
    for (const given of [key, bytes.toString('base64url'), bytes.toString('hex'), bytes]) {
      const text = new Keyring(given).seal(Buffer.from('x'), 'c');
      expect(new Keyring(key).open(text, 'c').toString()).toBe('x');
    }
    expect(() => new Keyring('short key')).toThrow('32 bytes');
    expect(() => new Keyring({ keys: { 'a b': key } })).toThrow('letters, digits');
    expect(() => new Keyring({ current: 'k9', keys: { k1: key } })).toThrow('not one of the keys');
  });

  it('reads the keys of the environment, and says when there are none', () => {
    class Note extends Model {
      static fields = { text: fields.encrypted(fields.text()) };
    }
    new Database({ backend: 'memory' }).register(Note);
    const field = Note.meta.field('text');
    expect(() => field.seal('x')).toThrow(EncryptionError);
    expect(() => field.seal('x')).toThrow('XUFA_ENCRYPTION_KEYS');
    const old = generateEncryptionKey();
    process.env.XUFA_ENCRYPTION_KEYS = `k2:${key}, k1:${old}`;
    const text = field.seal('hello');
    expect(text.startsWith('$xenc$1$k2$')).toBe(true);
    expect(field.open(text)).toBe('hello');
    expect(field.open(new Keyring({ keys: { k1: old } }).seal(Buffer.from('"old"'), field.aad))).toBe('old');
    process.env.XUFA_ENCRYPTION_KEYS = 'nocolon';
    setEncryptionKeys(null);
    expect(() => field.seal('x')).toThrow('id:key');
  });
});

describe('encrypted fields', () => {
  it('refuse what they cannot be', () => {
    expect(() => fields.encrypted(fields.string(), { unique: true })).toThrow('deterministic');
    expect(() => fields.encrypted(fields.json(), { deterministic: true })).toThrow('cannot be deterministic');
    expect(() => fields.encrypted(fields.string(), { primaryKey: true })).toThrow('primary key');
    expect(() => fields.encrypted(fields.foreignKey('self'))).toThrow('not a relation');
    expect(() => fields.encrypted(fields.encrypted(fields.string()))).toThrow('not a relation');
  });

  it('are text columns, with the JSON Schema of their base field', () => {
    class Card extends Model {
      static fields = {
        number: fields.encrypted(fields.string({ maxLength: 19 })),
        context: fields.encrypted(fields.string(), { context: 'cards.number_v0', null: true }),
      };
    }
    new Database({ backend: 'memory' }).register(Card);
    expect(Card.meta.field('number').dbType).toBe('text');
    expect(Card.meta.field('number').aad).toBe('card.number');
    expect(Card.meta.field('context').aad).toBe('cards.number_v0');
    expect(Card.jsonSchema().properties.number).toEqual({ type: 'string', maxLength: 19 });
  });
});
