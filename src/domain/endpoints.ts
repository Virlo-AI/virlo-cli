/**
 * Single source of truth for which commands spend credits and roughly how much.
 * Consumed by command help text (the 💲 marker) and by the spend-guard.
 *
 * Exact prices are resolved server-side from the DB (public_api_credit_pricing /
 * feature_credit_costs) and may change; these hints are guidance, and the actual
 * charge is always reported from the X-Cost / X-Credits-Remaining response headers.
 */
export interface PaidEndpoint {
  /** Human-readable cost estimate shown before the call and in --help. */
  hint: string;
}

export const PAID: Record<string, PaidEndpoint> = {
  'trends.list': { hint: '$0.25' },
  'trends.digest': { hint: '$0.25' },
  'videos.digest': { hint: '$0.25' },
  'hashtags.list': { hint: '$0.05' },
  'hashtags.performance': { hint: '$0.05' },
  'orbit.create': { hint: '~$0.50 (+$1.00 with --data-intelligence)' },
  'comet.create': { hint: 'billed per scheduled run (~$0.50, +$1.00/run with --data-intelligence)' },
  'satellite.creator': { hint: '$0.50 per creator (starts a scrape job)' },
  'satellite.batch': { hint: '$0.50 per creator' },
  'satellite.video-outlier': { hint: '$0.50 (starts a video-outlier job)' },
  'sounds.trending': { hint: '$0.25' },
  'sounds.search': { hint: '$0.10' },
  'sounds.by-creator': { hint: '$0.25' },
  'sounds.get': { hint: '$0.05 (+$0.10 on a fresh sound-to-artist match)' },
  'sounds.usage-history': { hint: '$0.05' },
  'sounds.videos': { hint: '$0.25' },
  'tracking.creators.add': { hint: '$0.25/cycle (+ collection depth up front)' },
  'tracking.videos.add': { hint: '$0.25/cycle' },
  'tracking.creators.collect': { hint: '$0.50 standard / $1.00 deep / $2.00 full' },
};

export function isPaid(key: string): boolean {
  return key in PAID;
}

export function costHint(key: string): string | undefined {
  return PAID[key]?.hint;
}

/** Append a 💲 cost marker to a command description when the command spends credits. */
export function withCostMarker(description: string, key: string): string {
  const hint = costHint(key);
  return hint ? `${description}  💲 ${hint}` : description;
}
