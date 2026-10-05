import { expectType, expectError } from 'tsd';
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
expectType<string>(stringify({ p: new Point(1, 2) }, { registry: local, functions: 'skip' }));
expectType<Point>(parse<Point>('[1]', { registry: local, unknown: 'error' }));
expectType<Marshalled>(marshal(1n));
expectType<Map<string, number>>(unmarshal<Map<string, number>>([]));
expectType<Point>(clone(new Point(1, 2)));
expectError(stringify(1, { unknown: 'drop' }));
expectType<MarshalError['code']>(new MarshalError().code);
