// Text comparison utilities: pronunciation scoring by alignment, word diffs for corrections, similarity.
import { escapeHtml, isCJKChar } from './text.js';

export function lev(a, b) {
    const m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
        const cur = [i];
        for (let j = 1; j <= n; j++) {
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        prev = cur;
    }
    return prev[n];
}

export function similarity(a, b) {
    a = String(a ?? ''); b = String(b ?? '');
    const L = Math.max(a.length, b.length);
    return L ? 1 - lev(a, b) / L : 1;
}

/** Tokens used to compare spoken and expected text. */
export function compareTokens(text, lang) {
    const s = String(text ?? '').toLowerCase().replace(/’/g, '\'');
    if (lang === 'zh') return [...s].filter(isCJKChar);
    return (s.match(/[a-z0-9]+(?:'[a-z]+)?/g) || []).map((w) => w.replace(/'s$/, ''));
}

const near = (x, y) => x !== y && Math.max(x.length, y.length) >= 4 && similarity(x, y) >= 0.75;

/**
 * Aligns spoken tokens against target tokens.
 * Returns { score 0..100, tokens: [{t, status: ok|near|wrong|miss, said?}], extra: [..] }
 */
export function scoreSpeech(target, spoken, lang = 'en') {
    const A = compareTokens(target, lang);
    const B = compareTokens(spoken, lang);
    const m = A.length, n = B.length;
    if (!m) return { score: 0, tokens: [], extra: B };
    const cost = (x, y) => (x === y ? 0 : (lang !== 'zh' && near(x, y) ? 0.4 : 1));
    const D = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) D[i][0] = i;
    for (let j = 1; j <= n; j++) D[0][j] = j * 0.8;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            D[i][j] = Math.min(D[i - 1][j] + 1, D[i][j - 1] + 0.8, D[i - 1][j - 1] + cost(A[i - 1], B[j - 1]));
        }
    }
    const tokens = new Array(m);
    const extra = [];
    let i = m, j = n;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && Math.abs(D[i][j] - (D[i - 1][j - 1] + cost(A[i - 1], B[j - 1]))) < 1e-9) {
            const c = cost(A[i - 1], B[j - 1]);
            tokens[i - 1] = c === 0 ? { t: A[i - 1], status: 'ok' } : c < 1 ? { t: A[i - 1], status: 'near', said: B[j - 1] } : { t: A[i - 1], status: 'wrong', said: B[j - 1] };
            i--; j--;
        } else if (i > 0 && Math.abs(D[i][j] - (D[i - 1][j] + 1)) < 1e-9) {
            tokens[i - 1] = { t: A[i - 1], status: 'miss' };
            i--;
        } else {
            extra.unshift(B[j - 1]);
            j--;
        }
    }
    const ok = tokens.filter((x) => x.status === 'ok').length;
    const nr = tokens.filter((x) => x.status === 'near').length;
    const score = Math.max(0, Math.round(100 * (ok + 0.6 * nr) / (m + 0.5 * extra.length)));
    return { score, tokens, extra };
}

/** Keeps the original (cased) words of `target` in the scoring result for display. */
export function scoreSpeechDisplay(target, spoken, lang = 'en') {
    const res = scoreSpeech(target, spoken, lang);
    if (lang === 'zh') {
        const chars = [...String(target)].filter(isCJKChar);
        res.tokens.forEach((t, i) => { t.show = chars[i] || t.t; });
    } else {
        const words = String(target).replace(/’/g, '\'').match(/[A-Za-z0-9]+(?:'[A-Za-z]+)?/g) || [];
        res.tokens.forEach((t, i) => { t.show = words[i] || t.t; });
    }
    return res;
}

const DIFF_TOKEN = /[\p{L}\p{N}'’-]+|[^\p{L}\p{N}\s]|\s+/gu;

/** Word-level diff between original and corrected text → ops [{op: eq|del|ins, text}] */
export function diffWords(a, b) {
    const A = String(a ?? '').match(DIFF_TOKEN) || [];
    const B = String(b ?? '').match(DIFF_TOKEN) || [];
    const m = A.length, n = B.length;
    const L = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = m - 1; i >= 0; i--) {
        for (let j = n - 1; j >= 0; j--) {
            L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
        }
    }
    const ops = [];
    let i = 0, j = 0;
    const push = (op, text) => {
        const last = ops[ops.length - 1];
        if (last && last.op === op) last.text += text; else ops.push({ op, text });
    };
    while (i < m && j < n) {
        if (A[i] === B[j]) { push('eq', A[i]); i++; j++; }
        else if (L[i + 1][j] >= L[i][j + 1]) { push('del', A[i]); i++; }
        else { push('ins', B[j]); j++; }
    }
    while (i < m) push('del', A[i++]);
    while (j < n) push('ins', B[j++]);
    return ops;
}

export function diffHtml(a, b) {
    return diffWords(a, b).map((o) => {
        const t = escapeHtml(o.text);
        if (o.op === 'del') return /^\s+$/.test(o.text) ? '' : `<del class="lt-del">${t}</del>`;
        if (o.op === 'ins') return /^\s+$/.test(o.text) ? t : `<ins class="lt-ins">${t}</ins>`;
        return t;
    }).join('');
}

/** Case/punctuation-insensitive equality for typed answers. */
export function sameAnswer(a, b) {
    const n = (s) => String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
    return n(a) === n(b);
}
