// Tap-to-translate for chat messages: word wrapping, popup, per-message bar, reset on swipe/regenerate.
import * as st from './st.js';
import * as S from './state.js';
import * as speech from './speech.js';
import * as llm from './llm.js';
import { translate, dictionaryEn } from './translate.js';
import { $, $$, esc, el, spinner, levelChip, emit, debounce, topShow, topHide } from './ui.js';
import { segmentZh, hasCJK, hashStr, normWord, sentenceAt, RE_EN_WORD, splitSentences } from './text.js';
import { wordInfo, analyzeText, levelLabel, splitZhWord, isLoaded, loadData } from './levels.js';

const MAX_AUTO = 30;                 // messages wrapped immediately; older ones lazily when scrolled into view
const SKIP = 'code, pre, script, style, a, button, textarea, input, ruby, .lt-w, .lt-bar, .lt-out, .lt-coach, .mes_reasoning, .mes_reasoning_details, .mes_img_container, .mes_media_container, .custom-code-block';

let chatEl = null;
let popup = null;
let chip = null;
let cur = null;                       // current popup state
let observer = null;
let io = null;
let reqId = 0;
let generating = false;
let genSince = 0;
let speakingMes = null;
const observed = new WeakSet();

const isGenerating = () => generating && Date.now() - genSince < 90000;

// ------------------------------------------------------------------ visible text of a message

/** Text the reader sees (ruby/pinyin and our own UI excluded) plus the offset of `target` inside it. */
export function walkText(root, target = null) {
    let out = '';
    let offset = -1;
    const walk = (n) => {
        for (const c of n.childNodes) {
            if (c === target && offset < 0) offset = out.length;      // remember where the tapped word starts, but keep collecting the whole text
            if (c.nodeType === 3) { out += c.nodeValue; continue; }
            if (c.nodeType !== 1) continue;
            const tag = c.tagName;
            if (tag === 'RT' || tag === 'RP' || tag === 'SCRIPT' || tag === 'STYLE') continue;
            if (c.classList.contains('lt-out') || c.classList.contains('lt-bar') || c.classList.contains('lt-coach')) continue;
            if (tag === 'BR') { out += '\n'; continue; }
            const block = /^(P|DIV|LI|BLOCKQUOTE|H[1-6]|PRE|UL|OL|TR)$/.test(tag);
            if (block && out && !out.endsWith('\n')) out += '\n';
            walk(c);
            if (block && !out.endsWith('\n')) out += '\n';
        }
    };
    walk(root);
    return { text: out, offset };
}

export const visibleText = (root) => walkText(root).text.replace(/\n{3,}/g, '\n\n').trim();

function sentenceFor(span) {
    const lang = S.get().lang;
    const textEl = span.closest('.mes_text');
    if (textEl) {
        const { text, offset } = walkText(textEl, span);
        if (offset >= 0) return sentenceAt(text, offset, lang);
    }
    // chips in the "new words" panel: find a sentence of the message that contains the word
    const mes = span.closest('.mes');
    const full = mes ? visibleText($('.mes_text', mes)) : '';
    const w = span.dataset.w;
    for (const s of splitSentences(full, lang)) if (s.text.toLowerCase().includes(w.toLowerCase())) return s.text;
    return '';
}

// ------------------------------------------------------------------ word wrapping

function classesFor(info, surface) {
    const s = S.get();
    const lang = s.lang;
    const ul = S.userLevel();
    const cls = ['lt-w'];
    const known = S.isKnown(lang, info.key);
    if (S.getWord(lang, info.key) && !known) cls.push('lt-saved');
    if (known || s.highlight === 'off' || s.highlight === 'saved') return cls;
    if (info.level) {
        const n = Math.min(info.level, 6);
        if (s.highlight === 'levels') cls.push('lt-lv', 'lt-l' + n);
        else if (info.level > ul) cls.push('lt-above', 'lt-l' + n);
    } else if (!info.known && s.highlight === 'above') {
        const name = lang === 'en' && /^[A-Z]/.test(surface);
        if (!name && (lang === 'zh' || surface.length >= 4)) cls.push('lt-unk');
    }
    return cls;
}

