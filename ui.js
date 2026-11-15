// Small DOM helpers shared by all UI modules.
import { escapeHtml } from './text.js';
import { levelLabel } from './levels.js';

export const esc = escapeHtml;
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
}

export const spinner = (text = 'Думаю…') => `<div class="lt-loading"><span class="lt-spin"></span>${esc(text)}</div>`;

export function levelChip(lang, n, approx = false) {
    if (!n) return '<span class="lt-lvl lt-l0">вне списка</span>';
    return `<span class="lt-lvl lt-l${Math.min(n, 6)}">${approx ? '≈' : ''}${esc(levelLabel(lang, n))}</span>`;
}

/** Centered modal sheet. Returns { root, body, close, set(html) }. */
/**
 * Elements shown in the browser's top layer ignore ancestors' transforms. SillyTavern puts `transform: translateZ(0)` on <html>,
 * which on phones turns `position: fixed` into "relative to a zero-height box" and pushes overlays off screen.
 * Browsers without the Popover API simply keep a normal fixed element.
 */
export function topShow(node) {
    try { if (typeof node.showPopover === 'function' && !node.matches(':popover-open')) node.showPopover(); } catch { /* plain fixed element */ }
}
export function topHide(node) {
    try { if (typeof node.hidePopover === 'function' && node.matches(':popover-open')) node.hidePopover(); } catch { /* ignore */ }
}

/** A modal window (native <dialog>, so it lives in the top layer like SillyTavern's own popups). */
export function sheet({ title = '', cls = '', onClose } = {}) {
    const wrap = el(`<dialog class="lt-sheet-wrap ${cls}">
        <div class="lt-sheet">
            <div class="lt-sheet-head"><span class="lt-sheet-title">${esc(title)}</span><button class="lt-x" data-a="close" aria-label="Закрыть"><i class="fa-solid fa-xmark"></i></button></div>
            <div class="lt-sheet-body"></div>
        </div></dialog>`);
    const body = $('.lt-sheet-body', wrap);
    let closed = false;
    const api = {
        root: wrap,
        body,
        set: (html) => { body.innerHTML = html; },
        close: () => {
            if (closed) return;
            closed = true;
            try { if (typeof wrap.close === 'function' && wrap.open) wrap.close(); } catch { /* ignore */ }
            wrap.remove();
            onClose?.();
        },
    };
    wrap.addEventListener('click', (e) => {
        if (e.target === wrap || e.target.closest('[data-a="close"]')) api.close();
    });
    wrap.addEventListener('cancel', (e) => { e.preventDefault(); api.close(); });   // Esc
    document.body.appendChild(wrap);
    if (typeof wrap.showModal === 'function') {
        try { wrap.showModal(); } catch { wrap.setAttribute('open', ''); }
    } else {
        wrap.setAttribute('open', '');
    }
    return api;
}

export function download(name, text, type = 'text/plain') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export function debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function emit(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail }));
}
