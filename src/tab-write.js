// "Письмо" tab: text check with corrections, "how do I say it", writing tasks, drills on the learner's own typical mistakes.
import * as S from './state.js';
import * as st from './st.js';
import * as speech from './speech.js';
import * as llm from './llm.js';
import { CATS, CAT_RU } from './llm.js';
import { diffHtml } from './diff.js';
import { countUnits } from './text.js';
import { shuffle } from './bank.js';
import { WRITING_TOPICS } from './content.js';
import { $, esc, spinner, emit, copy } from './ui.js';

const STYLE_RU = { simple: 'Просто', natural: 'Естественно', advanced: 'Продвинуто' };
const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

export const catName = (c) => CAT_RU[c] || c;

/** Shared renderer of a writing check result. */
export function checkHtml(res, original, lang) {
    const same = res.corrected.trim() === original.trim();
    const errs = res.errors.map((e) => `<div class="lt-err"><span class="lt-cat">${esc(catName(e.cat))}</span>
        <del class="lt-del">${esc(e.wrong)}</del> → <ins class="lt-ins">${esc(e.right)}</ins>${e.why ? `<div class="lt-why">${esc(e.why)}</div>` : ''}</div>`).join('');
    return `<div class="lt-score" title="Оценка текста">${stars(res.score)}</div>
        ${res.praise ? `<div class="lt-praise">👍 ${esc(res.praise)}</div>` : ''}
        <div class="lt-label">${same ? 'Ошибок не найдено' : 'Исправленный текст'}</div>
        <div class="lt-diffbox" lang="${lang}">${diffHtml(original, res.corrected)}</div>
        ${errs ? `<div class="lt-label">Что исправлено</div>${errs}` : ''}
        ${res.natural && res.natural.trim() !== res.corrected.trim() ? `<div class="lt-label">Как сказал бы носитель</div><div class="lt-natural" lang="${lang}">${esc(res.natural)}</div>` : ''}
        ${res.tip ? `<div class="lt-note">💡 ${esc(res.tip)}</div>` : ''}
        <div class="lt-pop-actions">
            <button class="lt-pbtn" data-a="r-say" data-t="${esc(res.natural || res.corrected)}"><i class="fa-solid fa-volume-high"></i> Послушать</button>
            <button class="lt-pbtn" data-a="r-shadow" data-t="${esc(res.natural || res.corrected)}"><i class="fa-solid fa-microphone"></i> Повторить вслух</button>
            <button class="lt-pbtn" data-a="r-chat" data-t="${esc(res.corrected)}"><i class="fa-solid fa-paper-plane"></i> В чат</button>
            <button class="lt-pbtn" data-a="r-save" data-t="${esc(res.corrected)}"><i class="fa-solid fa-star"></i> В фразы</button>
        </div>`;
}

/** Handles the buttons produced by checkHtml / how-to-say. Returns true if handled. */
export function handleResultAction(b, lang) {
    const a = b.dataset.a;
    const t = b.dataset.t || '';
    if (a === 'r-say') { speech.speak(t, { lang }); return true; }
    if (a === 'r-shadow') { emit('lt:open-hub', { tab: 'speak', mode: 'shadow', items: [t] }); return true; }
    if (a === 'r-chat') { st.appendInput(t); st.toast('success', 'Текст добавлен в поле ввода.'); return true; }
    if (a === 'r-save') {
        const ph = S.get().phrases;
        if (!ph.some((p) => p.t === t && p.lang === lang)) ph.push({ t, tr: '', lang, added: Date.now() });
        S.save();
        b.classList.add('on');
        return true;
    }
    return false;
}