function makeSpan(surface) {
    const s = S.get();
    const info = wordInfo(s.lang, surface);
    const sp = document.createElement('span');
    sp.className = classesFor(info, surface).join(' ');
    sp.dataset.w = surface;
    sp.dataset.k = info.key;
    const hard = info.level > S.userLevel() || !info.known || sp.classList.contains('lt-saved');
    if (s.lang === 'zh' && info.pinyin && (s.pinyin === 'all' || (s.pinyin === 'unknown' && hard))) {
        const ruby = document.createElement('ruby');
        ruby.appendChild(document.createTextNode(surface));
        const rt = document.createElement('rt');
        rt.textContent = info.pinyin;
        ruby.appendChild(rt);
        sp.appendChild(ruby);
    } else {
        sp.textContent = surface;
    }
    return sp;
}

function buildFragment(text) {
    const lang = S.get().lang;
    const frag = document.createDocumentFragment();
    let any = false;
    if (lang === 'zh') {
        for (const seg of segmentZh(text)) {
            if (!seg.word) { frag.appendChild(document.createTextNode(seg.text)); continue; }
            for (const piece of splitZhWord(seg.text)) {
                if (hasCJK(piece)) { frag.appendChild(makeSpan(piece)); any = true; } else frag.appendChild(document.createTextNode(piece));
            }
        }
    } else {
        const re = new RegExp(RE_EN_WORD.source, 'g');
        let last = 0;
        let m;
        while ((m = re.exec(text))) {
            if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
            frag.appendChild(makeSpan(m[0]));
            any = true;
            last = m.index + m[0].length;
        }
        if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    }
    return any ? frag : null;
}

function wrapEl(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (!n.nodeValue.trim() || n.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const n of nodes) {
        const frag = buildFragment(n.nodeValue);
        if (frag) n.replaceWith(frag);
    }
}

function unwrapEl(root) {
    for (const sp of $$('.lt-w:not(.lt-chip)', root)) sp.replaceWith(document.createTextNode(sp.dataset.w));
    root.normalize();
}

function ensureWrapped(textEl) {
    if (textEl.querySelector('.lt-w')) return;
    const txt = textEl.textContent;
    if (!txt.trim() || txt.trim() === '...') return;
    const h = hashStr(txt);
    if (textEl.dataset.ltEmpty === h) return;
    wrapEl(textEl);
    if (!textEl.querySelector('.lt-w')) textEl.dataset.ltEmpty = h;
}

// ------------------------------------------------------------------ per-message bar

const btn = (a, icon, title, extra = '') => `<button class="lt-btn ${extra}" data-a="${a}" title="${title}" aria-label="${title}"><i class="fa-solid ${icon}"></i></button>`;

function ensureBar(mes) {
    const mode = S.get().msgBar;
    const textEl = $('.mes_text', mes);
    let bar = $(':scope > .mes_block > .lt-bar', mes) || $('.lt-bar', mes);
    const wanted = mode === 'all' || (mode === 'last' && mes.classList.contains('last_mes'));
    if (!wanted || !textEl) { bar?.remove(); return; }
    const isUser = mes.getAttribute('is_user') === 'true';
    const text = visibleText(textEl);
    if (!text) { bar?.remove(); return; }
    const h = hashStr(text) + S.get().lang + S.levelSetting() + (isUser ? 'u' : 'a');
    if (bar && bar.dataset.h === h) return;
    const lang = S.get().lang;
    let badge = '';
    if (!isUser && isLoaded(lang)) {
        const a = analyzeText(text, lang, S.userLevel());
        if (a.units >= 4) {
            const n = a.above.length;
            badge = `<button class="lt-badge ${n ? 'lt-has' : ''}" data-a="words" title="Оценка сложности текста. Нажмите, чтобы увидеть слова выше вашего уровня"><b>≈${esc(levelLabel(lang, a.level))}</b>${n ? ` · ${n} нов.` : ''}</button>`;
            bar ||= null;
            mes._ltAbove = a.above;
        }
    }
    const html = `${badge}<span class="lt-bar-btns">${isUser
        ? btn('check', 'fa-spell-check', 'Проверить мой текст')
        : btn('tr', 'fa-language', 'Перевести сообщение') + btn('simp', 'fa-wand-magic-sparkles', 'Упростить до моего уровня')
    }${btn('say', 'fa-volume-high', 'Озвучить', 'lt-say')}${btn('shadow', 'fa-microphone', 'Повторить вслух')}</span>`;
    if (!bar) {
        bar = el('<div class="lt-bar"></div>');
        textEl.insertAdjacentElement('afterend', bar);
    }
    bar.dataset.h = h;
    bar.innerHTML = html;
    $$('.lt-out', mes).forEach((o) => o.remove());   // the text changed (swipe/edit): old outputs are stale
}

