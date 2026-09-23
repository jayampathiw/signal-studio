import type { StockProvider, StockResultT } from './contracts.ts';

/**
 * P3.4 — Pexels stock-footage search, ported from
 * `apps/video/src/fetchers/pexels.js` behind the `StockProvider` contract.
 * Same "no @signal-studio/config" convention as the P2.4 providers — takes
 * its own `apiKey`, not the platform's all-required-vars `env`.
 *
 * Pexels licence: free for commercial use, no attribution required — the
 * `meta.attribution` field is carried through anyway (nice-to-have credit),
 * not a compliance requirement.
 */
export function createPexelsStockProvider(opts?: { apiKey?: string }): StockProvider {
  const apiKey = opts?.apiKey ?? process.env.PEXELS_API_KEY;
  if (!apiKey) throw new Error('createPexelsStockProvider: missing PEXELS_API_KEY');

  return {
    async search({ query, orientation, minDuration }): Promise<StockResultT[]> {
      const url = new URL('https://api.pexels.com/videos/search');
      url.searchParams.set('query', query);
      url.searchParams.set('per_page', '15');
      url.searchParams.set('orientation', orientation);
      url.searchParams.set('size', 'medium');

      const res = await fetch(url, { headers: { Authorization: apiKey } });
      if (!res.ok) {
        throw new Error(`Pexels search failed (${res.status}): ${await res.text()}`);
      }
      const data = (await res.json()) as {
        videos?: Array<{
          id: number;
          duration: number;
          tags?: string[];
          user?: { name?: string };
          video_files?: Array<{
            file_type: string;
            link: string;
            width: number;
            height: number;
          }>;
        }>;
      };

      const results: StockResultT[] = [];
      for (const v of data.videos ?? []) {
        if (minDuration !== undefined && v.duration < minDuration) continue;

        const portraitFiles = (v.video_files ?? []).filter(
          (f) => f.file_type === 'video/mp4' && f.height > f.width,
        );
        if (portraitFiles.length === 0) continue;

        portraitFiles.sort((a, b) => {
          const aIdeal = a.height === 1920 ? 0 : Math.abs(a.height - 1920);
          const bIdeal = b.height === 1920 ? 0 : Math.abs(b.height - 1920);
          return aIdeal - bIdeal;
        });
        const file = portraitFiles[0];

        results.push({
          url: file.link,
          meta: {
            sourceId: String(v.id),
            durationSec: v.duration,
            width: file.width,
            height: file.height,
            attribution: v.user?.name ?? 'Pexels',
            license: 'Pexels License',
            description: (v.tags ?? []).join(', ') || query,
          },
        });
      }
      return results;
    },
  };
}