export function mount(box, opts = {}) {
    const lang = S.get().lang;
    let mode = opts.mode || 'check';
    let draft = opts.text || '';
    let busy = 0;                       // token: ignore results of superseded requests
    let task = null;
    let drill = null;

    const units = (t) => countUnits(t, lang);
    const unitName = lang === 'zh' ? 'иер.' : 'слов';
    const tabs = [['check', 'Проверка'], ['say', 'Как сказать'], ['task', 'Задание'], ['drill', 'Ошибки']];
    const seg = () => `<div class="lt-seg">${tabs.map(([m, n]) => `<button class="${mode === m ? 'on' : ''}" data-a="mode" data-m="${m}">${n}</button>`).join('')}</div>`;

    function frame() {
        busy++;
        box.innerHTML = seg() + '<div data-r="body"></div>';
        ({ check: drawCheck, say: drawSay, task: drawTask, drill: drawDrill })[mode]();
    }
    const body = () => $('[data-r="body"]', box);
    const ta = () => $('[data-r="ta"]', box);

    // ---------------------------------------------------------------- check
    function drawCheck() {
        body().innerHTML = `<div class="lt-hint">Напишите несколько предложений, как умеете. Я исправлю ошибки минимальными правками и объясню правило.</div>
            <textarea class="lt-textarea" data-r="ta" rows="6" lang="${lang}" placeholder="${lang === 'zh' ? '用中文写几句话……' : 'Write a few sentences…'}">${esc(draft)}</textarea>
            <div class="lt-row"><span class="lt-count" data-r="wc"></span><span class="lt-grow"></span>
            <button class="lt-pbtn lt-primary" data-a="check"><i class="fa-solid fa-spell-check"></i> Проверить</button></div>
            <div data-r="res"></div>`;
        count();
    }

    function count() {
        const el = $('[data-r="wc"]', box);
        if (el && ta()) el.textContent = `${units(ta().value)} ${unitName}`;
    }

    async function runCheck(text, target, after) {
        const my = ++busy;
        target.innerHTML = spinner('Проверяю…');
        try {
            const r = await llm.checkWriting(text);
            if (my !== busy || !target.isConnected) return;
            S.logMistakes(r.errors);
            S.bump('written');
            S.bump('checked');
            target.innerHTML = checkHtml(r, text, lang);
            after?.(r);
        } catch (e) {
            if (my === busy && target.isConnected) target.innerHTML = `<div class="lt-pop-err">${esc(e.message || String(e))}</div>`;
        }
    }

    // ---------------------------------------------------------------- how to say
    function drawSay() {
        body().innerHTML = `<div class="lt-hint">Не знаете, как выразить мысль? Напишите по-русски или как получится — предложу три варианта: простой, естественный и посложнее.</div>
            <textarea class="lt-textarea" data-r="ta" rows="3" placeholder="Например: я хочу попросить перенести встречу на завтра"></textarea>
            <div class="lt-row"><span class="lt-grow"></span><button class="lt-pbtn lt-primary" data-a="say-go"><i class="fa-solid fa-lightbulb"></i> Подсказать</button></div>
            <div data-r="res"></div>`;
    }

    async function runSay() {
        const text = ta().value.trim();
        if (!text) return;
        const res = $('[data-r="res"]', box);
        const my = ++busy;
        res.innerHTML = spinner('Подбираю варианты…');
        try {
            const r = await llm.howToSay(text);
            if (my !== busy || !res.isConnected) return;
            if (!r.options.length) { res.innerHTML = '<div class="lt-pop-err">Не получилось подобрать варианты. Переформулируйте.</div>'; return; }
            S.bump('written');
            res.innerHTML = r.options.map((o) => `<div class="lt-opt"><div class="lt-opt-style">${esc(STYLE_RU[o.style] || o.style)}</div>
                <div class="lt-natural" lang="${lang}">${esc(o.text)}</div>${o.note ? `<div class="lt-why">${esc(o.note)}</div>` : ''}
                <div class="lt-pop-actions">
                    <button class="lt-pbtn" data-a="r-say" data-t="${esc(o.text)}"><i class="fa-solid fa-volume-high"></i></button>
                    <button class="lt-pbtn" data-a="r-shadow" data-t="${esc(o.text)}"><i class="fa-solid fa-microphone"></i> Повторить</button>
                    <button class="lt-pbtn" data-a="r-chat" data-t="${esc(o.text)}"><i class="fa-solid fa-paper-plane"></i> В чат</button>
                    <button class="lt-pbtn" data-a="r-save" data-t="${esc(o.text)}"><i class="fa-solid fa-star"></i></button></div></div>`).join('')
                + (r.keywords.length ? `<div class="lt-label">Полезные слова (нажмите, чтобы сохранить)</div><div class="lt-chips">${r.keywords.map((k) => `<button class="lt-chipbtn" data-a="kw" data-w="${esc(k.w)}" data-tr="${esc(k.tr)}">${esc(k.w)} — ${esc(k.tr)}</button>`).join('')}</div>` : '');
        } catch (e) {
            if (my === busy && res.isConnected) res.innerHTML = `<div class="lt-pop-err">${esc(e.message || String(e))}</div>`;
        }
    }

    // ---------------------------------------------------------------- task
    function pickBuiltin() {
        const list = WRITING_TOPICS[lang] || [];
        if (!list.length) return null;
        const t = list[Math.floor(Math.random() * list.length)];
        return { title: t.title, task: t.task, minWords: t.min, phrases: t.phrases };
    }

    function drawTask() {
        task ||= pickBuiltin();
        if (!task) { body().innerHTML = '<div class="lt-empty">Для этого языка нет встроенных заданий — попросите новое у ИИ.</div><div class="lt-row"><button class="lt-pbtn" data-a="task-new">Новое задание от ИИ</button></div>'; return; }
        body().innerHTML = `<div class="lt-bigcard lt-left"><div class="lt-task-title">${esc(task.title)}</div>
            <div class="lt-pop-tr">${esc(task.task)}</div>
            ${task.phrases?.length ? `<div class="lt-label">Полезные фразы</div><div class="lt-chips">${task.phrases.map((p) => `<span class="lt-chipbtn lt-static" lang="${lang}">${esc(p)}</span>`).join('')}</div>` : ''}
            <div class="lt-hint">Минимум: ${task.minWords} ${unitName}</div></div>
            <textarea class="lt-textarea" data-r="ta" rows="7" lang="${lang}" placeholder="${lang === 'zh' ? '开始写吧……' : 'Start writing…'}">${esc(draft)}</textarea>
            <div class="lt-row"><span class="lt-count" data-r="wc"></span><span class="lt-grow"></span>
                <button class="lt-pbtn" data-a="task-next">Другое</button>
                <button class="lt-pbtn" data-a="task-new" title="Придумать задание с помощью ИИ"><i class="fa-solid fa-wand-magic-sparkles"></i> От ИИ</button>
                <button class="lt-pbtn lt-primary" data-a="check"><i class="fa-solid fa-spell-check"></i> Проверить</button></div>
            <div data-r="res"></div>`;
        count();
    }

    // ---------------------------------------------------------------- drills
    function topCats() {
        const m = S.get().stats.mistakes || {};
        return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k]) => k).filter((k) => CATS[lang].includes(k));
    }

    function drawDrill() {
        const cats = CATS[lang].filter((c) => c !== 'other');
        const top = opts.cat || topCats()[0] || cats[0];
        body().innerHTML = `<div class="lt-hint">Упражнения на пропуски по теме, в которой вы чаще всего ошибаетесь. Выбрана ваша главная слабая тема — но можно взять любую.</div>
            <div class="lt-chiprow">${cats.map((c) => `<button class="lt-chipbtn ${c === top ? 'on' : ''}" data-a="cat" data-c="${c}">${esc(catName(c))}</button>`).join('')}</div>
            <div class="lt-row"><button class="lt-pbtn lt-primary" data-a="drill-go"><i class="fa-solid fa-play"></i> Начать</button></div>
            <div data-r="res"></div>`;
        box.dataset.cat = top;
    }

    async function startDrill() {
        const cat = box.dataset.cat;
        const res = $('[data-r="res"]', box);
        const my = ++busy;
        res.innerHTML = spinner('Готовлю упражнения…');
        try {
            const items = await llm.genGapFill({ cat, n: 5 });
            if (my !== busy || !res.isConnected) return;
            if (!items.length) { res.innerHTML = '<div class="lt-pop-err">Модель не смогла составить упражнения. Попробуйте ещё раз.</div>'; return; }
            drill = { cat, items: items.map((x) => ({ ...x, options: shuffle([...new Set([x.answer, ...x.options])]).slice(0, 4) })), i: 0, ok: 0 };
            drawDrillItem();
        } catch (e) {
            if (my === busy && res.isConnected) res.innerHTML = `<div class="lt-pop-err">${esc(e.message || String(e))}</div>`;
        }
    }

    function drawDrillItem() {
        const res = $('[data-r="res"]', box);
        const x = drill.items[drill.i];
        if (!x) {
            res.innerHTML = `<div class="lt-bigcard"><div class="lt-bigword">${drill.ok} / ${drill.items.length}</div><div class="lt-pop-tr">${drill.ok === drill.items.length ? 'Отлично! 🎉' : 'Хорошая работа — повторите тему ещё раз.'}</div>
                <div class="lt-row"><button class="lt-pbtn lt-primary" data-a="drill-go">Ещё раз</button></div></div>`;
            return;
        }
        res.innerHTML = `<div class="lt-bigcard"><div class="lt-hint">${drill.i + 1} из ${drill.items.length} · ${esc(catName(drill.cat))}</div>
            <div class="lt-sent" lang="${lang}">${esc(x.sentence).replace('___', '<span class="lt-gap">＿＿＿</span>')}</div>
            <div class="lt-chips" data-r="opts">${x.options.map((o) => `<button class="lt-chipbtn" data-a="pick" data-o="${esc(o)}" lang="${lang}">${esc(o)}</button>`).join('')}</div>
            <div data-r="fb"></div></div>`;
    }

    function pick(b) {
        const x = drill.items[drill.i];
        if (x.done) return;
        x.done = true;
        const ok = b.dataset.o.trim().toLowerCase() === x.answer.trim().toLowerCase();
        if (ok) drill.ok++;
        S.bump('written');
        $$$('[data-a="pick"]').forEach((o) => {
            o.disabled = true;
            if (o.dataset.o.trim().toLowerCase() === x.answer.trim().toLowerCase()) o.classList.add('good');
        });
        if (!ok) b.classList.add('bad');
        $('[data-r="fb"]', box).innerHTML = `<div class="lt-pop-tr">${ok ? '✅ Верно' : '❌ Правильно: ' + esc(x.answer)}</div>${x.why ? `<div class="lt-why">${esc(x.why)}</div>` : ''}
            <div class="lt-row"><button class="lt-pbtn lt-primary" data-a="drill-next">${drill.i + 1 < drill.items.length ? 'Дальше' : 'Результат'}</button></div>`;
    }
    const $$$ = (sel) => [...box.querySelectorAll(sel)];

    // ---------------------------------------------------------------- events
    box.addEventListener('input', (e) => {
        if (e.target.dataset.r === 'ta') { draft = e.target.value; count(); }
    });

    box.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-a]');
        if (!b) return;
        if (handleResultAction(b, lang)) return;
        const a = b.dataset.a;
        if (a === 'mode') { mode = b.dataset.m; return frame(); }
        if (a === 'check') {
            const text = ta().value.trim();
            if (!text) return;
            draft = text;
            return runCheck(text, $('[data-r="res"]', box));
        }
        if (a === 'say-go') return runSay();
        if (a === 'kw') {
            S.saveWord({ lang, w: b.dataset.w.toLowerCase(), f: b.dataset.w, tr: b.dataset.tr });
            b.classList.add('on');
            return;
        }
        if (a === 'task-next') { task = pickBuiltin(); draft = ''; return drawTask(); }
        if (a === 'task-new') {
            b.disabled = true;
            try { task = await llm.genWritingTask(); draft = ''; } catch (err) { st.toast('error', err.message || String(err)); }
            return drawTask();
        }
        if (a === 'cat') { box.dataset.cat = b.dataset.c; $$$('[data-a="cat"]').forEach((x) => x.classList.toggle('on', x === b)); return; }
        if (a === 'drill-go') return startDrill();
        if (a === 'pick') return pick(b);
        if (a === 'drill-next') { drill.i++; return drawDrillItem(); }
    });

    frame();
}
