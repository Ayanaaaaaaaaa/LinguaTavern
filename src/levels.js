// Word levels (CEFR for English, HSK for Chinese), lemmatising and text difficulty. Pure logic; data is injected or fetched.
import { tokenizeEn, segmentZh, splitSentences, normWord, hasCJK, isCJKChar, countUnits } from './text.js';

export const EN_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

let EN = null;   // { main: Map, approx: Map, forms: {} }
let ZH = null;   // { hsk: {}, chars: {}, std: 3 }
const infoCache = new Map();

const CONTRACTIONS = {
    'can\'t': 'can', 'won\'t': 'will', 'don\'t': 'do', 'doesn\'t': 'do', 'didn\'t': 'do', 'isn\'t': 'be', 'aren\'t': 'be',
    'wasn\'t': 'be', 'weren\'t': 'be', 'haven\'t': 'have', 'hasn\'t': 'have', 'hadn\'t': 'have', 'couldn\'t': 'could',
    'wouldn\'t': 'would', 'shouldn\'t': 'should', 'mustn\'t': 'must', 'needn\'t': 'need', 'ain\'t': 'be', 'shan\'t': 'shall',
    'i\'m': 'be', 'let\'s': 'let', 'y\'all': 'you', 'ma\'am': 'madam', 'o\'clock': 'clock',
};

export function setData({ en, forms, zh, chars } = {}) {
    infoCache.clear();
    if (en) {
        const main = new Map();
        const approx = new Map();
        EN_LEVELS.forEach((L, i) => { for (const w of (en[L] || '').split(' ')) if (w) main.set(w, i); });
        const ap = en['~'] || {};
        EN_LEVELS.forEach((L, i) => { for (const w of (ap[L] || '').split(' ')) if (w && !main.has(w)) approx.set(w, i); });
        EN = { main, approx, forms: forms || EN?.forms || {} };
    } else if (forms && EN) {
        EN.forms = forms;
    }
    if (zh) ZH = { hsk: zh, chars: chars || ZH?.chars || {}, std: ZH?.std || 3 };
    else if (chars && ZH) ZH.chars = chars;
}

export function setHskStandard(std) {
    infoCache.clear();
    if (ZH) ZH.std = std === 2 ? 2 : 3;
    else pendingStd = std === 2 ? 2 : 3;
}
let pendingStd = 3;

const loading = {};
async function fetchJson(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    return r.json();
}

/** Loads the data files for a target language (browser only). `baseUrl` points to the data directory. */
export async function loadData(lang, baseUrl) {
    if (lang === 'zh') {
        if (ZH) return;
        loading.zh ||= Promise.all([fetchJson(baseUrl + 'zh_hsk.json'), fetchJson(baseUrl + 'zh_chars.json').catch(() => ({}))])
            .then(([zh, chars]) => { setData({ zh, chars }); if (ZH) ZH.std = pendingStd; });
        return loading.zh;
    }
    if (EN) return;
    loading.en ||= Promise.all([fetchJson(baseUrl + 'en_cefr.json'), fetchJson(baseUrl + 'en_forms.json').catch(() => ({}))])
        .then(([en, forms]) => setData({ en, forms }));
    return loading.en;
}

export const isLoaded = (lang) => (lang === 'zh' ? !!ZH : !!EN);

// ------------------------------------------------------------------ English