function panel(mes, key, title, content) {
    const bar = $('.lt-bar', mes);
    if (!bar) return null;
    const old = $(`.lt-out[data-k="${key}"]`, mes);
    if (old) { old.remove(); if (content === undefined) return null; }
    const p = el(`<div class="lt-out" data-k="${key}"><div class="lt-out-head"><span>${esc(title)}</span><button class="lt-x" data-a="close-out" aria-label="Закрыть"><i class="fa-solid fa-xmark"></i></button></div><div class="lt-out-body"></div></div>`);
    $('.lt-out-body', p).innerHTML = content ?? '';
    const last = $$('.lt-out', mes).pop();
    (last || bar).insertAdjacentElement('afterend', p);
    return p;
}

async function onBarClick(b) {
    const mes = b.closest('.mes');
    const textEl = $('.mes_text', mes);
    const a = b.dataset.a;
    const text = visibleText(textEl);
    const lang = S.get().lang;
    if (a === 'close-out') { b.closest('.lt-out')?.remove(); return; }
    if (a === 'check') { emit('lt:check', { text }); return; }
    if (a === 'shadow') { emit('lt:open-hub', { tab: 'speak', mode: 'shadow', items: splitSentences(text, lang).map((x) => x.text).slice(0, 12) }); return; }
    if (a === 'say') {
        const id = mes.getAttribute('mesid');
        if (speakingMes === id) { speech.stop(); speakingMes = null; b.classList.remove('on'); return; }
        $$('.lt-say.on').forEach((x) => x.classList.remove('on'));
        speakingMes = id;
        b.classList.add('on');
        const ok = await speech.speak(text, { lang });
        if (speakingMes === id) { speakingMes = null; b.classList.remove('on'); }
        if (ok === false && !speech.ttsSupported()) st.toast('warning', 'Озвучка не поддерживается этим браузером.');
        return;
    }
    if (a === 'words') {
        const list = mes._ltAbove || [];
        const body = list.length
            ? `<div class="lt-chips">${list.map((x) => `<span class="lt-w lt-chip lt-l${Math.min(x.level, 6)}" data-w="${esc(x.word)}" data-k="${esc(x.word)}">${esc(x.word)} <small>${esc(levelLabel(lang, x.level))}</small></span>`).join('')}</div><div class="lt-hint">Нажмите на слово — перевод и сохранение в словарь.</div>`
            : '<div class="lt-hint">В этом сообщении нет слов выше вашего уровня.</div>';
        panel(mes, 'words', 'Слова выше вашего уровня', body);
        return;
    }
    if (a === 'tr' || a === 'simp') {
        const old = $(`.lt-out[data-k="${a}"]`, mes);
        if (old) { old.remove(); return; }
        const p = panel(mes, a, a === 'tr' ? 'Перевод' : `Проще (${levelLabel(lang, S.userLevel())})`, spinner(a === 'tr' ? 'Перевожу…' : 'Упрощаю…'));
        const stamp = $('.lt-bar', mes)?.dataset.h;
        try {
            const out = a === 'tr' ? await translate(text) : await llm.simplifyText(text);
            if ($('.lt-bar', mes)?.dataset.h !== stamp || !p.isConnected) return;   // swiped meanwhile
            $('.lt-out-body', p).innerHTML = `<div class="lt-out-text">${esc(out).replace(/\n/g, '<br>')}</div>`;
        } catch (e) {
            if (p.isConnected) $('.lt-out-body', p).innerHTML = `<div class="lt-pop-err">${esc(e.message || String(e))}</div>`;
        }
    }
}

