// "Прогресс" tab: streak, daily goal, activity, level map, typical mistakes, speaking trend.
import * as S from './state.js';
import * as st from './st.js';
import { streak, dayKey, DAY } from './srs.js';
import { wordsAtLevel, levelLabel, loadData } from './levels.js';
import { catName } from './tab-write.js';
import { $, esc } from './ui.js';

const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

export function activityOf(d) {
    return d ? (d.added || 0) + (d.reviewed || 0) + (d.written || 0) + (d.spoken || 0) + (d.checked || 0) : 0;
}

/** { recent, previous } mean score of the last 10 and the 10 before for repeat-after-me exercises. */
export function speakingTrend(list) {
    const sc = list.filter((x) => x.kind === 'shadow').map((x) => x.score);
    return { count: sc.length, recent: avg(sc.slice(-10)), previous: sc.length > 10 ? avg(sc.slice(-20, -10)) : null };
}

/** Mistakes per 100 words in free answers: last 5 and the 5 before. */
export function answerTrend(list) {
    const an = list.filter((x) => x.kind === 'answer' && x.words > 0);
    const rate = (a) => (a.length ? (100 * a.reduce((s, x) => s + x.errors, 0)) / a.reduce((s, x) => s + x.words, 0) : null);
    return { count: an.length, recent: rate(an.slice(-5)), previous: an.length > 5 ? rate(an.slice(-10, -5)) : null };
}

export async function mount(box, opts = {}) {
    const lang = S.get().lang;
    const s = S.get();
    await loadData(lang, st.baseUrl).catch(() => { });
    if (!box.isConnected) return;

    const t = S.today();
    const goal = s.dailyGoal || 10;
    const pct = Math.min(100, Math.round((100 * t.reviewed) / goal));
    const sk = streak(s.stats.days);

    // last 14 days
    const bars = [];
    for (let i = 13; i >= 0; i--) {
        const k = dayKey(Date.now() - i * DAY);
        bars.push({ k, v: activityOf(s.stats.days[k]) });
    }
    const maxV = Math.max(5, ...bars.map((b) => b.v));

    // level map
    const maxLevel = lang === 'zh' ? 7 : 6;
    const rows = [];
    for (let n = 1; n <= maxLevel; n++) {
        const all = wordsAtLevel(lang, n);
        if (!all.length) continue;
        const got = all.filter((w) => S.isKnown(lang, w) || S.getWord(lang, w)).length;
        rows.push(`<div class="lt-lvrow"><span class="lt-lvl lt-l${Math.min(n, 6)}">${esc(levelLabel(lang, n))}</span>
            <div class="lt-meter"><i style="width:${Math.min(100, (100 * got) / all.length).toFixed(1)}%"></i></div><span class="lt-count">${got}/${all.length}</span></div>`);
    }

    const vocab = S.vocabList(lang).filter((e) => !e.phrase);
    const knownN = Object.keys(s.known).filter((k) => k.startsWith(lang + ':')).length;
    const matureN = vocab.filter((e) => e.status === 'mature').length;

    // mistakes
    const mist = Object.entries(s.stats.mistakes || {}).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const mMax = mist.length ? mist[0][1] : 1;
    const mistHtml = mist.length
        ? mist.map(([k, v]) => `<div class="lt-lvrow"><span class="lt-catname">${esc(catName(k))}</span><div class="lt-meter bad"><i style="width:${(100 * v / mMax).toFixed(0)}%"></i></div><span class="lt-count">${v}</span></div>`).join('')
            + `<div class="lt-row"><button class="lt-pbtn lt-primary" data-a="drill" data-c="${esc(mist[0][0])}"><i class="fa-solid fa-dumbbell"></i> Потренировать: ${esc(catName(mist[0][0]))}</button></div>`
        : '<div class="lt-hint">Пока нет данных. Проверяйте свои тексты и ответы во вкладках «Письмо» и «Речь» — здесь появятся ваши типичные ошибки.</div>';

    // speaking
    const sp = speakingTrend(s.stats.speaking);
    const an = answerTrend(s.stats.speaking);
    const arrow = (cur, prev, goodUp) => (prev == null ? '' : ((cur - prev) * (goodUp ? 1 : -1) > 0 ? ' ▲' : (cur === prev ? '' : ' ▼')));
    const speakHtml = (sp.count || an.count)
        ? `${sp.count ? `<div class="lt-stat"><b>${Math.round(sp.recent)}%</b><span>точность повтора (последние 10)${arrow(sp.recent, sp.previous, true)}</span></div>` : ''}
           ${an.count ? `<div class="lt-stat"><b>${an.recent.toFixed(1)}</b><span>ошибок на 100 слов в ответах${arrow(an.recent, an.previous, false)}</span></div>` : ''}`
        : '<div class="lt-hint">Пока нет данных. Попробуйте «Повтор» или «Вопросы» во вкладке «Речь».</div>';

    box.innerHTML = `
        <div class="lt-stats-top">
            <div class="lt-stat"><b>${sk}</b><span>${sk === 1 ? 'день' : 'дн.'} подряд 🔥</span></div>
            <div class="lt-stat"><b>${vocab.length}</b><span>слов в словаре</span></div>
            <div class="lt-stat"><b>${knownN}</b><span>знаю</span></div>
            <div class="lt-stat"><b>${matureN}</b><span>выучено</span></div>
        </div>
        <div class="lt-label">Цель на сегодня — повторить ${goal}</div>
        <div class="lt-meter big"><i style="width:${pct}%"></i></div><div class="lt-count">${t.reviewed} из ${goal} · добавлено ${t.added} · письмо ${t.written + t.checked} · речь ${t.spoken}</div>
        <div class="lt-label">Активность за 14 дней</div>
        <div class="lt-bars">${bars.map((b) => `<div class="lt-bar-col" title="${b.k}: ${b.v}"><i style="height:${Math.max(b.v ? 8 : 2, (100 * b.v) / maxV)}%"></i></div>`).join('')}</div>
        <div class="lt-label">Карта слов: сколько вы уже знаете или сохранили</div>${rows.join('') || '<div class="lt-hint">Данные уровней не загружены.</div>'}
        <div class="lt-label">Ваши частые ошибки</div>${mistHtml}
        <div class="lt-label">Речь</div><div class="lt-stats-top">${speakHtml}</div>`;

    box.addEventListener('click', (e) => {
        const b = e.target.closest('[data-a="drill"]');
        if (b) opts.go?.('write', { mode: 'drill', cat: b.dataset.c });
    });
}
