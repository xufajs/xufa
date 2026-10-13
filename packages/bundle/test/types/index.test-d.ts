import { expectTypeOf } from '@xufa/test';
import { bundle, transform, minifyJs, minifyCss, resolve, type BundleResult, type TransformResult } from '../..';

const result = bundle('src/main.jsx', { define: { 'process.env.NODE_ENV': '"production"' }, minify: true, globalName: 'app' });
expectTypeOf(result).toEqualTypeOf<BundleResult>();
expectTypeOf(result.legal).toEqualTypeOf<Map<string, string[]>>();
expectTypeOf(transform('export const a = 1;', { file: 'a.ts', target: 'es2020' })).toEqualTypeOf<TransformResult>();
expectTypeOf(minifyJs('a = 1', { mangle: false })).toEqualTypeOf<string>();
expectTypeOf(minifyCss('a {}')).toEqualTypeOf<string>();
expectTypeOf(resolve('react', '/src/a.js', { kind: 'require' })).toEqualTypeOf<string | false | null>();
// @ts-expect-error jsx is 'automatic' or 'classic'
transform('', { jsx: 'preserve' });
// @ts-expect-error legal comments are 'eof' or 'none'
bundle('x.js', { legalComments: 'inline' });
