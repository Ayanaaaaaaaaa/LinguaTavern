// "Уровни" tab: discover words and read sentences by level.
import * as S from './state.js';
import * as speech from './speech.js';
import * as llm from './llm.js';
import * as st from './st.js';
import { $, esc, spinner, emit } from './ui.js';
import { wordsAtLevel, levelLabel, loadData, lookupZh, pinyinOf } from './levels.js';
import { translate, dictionaryEn } from './translate.js';
import { sentencesFor, shuffle } from './bank.js';

export async function mount(box) {
    const lang = S.get().lang;
    await loadData(lang, st.baseUrl).catch(() => { });
    const max = lang === 'zh' ? 7 : 6;
    let level = Math.min(S.userLevel() + (S.userLevel() < max ? 0 : 0), max);
    let mode = 'words';
    let pool = [];
    let word = null;
    let revealed = null;
    let sents = [];
    let si = 0;
    let genBusy = false;

    const chips = () => Array.from({ length: max }, (_, i) => `<button class="lt-chipbtn ${i + 1 === level ? 'on' : ''}" data-a="lvl" data-n="${i + 1}">${esc(levelLabel(lang, i + 1))}</button>`).join('');

    function frame() {
        box.innerHTML = `<div class="lt-seg"><button class="${mode === 'words' ? 'on' : ''}" data-a="mode" data-m="words">Слова</button><button class="${mode === 'sents' ? 'on' : ''}" data-a="mode" data-m="sents">Предложения</button></div>
            <div class="lt-chiprow">${chips()}</div><div data-r="body"></div>`;
        mode === 'words' ? nextWord() : loadSents();
    }

    // ---------------------------------------------------------------- words
    function refill() {
        const all = wordsAtLevel(lang, level);
        pool = shuffle(all.filter((w) => !S.isKnown(lang, w) && !S.getWord(lang, w)));
    }

    function nextWord() {
        const body = $('[data-r="body"]', box);
        if (!pool.length) refill();
        const all = wordsAtLevel(lang, level);
        const known = all.filter((w) => S.isKnown(lang, w)).length;
        const saved = all.filter((w) => S.getWord(lang, w)).length;
        const stat = `<div class="lt-hint">${esc(levelLabel(lang, level))}: всего ${all.length} · знаю ${known} · в словаре ${saved} · осталось ${pool.length}</div>`;
        word = pool.pop();
        revealed = null;
        if (!word) { body.innerHTML = `${stat}<div class="lt-empty">На этом уровне новых слов не осталось 🎉 Выберите другой уровень.</div>`; return; }
        const z = lang === 'zh' ? lookupZh(word) : null;
        body.innerHTML = `${stat}<div class="lt-bigcard">
            <div class="lt-bigword">${esc(word)}</div>
            ${z ? `<div class="lt-pop-ipa">${esc(z.pinyin)}</div><div class="lt-pop-def">${esc(z.gloss)}</div>` : ''}
            <div class="lt-reveal" data-r="rev"><button class="lt-pbtn" data-a="reveal"><i class="fa-solid fa-eye"></i> Показать перевод</button></div>
            <div class="lt-pop-actions">
                <button class="lt-pbtn" data-a="say"><i class="fa-solid fa-volume-high"></i></button>
                <button class="lt-pbtn" data-a="know"><i class="fa-solid fa-check"></i> Знаю</button>
                <button class="lt-pbtn lt-primary" data-a="learn"><i class="fa-solid fa-star"></i> Учить</button>
                <button class="lt-pbtn" data-a="skip">Дальше <i class="fa-solid fa-forward"></i></button>
            </div></div>`;
    }

    async function reveal() {
        const rev = $('[data-r="rev"]', box);
        rev.innerHTML = spinner('Перевожу…');
        const w = word;
        try {
            const [tr, dict] = await Promise.all([translate(w), lang === 'en' ? dictionaryEn(w) : null]);
            if (word !== w) return;
            revealed = { tr, ipa: dict?.ipa, def: dict?.meanings?.[0]?.def, pos: dict?.meanings?.[0]?.pos, ex: dict?.meanings?.find((m) => m.example)?.example };
            rev.innerHTML = `<div class="lt-pop-tr">${esc(tr)}</div>${revealed.ipa ? `<span class="lt-pop-ipa">${esc(revealed.ipa)}</span>` : ''}${revealed.def ? `<div class="lt-pop-def">${esc(revealed.pos)} — ${esc(revealed.def)}</div>` : ''}${revealed.ex ? `<div class="lt-pop-ex">“${esc(revealed.ex)}”</div>` : ''}`;
        } catch (e) {
            rev.innerHTML = `<div class="lt-pop-err">${esc(e.message)}</div>`;
        }
    }

    async function learnWord() {
        if (!revealed) await reveal();
        const z = lang === 'zh' ? lookupZh(word) : null;
        S.saveWord({ lang, w: word, f: word, tr: revealed?.tr || '', lvl: level, ipa: revealed?.ipa, pinyin: z?.pinyin || (lang === 'zh' ? pinyinOf(word) : undefined), def: revealed?.def || z?.gloss || '', pos: revealed?.pos || '', ex: revealed?.ex });
    }

    // ---------------------------------------------------------------- sentences
    async function loadSents() {
        const body = $('[data-r="body"]', box);
        body.innerHTML = spinner('Загружаю…');
        sents = shuffle(await sentencesFor(lang, level));
        si = 0;
        drawSent();
    }

    function drawSent() {
        const body = $('[data-r="body"]', box);
        const s = sents[si];
        const gen = `<button class="lt-pbtn" data-a="gen" ${genBusy ? 'disabled' : ''}><i class="fa-solid fa-wand-magic-sparkles"></i> ${genBusy ? 'Генерирую…' : 'Ещё от ИИ'}</button>`;
        if (!s) { body.innerHTML = `<div class="lt-empty">Во встроенной базе нет предложений этого уровня.</div><div class="lt-row">${gen}</div>`; return; }
        body.innerHTML = `<div class="lt-hint">${si + 1} из ${sents.length}${sents.length < 30 ? ' · встроенная база небольшая, остальное можно сгенерировать' : ''}</div>
            <div class="lt-bigcard"><div class="lt-sent">${esc(s.t)}</div>
            ${s.py ? `<div class="lt-pop-ipa">${esc(s.py)}</div>` : ''}
            <div class="lt-reveal" data-r="rev">${s.tr ? `<button class="lt-pbtn" data-a="srev"><i class="fa-solid fa-eye"></i> Показать перевод</button>` : `<button class="lt-pbtn" data-a="srev"><i class="fa-solid fa-eye"></i> Перевести</button>`}</div>
            <div class="lt-pop-actions"><button class="lt-pbtn" data-a="ssay"><i class="fa-solid fa-volume-high"></i></button><button class="lt-pbtn" data-a="sslow">🐢</button><button class="lt-pbtn" data-a="sshadow"><i class="fa-solid fa-microphone"></i> Повторить</button><button class="lt-pbtn" data-a="ssave"><i class="fa-solid fa-star"></i></button></div>
            <div class="lt-row"><button class="lt-pbtn" data-a="sprev" ${si ? '' : 'disabled'}><i class="fa-solid fa-backward"></i></button><button class="lt-pbtn" data-a="snext">Дальше <i class="fa-solid fa-forward"></i></button>${gen}</div></div>`;
    }

    box.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-a]');
        if (!b) return;
        const a = b.dataset.a;
        if (a === 'lvl') { level = +b.dataset.n; pool = []; return frame(); }
        if (a === 'mode') { mode = b.dataset.m; return frame(); }
        if (a === 'say') return void speech.speak(word, { lang, rate: 0.8 });
        if (a === 'reveal') return reveal();
        if (a === 'know') { S.setKnown(lang, word, true); return nextWord(); }
        if (a === 'learn') { await learnWord(); return nextWord(); }
        if (a === 'skip') return nextWord();
        const s = sents[si];
        if (a === 'ssay') return void speech.speak(s.t, { lang });
        if (a === 'sslow') return void speech.speak(s.t, { lang, rate: 0.6 });
        if (a === 'sshadow') return emit('lt:open-hub', { tab: 'speak', mode: 'shadow', items: sents.slice(si, si + 10).map((x) => x.t) });
        if (a === 'sprev') { si = Math.max(0, si - 1); return drawSent(); }
        if (a === 'snext') { si = Math.min(sents.length - 1, si + 1); return drawSent(); }
        if (a === 'srev') {
            const rev = $('[data-r="rev"]', box);
            if (!s.tr) {
                rev.innerHTML = spinner('Перевожу…');
                try { s.tr = await translate(s.t); s.trLang = 'native'; } catch (err) { rev.innerHTML = `<div class="lt-pop-err">${esc(err.message)}</div>`; return; }
            }
            if (s === sents[si]) rev.innerHTML = `<div class="lt-pop-tr">${esc(s.tr)}</div>${s.trLang === 'en' ? '<div class="lt-hint">(перевод на английский)</div>' : ''}`;
            return;
        }
        if (a === 'ssave') {
            const ph = S.get().phrases;
            if (!ph.some((p) => p.t === s.t)) {
                let tr = s.trLang === 'en' ? '' : s.tr;
                if (!tr) { try { tr = await translate(s.t); } catch { tr = ''; } }
                ph.push({ t: s.t, tr: tr || '', lang, added: Date.now() });
                S.save();
            }
            b.classList.add('on');
            return;
        }
        if (a === 'gen') {
            genBusy = true;
            drawSent();
            try {
                const items = await llm.genSentences({ n: 8, words: [] });
                sents.push(...items.map((x) => ({ t: x.target, tr: x.tr, trLang: 'native' })));
                if (items.length) si = sents.length - items.length;
            } catch (err) { st.toast('error', err.message || String(err)); }
            genBusy = false;
            drawSent();
        }
    });

    frame();
}
