import { type Command, Option } from 'commander';
import { action, compact, req, runRead } from '../lib/cli';
import { csv, headerCollector, intArg } from '../lib/flags';
import { ValidationError } from '../client/errors';

const WEBHOOK_EVENTS = [
  'comet.run.completed',
  'orbit.run.completed',
  'satellite.lookup.completed',
  'trends.daily.completed',
  'tracking.cycle.completed',
  'tracking.outlier_video.detected',
  'tracking.paused',
];

export function registerWebhooks(program: Command): void {
  const webhooks = program.command('webhooks').description('Webhook endpoints & deliveries');

  webhooks
    .command('create')
    .description(`Register a webhook. Events: ${WEBHOOK_EVENTS.join(', ')}`)
    .requiredOption('--url <url>', 'delivery URL (<=2048 chars)')
    .requiredOption('--events <list>', 'comma-separated event types', csv)
    .option('--description <text>', 'description (<=256 chars)')
    .option('--header <kv>', 'custom header key:value (repeatable, <=5)', headerCollector, {})
    .option('--inactive', 'create disabled (is_active=false)')
    .action(
      action(async ({ opts, ctx }) => {
        const headers = opts.header as Record<string, string>;
        const body = compact({
          url: opts.url as string,
          enabled_events: opts.events as string[],
          description: opts.description as string | undefined,
          headers: headers && Object.keys(headers).length > 0 ? headers : undefined,
          is_active: opts.inactive ? false : undefined,
        });
        await runRead(ctx, { method: 'POST', path: '/v1/webhooks', body });
      }),
    );

  webhooks
    .command('list')
    .description('List webhook endpoints for your team')
    .action(action(async ({ ctx }) => {
      await runRead(ctx, { method: 'GET', path: '/v1/webhooks' });
    }));

  webhooks
    .command('get')
    .argument('<id>')
    .description('Webhook endpoint details')
    .action(action(async ({ positional, ctx }) => {
      await runRead(ctx, { method: 'GET', path: `/v1/webhooks/${positional[0]}` });
    }));

  webhooks
    .command('update')
    .argument('<id>')
    .description('Update a webhook endpoint')
    .option('--url <url>', 'delivery URL')
    .option('--events <list>', 'comma-separated event types', csv)
    .option('--description <text>', 'description')
    .option('--header <kv>', 'custom header key:value (repeatable)', headerCollector, {})
    .option('--activate', 'set active')
    .option('--deactivate', 'set inactive')
    .action(action(async ({ positional, opts, ctx }) => {
      const headers = opts.header as Record<string, string>;
      const isActive = opts.activate ? true : opts.deactivate ? false : undefined;
      const body = compact({
        url: opts.url as string | undefined,
        enabled_events: opts.events as string[] | undefined,
        description: opts.description as string | undefined,
        headers: headers && Object.keys(headers).length > 0 ? headers : undefined,
        is_active: isActive,
      });
      if (Object.keys(body).length === 0) {
        throw new ValidationError(
          'Nothing to update — pass at least one of --url, --events, --description, --header, --activate, --deactivate.',
        );
      }
      await runRead(ctx, { method: 'PATCH', path: `/v1/webhooks/${positional[0]}`, body });
    }));

  webhooks
    .command('delete')
    .argument('<id>')
    .description('Delete a webhook endpoint')
    .action(action(async ({ positional, ctx }) => {
      const id = positional[0]!;
      await req(ctx, { method: 'DELETE', path: `/v1/webhooks/${id}` });
      if (ctx.json) process.stdout.write(`${JSON.stringify({ deleted: id })}\n`);
      else process.stdout.write(`Deleted webhook ${id}.\n`);
    }));

  webhooks
    .command('reenable')
    .argument('<id>')
    .description('Re-enable an auto-disabled endpoint')
    .action(action(async ({ positional, ctx }) => {
      await runRead(ctx, { method: 'POST', path: `/v1/webhooks/${positional[0]}/reenable` });
    }));

  webhooks
    .command('test')
    .argument('<id>')
    .description('Send a test event to a webhook')
    .option('--event <type>', 'event type (default orbit.run.completed)')
    .action(action(async ({ positional, opts, ctx }) => {
      const body = compact({ event_type: opts.event as string | undefined });
      await runRead(ctx, { method: 'POST', path: `/v1/webhooks/${positional[0]}/test`, body });
    }));

  webhooks
    .command('deliveries')
    .argument('<id>')
    .description('List delivery attempts (cursor pagination)')
    .option('--status <status>', 'filter by status')
    .option('--event-type <type>', 'filter by event type')
    .option('--limit <n>', 'page size', intArg)
    .option('--cursor <cursor>', 'pagination cursor')
    .action(action(async ({ positional, opts, ctx }) => {
      await runRead(ctx, {
        method: 'GET',
        path: `/v1/webhooks/${positional[0]}/deliveries`,
        query: compact({
          status: opts.status as string | undefined,
          event_type: opts.eventType as string | undefined,
          limit: opts.limit as number | undefined,
          cursor: opts.cursor as string | undefined,
        }),
      });
    }));

  webhooks
    .command('retry-delivery')
    .argument('<delivery_id>')
    .description('Retry a failed delivery')
    .action(action(async ({ positional, ctx }) => {
      await runRead(ctx, {
        method: 'POST',
        path: `/v1/webhooks/deliveries/${positional[0]}/retry`,
      });
    }));
}
