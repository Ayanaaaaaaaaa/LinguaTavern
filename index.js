// Lingua Tavern — loader.
//
// SillyTavern greys an extension out ("Cannot enable extension") when its entry script or stylesheet fails to load,
// and says nothing about why. This entry file has no static imports, so it always loads; the real code lives in
// src/main.js. If anything goes wrong, the reason is shown on screen together with the list of missing files.

const VERSION = '1.0.1';
const BASE = new URL('./', import.meta.url);

// Every file the extension needs (a test keeps this list in sync with the folder).
export const FILES = [
    'manifest.json', 'style.css',
    'src/main.js', 'src/bank.js', 'src/content.js', 'src/diff.js', 'src/hub.js', 'src/levels.js', 'src/llm-parse.js',
    'src/llm.js', 'src/mic.js', 'src/speech.js', 'src/srs.js', 'src/st.js', 'src/state.js', 'src/tab-cards.js',
    'src/tab-dict.js', 'src/tab-learn.js', 'src/tab-speak.js', 'src/tab-stats.js', 'src/tab-write.js', 'src/text.js',
    'src/translate.js', 'src/tutor.js', 'src/ui.js', 'src/wordtap.js',
    'data/en_cefr.json', 'data/en_forms.json', 'data/sentences_en.json', 'data/sentences_zh.json',
    'data/zh_chars.json', 'data/zh_hsk.json',
];

const esc = (s) => String(s).replace(/[&<>\"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// The stylesheet is added here (not through manifest.json) so that a problem with it can never block activation.
function addStyle() {
    try {
        if (document.getElementById('lingua-tavern-css')) return;
        const link = document.createElement('link');
        link.id = 'lingua-tavern-css';
        link.rel = 'stylesheet';
        link.href = new URL('style.css', BASE).href;
        document.head.appendChild(link);
    } catch (e) { console.warn('[Lingua Tavern] stylesheet not added', e); }
}

async function missingFiles() {
    const missing = [];
    await Promise.all(FILES.map(async (f) => {
        try {
            const r = await fetch(new URL(f, BASE), { cache: 'no-store' });
            if (!r.ok) missing.push(`${f} (${r.status})`);
        } catch { missing.push(`${f} (нет ответа)`); }
    }));
    return missing.sort();
}

function report(err, missing) {
    const head = `Lingua Tavern ${VERSION}: не удалось загрузить расширение`;
    const lines = [String(err?.message || err)];
    if (missing.length) lines.push('Не найдены файлы: ' + missing.join(', ') + '. Скопируйте папку целиком (вместе с src и data).');
    else lines.push('Все файлы на месте. Обновите страницу с очисткой кэша; если не помогло — браузер, скорее всего, слишком старый.');
    console.error('[Lingua Tavern]', err, missing);
    try {
        window.toastr?.error(lines.map(esc).join('<br>'), head, { timeOut: 0, extendedTimeOut: 0, closeButton: true, tapToDismiss: false, escapeHtml: false });
    } catch { /* ignore */ }
    const mount = () => {
        const host = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
        if (!host) return false;
        if (!document.getElementById('lt_load_error')) {
            const box = document.createElement('div');
            box.id = 'lt_load_error';
            box.style.cssText = 'margin:8px 0;padding:10px;border:1px solid #c44;border-radius:6px;white-space:pre-wrap;word-break:break-word;font-size:.9em';
            box.textContent = head + '\n' + lines.join('\n');
            host.prepend(box);
        }
        return true;
    };
    if (!mount()) setTimeout(mount, 3000);
}

addStyle();

export const ready = import('./src/main.js')
    .then(() => console.info(`[Lingua Tavern] ${VERSION} loaded`))
    .catch(async (e) => report(e, await missingFiles()));
