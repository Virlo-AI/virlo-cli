import type { Command } from 'commander';
import { action, runRead } from '../lib/cli';

export function registerAccount(program: Command): void {
  const account = program.command('account').description('Account & billing');

  account
    .command('balance')
    .description('Show your credit balance (free)')
    .action(
      action(async ({ ctx }) => {
        await runRead(ctx, { method: 'GET', path: '/v1/account/balance' });
      }),
    );
}
