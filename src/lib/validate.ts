import { z } from 'zod';
import { ValidationError } from '../client/errors';

/** Parse with a zod schema, converting failures into a ValidationError (exit 2). */
export function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const msg = result.error.issues
      .map((i) => `${i.path.join('.') || '(value)'}: ${i.message}`)
      .join('; ');
    throw new ValidationError(msg);
  }
  return result.data;
}

const platform = z.enum(['youtube', 'tiktok', 'instagram']);
const timeWindow = z.enum(['today', 'this_week', 'this_month', 'this_year']);

export const orbitCreateSchema = z.object({
  name: z.string().min(1),
  keywords: z.array(z.string().min(1)).min(1, 'at least 1 keyword').max(10, 'at most 10 keywords'),
  platforms: z.array(platform).optional(),
  min_views: z.number().int().nonnegative().optional(),
  time_period: timeWindow,
  enable_meta_ads: z.boolean().optional(),
  exclude_keywords: z.array(z.string()).optional(),
  exclude_keywords_strict: z.boolean().optional(),
  intent: z.string().optional(),
  data_intelligence_enabled: z.boolean().optional(),
});

export const cometCreateSchema = z.object({
  name: z.string().min(1),
  keywords: z.array(z.string().min(1)).min(1, 'at least 1 keyword').max(20, 'at most 20 keywords'),
  platforms: z.array(platform).min(1, 'at least 1 platform'),
  cadence: z.enum(['daily', 'weekly', 'monthly', 'cron']),
  min_views: z.number().int().nonnegative(),
  time_range: timeWindow,
  is_active: z.boolean().optional(),
  meta_ads_enabled: z.boolean().optional(),
  exclude_keywords: z.array(z.string()).optional(),
  exclude_keywords_strict: z.boolean().optional(),
  intent: z.string().optional(),
  data_intelligence_enabled: z.boolean().optional(),
});

export const cometUpdateSchema = cometCreateSchema.partial();

export const batchCreatorsSchema = z
  .array(z.object({ platform, username: z.string().min(1) }))
  .min(1, 'at least 1 creator')
  .max(25, 'at most 25 creators');
