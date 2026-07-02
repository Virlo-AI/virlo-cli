import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assertCanSpend } from '../src/lib/spend-guard';
import { ValidationError } from '../src/client/errors';

// Note: the interactive @clack/prompts confirm() path requires a real TTY and
// is intentionally not exercised here.

describe('assertCanSpend', () => {
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    originalIsTTY = process.stdin.isTTY;
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: originalIsTTY,
      configurable: true,
      writable: true,
    });
  });

  it('resolves without throwing when yes:true', async () => {
    await expect(assertCanSpend({ key: 'sounds.get', json: false, yes: true })).resolves.toBeUndefined();
  });

  it('rejects with a ValidationError mentioning --yes when yes:false and json:true', async () => {
    await expect(assertCanSpend({ key: 'sounds.get', json: true, yes: false })).rejects.toThrow(
      ValidationError,
    );
    await expect(assertCanSpend({ key: 'sounds.get', json: true, yes: false })).rejects.toThrow(/--yes/);
  });

  it('rejects when yes:false, json:false, and stdin is not a TTY', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true, writable: true });
    await expect(assertCanSpend({ key: 'sounds.get', json: false, yes: false })).rejects.toThrow(
      ValidationError,
    );
    await expect(assertCanSpend({ key: 'sounds.get', json: false, yes: false })).rejects.toThrow(/--yes/);
  });
});
