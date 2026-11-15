// Spaced repetition (SM-2 variant). Pure functions over plain card objects.

export const DAY = 86400000;
export const GRADES = { again: 0, hard: 1, good: 2, easy: 3 };

export function newCardFields(now = Date.now()) {
    return { reps: 0, ivl: 0, ease: 2.5, lapses: 0, due: now, last: 0, status: 'learning' };
}

/** Returns the updated card fields after answering with `grade` (0 again, 1 hard, 2 good, 3 easy). */
export function review(card, grade, now = Date.now()) {
    const c = { ...newCardFields(now), ...card };
    if (grade === 0) {
        c.lapses += 1;
        c.reps = 0;
        c.ivl = 0;
        c.ease = Math.max(1.3, c.ease - 0.2);
        c.due = now + 10 * 60000;
    } else {
        if (grade === 1) {
            c.ease = Math.max(1.3, c.ease - 0.15);
            c.ivl = Math.max(1, Math.round(c.ivl * 1.2));
        } else if (grade === 2) {
            c.ivl = c.reps === 0 ? 1 : c.reps === 1 ? 3 : Math.max(c.ivl + 1, Math.round(c.ivl * c.ease));
        } else {
            c.ease += 0.15;
            c.ivl = c.reps === 0 ? 4 : Math.max(c.ivl + 2, Math.round(c.ivl * c.ease * 1.3));
        }
        c.reps += 1;
        c.due = now + c.ivl * DAY;
    }
    c.last = now;
    c.status = c.ivl >= 21 ? 'mature' : 'learning';
    return c;
}

export const isNew = (c) => !c.last;
export const isDue = (c, now = Date.now()) => c.status !== 'known' && c.last > 0 && c.due <= now;

/** Picks the cards for a session: due ones first (oldest due first), then new ones up to `newLimit`. */
export function buildQueue(cards, { now = Date.now(), newLimit = 10, max = 40 } = {}) {
    const due = cards.filter((c) => isDue(c, now)).sort((a, b) => a.due - b.due);
    const fresh = cards.filter((c) => c.status !== 'known' && isNew(c)).sort((a, b) => a.added - b.added).slice(0, newLimit);
    return [...due, ...fresh].slice(0, max);
}

export function intervalLabel(c) {
    if (!c.last) return 'новое';
    if (c.ivl < 1) return '<1 дн';
    if (c.ivl < 30) return c.ivl + ' дн';
    if (c.ivl < 365) return Math.round(c.ivl / 30) + ' мес';
    return (c.ivl / 365).toFixed(1) + ' г';
}

export function dayKey(ts = Date.now()) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Consecutive days (ending today or yesterday) with any activity. */
export function streak(days, now = Date.now()) {
    let n = 0;
    let t = now;
    if (!days[dayKey(t)]) t -= DAY;
    while (days[dayKey(t)]) { n++; t -= DAY; }
    return n;
}