function ruleCandidates(w) {
    const c = [];
    const n = w.length;
    const dbl = (b) => (b.length > 2 && b.at(-1) === b.at(-2) ? b.slice(0, -1) : null);
    if (n > 3 && w.endsWith('ies')) c.push(w.slice(0, -3) + 'y');
    if (n > 3 && w.endsWith('ied')) c.push(w.slice(0, -3) + 'y');
    if (n > 4 && w.endsWith('ier')) c.push(w.slice(0, -3) + 'y');
    if (n > 5 && w.endsWith('iest')) c.push(w.slice(0, -4) + 'y');
    if (n > 3 && w.endsWith('es')) { c.push(w.slice(0, -2)); c.push(w.slice(0, -1)); }
    else if (n > 2 && w.endsWith('s') && !w.endsWith('ss')) c.push(w.slice(0, -1));
    if (n > 4 && w.endsWith('ing')) { const b = w.slice(0, -3); c.push(b + 'e', b); const d = dbl(b); if (d) c.push(d); }
    if (n > 3 && w.endsWith('ed')) { const b = w.slice(0, -2); c.push(w.slice(0, -1), b); const d = dbl(b); if (d) c.push(d); }
    if (n > 3 && w.endsWith('er')) { const b = w.slice(0, -2); c.push(w.slice(0, -1), b); const d = dbl(b); if (d) c.push(d); }
    if (n > 4 && w.endsWith('est')) { const b = w.slice(0, -3); c.push(w.slice(0, -2), b); const d = dbl(b); if (d) c.push(d); }
    if (n > 4 && w.endsWith('ly')) {
        c.push(w.slice(0, -2));
        if (w.endsWith('ily')) c.push(w.slice(0, -3) + 'y');
        if (w.endsWith('ally')) c.push(w.slice(0, -4));
        c.push(w.slice(0, -1) + 'e');
    }
    return c;
}

function exact(w) {
    if (EN.main.has(w)) return { idx: EN.main.get(w), approx: false };
    if (EN.approx.has(w)) return { idx: EN.approx.get(w), approx: true };
    return null;
}

/** Looks up the base form and level of an English token. Returns null if the word is not in the lists. */
export function lookupEn(raw, { useForms = true } = {}) {
    if (!EN) return null;
    let w = normWord(raw);
    if (w.includes('\'')) {
        if (CONTRACTIONS[w]) w = CONTRACTIONS[w];
        else w = w.split('\'')[0];
    }
    if (!w) return null;
    if (useForms && EN.forms[w]) {
        const lem = EN.forms[w];
        const e = exact(lem);
        if (e) return { lemma: lem, ...e };
    }
    const own = exact(w);
    if (own) return { lemma: w, ...own };
    let best = null;
    for (const cand of ruleCandidates(w)) {
        const e = exact(cand);
        if (e && (!best || e.idx < best.idx || (e.idx === best.idx && best.approx && !e.approx))) best = { lemma: cand, ...e };
    }
    return best;
}

// ------------------------------------------------------------------ Chinese

export function zhLevelOf(entry) {
    if (!entry) return 0;
    const std = ZH?.std || 3;
    const own = entry[std === 2 ? 0 : 1];
    if (own) return own;
    return (entry[std === 2 ? 1 : 0]) ? 7 : 0;
}

export function lookupZh(word) {
    const e = ZH?.hsk[word];
    return e ? { word, level: zhLevelOf(e), pinyin: e[2], gloss: e[3] } : null;
}

export function pinyinOf(word) {
    const e = ZH?.hsk[word];
    if (e) return e[2];
    const parts = [];
    for (const ch of word) {
        if (isCJKChar(ch)) parts.push(ZH?.chars[ch] || '');
    }
    return parts.filter(Boolean).join(' ');
}

/** Splits an unknown multi-character segment into known HSK words (forward maximum matching). Returns [seg] if nothing helps. */
export function splitZhWord(seg, minLen = 4) {
    if (!ZH || seg.length < minLen || ZH.hsk[seg]) return [seg];
    const out = [];
    let i = 0;
    let multi = false;
    while (i < seg.length) {
        let j = Math.min(seg.length, i + 6);
        let found = null;
        for (; j > i + 1; j--) {
            if (ZH.hsk[seg.slice(i, j)]) { found = seg.slice(i, j); break; }
        }
        if (found) { out.push(found); i += found.length; multi = true; } else { out.push(seg[i]); i += 1; }
    }
    return multi ? out : [seg];
}

// ------------------------------------------------------------------ unified API

export function levelLabel(lang, n) {
    if (!n) return '—';
    if (lang === 'zh') return n >= 7 ? 'HSK 7–9' : 'HSK ' + n;
    return EN_LEVELS[Math.min(n, 6) - 1];
}

export function levelFromSetting(lang, value) {
    if (lang === 'zh') return Math.max(1, Math.min(7, parseInt(value, 10) || 3));
    const i = EN_LEVELS.indexOf(String(value).toUpperCase());
    return i < 0 ? 3 : i + 1;
}

