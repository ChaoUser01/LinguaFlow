/**
 * CardSelector — Intelligent card selection algorithm for spaced repetition.
 *
 * Pools:      Due (45%), Learning (30%), New (20%), Mature (5%)
 * History:    Circular buffer of last 5 shown vocab_ids prevents repeats
 * Retry:     "Again"-rated cards re-enter after 4-6 other cards
 * Momentum:   New cards repeat after 5-8 then 15-20 other cards
 * Diversity:  Avoids back-to-back cards from the same HSK level
 */

interface PoolWeights {
  due: number;
  learning: number;
  new: number;
  mature: number;
}

interface RetryEntry {
  card: any;
  showAfter: number; // absolute card count after which this should be shown
}

interface MomentumEntry {
  card: any;
  showAfter: number; // absolute card count
  stage: 1 | 2;      // stage 1 = first repeat (5-8), stage 2 = second repeat (15-20)
}

const DEFAULT_WEIGHTS: PoolWeights = {
  due: 45,
  learning: 30,
  new: 20,
  mature: 5,
};

const HISTORY_SIZE = 5;
const RETRY_MIN_GAP = 4;
const RETRY_MAX_GAP = 6;
const MOMENTUM_STAGE1_MIN = 5;
const MOMENTUM_STAGE1_MAX = 8;
const MOMENTUM_STAGE2_MIN = 15;
const MOMENTUM_STAGE2_MAX = 20;

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export class CardSelector {
  private pools: {
    due: any[];
    learning: any[];
    new: any[];
    mature: any[];
  };

  /** Circular buffer of the last N shown vocab_ids */
  private history: string[] = [];

  /** Cards that got "Again" and need to be retried */
  private retryQueue: RetryEntry[] = [];

  /** New cards that need momentum re-showing */
  private momentumQueue: MomentumEntry[] = [];

  /** Total number of cards picked so far (monotonically increasing) */
  private pickCount: number = 0;

  /** Total cards reviewed (rated) */
  private reviewedCount: number = 0;

  /** HSK level of the last picked card, for diversity */
  private lastHskLevel: number | null = null;

  constructor(
    dueCards: any[],
    learningCards: any[],
    newCards: any[],
    matureCards: any[]
  ) {
    // Shallow-copy so we can mutate without affecting the caller
    this.pools = {
      due: [...dueCards],
      learning: [...learningCards],
      new: [...newCards],
      mature: [...matureCards],
    };
  }

  // ─── Public API ─────────────────────────────────────────────

  /**
   * Pick the next card to show. Returns null when all pools are exhausted
   * and there are no retry / momentum cards pending.
   */
  pickNextCard(): any | null {
    // 1. Check retry queue first — high priority failed-card reinsertion
    const retryCard = this.popReadyRetry();
    if (retryCard) {
      this.recordPick(retryCard);
      return retryCard;
    }

    // 2. Check momentum queue — re-show recently introduced new cards
    const momentumCard = this.popReadyMomentum();
    if (momentumCard) {
      this.recordPick(momentumCard);
      return momentumCard;
    }

    // 3. Weighted pool selection
    const card = this.pickFromPools();
    if (card) {
      this.recordPick(card);
      return card;
    }

    // 4. If pools are empty but there are pending retry/momentum entries,
    //    force the earliest one
    const forcedRetry = this.forceNextPending();
    if (forcedRetry) {
      this.recordPick(forcedRetry);
      return forcedRetry;
    }

    // Truly nothing left
    return null;
  }

  /**
   * Called after the user rates a card.
   * quality: 1 = Again, 3 = Hard, 4 = Good, 5 = Easy
   */
  reportRating(vocabId: string, quality: number): void {
    this.reviewedCount++;

    if (quality === 1) {
      // Failed — schedule retry after 4-6 more picks
      const gap = randInt(RETRY_MIN_GAP, RETRY_MAX_GAP);
      // Find the card data — it may be in history context or we look it up
      // We store the card reference when we pick, so we need to find it.
      // The caller should pass the card, but since the API only takes vocabId,
      // we'll search all pools + retry/momentum for it. If not found, skip.
      const card = this.findCardByVocabId(vocabId);
      if (card) {
        this.retryQueue.push({
          card,
          showAfter: this.pickCount + gap,
        });
      }
    }
  }

  /**
   * Report that a brand-new card was just introduced (call after first rating
   * of a new card). Schedules momentum re-shows.
   */
  reportNewCardIntroduced(card: any): void {
    const gap1 = randInt(MOMENTUM_STAGE1_MIN, MOMENTUM_STAGE1_MAX);
    this.momentumQueue.push({
      card,
      showAfter: this.pickCount + gap1,
      stage: 1,
    });
  }

  getProgress(): {
    due: number;
    learning: number;
    new: number;
    mature: number;
    reviewed: number;
  } {
    return {
      due: this.pools.due.length,
      learning: this.pools.learning.length,
      new: this.pools.new.length,
      mature: this.pools.mature.length,
      reviewed: this.reviewedCount,
    };
  }

  // ─── Internal helpers ───────────────────────────────────────

  private recordPick(card: any): void {
    this.pickCount++;
    const vocabId = card.vocab_id || card.vocab?.vocab_id;
    if (vocabId) {
      this.history.push(vocabId);
      if (this.history.length > HISTORY_SIZE) {
        this.history.shift();
      }
    }
    this.lastHskLevel = card.vocab?.hsk_level ?? null;
  }

  private isInHistory(card: any): boolean {
    const vocabId = card.vocab_id || card.vocab?.vocab_id;
    return vocabId ? this.history.includes(vocabId) : false;
  }

  /** Pop a retry entry whose showAfter has been reached */
  private popReadyRetry(): any | null {
    for (let i = 0; i < this.retryQueue.length; i++) {
      if (this.retryQueue[i].showAfter <= this.pickCount) {
        const entry = this.retryQueue.splice(i, 1)[0];
        if (!this.isInHistory(entry.card)) {
          return entry.card;
        }
        // If in history, push it back with +1 delay
        this.retryQueue.push({
          card: entry.card,
          showAfter: this.pickCount + 1,
        });
      }
    }
    return null;
  }

  /** Pop a momentum entry whose showAfter has been reached */
  private popReadyMomentum(): any | null {
    for (let i = 0; i < this.momentumQueue.length; i++) {
      if (this.momentumQueue[i].showAfter <= this.pickCount) {
        const entry = this.momentumQueue.splice(i, 1)[0];
        if (!this.isInHistory(entry.card)) {
          // If stage 1, schedule stage 2
          if (entry.stage === 1) {
            const gap2 = randInt(MOMENTUM_STAGE2_MIN, MOMENTUM_STAGE2_MAX);
            this.momentumQueue.push({
              card: entry.card,
              showAfter: this.pickCount + gap2,
              stage: 2,
            });
          }
          return entry.card;
        }
        // If in history, push it back with +1 delay
        this.momentumQueue.push({
          card: entry.card,
          showAfter: this.pickCount + 1,
          stage: entry.stage,
        });
      }
    }
    return null;
  }

  /** Force the earliest pending retry or momentum card (when pools are empty) */
  private forceNextPending(): any | null {
    // Combine and sort by showAfter
    type PendingEntry = { source: 'retry' | 'momentum'; index: number; showAfter: number; card: any };
    const pending: PendingEntry[] = [];

    this.retryQueue.forEach((e, i) =>
      pending.push({ source: 'retry', index: i, showAfter: e.showAfter, card: e.card })
    );
    this.momentumQueue.forEach((e, i) =>
      pending.push({ source: 'momentum', index: i, showAfter: e.showAfter, card: e.card })
    );

    if (pending.length === 0) return null;

    pending.sort((a, b) => a.showAfter - b.showAfter);

    const best = pending[0];
    // Remove from its source queue
    if (best.source === 'retry') {
      this.retryQueue.splice(best.index, 1);
    } else {
      const entry = this.momentumQueue.splice(best.index, 1)[0];
      // Schedule stage 2 if this was stage 1
      if (entry.stage === 1) {
        const gap2 = randInt(MOMENTUM_STAGE2_MIN, MOMENTUM_STAGE2_MAX);
        this.momentumQueue.push({
          card: entry.card,
          showAfter: this.pickCount + gap2,
          stage: 2,
        });
      }
    }

    // Advance pickCount to simulate the gap
    this.pickCount = Math.max(this.pickCount, best.showAfter);
    return best.card;
  }

  /** Weighted random pool selection with redistribution and diversity */
  private pickFromPools(): any | null {
    const poolKeys: (keyof PoolWeights)[] = ['due', 'learning', 'new', 'mature'];

    // Build effective weights (zero out empty pools)
    const effective: PoolWeights = { ...DEFAULT_WEIGHTS };
    const emptyPools: (keyof PoolWeights)[] = [];
    const activePools: (keyof PoolWeights)[] = [];

    for (const key of poolKeys) {
      // A pool is "active" if it has at least one card not in history
      const hasAvailable = this.pools[key].some((c) => !this.isInHistory(c));
      if (!hasAvailable) {
        effective[key] = 0;
        emptyPools.push(key);
      } else {
        activePools.push(key);
      }
    }

    if (activePools.length === 0) return null;

    // Redistribute weights from empty pools proportionally
    const totalEmptyWeight = emptyPools.reduce((s, k) => s + DEFAULT_WEIGHTS[k], 0);
    const totalActiveDefaultWeight = activePools.reduce((s, k) => s + DEFAULT_WEIGHTS[k], 0);

    if (totalActiveDefaultWeight > 0 && totalEmptyWeight > 0) {
      for (const key of activePools) {
        effective[key] += (DEFAULT_WEIGHTS[key] / totalActiveDefaultWeight) * totalEmptyWeight;
      }
    }

    // Weighted random selection of pool
    const totalWeight = activePools.reduce((s, k) => s + effective[k], 0);
    let roll = Math.random() * totalWeight;
    let selectedPool: keyof PoolWeights = activePools[0];

    for (const key of activePools) {
      roll -= effective[key];
      if (roll <= 0) {
        selectedPool = key;
        break;
      }
    }

    // Pick a card from the selected pool respecting diversity + history
    return this.pickFromPool(selectedPool) ?? this.pickFallback(activePools);
  }

  /**
   * Pick from a specific pool. Tries diversity-aware selection first,
   * then falls back to any non-history card.
   */
  private pickFromPool(poolName: keyof PoolWeights): any | null {
    const pool = this.pools[poolName];

    // First pass: prefer cards from a DIFFERENT HSK level (soft diversity)
    if (this.lastHskLevel !== null) {
      for (let i = 0; i < pool.length; i++) {
        const card = pool[i];
        const hsk = card.vocab?.hsk_level;
        if (hsk !== this.lastHskLevel && !this.isInHistory(card)) {
          pool.splice(i, 1);
          return card;
        }
      }
    }

    // Second pass: any card not in history
    for (let i = 0; i < pool.length; i++) {
      if (!this.isInHistory(pool[i])) {
        return pool.splice(i, 1)[0];
      }
    }

    return null;
  }

  /** Fallback: try pools in priority order (Due → Learning → New → Mature) */
  private pickFallback(activePools: (keyof PoolWeights)[]): any | null {
    const priority: (keyof PoolWeights)[] = ['due', 'learning', 'new', 'mature'];
    for (const key of priority) {
      if (activePools.includes(key)) {
        const card = this.pickFromPool(key);
        if (card) return card;
      }
    }
    return null;
  }

  /** Find a card object across all pools and queues by vocab_id */
  private findCardByVocabId(vocabId: string): any | null {
    for (const key of ['due', 'learning', 'new', 'mature'] as const) {
      const found = this.pools[key].find(
        (c) => (c.vocab_id || c.vocab?.vocab_id) === vocabId
      );
      if (found) return found;
    }
    // Also check retry and momentum queues (card may already be there)
    for (const entry of this.retryQueue) {
      if ((entry.card.vocab_id || entry.card.vocab?.vocab_id) === vocabId) {
        return entry.card;
      }
    }
    for (const entry of this.momentumQueue) {
      if ((entry.card.vocab_id || entry.card.vocab?.vocab_id) === vocabId) {
        return entry.card;
      }
    }
    return null;
  }
}
