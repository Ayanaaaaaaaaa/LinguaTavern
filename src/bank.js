// Built-in sentence banks (data/sentences_en.json, data/sentences_zh.json). Optional: every user of this module copes with an empty bank.
import * as st from './st.js';
import { EN_LEVELS } from './levels.js';

let banks = null;

export async function loadBanks() {
    if (banks) return banks;
    const out = { en: {}, zh: {} };
    await Promise.all(['en', 'zh'].map(async (l) => {
        try {
            const r = await fetch(st.baseUrl + `sentences_${l}.json`);
            if (r.ok) out[l] = await r.json();
        } catch { /* optional */ }
    }));
    banks = out;
    return banks;
}

/** Bank key for a numeric level: CEFR letter for English, "1".."5" for Chinese. */
export const bankKey = (lang, level) => (lang === 'zh' ? String(Math.min(Math.max(level, 1), 5)) : EN_LEVELS[Math.min(Math.max(level, 1), 5) - 1]);

/** Plain sentence objects { t, tr, py?, trLang } of one level. */
export async function sentencesFor(lang, level) {
    const b = await loadBanks();
    const list = b[lang]?.[bankKey(lang, level)] || [];
    return list.map((x) => (lang === 'zh' ? { t: x[0], py: x[1], tr: x[2], trLang: 'en' } : { t: x[0], tr: x[1], trLang: 'native' }));
}

export const shuffle = (a) => {
    a = [...a];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
};
