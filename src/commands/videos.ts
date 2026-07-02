import type { Command } from 'commander';
import { action, compact, runRead } from '../lib/cli';
import { choiceOption, intArg, PLATFORMS } from '../lib/flags';

export function registerVideos(program: Command): void {
  const videos = program.command('videos').description('Trending video digests (free reads)');

  videos
    .command('digest')
    .description('Top videos from the last 24-48h by views')
    .addOption(choiceOption('--platform <p>', 'limit to one platform', PLATFORMS))
    .option('--limit <n>', 'max videos (1-100)', intArg)
    .action(
      action(async ({ opts, ctx }) => {
        const platform = opts.platform as string | undefined;
        const path = platform ? `/v1/${platform}/videos/digest` : '/v1/videos/digest';
        await runRead(ctx, {
          method: 'GET',
          path,
          query: compact({ limit: opts.limit as number | undefined }),
        });
      }),
    );
}
