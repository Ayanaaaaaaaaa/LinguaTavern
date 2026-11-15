// Translation (via SillyTavern's built-in server endpoints, no API key needed) and the free English dictionary.
import * as st from './st.js';
import * as S from './state.js';
import { translateLLM } from './llm.js';
import { splitSentences } from './text.js';

const cache = new Map();
const pending = new Map();
const MAX_CACHE = 500;

async function viaServer(provider, text, to) {
    const r = await fetch(`/api/translate/${provider}`, {
        method: 'POST',
        headers: st.headers(),
        body: JSON.stringify({ text, lang: to }),
    });
    if (!r.ok) throw new Error(`Переводчик «${provider}» недоступен (HTTP ${r.status}).`);
    return (await r.text()).trim();
}

async function one(text, to, provider) {
    if (provider === 'llm') return translateLLM(text, to);
    try {
        return await viaServer(provider, text, to);
    } catch (e) {
        if (provider !== 'google') {
            try { return await viaServer('google', text, to); } catch { /* fall through */ }
        }
        // last resort: the language model the user is connected to
        try { return await translateLLM(text, to); } catch { throw e; }
    }
}

/** Translates text (any length) into the native language. */
export async function translate(text, { to = S.get().native, provider = S.get().provider } = {}) {
    text = String(text ?? '').trim();
    if (!text) return '';
    const key = `${provider}|${to}|${text}`;
    if (cache.has(key)) return cache.get(key);
    if (pending.has(key)) return pending.get(key);
    const job = (async () => {
        let out;
        if (text.length <= 3500) {
            out = await one(text, to, provider);
        } else {
            const parts = [];
            let cur = '';
            for (const s of splitSentences(text, S.get().lang)) {
                if ((cur + ' ' + s.text).length > 3000 && cur) { parts.push(cur); cur = s.text; } else cur = cur ? cur + ' ' + s.text : s.text;
            }
            if (cur) parts.push(cur);
            out = (await Promise.all(parts.map((p) => one(p, to, provider)))).join(' ');
        }
        cache.set(key, out);
        if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
        return out;
    })();
    pending.set(key, job);
    try { return await job; } finally { pending.delete(key); }
}

const dictCache = new Map();

/** English dictionary entry: { ipa, audio, meanings: [{pos, def, example}] } or null. */
export async function dictionaryEn(word) {
    word = String(word).toLowerCase();
    if (dictCache.has(word)) return dictCache.get(word);
    let result = null;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 6000);
    try {
        const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, { signal: ctl.signal });
        if (r.ok) {
            const data = await r.json();
            const e = data?.[0];
            if (e) {
                const ph = (e.phonetics || []).find((p) => p.text && p.audio) || (e.phonetics || []).find((p) => p.text) || {};
                const audio = (e.phonetics || []).map((p) => p.audio).find(Boolean) || '';
                result = {
                    ipa: ph.text || e.phonetic || '',
                    audio,
                    meanings: (e.meanings || []).slice(0, 3).map((m) => ({
                        pos: m.partOfSpeech || '',
                        def: m.definitions?.[0]?.definition || '',
                        example: m.definitions?.find((d) => d.example)?.example || '',
                    })).filter((m) => m.def),
                };
            }
        }
    } catch { /* offline or blocked: popup works without it */ } finally { clearTimeout(timer); }
    dictCache.set(word, result);
    return result;
}