/** { key, lemma, level (0 = not in list), approx, known, pinyin?, gloss? } */
export function wordInfo(lang, surface) {
    const cacheKey = `${lang}|${lang === 'zh' ? ZH?.std || pendingStd : ''}|${surface}`;
    if (infoCache.has(cacheKey)) return infoCache.get(cacheKey);
    let result;
    if (lang === 'zh') {
        const e = ZH?.hsk[surface];
        result = { lang, key: surface, lemma: surface, level: zhLevelOf(e), approx: false, known: !!e, pinyin: pinyinOf(surface), gloss: e ? e[3] : '' };
    } else {
        const r = lookupEn(surface);
        const key = r ? r.lemma : normWord(surface).split('\'')[0];
        result = { lang, key, lemma: key, level: r ? r.idx + 1 : 0, approx: !!r?.approx, known: !!r };
    }
    infoCache.set(cacheKey, result);
    if (infoCache.size > 10000) infoCache.delete(infoCache.keys().next().value);
    return result;
}

/** Rough CEFR/HSK rating of a text: { level, units, sentences, avgLen, above[], share, unknown }. */
export function analyzeText(text, lang, userLevel) {
    const sents = splitSentences(text, lang);
    const levels = [];
    const aboveMap = new Map();
    let unknown = 0;
    const consider = (surface, isStart) => {
        const info = wordInfo(lang, surface);
        if (!info.known) {
            const looksName = lang === 'en' && /^[A-Z]/.test(surface) && !isStart;
            if (!looksName && (lang === 'zh' || surface.length > 3)) unknown++;
            return;
        }
        levels.push(info.level || 1);
        if (info.level > userLevel && !aboveMap.has(info.key)) aboveMap.set(info.key, info.level);
    };
    if (lang === 'zh') {
        for (const s of segmentZh(text)) {
            if (!s.word) continue;
            const parts = ZH?.hsk[s.text] ? [s.text] : (() => {
                const p = splitZhWord(s.text, 2);
                return p.length === 1 && p[0].length > 1 ? [...p[0]] : p;
            })();
            for (const piece of parts) if (hasCJK(piece)) consider(piece, false);
        }
    } else {
        for (const t of tokenizeEn(text)) {
            const before = text.slice(0, t.index).trimEnd();
            consider(t.text, before === '' || /[.!?…]["'”’)]*$/.test(before));
        }
    }
    const units = countUnits(text, lang);
    const avgLen = sents.length ? units / sents.length : units;
    levels.sort((a, b) => a - b);
    const p = levels.length ? levels[Math.min(levels.length - 1, Math.floor(levels.length * 0.9))] : 1;
    let lenLevel;
    if (lang === 'zh') lenLevel = avgLen <= 7 ? 1 : avgLen <= 12 ? 2 : avgLen <= 18 ? 3 : avgLen <= 26 ? 4 : 5;
    else lenLevel = avgLen <= 7 ? 1 : avgLen <= 11 ? 2 : avgLen <= 16 ? 3 : avgLen <= 22 ? 4 : 5;
    const level = Math.max(p, Math.min(lenLevel, p + 1));
    const above = [...aboveMap.entries()].sort((a, b) => b[1] - a[1]).map(([w, l]) => ({ word: w, level: l }));
    const total = levels.length + unknown;
    const aboveCount = levels.filter((l) => l > userLevel).length + unknown;
    return { level, units, sentences: sents.length, avgLen, above, unknown, share: total ? aboveCount / total : 0 };
}

const levelWordCache = {};
/** All headwords of one level (CEFR A1..C2 = 1..6 / HSK 1..6, 7 = 7–9). */
export function wordsAtLevel(lang, n) {
    const key = lang + n + (lang === 'zh' ? ZH?.std : '');
    if (levelWordCache[key]) return levelWordCache[key];
    let out = [];
    if (lang === 'zh' && ZH) out = Object.keys(ZH.hsk).filter((w) => zhLevelOf(ZH.hsk[w]) === n);
    else if (EN) out = [...EN.main].filter(([, i]) => i === n - 1).map(([w]) => w);
    return (levelWordCache[key] = out);
}

/** Difficulty of a single sentence as a level number (max word level, ignoring unknowns). */
export function sentenceLevel(text, lang) {
    const a = analyzeText(text, lang, 99);
    return a.level;
}
