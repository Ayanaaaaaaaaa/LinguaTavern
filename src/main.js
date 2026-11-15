// Lingua Tavern — learn English or Chinese while you roleplay.
// Main module (loaded by index.js): settings panel, wand-menu button, and wiring of the other modules.
import * as st from './st.js';
import * as S from './state.js';
import * as speech from './speech.js';
import * as wordtap from './wordtap.js';
import * as tutor from './tutor.js';
import * as hub from './hub.js';
import * as mic from './mic.js';
import { setHskStandard, EN_LEVELS } from './levels.js';
import { el, $, $$, esc } from './ui.js';

const lvOpt = (cur) => EN_LEVELS.map((l) => `<option value="${l}" ${cur === l ? 'selected' : ''}>${l}</option>`).join('');
const hskOpt = (cur) => [1, 2, 3, 4, 5, 6, 7].map((n) => `<option value="${n}" ${+cur === n ? 'selected' : ''}>${n === 7 ? 'HSK 7–9' : 'HSK ' + n}</option>`).join('');

function sel(key, label, options, type = 'str') {
    return `<label class="lt-set"><span>${label}</span><select class="text_pole" data-k="${key}" data-t="${type}">${options}</select></label>`;
}
const opts = (cur, list) => list.map(([v, n]) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${n}</option>`).join('');
const chk = (key, label, hint = '') => `<label class="checkbox_label lt-chk" title="${esc(hint)}"><input type="checkbox" data-k="${key}" data-t="bool"><span>${label}</span></label>`;

function settingsHtml() {
    const s = S.get();
    return `<div class="inline-drawer lt-settings">
        <div class="inline-drawer-toggle inline-drawer-header"><b>Lingua Tavern — изучение языка</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div>
        <div class="inline-drawer-content">
            <div class="lt-set-row"><button class="menu_button" id="lt_open"><i class="fa-solid fa-graduation-cap"></i> Открыть Lingua Tavern</button></div>
            ${chk('enabled', 'Включить расширение')}
            <div class="lt-set-grid">
                ${sel('lang', 'Изучаю', opts(s.lang, [['en', 'English'], ['zh', '中文 (китайский)']]))}
                ${sel('native', 'Мой язык', opts(s.native, [['ru', 'Русский'], ['uk', 'Українська'], ['kk', 'Қазақша'], ['en', 'English']]))}
                <label class="lt-set lt-lv-en"><span>Мой уровень (English)</span><select class="text_pole" data-k="levelEn" data-t="str">${lvOpt(s.levelEn)}</select></label>
                <label class="lt-set lt-lv-zh"><span>Мой уровень (中文)</span><select class="text_pole" data-k="levelZh" data-t="int">${hskOpt(s.levelZh)}</select></label>
                ${sel('hskStd', 'Стандарт HSK', opts(s.hskStd, [[3, 'HSK 3.0 (новый)'], [2, 'HSK 2.0 (старый)']]), 'int')}
                ${sel('provider', 'Переводчик', opts(s.provider, [['google', 'Google (встроенный в ST)'], ['bing', 'Bing (встроенный в ST)'], ['llm', 'Моя модель из ST']]))}
            </div>
            <h4 class="lt-set-h">Чат</h4>
            <div class="lt-set-grid">
                ${sel('highlight', 'Подсвечивать слова', opts(s.highlight, [['above', 'Выше моего уровня'], ['levels', 'Все, по цвету уровня'], ['saved', 'Только мои сохранённые'], ['off', 'Не подсвечивать']]))}
                ${sel('msgBar', 'Панель под сообщением', opts(s.msgBar, [['all', 'У всех сообщений'], ['last', 'Только у последнего'], ['off', 'Скрыть']]))}
                ${sel('pinyin', 'Пиньинь над иероглифами', opts(s.pinyin, [['unknown', 'Над незнакомыми'], ['all', 'Над всеми'], ['off', 'Не показывать']]))}
            </div>
            <h4 class="lt-set-h">Производительность</h4>
            <div class="lt-set-grid">
                ${sel('scanLimit', 'Сколько новых сообщений обрабатывать сразу', opts(s.scanLimit, [[15, '15 — быстрее'], [30, '30 — обычно'], [60, '60 — больше подсветки']]), 'int')}
            </div>
            <div class="lt-hint">Старые сообщения обрабатываются при прокрутке. Переводы и определения кэшируются, поэтому повторные нажатия не создают новые запросы.</div>
            ${chk('popupDefs', 'Показывать английское определение и транскрипцию (бесплатный словарь, нужен интернет)')}
            ${chk('autoSpeak', 'Автоматически озвучивать новые ответы персонажа')}
            <h4 class="lt-set-h">Репетитор в ролевой игре</h4>
            ${chk('tutorLevel', 'Персонаж пишет на моём уровне', 'Скрытая инструкция модели: лексика и грамматика вашего уровня')}
            ${chk('tutorFollowUp', 'Заканчивать ответ вопросом ко мне', 'Так вы больше пишете и говорите сами')}
            ${chk('tutorRecast', 'Мягко повторять мои фразы правильно', 'Персонаж не поправляет прямо, а использует верную форму в ответе')}
            ${chk('coachAuto', 'Мини-проверка моих сообщений под ними (тратит запросы к модели)', 'Работает после ответа персонажа')}
            <h4 class="lt-set-h">Речь</h4>
            <div class="lt-set-grid">
                <label class="lt-set"><span>Скорость озвучки: <b data-r="rate-val"></b></span><input type="range" min="0.5" max="1.2" step="0.05" data-k="ttsRate" data-t="num"></label>
                <label class="lt-set"><span>Голос English</span><select class="text_pole" data-k="voiceEn" data-t="str" data-voice="en"></select></label>
                <label class="lt-set"><span>Голос 中文</span><select class="text_pole" data-k="voiceZh" data-t="str" data-voice="zh"></select></label>
                <label class="lt-set"><span>Цель: карточек в день</span><input type="number" class="text_pole" min="1" max="200" data-k="dailyGoal" data-t="int"></label>
            </div>
            ${chk('voiceAutoSend', 'Отправлять продиктованное сообщение сразу', 'Кнопка микрофона рядом с полем ввода')}
            <div class="lt-set-row"><button class="menu_button" id="lt_mic_test"><i class="fa-solid fa-microphone"></i> Проверить микрофон и озвучку</button></div>
            <div class="lt-hint">Словарь и прогресс хранятся в настройках SillyTavern. Резервную копию можно скачать во вкладке «Словарь».</div>
        </div></div>`;
}

function fillVoices(root) {
    for (const s of $$('select[data-voice]', root)) {
        const lang = s.dataset.voice;
        const cur = S.get()[s.dataset.k] || '';
        const list = speech.voicesFor(lang);
        s.innerHTML = `<option value="">Автоматически</option>` + list.map((v) => `<option value="${esc(v.voiceURI)}" ${v.voiceURI === cur ? 'selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('');
    }
}

