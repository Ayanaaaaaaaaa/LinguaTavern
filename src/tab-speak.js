// "Речь" tab: repeat after the voice (scored), answer questions aloud (reviewed by the tutor), pronunciation drills.
import * as S from './state.js';
import * as speech from './speech.js';
import * as llm from './llm.js';
import { scoreSpeechDisplay, diffHtml } from './diff.js';
import { countUnits } from './text.js';
import { sentencesFor, shuffle } from './bank.js';
import { SPEAK_QUESTIONS, DRILLS } from './content.js';
import { catName, handleResultAction } from './tab-write.js';
import { $, esc, spinner } from './ui.js';
import { userLevel } from './state.js';

const STATUS_HINT = { ok: 'верно', near: 'почти', wrong: 'не то слово', miss: 'пропущено' };

function scoreView(r, lang) {
    const toks = r.tokens.map((t) => `<span class="lt-tok ${t.status}" title="${STATUS_HINT[t.status]}${t.said ? ': «' + esc(t.said) + '»' : ''}">${esc(t.show)}</span>`).join(lang === 'zh' ? '' : ' ');
    const verdict = r.score >= 90 ? 'Отлично! 🎉' : r.score >= 70 ? 'Хорошо 👍' : r.score >= 45 ? 'Неплохо, попробуйте ещё раз' : 'Давайте помедленнее — сначала послушайте';
    const wrong = r.tokens.filter((t) => t.status === 'wrong' || t.status === 'near').map((t) => `<b>${esc(t.show)}</b> → «${esc(t.said)}»`);
    return `<div class="lt-scorebig">${r.score}<small>%</small></div><div class="lt-pop-tr">${verdict}</div>
        <div class="lt-tokens" lang="${lang}">${toks}</div>
        ${wrong.length ? `<div class="lt-why">Распозналось иначе: ${wrong.join('; ')}</div>` : ''}
        ${r.extra.length ? `<div class="lt-why">Лишние слова: ${esc(r.extra.join(' '))}</div>` : ''}
        <div class="lt-hint">Зелёные слова распознаны верно, жёлтые — почти, красные — другое слово, серые — пропущены. Оценку даёт распознавание речи браузера, поэтому это ориентир, а не экзамен.</div>`;
}

