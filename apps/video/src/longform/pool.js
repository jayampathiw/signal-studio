// Rolling concurrency pool. Keeps up to `limit` workers in flight; the moment
// one finishes, the next queued item starts — no fixed batches, no idle waiting
// on the slowest item. This is the "true parallelism" mechanism for the 8-wide
// Higgsfield ceiling (docs/long-form-pipeline-plan.md §4).
//
// Higgsfield rejects (does NOT queue) submissions past 8 concurrent, so `limit`
// MUST be <= the account ceiling; the per-item worker additionally handles a
// transient rate_limit as back-off (see higgsfield.js), not as failure.

/**
 * @template T, R
 * @param {T[]} items
 * @param {(item: T, index: number) => Promise<R>} worker
 * @param {{ limit?: number, onSettle?: (r: {ok:boolean,item:T,value?:R,error?:Error}) => void }} [opts]
 * @returns {Promise<Array<{ok:boolean,item:T,value?:R,error?:Error}>>}
 */
export function runPool(items, worker, { limit = 8, onSettle } = {}) {
  const queue = items.map((item, index) => ({ item, index }));
  const results = [];

  return new Promise((resolve) => {
    let active = 0;

    const pump = () => {
      if (queue.length === 0 && active === 0) return resolve(results);
      while (active < limit && queue.length > 0) {
        const { item, index } = queue.shift();
        active++;
        Promise.resolve()
          .then(() => worker(item, index))
          .then(
            (value) => ({ ok: true, item, value }),
            (error) => ({ ok: false, item, error }),
          )
          .then((r) => {
            results.push(r);
            if (onSettle) { try { onSettle(r); } catch { /* non-fatal */ } }
            active--;
            pump();
          });
      }
    };

    pump();
  });
}

export default { runPool };
