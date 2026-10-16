import { expectTypeOf } from '@xufa/test';
import dotenv, { config, parse, populate, decrypt } from '@xufa/config/dotenv';
import '@xufa/config/dotenv/config';

// As dotenv's own type test: config() and parse() of strings and Buffers.
const env = config();
const dbUrl: string | null = env.error || !env.parsed ? null : env.parsed['BASIC'];
expectTypeOf(dbUrl).toEqualTypeOf<string | null>();

config({ path: '.env-example', encoding: 'utf8', debug: true });
config({ path: ['.env.local', '.env'], override: true, quiet: true, processEnv: {} });
config({ path: new URL('file:///app/.env') });

const parsed = parse('NODE_ENV=production\nDB_HOST=a.b.c');
expectTypeOf(parsed['DB_HOST']).toEqualTypeOf<string>();
const fromBuffer = parse(Buffer.from('JUSTICE=league\n'));
expectTypeOf(fromBuffer['JUSTICE']).toEqualTypeOf<string>();
const typed = parse<{ PORT: string }>('PORT=3000');
expectTypeOf(typed.PORT).toEqualTypeOf<string>();

expectTypeOf(populate({}, { A: '1' }, { override: true })).toEqualTypeOf<dotenv.DotenvPopulateOutput>();
expectTypeOf(decrypt('cipher', 'key')).toEqualTypeOf<string>();
expectTypeOf(dotenv.config).toEqualTypeOf(config);

if (env.error) expectTypeOf(env.error.code).toEqualTypeOf<dotenv.DotenvError['code']>();

// @ts-expect-error: path is a string, a list of them or a URL
config({ path: 3 });