// ------------------------------------------------------------------ popup

function highlightIn(sentence, surface) {
    const i = sentence.toLowerCase().indexOf(surface.toLowerCase());
    if (i < 0) return esc(sentence);
    return esc(sentence.slice(0, i)) + '<b>' + esc(sentence.slice(i, i + surface.length)) + '</b>' + esc(sentence.slice(i + surface.length));
}

function renderPopup() {
    const c = cur;
    if (!c || !popup) return;
    const lang = S.get().lang;
    const info = c.info;
    const saved = !!S.getWord(lang, info.key);
    const known = S.isKnown(lang, info.key);
    const lemma = !c.phrase && lang === 'en' && info.known && info.lemma !== normWord(c.surface) ? `<span class="lt-pop-lemma">← ${esc(info.lemma)}</span>` : '';
    const ipaText = lang === 'zh' ? info.pinyin : c.dict?.ipa;
    const ipa = ipaText ? `<span class="lt-pop-ipa">${esc(ipaText)}</span>` : '';
    const chipHtml = c.phrase ? '' : levelChip(lang, info.level, info.approx);
    let tr;
    if (c.trErr) tr = `<div class="lt-pop-err">${esc(c.trErr)} <button class="lt-link" data-a="retry">Повторить</button></div>`;
    else if (c.tr == null) tr = spinner('Перевожу…');
    else tr = `<div class="lt-pop-tr">${esc(c.tr)}</div>`;
    const gloss = lang === 'zh' && info.gloss ? `<div class="lt-pop-def">${esc(info.gloss)}</div>` : '';
    const defs = c.dict?.meanings?.length
        ? `<div class="lt-pop-defs">${c.dict.meanings.slice(0, 2).map((m) => `<div><i>${esc(m.pos)}</i> ${esc(m.def)}${m.example ? `<div class="lt-pop-ex">“${esc(m.example)}”</div>` : ''}</div>`).join('')}</div>`
        : '';
    const ctx = c.sentence && !c.phrase ? `<div class="lt-pop-ctx">${highlightIn(c.sentence, c.surface)}</div>` : '';
    popup.innerHTML = `
        <div class="lt-pop-head">
            <span class="lt-pop-word">${esc(c.surface)}</span>${lemma}${ipa}${chipHtml}
            <span class="lt-grow"></span>
            <button class="lt-x" data-a="audio" title="Произнести" aria-label="Произнести"><i class="fa-solid fa-volume-high"></i></button>
            <button class="lt-x" data-a="close" aria-label="Закрыть"><i class="fa-solid fa-xmark"></i></button>
        </div>
        ${tr}${gloss}${defs}${ctx}
        <div class="lt-pop-actions">
            <button class="lt-pbtn ${saved ? 'on' : ''}" data-a="save"><i class="fa-solid fa-star"></i> ${saved ? 'В словаре' : 'В словарь'}</button>
            ${c.phrase ? '' : `<button class="lt-pbtn ${known ? 'on' : ''}" data-a="known"><i class="fa-solid fa-check"></i> ${known ? 'Знаю ✓' : 'Знаю'}</button>
            <button class="lt-pbtn" data-a="ctx"><i class="fa-solid fa-lightbulb"></i> В контексте</button>
            <button class="lt-pbtn" data-a="sent"><i class="fa-solid fa-language"></i> Предложение</button>`}
            <button class="lt-pbtn" data-a="say"><i class="fa-solid fa-microphone"></i> Сказать</button>
        </div>
        <div class="lt-pop-extra">${c.extra || ''}</div>`;
    popup.classList.add('open');
    topShow(popup);
    requestAnimationFrame(ensureVisible);
}

function ensureVisible() {
    if (!cur?.span || !popup) return;
    const r = cur.span.getBoundingClientRect();
    const limit = window.innerHeight - popup.offsetHeight - 14;
    if (r.bottom > limit) {
        const scroller = cur.span.closest('#chat') || chatEl;
        if (scroller) scroller.scrollTop += r.bottom - limit + 6;
    }
}

