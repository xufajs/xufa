import { expectTypeOf } from '@xufa/test';
import { stringify, parse, marshal, unmarshal, clone, Registry, registry, ENCODE, DECODE, MarshalError, type Marshalled } from '../..';

class Point {
  constructor(public x: number, public y: number) {}
}
class Money {
  #cents: number;
  constructor(cents: number) {
    this.#cents = cents;
  }
  get cents() {
    return this.#cents;
  }
  static [ENCODE](money: Money) {
    return money.cents;
  }
  static [DECODE](cents: number) {
    return new Money(cents);
  }
}

const local = new Registry().register(Point).register(Money, { name: 'money', encode: (m) => m.cents, decode: (c) => new Money(c as number) });
registry.register(Point, Money);
expectTypeOf(stringify({ p: new Point(1, 2) }, { registry: local, functions: 'skip' })).toEqualTypeOf<string>();
expectTypeOf(parse<Point>('[1]', { registry: local, unknown: 'error' })).toEqualTypeOf<Point>();
expectTypeOf(marshal(1n)).toEqualTypeOf<Marshalled>();
expectTypeOf(unmarshal<Map<string, number>>([])).toEqualTypeOf<Map<string, number>>();
expectTypeOf(clone(new Point(1, 2))).toEqualTypeOf<Point>();
// @ts-expect-error
stringify(1, { unknown: 'drop' });
expectTypeOf(new MarshalError().code).toEqualTypeOf<MarshalError['code']>();
