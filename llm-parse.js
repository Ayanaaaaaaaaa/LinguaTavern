// Robust extraction of a JSON value from LLM output. Pure.

function balancedSlice(s, start) {
    const open = s[start];
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < s.length; i++) {
        const ch = s[i];
        if (inStr) {
            if (esc) esc = false;
            else if (ch === '\\') esc = true;
            else if (ch === '"') inStr = false;
            continue;
        }
        if (ch === '"') inStr = true;
        else if (ch === open) depth++;
        else if (ch === close) { depth--; if (depth === 0) return s.slice(start, i + 1); }
    }
    return null;
}

function tryParse(s) {
    try { return JSON.parse(s); } catch { /* fall through */ }
    try { return JSON.parse(s.replace(/,\s*([}\]])/g, '$1')); } catch { return undefined; }
}

export function extractJson(text) {
    let s = String(text ?? '')
        .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '')
        .replace(/```(?:json)?/gi, '');
    for (let i = 0; i < s.length; i++) {
        if (s[i] !== '{' && s[i] !== '[') continue;
        const slice = balancedSlice(s, i);
        if (!slice) continue;
        const v = tryParse(slice);
        if (v !== undefined && typeof v === 'object') return v;
    }
    return null;
}
