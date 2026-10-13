import { expectTypeOf, assertType } from '@xufa/test';
import { chromium, launch, findBrowser, type Page, type Locator, type Response, type Box, TimeoutError } from '../..';

expectTypeOf(findBrowser()).toEqualTypeOf<string | null>();
expectTypeOf(chromium.launch).toEqualTypeOf(launch);
const browser = await launch({ headless: true });
const page = await (await browser.newContext({ locale: 'en-US', viewport: { width: 800, height: 600 } })).newPage();
expectTypeOf(page).toEqualTypeOf<Page>();
expectTypeOf(await page.goto('http://x')).toEqualTypeOf<Response | null>();
expectTypeOf(page.locator('li', { hasText: /a/ }).first()).toEqualTypeOf<Locator>();
expectTypeOf(await page.locator('li').boundingBox()).toEqualTypeOf<Box | null>();
expectTypeOf(await page.$$eval('li', (elements) => elements.length)).toEqualTypeOf<number>();
expectTypeOf(await page.evaluate((n) => n * 2, 21)).toEqualTypeOf<number>();
expectTypeOf(await page.selectOption('select', { label: 'B' })).toEqualTypeOf<string[]>();
page.on('console', (message) => expectTypeOf(message.type()).toEqualTypeOf<string>());
page.on('pageerror', (error) => expectTypeOf(error).toEqualTypeOf<Error>());
assertType<Error>(new TimeoutError('x'));
// @ts-expect-error no such event
page.on('nope', () => {});
// @ts-expect-error a value is a string
await page.fill('#q', 1);
