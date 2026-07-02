import { describe, expect, it } from 'vitest';
import { InvalidArgumentError } from 'commander';
import { csv, floatArg, headerCollector, intArg } from '../src/lib/flags';

describe('csv', () => {
  it('trims whitespace and drops empty entries', () => {
    expect(csv(' a, b ,,c ,')).toEqual(['a', 'b', 'c']);
  });

  it('returns an empty array for an empty/whitespace-only string', () => {
    expect(csv('')).toEqual([]);
    expect(csv('   ')).toEqual([]);
  });
});

describe('intArg', () => {
  it('parses valid integers', () => {
    expect(intArg('42')).toBe(42);
    expect(intArg('-7')).toBe(-7);
  });

  it('throws a commander InvalidArgumentError on garbage input', () => {
    expect(() => intArg('abc')).toThrow(InvalidArgumentError);
  });
});

describe('floatArg', () => {
  it('parses valid numbers', () => {
    expect(floatArg('3.14')).toBeCloseTo(3.14);
    expect(floatArg('-0.5')).toBeCloseTo(-0.5);
  });

  it('throws a commander InvalidArgumentError on garbage input', () => {
    expect(() => floatArg('not-a-number')).toThrow(InvalidArgumentError);
  });
});

describe('headerCollector', () => {
  it('parses a single key:value pair', () => {
    expect(headerCollector('X-Foo:bar')).toEqual({ 'X-Foo': 'bar' });
  });

  it('trims key and value', () => {
    expect(headerCollector(' X-Foo : bar ')).toEqual({ 'X-Foo': 'bar' });
  });

  it('accumulates across repeated calls', () => {
    const first = headerCollector('A:1');
    const second = headerCollector('B:2', first);
    expect(second).toEqual({ A: '1', B: '2' });
  });

  it('throws a commander InvalidArgumentError when the colon is missing', () => {
    expect(() => headerCollector('no-colon-here')).toThrow(InvalidArgumentError);
  });
});
