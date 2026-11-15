// Settings, vocabulary and statistics. Stored in SillyTavern's extension_settings (synced with the server).
import * as st from './st.js';
import { newCardFields, dayKey } from './srs.js';
import { levelFromSetting } from './levels.js';

export const DEFAULTS = {
    enabled: true,
    lang: 'en',            // target language: 'en' | 'zh'
    native: 'ru',
    levelEn: 'B1',
    levelZh: 3,
    hskStd: 3,
    provider: 'google',    // translation: google | bing | llm
    highlight: 'above',    // off | above | levels | saved
    pinyin: 'unknown',     // off | unknown | all
    msgBar: 'all',         // off | last | all
    popupDefs: true,       // English definitions + IPA from the free dictionary
    autoSpeak: false,
    ttsRate: 0.9,
    voiceEn: '',
    voiceZh: '',
    voiceAutoSend: false,
    tutorLevel: true,
    tutorFollowUp: false,
    tutorRecast: false,
    coachAuto: false,
    dailyGoal: 10,
    vocab: {},
    known: {},
    phrases: [],
    stats: { days: {}, mistakes: {}, speaking: [] },
    version: 1,
};

// SillyTavern can replace extension_settings.lingua_tavern with a new object (it does so when it re-reads the
// settings from the server). Holding on to the object seen at init() would then write into a stale copy
// that is never saved, so S always resolves the live settings object and fills in any missing defaults on it.
let seen = null;
function applyDefaults(r) {
    for (const [k, v] of Object.entries(DEFAULTS)) {
        if (r[k] === undefined) r[k] = structuredClone(v);
    }
    r.stats ||= { days: {}, mistakes: {}, speaking: [] };
    r.stats.days ||= {};
    r.stats.mistakes ||= {};
    r.stats.speaking ||= [];
}
function live() {
    const r = st.root();
    if (r !== seen) { seen = r; applyDefaults(r); }
    return r;
}
const S = new Proxy({}, {
    get: (_, k) => live()[k],
    set: (_, k, v) => { live()[k] = v; return true; },
    deleteProperty: (_, k) => delete live()[k],
    has: (_, k) => k in live(),
    ownKeys: () => Reflect.ownKeys(live()),
    getOwnPropertyDescriptor: (_, k) => {
        const d = Reflect.getOwnPropertyDescriptor(live(), k);
        if (d) d.configurable = true;
        return d;
    },
});

export function init() {
    live();
    return S;
}

export const get = () => S;
export const save = () => st.saveSettings();
export const lang = () => S.lang;
export const levelSetting = () => (S.lang === 'zh' ? S.levelZh : S.levelEn);
export const userLevel = () => levelFromSetting(S.lang, levelSetting());
export const nativeName = () => ({ ru: 'Russian', en: 'English', uk: 'Ukrainian', kk: 'Kazakh' }[S.native] || 'Russian');

// ------------------------------------------------------------------ vocabulary

export const vkey = (lang, w) => `${lang}:${w}`;
export const getWord = (lang, w) => S.vocab[vkey(lang, w)];
export const isKnown = (lang, w) => !!S.known[vkey(lang, w)] || S.vocab[vkey(lang, w)]?.status === 'known';

export function saveWord(entry) {
    const k = vkey(entry.lang, entry.w);
    const old = S.vocab[k];
    const clean = Object.fromEntries(Object.entries(entry).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    S.vocab[k] = old ? { ...old, ...clean } : { ...newCardFields(), added: Date.now(), ...clean };
    if (!old) bump('added');
    save();
    return S.vocab[k];
}

export function removeWord(lang, w) {
    delete S.vocab[vkey(lang, w)];
    save();
}

export function setKnown(lang, w, known) {
    const k = vkey(lang, w);
    if (known) S.known[k] = 1; else delete S.known[k];
    if (S.vocab[k]) S.vocab[k].status = known ? 'known' : (S.vocab[k].ivl >= 21 ? 'mature' : 'learning');
    save();
}

export const vocabList = (lang = S.lang) => Object.values(S.vocab).filter((e) => e.lang === lang);

// ------------------------------------------------------------------ statistics

export function today() {
    const k = dayKey();
    S.stats.days[k] ||= { added: 0, reviewed: 0, written: 0, spoken: 0, checked: 0 };
    return S.stats.days[k];
}

export function bump(kind, n = 1) {
    const d = today();
    d[kind] = (d[kind] || 0) + n;
    const keys = Object.keys(S.stats.days).sort();
    while (keys.length > 200) delete S.stats.days[keys.shift()];
    save();
}

export function logMistakes(errors) {
    for (const e of errors || []) {
        const cat = String(e.cat || 'other').toLowerCase();
        S.stats.mistakes[cat] = (S.stats.mistakes[cat] || 0) + 1;
    }
    save();
}

export function logSpeaking(score, kind = 'shadow') {
    S.stats.speaking.push({ t: Date.now(), score: Math.round(score), kind });
    if (S.stats.speaking.length > 300) S.stats.speaking.splice(0, S.stats.speaking.length - 300);
    bump('spoken');
}

/** Logs a free spoken/typed answer: how many words and how many mistakes the tutor found. */
export function logAnswer(words, errors) {
    S.stats.speaking.push({ t: Date.now(), kind: 'answer', words, errors });
    if (S.stats.speaking.length > 300) S.stats.speaking.splice(0, S.stats.speaking.length - 300);
    bump('spoken');
}

export function exportData() {
    return JSON.stringify({ app: 'lingua-tavern', version: 1, vocab: S.vocab, known: S.known, phrases: S.phrases, stats: S.stats }, null, 1);
}

export function importData(text) {
    const d = JSON.parse(text);
    if (d.app !== 'lingua-tavern') throw new Error('Это не файл резервной копии Lingua Tavern');
    let added = 0;
    for (const [k, v] of Object.entries(d.vocab || {})) {
        if (!S.vocab[k]) { S.vocab[k] = v; added++; }
    }
    Object.assign(S.known, d.known || {});
    for (const p of d.phrases || []) if (!S.phrases.some((x) => x.t === p.t)) S.phrases.push(p);
    for (const [k, v] of Object.entries(d.stats?.mistakes || {})) S.stats.mistakes[k] = Math.max(S.stats.mistakes[k] || 0, v);
    for (const [k, v] of Object.entries(d.stats?.days || {})) if (!S.stats.days[k]) S.stats.days[k] = v;
    save();
    return added;
}

export function toCsv(list) {
    const q = (s) => `"${String(s ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
    return list.map((e) => [e.w, e.pinyin || e.ipa || '', e.tr || '', e.ctx || '', e.lvl || ''].map(q).join(';')).join('\n');
}