export function closePopup() {
    reqId++;
    if (cur?.span) cur.span.classList.remove('lt-active');
    cur = null;
    popup?.classList.remove('open');
    if (popup) topHide(popup);
    if (popup) popup.innerHTML = '';
}

async function lookup(c, mine) {
    const lang = S.get().lang;
    const tasks = [];
    c.tr = null;
    c.trErr = '';
    tasks.push(translate(c.surface).then((t) => { if (mine === reqId) { c.tr = t; } }).catch((e) => { if (mine === reqId) { c.trErr = e.message || 'Не удалось перевести'; c.tr = ''; } }));
    if (lang === 'en' && S.get().popupDefs && !c.phrase && /^[A-Za-z']+$/.test(c.surface)) {
        tasks.push(dictionaryEn(c.info.known ? c.info.lemma : normWord(c.surface)).then((d) => { if (mine === reqId) c.dict = d; }));
    }
    renderPopup();
    await Promise.allSettled(tasks);
    if (mine === reqId && cur === c) renderPopup();
}

function openWord(span) {
    if (cur?.span === span) { closePopup(); return; }
    closePopup();
    const lang = S.get().lang;
    const surface = span.dataset.w;
    const c = { span, surface, info: wordInfo(lang, surface), sentence: sentenceFor(span), tr: null, dict: null, extra: '' };
    cur = c;
    span.classList.add('lt-active');
    lookup(c, ++reqId);
}

function openPhrase(text, sentence) {
    closePopup();
    const lang = S.get().lang;
    const c = { span: null, surface: text, phrase: true, info: { lang, key: text.toLowerCase(), level: 0, known: false, lemma: text }, sentence, tr: null, extra: '' };
    cur = c;
    lookup(c, ++reqId);
}

function restyleKey(key) {
    for (const sp of $$('.lt-w')) {
        if (sp.dataset.k !== key || sp.classList.contains('lt-chip')) continue;
        const active = sp.classList.contains('lt-active');
        sp.className = classesFor(wordInfo(S.get().lang, sp.dataset.w), sp.dataset.w).join(' ') + (active ? ' lt-active' : '');
    }
}

async function onPopupClick(e) {
    const b = e.target.closest('[data-a]');
    if (!b || !cur) return;
    const c = cur;
    const lang = S.get().lang;
    const a = b.dataset.a;
    if (a === 'close') return closePopup();
    if (a === 'retry') return lookup(c, ++reqId);
    if (a === 'audio') {
        if (lang === 'en' && c.dict?.audio && !c.phrase) {
            if (await speech.playUrl(c.dict.audio)) return;
        }
        return void speech.speak(c.surface, { lang, rate: 0.85 });
    }
    if (a === 'save') {
        if (S.getWord(lang, c.info.key)) S.removeWord(lang, c.info.key);
        else {
            S.saveWord({
                lang, w: c.info.key, f: c.surface, tr: c.tr || '', ctx: c.sentence || '', lvl: c.info.level || 0, approx: c.info.approx || undefined,
                ipa: lang === 'en' ? c.dict?.ipa : undefined, pinyin: lang === 'zh' ? c.info.pinyin : undefined,
                def: c.dict?.meanings?.[0]?.def || c.info.gloss || '', pos: c.dict?.meanings?.[0]?.pos || '', phrase: c.phrase || undefined,
            });
        }
        restyleKey(c.info.key);
        return renderPopup();
    }
    if (a === 'known') {
        S.setKnown(lang, c.info.key, !S.isKnown(lang, c.info.key));
        restyleKey(c.info.key);
        return renderPopup();
    }
    if (a === 'say') {
        emit('lt:open-hub', { tab: 'speak', mode: 'shadow', items: [c.sentence || c.surface] });
        return closePopup();
    }
    if (a === 'sent' || a === 'ctx') {
        if (!c.sentence) return;
        const mine = reqId;
        c.extra = spinner(a === 'sent' ? 'Перевожу предложение…' : 'Разбираю в контексте…');
        renderPopup();
        try {
            if (a === 'sent') {
                const t = await translate(c.sentence);
                c.extra = `<div class="lt-pop-ai"><b>Перевод предложения</b><div>${esc(t)}</div></div>`;
            } else {
                const x = await llm.explainWord(c.surface, c.sentence);
                c.extra = `<div class="lt-pop-ai"><b>В этом контексте:</b> ${esc(x.translation)} <i>${esc(x.pos)}</i>
                    ${x.meaning ? `<div>${esc(x.meaning)}</div>` : ''}${x.example ? `<div class="lt-pop-ex">“${esc(x.example)}” — ${esc(x.example_tr)}</div>` : ''}
                    ${x.note ? `<div class="lt-note">${esc(x.note)}</div>` : ''}</div>`;
                const saved = S.getWord(lang, c.info.key);
                if (saved && x.translation) S.saveWord({ lang, w: c.info.key, tr: x.translation, def: x.meaning || saved.def, ex: x.example, exTr: x.example_tr });
            }
        } catch (err) {
            c.extra = `<div class="lt-pop-err">${esc(err.message || String(err))}</div>`;
        }
        if (cur === c && mine === reqId) renderPopup();
    }
}

// ------------------------------------------------------------------ selection chip

function hideChip() { if (chip) { chip.classList.remove('open'); topHide(chip); } }

const onSelection = debounce(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !chip) return hideChip();
    const text = sel.toString().replace(/\s+/g, ' ').trim();
    const node = sel.anchorNode?.nodeType === 1 ? sel.anchorNode : sel.anchorNode?.parentElement;
    if (text.length < 2 || text.length > 400 || !node?.closest?.('.mes_text')) return hideChip();
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    chip.style.top = Math.max(8, rect.top - 44) + 'px';
    chip.style.left = Math.min(window.innerWidth - 190, Math.max(8, rect.left)) + 'px';
    chip.dataset.text = text;
    chip.classList.add('open');
    topShow(chip);
}, 250);

