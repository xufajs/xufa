// registerBsonTypes(): the types of BSON through @xufa/marshal (as between the processes of a cluster) come back as
// themselves, as a read from the database gives them.
import { Registry, stringify, parse } from '@xufa/marshal';
import { Binary, Decimal128, Double, Int32, MaxKey, MinKey, ObjectId, Timestamp, registerBsonTypes } from '../index.js';

describe('registerBsonTypes', () => {
  const registry = registerBsonTypes(new Registry());
  const roundTrip = (value) => parse(stringify(value, { registry }), { registry });

  it('keeps ObjectIds, decimals and the other BSON values, nested in documents', () => {
    const doc = {
      id: '65f1a2b3c4d5e6f708192a3b',
      owner: new ObjectId('65f1a2b3c4d5e6f708192a3c'),
      refs: [new ObjectId('65f1a2b3c4d5e6f708192a3d')],
      price: Decimal128.fromString('19.99'),
      file: new Binary(Buffer.from('hi'), 4),
      at: new Timestamp(7, 5),
      small: new Int32(3),
      ratio: new Double(1.5),
      lowest: new MinKey(),
      highest: new MaxKey(),
      createdAt: new Date('2026-01-02T03:04:05Z'),
    };
    const back = roundTrip(doc);
    expect(back.owner).toBeInstanceOf(ObjectId);
    expect(back.owner.toHexString()).toBe('65f1a2b3c4d5e6f708192a3c');
    expect(back.refs[0].equals(doc.refs[0])).toBe(true);
    expect(back.price).toBeInstanceOf(Decimal128);
    expect(back.price.toString()).toBe('19.99');
    expect(back.file).toBeInstanceOf(Binary);
    expect(back.file.buffer.toString()).toBe('hi');
    expect(back.file.subType).toBe(4);
    expect(back.at).toEqual(doc.at);
    expect(back.at).toBeInstanceOf(Timestamp);
    expect(back.small).toBeInstanceOf(Int32);
    expect(back.ratio).toBeInstanceOf(Double);
    expect(back.lowest).toBeInstanceOf(MinKey);
    expect(back.highest).toBeInstanceOf(MaxKey);
    expect(back.createdAt).toEqual(doc.createdAt);
  });

  it('writes an ObjectId as its hex', () => {
    expect(stringify(new ObjectId('65f1a2b3c4d5e6f708192a3b'), { registry })).toContain('65f1a2b3c4d5e6f708192a3b');
  });
});
