// "Словарь" tab: saved words and phrases, search, export/import.
import * as S from './state.js';
import * as speech from './speech.js';
import { $, $$, esc, el, levelChip, download, debounce } from './ui.js';
import { intervalLabel } from './srs.js';

const PAGE = 60;

export function mount(box) {
    const lang = S.get().lang;
    let q = '', filter = 'all', sort = 'new', shown = PAGE;
    box.innerHTML = `
        <div class="lt-toolbar">
            <input class="lt-input" data-r="q" placeholder="Поиск по слову или переводу…" type="search">
            <select class="lt-select" data-r="filter"><option value="all">Все</option><option value="learning">Учу</option><option value="mature">Выучено</option><option value="known">Знаю</option><option value="phrases">Фразы</option></select>
            <select class="lt-select" data-r="sort"><option value="new">Новые сверху</option><option value="alpha">По алфавиту</option><option value="lvl">По уровню</option><option value="due">По повторению</option></select>
        </div>
        <div class="lt-count" data-r="count"></div>
        <div class="lt-list" data-r="list"></div>
        <div class="lt-row lt-wrap">
            <button class="lt-pbtn" data-a="csv"><i class="fa-solid fa-file-csv"></i> CSV (Anki)</button>
            <button class="lt-pbtn" data-a="backup"><i class="fa-solid fa-download"></i> Резервная копия</button>
            <button class="lt-pbtn" data-a="import"><i class="fa-solid fa-upload"></i> Импорт</button>
            <input type="file" accept=".json,application/json" hidden data-r="file">
        </div>`;
    const list = $('[data-r="list"]', box);

    const items = () => {
        if (filter === 'phrases') {
            return S.get().phrases.filter((p) => p.lang === lang).map((p) => ({ phrase: true, w: p.t, tr: p.tr, added: p.added }));
        }
        let a = S.vocabList(lang).filter((e) => !e.phrase || true);
        if (filter === 'known') a = a.filter((e) => S.isKnown(lang, e.w));
        else if (filter === 'learning') a = a.filter((e) => !S.isKnown(lang, e.w) && e.status !== 'mature');
        else if (filter === 'mature') a = a.filter((e) => e.status === 'mature' && !S.isKnown(lang, e.w));
        if (q) { const s = q.toLowerCase(); a = a.filter((e) => (e.w + ' ' + (e.f || '') + ' ' + (e.tr || '')).toLowerCase().includes(s)); }
        const cmp = {
            new: (x, y) => (y.added || 0) - (x.added || 0),
            alpha: (x, y) => x.w.localeCompare(y.w),
            lvl: (x, y) => (y.lvl || 0) - (x.lvl || 0),
            due: (x, y) => (x.due || 0) - (y.due || 0),
        }[sort];
        return a.sort(cmp);
    };

    const draw = () => {
        const a = items();
        $('[data-r="count"]', box).textContent = a.length ? `${a.length} ${filter === 'phrases' ? 'фраз' : 'слов'}` : '';
        if (!a.length) {
            list.innerHTML = `<div class="lt-empty">${filter === 'phrases' ? 'Сохранённых фраз пока нет. Выделите фразу в чате и нажмите «Перевести», затем «В словарь».' : 'Здесь пока пусто. Нажмите на любое слово в сообщении чата — и добавьте его в словарь звёздочкой.'}</div>`;
            return;
        }
        list.innerHTML = a.slice(0, shown).map((e) => {
            if (e.phrase) return `<div class="lt-item" data-w="${esc(e.w)}" data-ph="1"><div class="lt-item-main"><b>${esc(e.w)}</b><div class="lt-item-tr">${esc(e.tr || '')}</div></div><div class="lt-item-act"><button class="lt-x" data-a="say" title="Произнести"><i class="fa-solid fa-volume-high"></i></button><button class="lt-x" data-a="del" title="Удалить"><i class="fa-solid fa-trash"></i></button></div></div>`;
            const known = S.isKnown(lang, e.w);
            const sub = lang === 'zh' ? e.pinyin : e.ipa;
            return `<div class="lt-item ${known ? 'lt-dim' : ''}" data-w="${esc(e.w)}">
                <div class="lt-item-main"><div><b>${esc(e.f && lang === 'en' && e.f.toLowerCase() !== e.w ? `${e.w}` : e.w)}</b> ${sub ? `<span class="lt-pop-ipa">${esc(sub)}</span>` : ''} ${levelChip(lang, e.lvl, e.approx)} <span class="lt-due">${known ? 'знаю' : esc(intervalLabel(e))}</span></div>
                <div class="lt-item-tr">${esc(e.tr || '')}</div>
                ${e.ctx ? `<div class="lt-item-ctx">${esc(e.ctx)}</div>` : ''}</div>
                <div class="lt-item-act"><button class="lt-x" data-a="say" title="Произнести"><i class="fa-solid fa-volume-high"></i></button><button class="lt-x ${known ? 'on' : ''}" data-a="known" title="Знаю / учить"><i class="fa-solid fa-check"></i></button><button class="lt-x" data-a="del" title="Удалить"><i class="fa-solid fa-trash"></i></button></div></div>`;
        }).join('') + (a.length > shown ? '<button class="lt-pbtn lt-more" data-a="more">Показать ещё</button>' : '');
    };

    box.addEventListener('input', debounce((e) => {
        const r = e.target.dataset.r;
        if (r === 'q') q = e.target.value.trim();
        if (r === 'filter') filter = e.target.value;
        if (r === 'sort') sort = e.target.value;
        shown = PAGE;
        draw();
    }, 150));

    box.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-a]');
        if (!b) return;
        const a = b.dataset.a;
        const row = b.closest('.lt-item');
        const w = row?.dataset.w;
        if (a === 'more') { shown += PAGE; return draw(); }
        if (a === 'say') return void speech.speak(w, { lang });
        if (a === 'known') { S.setKnown(lang, w, !S.isKnown(lang, w)); return draw(); }
        if (a === 'del') {
            if (row.dataset.ph) { const s = S.get(); s.phrases = s.phrases.filter((p) => !(p.t === w && p.lang === lang)); S.save(); } else S.removeWord(lang, w);
            return draw();
        }
        if (a === 'csv') {
            const rows = S.vocabList(lang);
            if (!rows.length) return;
            download(`lingua-tavern-${lang}.csv`, '﻿' + S.toCsv(rows), 'text/csv');
        }
        if (a === 'backup') download('lingua-tavern-backup.json', S.exportData(), 'application/json');
        if (a === 'import') $('[data-r="file"]', box).click();
    });

    $('[data-r="file"]', box).addEventListener('change', async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        try {
            const n = S.importData(await f.text());
            draw();
            $('[data-r="count"]', box).textContent = `Импортировано новых слов: ${n}`;
        } catch (err) {
            $('[data-r="count"]', box).textContent = 'Ошибка импорта: ' + err.message;
        }
        e.target.value = '';
    });

    draw();
}