// ------------------------------------------------------------------ scanning

function guard(fn) {
    observer?.disconnect();
    try { fn(); } finally { observer?.observe(chatEl, { childList: true, subtree: true }); }
}

function handleMes(mes) {
    if (!S.get().enabled || !isLoaded(S.get().lang)) return;
    if (mes.getAttribute('is_system') === 'true') return;
    const textEl = $('.mes_text', mes);
    if (!textEl) return;
    if (isGenerating() && mes.classList.contains('last_mes')) return;
    ensureWrapped(textEl);
    ensureBar(mes);
}

export function scan() {
    if (!chatEl || !S.get().enabled) return;
    const all = $$('.mes', chatEl);
    guard(() => {
        for (const m of all.slice(-MAX_AUTO)) handleMes(m);
        if (all.length > MAX_AUTO) {
            for (const m of all.slice(0, -MAX_AUTO)) {
                if (!observed.has(m)) { observed.add(m); io?.observe(m); }
            }
        }
        if (S.get().msgBar === 'last') for (const m of all) if (!m.classList.contains('last_mes')) $('.lt-bar', m)?.remove();
    });
    if (cur?.span && !cur.span.isConnected) closePopup();
}

const schedule = debounce(() => scan(), 120);

/** Closes popup and removes per-message outputs (translation, simplification…). Called on swipe/regenerate/edit. */
export function reset(mesId = null) {
    closePopup();
    hideChip();
    if (speakingMes !== null && (mesId === null || String(mesId) === speakingMes)) { speech.stop(); speakingMes = null; }
    const mess = mesId === null ? $$('.mes', chatEl) : $$(`.mes[mesid="${mesId}"]`, chatEl);
    for (const m of mess) {
        $$('.lt-out, .lt-coach', m).forEach((o) => o.remove());
        $$('.lt-say.on', m).forEach((b) => b.classList.remove('on'));
        const bar = $('.lt-bar', m);
        if (bar) bar.dataset.h = '';
    }
}

/** Re-applies highlighting after a settings change. */
export async function refresh() {
    if (!chatEl) return;
    closePopup();
    await loadData(S.get().lang, st.baseUrl).catch((e) => st.toast('error', 'Не удалось загрузить данные уровней: ' + e.message));
    guard(() => {
        for (const t of $$('.mes_text', chatEl)) { unwrapEl(t); delete t.dataset.ltEmpty; }
        for (const b of $$('.lt-bar', chatEl)) b.remove();
    });
    scan();
}

