// "Карточки" tab: spaced repetition with three modes (flip, write a sentence, dictation).
import * as S from './state.js';
import * as speech from './speech.js';
import * as llm from './llm.js';
import { review, buildQueue, GRADES } from './srs.js';
import { diffHtml, sameAnswer } from './diff.js';
import { $, esc, spinner, levelChip } from './ui.js';

export function mount(box) {
    const lang = S.get().lang;
    let mode = S.get()._cardMode || 'flip';
    let queue = [];
    let done = 0;
    let card = null;
    let flipped = false;

    const goal = () => S.get().dailyGoal;
    const doneToday = () => S.today().reviewed;

    function start() {
        queue = buildQueue(S.vocabList(lang).filter((c) => !c.phrase), { newLimit: 10, max: 40 });
        done = 0;
        next();
    }

    function head() {
        return `<div class="lt-seg"><button class="${mode === 'flip' ? 'on' : ''}" data-a="mode" data-m="flip">Карточки</button><button class="${mode === 'write' ? 'on' : ''}" data-a="mode" data-m="write">Предложение</button><button class="${mode === 'dict' ? 'on' : ''}" data-a="mode" data-m="dict">Диктант</button></div>
        <div class="lt-hint">Сегодня: ${doneToday()} / ${goal()} · в очереди: ${queue.length}</div>`;
    }

    function next() {
        card = queue.shift();
        flipped = false;
        if (!card) {
            const total = S.vocabList(lang).length;
            box.innerHTML = `${head()}<div class="lt-empty">${total ? 'На сегодня всё повторили 🎉 Загляните позже или добавьте новые слова во вкладке «Учить».' : 'В словаре пока нет слов. Нажмите на слово в чате и добавьте его, либо возьмите слова по уровню во вкладке «Учить».'}</div>`;
            return;
        }
        if (mode === 'flip') drawFlip();
        else if (mode === 'write') drawWrite();
        else drawDict();
    }

    const gradeRow = () => `<div class="lt-grades"><button class="lt-g g0" data-a="g" data-g="0">Снова</button><button class="lt-g g1" data-a="g" data-g="1">Трудно</button><button class="lt-g g2" data-a="g" data-g="2">Хорошо</button><button class="lt-g g3" data-a="g" data-g="3">Легко</button></div>`;
    const sub = () => (lang === 'zh' ? card.pinyin : card.ipa);

    function drawFlip() {
        const front = `<div class="lt-bigword">${esc(card.f && lang === 'zh' ? card.w : card.w)}</div>${sub() ? `<div class="lt-pop-ipa">${esc(sub())}</div>` : ''}`;
        const back = flipped ? `<div class="lt-pop-tr">${esc(card.tr || '—')}</div>${card.def ? `<div class="lt-pop-def">${esc(card.def)}</div>` : ''}${card.ctx ? `<div class="lt-pop-ctx">${esc(card.ctx)}</div>` : ''}` : '';
        box.innerHTML = `${head()}<div class="lt-bigcard">${levelChip(lang, card.lvl, card.approx)}${front}${back}
            <div class="lt-pop-actions"><button class="lt-pbtn" data-a="say"><i class="fa-solid fa-volume-high"></i></button></div>
            ${flipped ? gradeRow() : '<button class="lt-pbtn lt-primary lt-wide" data-a="flip">Показать ответ</button>'}</div>`;
        if (!flipped && S.get().autoSpeak) speech.speak(card.w, { lang, rate: 0.85 });
    }

    function drawWrite() {
        box.innerHTML = `${head()}<div class="lt-bigcard"><div class="lt-hint">Составьте своё предложение со словом</div>
            <div class="lt-bigword">${esc(card.w)}</div>${sub() ? `<div class="lt-pop-ipa">${esc(sub())}</div>` : ''}<div class="lt-pop-tr">${esc(card.tr || '')}</div>
            <textarea class="lt-textarea" data-r="ta" rows="3" placeholder="Напишите предложение…" lang="${lang === 'zh' ? 'zh' : 'en'}"></textarea>
            <div data-r="res"></div>
            <div class="lt-row"><button class="lt-pbtn lt-primary" data-a="wcheck">Проверить</button><button class="lt-pbtn" data-a="wskip">Пропустить</button></div></div>`;
    }

    function drawDict() {
        const text = card.ctx && card.ctx.length < 160 ? card.ctx : card.w;
        card._dict = text;
        box.innerHTML = `${head()}<div class="lt-bigcard"><div class="lt-hint">Послушайте и напишите, что услышали</div>
            <div class="lt-pop-actions"><button class="lt-pbtn lt-primary" data-a="dsay"><i class="fa-solid fa-volume-high"></i> Слушать</button><button class="lt-pbtn" data-a="dslow">🐢 Медленно</button></div>
            <textarea class="lt-textarea" data-r="ta" rows="2" placeholder="Что вы услышали?" lang="${lang === 'zh' ? 'zh' : 'en'}"></textarea>
            <div data-r="res"></div>
            <div class="lt-row"><button class="lt-pbtn lt-primary" data-a="dcheck">Проверить</button><button class="lt-pbtn" data-a="wskip">Пропустить</button></div></div>`;
        speech.speak(text, { lang, rate: 0.85 });
    }

    function grade(g) {
        const upd = review(card, g);
        Object.assign(S.getWord(lang, card.w), upd);
        S.bump('reviewed');
        if (g === 0) queue.push(card);        // see it again in this session
        done++;
        S.save();
        next();
    }

    box.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-a]');
        if (!b || !box.isConnected) return;
        const a = b.dataset.a;
        if (a === 'mode') { mode = b.dataset.m; S.get()._cardMode = mode; return start(); }
        if (!card) return;
        const res = $('[data-r="res"]', box);
        if (a === 'say') return void speech.speak(card.w, { lang, rate: 0.85 });
        if (a === 'flip') { flipped = true; return drawFlip(); }
        if (a === 'g') return grade(+b.dataset.g);
        if (a === 'wskip') return grade(GRADES.again);
        if (a === 'dsay') return void speech.speak(card._dict, { lang });
        if (a === 'dslow') return void speech.speak(card._dict, { lang, rate: 0.6 });
        if (a === 'dcheck') {
            const typed = $('[data-r="ta"]', box).value.trim();
            if (!typed) return;
            const ok = sameAnswer(typed, card._dict);
            res.innerHTML = `<div class="lt-diffbox">${diffHtml(typed, card._dict)}</div><div class="lt-pop-tr">${ok ? 'Верно!' : 'Есть отличия — правильный текст выше.'}</div>${gradeRow()}`;
            S.bump('written');
            return;
        }
        if (a === 'wcheck') {
            const typed = $('[data-r="ta"]', box).value.trim();
            if (!typed) return;
            res.innerHTML = spinner('Проверяю…');
            const shown = card;
            try {
                const r = await llm.reviewSentence({ word: card.w, sentence: typed });
                if (card !== shown) return;
                S.logMistakes(r.errors);
                S.bump('written');
                res.innerHTML = `<div class="lt-pop-tr">${r.ok ? '✅ Хорошо' : '✏️ Есть что поправить'}</div><div class="lt-diffbox">${diffHtml(typed, r.corrected)}</div>${r.feedback ? `<div class="lt-note">${esc(r.feedback)}</div>` : ''}${gradeRow().replace('g2">Хорошо', `g2">${r.ok ? 'Хорошо' : 'Ок'}`)}`;
            } catch (err) {
                res.innerHTML = `<div class="lt-pop-err">${esc(err.message)}</div>`;
            }
        }
    });

    start();
}
