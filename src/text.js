// Pure text helpers: tokenising, sentence splitting, markup stripping. No SillyTavern imports.

export const hasCJK = (s) => /[㐀-䶿一-鿿豈-﫿]/.test(s);
export const isCJKChar = (ch) => /[㐀-䶿一-鿿豈-﫿]/.test(ch);
export const RE_EN_WORD = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;

export function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
}

export function hashStr(s) {
    s = String(s ?? '');
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
    return (h >>> 0).toString(36);
}

export function normWord(w) {
    return String(w ?? '').toLowerCase().replace(/’/g, '\'');
}

/** Removes HTML/markdown/reasoning blocks so only readable text remains. */
export function stripMarkup(s) {
    return String(s ?? '')
        .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/[*_~`#>]+/g, '')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/** Latin word tokens with positions. */
export function tokenizeEn(text) {
    const out = [];
    const re = new RegExp(RE_EN_WORD.source, 'g');
    let m;
    while ((m = re.exec(text))) out.push({ text: m[0], index: m.index });
    return out;
}

let segmenter = null;
/** Chinese word segmentation using the browser's built-in ICU segmenter. */
export function segmentZh(text) {
    if (segmenter === null) {
        try { segmenter = (typeof Intl !== 'undefined' && Intl.Segmenter) ? new Intl.Segmenter('zh', { granularity: 'word' }) : false; } catch { segmenter = false; }
    }
    const out = [];
    if (segmenter) {
        for (const s of segmenter.segment(text)) out.push({ text: s.segment, index: s.index, word: hasCJK(s.segment) });
    } else {
        let i = 0;
        for (const ch of text) { out.push({ text: ch, index: i, word: isCJKChar(ch) }); i += ch.length; }
    }
    return out;
}

/** Word tokens (only real words) for either language. */
export function tokenize(text, lang) {
    if (lang === 'zh') return segmentZh(text).filter((s) => s.word).map(({ text: t, index }) => ({ text: t, index }));
    return tokenizeEn(text);
}

const ABBR = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'vs', 'etc', 'inc', 'ltd', 'no', 'eg', 'ie']);

/** Splits text into sentences: [{text, start, end}] */
export function splitSentences(text, lang = 'en') {
    const s = String(text ?? '');
    const res = [];
    const push = (a, b) => {
        const raw = s.slice(a, b);
        const t = raw.trim();
        if (!t) return;
        const lead = raw.length - raw.trimStart().length;
        res.push({ text: t, start: a + lead, end: a + lead + t.length });
    };
    const re = lang === 'zh' ? /[。！？!?…]+[”’」』)）"']*|\n+/g : /[.!?…]+["'”’)\]]*(?=\s|$)|\n+/g;
    let start = 0;
    let m;
    while ((m = re.exec(s))) {
        if (lang !== 'zh' && m[0][0] === '.' && /^\.+["'”’)\]]*$/.test(m[0])) {
            const before = s.slice(start, m.index);
            const last = (before.match(/([A-Za-z]+)$/) || [])[1] || '';
            if (ABBR.has(last.toLowerCase()) || /^[A-Z]$/.test(last)) continue;
        }
        const end = m.index + m[0].length;
        // dialogue tag: "Where are you?" she asked.
        if (lang !== 'zh' && /[?!…]/.test(m[0]) && /["'”’]/.test(m[0]) && /^\s*[a-z]/.test(s.slice(end, end + 4))) continue;
        push(start, end);
        start = end;
    }
    push(start, s.length);
    return res;
}

/** The sentence that contains character offset `index`. */
export function sentenceAt(text, index, lang = 'en') {
    const list = splitSentences(text, lang);
    for (const x of list) if (index >= x.start && index <= x.end) return x.text;
    return list.length ? list[list.length - 1].text : String(text ?? '').trim();
}

/** Counts words of a text (en: latin words, zh: CJK characters). */
export function countUnits(text, lang) {
    if (lang === 'zh') return (String(text).match(/[㐀-鿿豈-﫿]/g) || []).length;
    return tokenizeEn(String(text)).length;
}

export function capitalize(s) {
    s = String(s ?? '');
    return s.charAt(0).toUpperCase() + s.slice(1);
}
