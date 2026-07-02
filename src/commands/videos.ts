import type { Command } from 'commander';
import { action, compact, runPaid } from '../lib/cli';
import { choiceOption, intArg, PLATFORMS } from '../lib/flags';
import { withCostMarker } from '../domain/endpoints';

export function registerVideos(program: Command): void {
  const videos = program.command('videos').description('Trending video digests (these reads cost credits)');

  videos
    .command('digest')
    .description(withCostMarker('Top videos from the last 24-48h by views', 'videos.digest'))
    .addOption(choiceOption('--platform <p>', 'limit to one platform', PLATFORMS))
    .option('--limit <n>', 'max videos (1-100)', intArg)
    .action(
      action(async ({ opts, ctx }) => {
        const platform = opts.platform as string | undefined;
        const path = platform ? `/v1/${platform}/videos/digest` : '/v1/videos/digest';
        await runPaid(ctx, 'videos.digest', {
          method: 'GET',
          path,
          query: compact({ limit: opts.limit as number | undefined }),
        });
      }),
    );
}