export function disable() {
    closePopup();
    hideChip();
    if (!chatEl) return;
    guard(() => {
        for (const t of $$('.mes_text', chatEl)) unwrapEl(t);
        for (const b of $$('.lt-bar, .lt-out', chatEl)) b.remove();
    });
}

function autoSpeak(id) {
    const s = S.get();
    if (!s.autoSpeak || !s.enabled) return;
    const mes = $(`.mes[mesid="${id}"]`, chatEl);
    if (!mes || mes.getAttribute('is_user') === 'true') return;
    const text = visibleText($('.mes_text', mes));
    const ok = s.lang === 'zh' ? hasCJK(text) : /[A-Za-z]{2}/.test(text);
    if (ok) speech.speak(text, { lang: s.lang });
}

// ------------------------------------------------------------------ init

export async function init() {
    chatEl = document.getElementById('chat');
    if (!chatEl) return;
    popup = el('<div class="lt-pop" role="dialog" popover="manual"></div>');
    chip = el('<button class="lt-selchip" popover="manual"><i class="fa-solid fa-language"></i> Перевести</button>');
    document.body.append(popup, chip);

    popup.addEventListener('click', onPopupClick);
    chip.addEventListener('click', (e) => {
        e.stopPropagation();
        const text = chip.dataset.text;
        const node = window.getSelection()?.anchorNode;
        const textEl = (node?.nodeType === 1 ? node : node?.parentElement)?.closest('.mes_text');
        const full = textEl ? walkText(textEl).text : '';
        const sentence = full ? (splitSentences(full, S.get().lang).find((x) => x.text.includes(text.slice(0, 20)))?.text || '') : '';
        hideChip();
        window.getSelection()?.removeAllRanges();
        openPhrase(text, sentence);
    });

    chatEl.addEventListener('click', (e) => {
        if (!S.get().enabled) return;
        const w = e.target.closest('.lt-w');
        if (w) {
            const sel = window.getSelection();
            if (sel && !sel.isCollapsed && sel.toString().trim().length > 1) return;
            e.preventDefault();
            e.stopPropagation();
            return openWord(w);
        }
        const b = e.target.closest('.lt-bar [data-a], .lt-out [data-a]');
        if (b) { e.stopPropagation(); onBarClick(b); }
    });
    document.addEventListener('click', (e) => {
        if (cur && !e.target.closest('.lt-pop, .lt-w, .lt-selchip')) closePopup();
    }, true);
    document.addEventListener('selectionchange', onSelection);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closePopup(); hideChip(); } });

    observer = new MutationObserver(() => schedule());
    io = new IntersectionObserver((entries) => {
        guard(() => { for (const e of entries) if (e.isIntersecting) handleMes(e.target); });
    }, { rootMargin: '500px 0px' });

    const mark = () => { generating = true; genSince = Date.now(); closePopup(); };
    const done = () => { generating = false; schedule(); };
    st.on('GENERATION_STARTED', mark);
    st.on('GENERATION_ENDED', done);
    st.on('GENERATION_STOPPED', done);
    st.on('MESSAGE_SWIPED', (id) => { reset(id); schedule(); });
    st.on('MESSAGE_EDITED', (id) => { reset(id); schedule(); });
    st.on('MESSAGE_UPDATED', (id) => { reset(id); schedule(); });
    st.on('MESSAGE_DELETED', () => { reset(); schedule(); });
    st.on('CHAT_CHANGED', () => { generating = false; reset(); setTimeout(scan, 400); });
    st.on('USER_MESSAGE_RENDERED', () => schedule());
    st.on('CHARACTER_MESSAGE_RENDERED', (id) => { generating = false; schedule(); setTimeout(() => autoSpeak(id), 250); });

    await loadData(S.get().lang, st.baseUrl).catch((e) => st.toast('error', 'Не удалось загрузить данные уровней: ' + e.message));
    observer.observe(chatEl, { childList: true, subtree: true });
    scan();
}