export function mount(box, opts = {}) {
    const lang = S.get().lang;
    const lvl = userLevel();
    let mode = opts.mode || 'shadow';          // shadow | answer | drills
    let items = opts.items?.length ? opts.items.filter(Boolean) : [];
    let title = opts.title || '';
    let hint = opts.hint || '';
    let idx = 0;
    let rec = null;
    let question = null;
    let pool = null;
    let transcript = '';
    let busy = 0;

    const body = () => $('[data-r="body"]', box);
    const seg = () => `<div class="lt-seg">${[['shadow', 'Повтор'], ['answer', 'Вопросы'], ['drills', 'Звуки']].map(([m, n]) => `<button class="${mode === m ? 'on' : ''}" data-a="mode" data-m="${m}">${n}</button>`).join('')}</div>`;

    function warnMic() {
        const issue = speech.micIssue();
        return issue ? `<div class="lt-warn">${esc(issue)}</div>` : '';
    }

    function stopRec() {
        if (rec) { rec.stop(); rec = null; }
    }

    function frame() {
        busy++;
        stopRec();
        speech.stop();
        box.innerHTML = seg() + warnMic() + '<div data-r="body"></div>';
        ({ shadow: drawShadow, answer: drawAnswer, drills: drawDrills })[mode]();
    }

    // ---------------------------------------------------------------- shadowing
    async function drawShadow() {
        if (!items.length) {
            body().innerHTML = spinner('Подбираю фразы…');
            const bank = await sentencesFor(lang, Math.min(Math.max(lvl, 1), 5));
            if (!box.isConnected || mode !== 'shadow') return;
            items = shuffle(bank).slice(0, 8).map((x) => x.t);
            title = title || 'Фразы вашего уровня';
            if (!items.length) {
                body().innerHTML = '<div class="lt-empty">Фраз для повтора пока нет. Нажмите «🎤 Повторить» под сообщением в чате, из словаря или во вкладке «Учить» — или откройте «Звуки».</div>';
                return;
            }
        }
        idx = Math.min(idx, items.length - 1);
        const t = items[idx];
        body().innerHTML = `<div class="lt-hint">${esc(title || 'Повторяйте вслух')} · ${idx + 1} из ${items.length}</div>
            ${hint ? `<div class="lt-note">${esc(hint)}</div>` : ''}
            <div class="lt-bigcard"><div class="lt-sent" lang="${lang}">${esc(t)}</div>
            <div class="lt-pop-actions"><button class="lt-pbtn" data-a="listen"><i class="fa-solid fa-volume-high"></i> Слушать</button><button class="lt-pbtn" data-a="listen-slow">🐢 Медленно</button>
                <button class="lt-pbtn lt-primary lt-mic" data-a="rec"><i class="fa-solid fa-microphone"></i> Говорить</button></div>
            <div class="lt-interim" data-r="live"></div><div data-r="res"></div>
            <div class="lt-row"><button class="lt-pbtn" data-a="prev" ${idx ? '' : 'disabled'}><i class="fa-solid fa-backward"></i></button>
                <button class="lt-pbtn" data-a="next" ${idx + 1 < items.length ? '' : 'disabled'}>Дальше <i class="fa-solid fa-forward"></i></button></div></div>`;
    }

    async function recordShadow(b) {
        if (rec) { stopRec(); return; }
        const target = items[idx];
        const my = busy;
        const res = $('[data-r="res"]', box);
        const live = $('[data-r="live"]', box);
        res.innerHTML = '';
        b.classList.add('on');
        b.innerHTML = '<i class="fa-solid fa-stop"></i> Стоп';
        live.textContent = 'Слушаю…';
        const r = speech.listen({ lang, onInterim: (t) => { live.textContent = t || 'Слушаю…'; } });
        rec = r;
        try {
            const out = await r.promise;
            if (my !== busy || !box.isConnected) return;
            live.textContent = out.text ? '«' + out.text + '»' : '';
            if (out.empty) { res.innerHTML = '<div class="lt-pop-err">Ничего не расслышал. Говорите ближе к микрофону и чуть громче.</div>'; return; }
            const sc = scoreSpeechDisplay(target, out.text, lang);
            S.logSpeaking(sc.score, 'shadow');
            res.innerHTML = scoreView(sc, lang);
        } catch (e) {
            if (my === busy && box.isConnected) res.innerHTML = `<div class="lt-pop-err">${esc(e.message || String(e))}</div>`;
        } finally {
            if (rec === r) rec = null;
            if (b.isConnected) { b.classList.remove('on'); b.innerHTML = '<i class="fa-solid fa-microphone"></i> Говорить'; }
        }
    }

    // ---------------------------------------------------------------- answering questions
    function questionPool() {
        const all = SPEAK_QUESTIONS[lang] || [];
        const lv = Math.min(lvl, lang === 'zh' ? 3 : 4);
        const near = all.filter((q) => q.l <= lv && q.l >= lv - 1);
        return shuffle((near.length ? near : all).map((q) => q.q));
    }

    function drawAnswer() {
        pool ||= questionPool();
        question ||= pool.shift();
        transcript = '';
        if (!question) { body().innerHTML = '<div class="lt-empty">Вопросы закончились. Попросите новые у ИИ.</div><div class="lt-row"><button class="lt-pbtn" data-a="q-ai">Вопросы от ИИ</button></div>'; return; }
        body().innerHTML = `<div class="lt-hint">Ответьте вслух 3–5 предложениями. Потом я разберу ответ: ошибки, как сказать лучше и один совет по беглости.</div>
            <div class="lt-bigcard"><div class="lt-sent" lang="${lang}">${esc(question)}</div>
            <div class="lt-pop-actions"><button class="lt-pbtn" data-a="q-say"><i class="fa-solid fa-volume-high"></i></button>
                <button class="lt-pbtn lt-primary lt-mic" data-a="a-rec"><i class="fa-solid fa-microphone"></i> Отвечать</button>
                <button class="lt-pbtn" data-a="q-next">Другой вопрос</button>
                <button class="lt-pbtn" data-a="q-ai" title="Новые вопросы от ИИ"><i class="fa-solid fa-wand-magic-sparkles"></i></button></div>
            <textarea class="lt-textarea" data-r="ta" rows="4" lang="${lang}" placeholder="Здесь появится распознанная речь. Её можно исправить или написать ответ руками."></textarea>
            <div class="lt-row"><span class="lt-count" data-r="wc"></span><span class="lt-grow"></span><button class="lt-pbtn lt-primary" data-a="a-check"><i class="fa-solid fa-circle-check"></i> Проверить ответ</button></div>
            <div data-r="res"></div></div>`;
    }

    async function recordAnswer(b) {
        if (rec) { stopRec(); return; }
        const my = busy;
        const ta = $('[data-r="ta"]', box);
        const base = ta.value.trim() ? ta.value.trim() + ' ' : '';
        b.classList.add('on');
        b.innerHTML = '<i class="fa-solid fa-stop"></i> Стоп';
        const r = speech.listen({ lang, continuous: true, onInterim: (t) => { if (ta.isConnected) ta.value = base + t; } });
        rec = r;
        try {
            const out = await r.promise;
            if (my !== busy || !ta.isConnected) return;
            if (out.empty && !base) { $('[data-r="res"]', box).innerHTML = '<div class="lt-pop-err">Ничего не расслышал. Попробуйте ещё раз.</div>'; return; }
            ta.value = base + out.text;
            ta.dispatchEvent(new Event('input', { bubbles: true }));
        } catch (e) {
            if (my === busy && box.isConnected) $('[data-r="res"]', box).innerHTML = `<div class="lt-pop-err">${esc(e.message || String(e))}</div>`;
        } finally {
            if (rec === r) rec = null;
            if (b.isConnected) { b.classList.remove('on'); b.innerHTML = '<i class="fa-solid fa-microphone"></i> Отвечать'; }
        }
    }

    async function checkAnswer() {
        const ta = $('[data-r="ta"]', box);
        const text = ta.value.trim();
        const res = $('[data-r="res"]', box);
        if (!text) return;
        const my = ++busy;
        res.innerHTML = spinner('Разбираю ответ…');
        try {
            const r = await llm.checkSpeech({ question, transcript: text });
            if (my !== busy || !res.isConnected) return;
            S.logMistakes(r.errors);
            S.logAnswer(countUnits(text, lang), r.errors.length);
            const errs = r.errors.map((e) => `<div class="lt-err"><span class="lt-cat">${esc(catName(e.cat))}</span> <del class="lt-del">${esc(e.wrong)}</del> → <ins class="lt-ins">${esc(e.right)}</ins>${e.why ? `<div class="lt-why">${esc(e.why)}</div>` : ''}</div>`).join('');
            res.innerHTML = `${r.praise ? `<div class="lt-praise">👍 ${esc(r.praise)}</div>` : ''}
                <div class="lt-label">Ваш ответ с исправлениями</div><div class="lt-diffbox" lang="${lang}">${diffHtml(text, r.corrected || text)}</div>
                ${errs ? `<div class="lt-label">Что исправлено</div>${errs}` : '<div class="lt-pop-tr">✅ Грубых ошибок нет</div>'}
                ${r.improved ? `<div class="lt-label">Как ответить лучше</div><div class="lt-natural" lang="${lang}">${esc(r.improved)}</div>` : ''}
                ${r.tip ? `<div class="lt-note">💡 ${esc(r.tip)}</div>` : ''}
                <div class="lt-pop-actions"><button class="lt-pbtn" data-a="r-say" data-t="${esc(r.improved || r.corrected)}"><i class="fa-solid fa-volume-high"></i> Послушать</button>
                    <button class="lt-pbtn" data-a="r-shadow" data-t="${esc(r.improved || r.corrected)}"><i class="fa-solid fa-microphone"></i> Повторить за образцом</button>
                    <button class="lt-pbtn" data-a="r-chat" data-t="${esc(r.corrected || text)}"><i class="fa-solid fa-paper-plane"></i> В чат</button></div>`;
        } catch (e) {
            if (my === busy && res.isConnected) res.innerHTML = `<div class="lt-pop-err">${esc(e.message || String(e))}</div>`;
        }
    }

    // ---------------------------------------------------------------- drills
    function drawDrills() {
        const list = DRILLS[lang] || [];
        body().innerHTML = `<div class="lt-hint">Короткие упражнения на трудные звуки. Выберите набор, послушайте образец и повторите — я покажу, какие слова распознались верно.</div>
            <div class="lt-list">${list.map((d) => `<div class="lt-item lt-click" data-a="drill" data-id="${d.id}"><div class="lt-item-main"><b>${esc(d.title)}</b><div class="lt-item-tr">${esc(d.hint)}</div></div><div class="lt-item-act"><i class="fa-solid fa-chevron-right"></i></div></div>`).join('')}</div>`;
    }

    // ---------------------------------------------------------------- events
    box.addEventListener('input', (e) => {
        if (e.target.dataset.r === 'ta') { const w = $('[data-r="wc"]', box); if (w) w.textContent = `${countUnits(e.target.value, lang)} ${lang === 'zh' ? 'иер.' : 'слов'}`; }
    });

    box.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-a]');
        if (!b) return;
        if (handleResultAction(b, lang)) return;
        const a = b.dataset.a;
        if (a === 'mode') { mode = b.dataset.m; if (mode !== 'shadow') { items = []; title = ''; hint = ''; } idx = 0; return frame(); }
        if (a === 'listen') return void speech.speak(items[idx], { lang });
        if (a === 'listen-slow') return void speech.speak(items[idx], { lang, rate: 0.6 });
        if (a === 'rec') return recordShadow(b);
        if (a === 'next') { stopRec(); busy++; idx++; return drawShadow(); }
        if (a === 'prev') { stopRec(); busy++; idx--; return drawShadow(); }
        if (a === 'drill') {
            const d = (DRILLS[lang] || []).find((x) => x.id === b.dataset.id);
            if (!d) return;
            mode = 'shadow'; items = d.items; title = d.title; hint = d.hint; idx = 0;
            return frame();
        }
        if (a === 'q-say') return void speech.speak(question, { lang });
        if (a === 'a-rec') return recordAnswer(b);
        if (a === 'a-check') return checkAnswer();
        if (a === 'q-next') { stopRec(); busy++; question = null; return drawAnswer(); }
        if (a === 'q-ai') {
            b.disabled = true;
            try {
                pool = [...(await llm.genQuestions({ n: 5 })), ...(pool || [])];
                question = null;
            } catch (err) {
                b.disabled = false;
                const res = $('[data-r="res"]', box);
                if (res) res.innerHTML = `<div class="lt-pop-err">${esc(err.message || String(err))}</div>`;
                return;
            }
            return drawAnswer();
        }
    });

    frame();
    return () => { busy++; stopRec(); speech.stop(); };
}