function syncLevelRows(root) {
    const zh = S.get().lang === 'zh';
    $$('.lt-lv-en', root).forEach((x) => { x.style.display = zh ? 'none' : ''; });
    $$('.lt-lv-zh', root).forEach((x) => { x.style.display = zh ? '' : 'none'; });
    $$('[data-k="hskStd"]', root).forEach((x) => { x.closest('.lt-set').style.display = zh ? '' : 'none'; });
    $$('[data-k="pinyin"]', root).forEach((x) => { x.closest('.lt-set').style.display = zh ? '' : 'none'; });
}

const RELOAD_KEYS = new Set(['enabled', 'lang', 'levelEn', 'levelZh', 'hskStd', 'highlight', 'msgBar', 'pinyin', 'scanLimit']);
const TUTOR_KEYS = new Set(['enabled', 'lang', 'levelEn', 'levelZh', 'tutorLevel', 'tutorFollowUp', 'tutorRecast']);

async function onSetting(e, root) {
    const t = e.target.closest('[data-k]');
    if (!t) return;
    const key = t.dataset.k;
    const type = t.dataset.t;
    const s = S.get();
    let v;
    if (type === 'bool') v = t.checked;
    else if (type === 'num') v = parseFloat(t.value);
    else if (type === 'int') v = parseInt(t.value, 10);
    else v = t.value;
    if ((type === 'num' || type === 'int') && Number.isNaN(v)) return;
    s[key] = v;
    S.save();
    if (key === 'ttsRate') { const o = $('[data-r="rate-val"]', root); if (o) o.textContent = v.toFixed(2); return; }
    if (key === 'hskStd') setHskStandard(v);
    if (key === 'lang') syncLevelRows(root);
    if (TUTOR_KEYS.has(key)) tutor.apply();
    if (key === 'enabled') mic.setVisible(v);
    if (RELOAD_KEYS.has(key)) {
        if (key === 'enabled' && !v) wordtap.disable();
        else await wordtap.refresh();
    }
}

function mountSettings() {
    const host = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (!host || document.getElementById('lt_open')) return;
    const root = el(settingsHtml());
    host.appendChild(root);
    const s = S.get();
    for (const t of $$('[data-k]', root)) {
        const v = s[t.dataset.k];
        if (t.dataset.t === 'bool') t.checked = !!v;
        else if (t.tagName === 'INPUT') t.value = v;
    }
    $('[data-r="rate-val"]', root).textContent = (+s.ttsRate || 0.9).toFixed(2);
    fillVoices(root);
    syncLevelRows(root);
    root.addEventListener('change', (e) => onSetting(e, root));
    root.addEventListener('input', (e) => { if (e.target.dataset?.k === 'ttsRate') onSetting(e, root); });
    $('#lt_open', root).addEventListener('click', () => hub.openHub('learn'));
    $('#lt_mic_test', root).addEventListener('click', async () => {
        const issue = speech.micIssue();
        if (!speech.ttsSupported()) st.toast('warning', 'Озвучка не поддерживается этим браузером.');
        else await speech.speak(s.lang === 'zh' ? '你好，欢迎使用。' : 'Hello! The voice works.', { lang: s.lang });
        st.toast(issue ? 'warning' : 'success', issue || 'Распознавание речи доступно. При первом нажатии на микрофон браузер спросит разрешение.');
    });
    if (speech.ttsSupported()) speechSynthesis.addEventListener?.('voiceschanged', () => fillVoices(root));
}

function mountMenuButton() {
    const menu = document.getElementById('extensionsMenu');
    if (!menu || document.getElementById('lt_menu_open')) return;
    const item = el(`<div id="lt_menu_open" class="list-group-item flex-container flexGap5 interactable" tabindex="0" role="button">
        <div class="fa-solid fa-graduation-cap extensionsMenuExtensionButton"></div><span>Lingua Tavern</span></div>`);
    item.addEventListener('click', () => hub.openHub('learn'));
    menu.appendChild(item);
}

async function main() {
    S.init();
    setHskStandard(S.get().hskStd);
    mountSettings();
    mountMenuButton();
    hub.init();
    mic.init();
    tutor.init();
    await wordtap.init();
    console.debug('[Lingua Tavern] ready');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => main().catch((e) => console.error('[Lingua Tavern]', e)));
else main().catch((e) => console.error('[Lingua Tavern]', e));
