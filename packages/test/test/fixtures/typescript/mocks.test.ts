import { describe, expect, it, vi } from 'vitest';
import { area, type Options } from './lib.js';

vi.mock('./lib.js', () => ({ area: vi.fn((options: Options) => -options.size) }));

describe('typescript mocks', () => {
  it('hoists vi.mock() of a file compiled by the transformer', () => {
    expect(area({ size: 2 })).toBe(-2);
    expect(vi.isMockFunction(area)).toBe(true);
  });
});
