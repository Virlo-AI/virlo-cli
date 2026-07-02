import { describe, expect, it } from 'vitest';
import { batchCreatorsSchema, orbitCreateSchema, parse } from '../src/lib/validate';
import { ValidationError } from '../src/client/errors';

describe('parse with orbitCreateSchema', () => {
  const validBody = {
    name: 'My Search',
    keywords: ['skincare', 'routine'],
    time_period: 'today',
  };

  it('passes through a valid body unchanged', () => {
    expect(parse(orbitCreateSchema, validBody)).toEqual(validBody);
  });

  it('fails with a ValidationError (exit 2) when name is missing', () => {
    const { name: _name, ...rest } = validBody;
    expect(() => parse(orbitCreateSchema, rest)).toThrow(ValidationError);
    try {
      parse(orbitCreateSchema, rest);
      throw new Error('expected parse to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).exitCode).toBe(2);
    }
  });

  it('fails when more than 10 keywords are supplied', () => {
    const body = { ...validBody, keywords: Array.from({ length: 11 }, (_, i) => `kw${i}`) };
    expect(() => parse(orbitCreateSchema, body)).toThrow(ValidationError);
  });

  it('fails with an invalid platform', () => {
    const body = { ...validBody, platforms: ['myspace'] };
    expect(() => parse(orbitCreateSchema, body)).toThrow(ValidationError);
  });
});

describe('parse with batchCreatorsSchema', () => {
  it('passes with a valid list of creators', () => {
    const body = [{ platform: 'tiktok', username: 'abc' }];
    expect(parse(batchCreatorsSchema, body)).toEqual(body);
  });

  it('fails with more than 25 creators', () => {
    const body = Array.from({ length: 26 }, (_, i) => ({ platform: 'tiktok', username: `user${i}` }));
    expect(() => parse(batchCreatorsSchema, body)).toThrow(ValidationError);
  });

  it('fails when the list is empty', () => {
    expect(() => parse(batchCreatorsSchema, [])).toThrow(ValidationError);
  });
});
