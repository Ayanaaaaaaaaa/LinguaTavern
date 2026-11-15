// The main window: tabs for learning words, cards, dictionary, writing, speaking and progress.
import * as speech from './speech.js';
import { sheet, $, $$ } from './ui.js';
import * as learn from './tab-learn.js';
import * as cards from './tab-cards.js';
import * as dict from './tab-dict.js';
import * as write from './tab-write.js';
import * as speak from './tab-speak.js';
import * as stats from './tab-stats.js';

export const TABS = [
    { id: 'learn', name: 'Учить', icon: 'fa-seedling', mod: learn },
    { id: 'cards', name: 'Карточки', icon: 'fa-clone', mod: cards },
    { id: 'dict', name: 'Словарь', icon: 'fa-book', mod: dict },
    { id: 'write', name: 'Письмо', icon: 'fa-pen-to-square', mod: write },
    { id: 'speak', name: 'Речь', icon: 'fa-microphone', mod: speak },
    { id: 'stats', name: 'Прогресс', icon: 'fa-chart-line', mod: stats },
];

let win = null;
let cleanup = null;
let current = null;

function runCleanup() {
    try { cleanup?.(); } catch { /* ignore */ }
    cleanup = null;
}

export function select(id, opts = {}) {
    if (!win) return;
    const tab = TABS.find((t) => t.id === id) || TABS[0];
    runCleanup();
    current = tab.id;
    $$('.lt-tab', win.root).forEach((b) => b.classList.toggle('on', b.dataset.tab === tab.id));
    const old = $('[data-r="tab"]', win.root);
    const box = document.createElement('div');       // fresh element: drops every listener of the previous tab
    box.dataset.r = 'tab';
    box.className = 'lt-tabbody';
    old.replaceWith(box);
    const r = tab.mod.mount(box, { ...opts, go: select });
    if (typeof r === 'function') cleanup = r;
    else if (r && typeof r.then === 'function') r.then((fn) => { if (typeof fn === 'function' && current === tab.id && box.isConnected) cleanup = fn; }).catch(() => { });
    box.scrollTop = 0;
}

export function openHub(tab = 'learn', opts = {}) {
    if (win && win.root.isConnected) {
        select(tab, opts);
        return;
    }
    win = sheet({
        title: 'Lingua Tavern',
        cls: 'lt-hub',
        onClose: () => { runCleanup(); speech.stop(); win = null; current = null; },
    });
    win.body.innerHTML = `<div class="lt-tabs" role="tablist">${TABS.map((t) => `<button class="lt-tab" role="tab" data-tab="${t.id}"><i class="fa-solid ${t.icon}"></i><span>${t.name}</span></button>`).join('')}</div><div data-r="tab" class="lt-tabbody"></div>`;
    win.body.addEventListener('click', (e) => {
        const b = e.target.closest('.lt-tab');
        if (b) select(b.dataset.tab);
    });
    select(tab, opts);
}

export const isOpen = () => !!(win && win.root.isConnected);

export function init() {
    document.addEventListener('lt:open-hub', (e) => openHub(e.detail?.tab || 'learn', e.detail || {}));
    document.addEventListener('lt:check', (e) => openHub('write', { mode: 'check', text: e.detail?.text || '' }));
}
