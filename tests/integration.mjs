// Integration test: loads the real extension files in jsdom, inside a copy of the directory layout of a real SillyTavern install
// (public/scripts/extensions/third-party/lingua-tavern), with stub script.js / extensions.js that export the same names the real ones do.
// run: node tests/integration.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(process.env.LT_TMP || os.tmpdir(), 'lt-int-'));
const EXT = path.join(TMP, 'public/scripts/extensions/third-party/lingua-tavern');
fs.mkdirSync(EXT, { recursive: true });
for (const f of ['index.js', 'manifest.json', 'style.css']) fs.copyFileSync(path.join(ROOT, f), path.join(EXT, f));
fs.cpSync(path.join(ROOT, 'src'), path.join(EXT, 'src'), { recursive: true });
fs.cpSync(path.join(ROOT, 'data'), path.join(EXT, 'data'), { recursive: true });

// ---------------------------------------------------------------- stubs of SillyTavern modules (same export names as the real ones)
fs.writeFileSync(path.join(TMP, 'public/script.js'), `
class Emitter { constructor(){ this.l = {}; } on(n, f){ (this.l[n] ||= []).push(f); } async emit(n, ...a){ for (const f of [...(this.l[n]||[])]) await f(...a); } }
export const eventSource = new Emitter();
export const event_types = { APP_READY:'app_ready', MESSAGE_SWIPED:'message_swiped', MESSAGE_SENT:'message_sent', MESSAGE_RECEIVED:'message_received', MESSAGE_EDITED:'message_edited', MESSAGE_DELETED:'message_deleted', MESSAGE_UPDATED:'message_updated', CHAT_CHANGED:'chat_id_changed', GENERATION_STARTED:'generation_started', GENERATION_STOPPED:'generation_stopped', GENERATION_ENDED:'generation_ended', USER_MESSAGE_RENDERED:'user_message_rendered', CHARACTER_MESSAGE_RENDERED:'character_message_rendered' };
export const stub = { saves: 0, prompts: {}, llm: [] };
export const saveSettingsDebounced = () => { stub.saves++; };
export function getRequestHeaders() { return { 'Content-Type': 'application/json', 'X-CSRF-Token': 't' }; }
export const extension_prompt_types = { NONE: -1, IN_PROMPT: 0, IN_CHAT: 1, BEFORE_PROMPT: 2 };
export const extension_prompt_roles = { SYSTEM: 0, USER: 1, ASSISTANT: 2 };
export function setExtensionPrompt(key, value, position, depth, scan = false, role = 0) { stub.prompts[key] = { value, position, depth, role }; }
export async function generateRaw({ prompt = '', systemPrompt = '', responseLength = null, trimNames = true } = {}) { return globalThis.__llm(prompt, systemPrompt); }
`);
fs.writeFileSync(path.join(TMP, 'public/scripts/extensions.js'), `
export const extension_settings = {};
export const ctx = { chat: [], name1: 'User', name2: 'Alice' };
export function getContext() { return ctx; }
`);

// ---------------------------------------------------------------- browser environment
const dom = new JSDOM(`<!doctype html><html><body>
  <div id="extensionsMenu"></div><div id="extensions_settings2"></div>
  <div id="chat"></div>
  <div id="send_form"><div id="leftSendForm"></div><textarea id="send_textarea"></textarea><div id="send_but"></div></div>
</body></html>`, { pretendToBeVisual: true, url: 'http://localhost:8000/' });
const w = dom.window;
const define = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
for (const k of ['window', 'document', 'Node', 'NodeFilter', 'Element', 'HTMLElement', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'MutationObserver', 'DocumentFragment', 'getComputedStyle', 'requestAnimationFrame']) {
    define(k, k === 'window' ? w : (k === 'requestAnimationFrame' ? w.requestAnimationFrame.bind(w) : w[k]));
}
define('navigator', w.navigator);
w.isSecureContext = true;
define('IntersectionObserver', class { observe() { } unobserve() { } disconnect() { } });
w.IntersectionObserver = globalThis.IntersectionObserver;
define('Audio', class { play() { return Promise.resolve(); } pause() { } });
define('URL', URL);
w.URL.createObjectURL = () => 'blob:x';

// fake speech recognition: tests feed it phrases
const sr = { last: null, say: [] };
class FakeSR {
    constructor() { this.onresult = null; this.onend = null; this.onerror = null; sr.last = this; }
    start() { setTimeout(() => this.fire(), 20); }
    fire() { const t = sr.say.shift() ?? ''; if (t) this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: t, confidence: 0.9 }], { isFinal: true })] }); setTimeout(() => this.onend?.(), 5); }
    stop() { }
}
w.SpeechRecognition = FakeSR;
globalThis.SpeechRecognition = FakeSR;

// ---------------------------------------------------------------- fake network
const calls = { translate: [], dict: [], llm: [] };
globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.includes('/api/translate/')) {
        const body = JSON.parse(init.body);
        calls.translate.push({ url: u, body, headers: init.headers });
        return { ok: true, status: 200, text: async () => `RU[${body.text.slice(0, 40)}]` };
    }
    if (u.includes('dictionaryapi.dev')) {
        calls.dict.push(u);
        return { ok: true, status: 200, json: async () => [{ phonetic: '/test/', phonetics: [{ text: '/tɛst/', audio: '' }], meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'a procedure', example: 'a test case' }] }] }] };
    }
    if (u.startsWith('file:')) {
        const p = fileURLToPath(u);
        if (!fs.existsSync(p)) return { ok: false, status: 404 };
        const txt = fs.readFileSync(p, 'utf8');
        return { ok: true, status: 200, json: async () => JSON.parse(txt), text: async () => txt };
    }
    return { ok: false, status: 404 };
};
w.fetch = globalThis.fetch;

// fake language model
const J = (o) => JSON.stringify(o);
globalThis.__llm = async (prompt, system) => {
    calls.llm.push({ prompt, system });
    if (prompt.includes('Learner text:')) return J({ corrected: 'I went to school yesterday.', natural: 'I went to school yesterday.', score: 3, errors: [{ wrong: 'goed', right: 'went', cat: 'tense', why: 'Неправильный глагол go: went.' }], praise: 'Понятная мысль.', tip: 'Повторите неправильные глаголы.' });
    if (prompt.includes('The learner wants to say this')) return J({ options: [{ text: 'Could we move it to tomorrow?', style: 'simple', note: 'Вежливо.' }, { text: 'Would it be possible to reschedule for tomorrow?', style: 'natural', note: '' }, { text: 'I was wondering whether we could reschedule.', style: 'advanced', note: '' }], keywords: [{ w: 'reschedule', tr: 'перенести' }] });
    if (prompt.includes('fill-in-the-gap')) return J({ items: [{ sentence: 'I ___ to school yesterday.', answer: 'went', options: ['go', 'went', 'goed'], why: 'Past simple.' }, { sentence: 'She ___ a doctor.', answer: 'is', options: ['is', 'are', 'am'], why: 'she + is.' }] });
    if (prompt.includes('open questions')) return J({ items: ['What did you do yesterday?'] });
    if (prompt.includes('A learner answered a spoken question')) return J({ corrected: 'I like tea.', improved: 'I really like tea because it relaxes me.', errors: [{ wrong: 'I likes', right: 'I like', cat: 'agreement', why: 'I + like.' }], fluency_tip: 'Добавьте because.', praise: 'Хорошо!' });
    if (prompt.includes('Invent one short writing task')) return J({ title: 'My cat', task: 'Опишите кота.', min_words: 40, phrases: ['I have a cat'] });
    if (prompt.includes('Explain the word AS USED')) return J({ translation: 'откладывать', pos: 'глагол', meaning: 'to delay', example: 'Let us postpone it.', example_tr: 'Давайте отложим.', note: '' });
    if (prompt.includes('must write a sentence that uses')) return J({ ok: true, corrected: 'ok', feedback: 'ok', errors: [] });
    if (system.includes('translation engine')) return 'LLM-RU';
    if (system.includes('rewrite')) return 'Simple text.';
    return '{}';
};

// ---------------------------------------------------------------- tiny test runner
const results = [];
const errors = [];
const ok = (cond, name, extra = '') => { results.push({ cond: !!cond, name }); console.log(`${cond ? '  ok  ' : ' FAIL '} ${name}${!cond && extra ? '  → ' + extra : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 3000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch { /* retry */ } await wait(25); } return null; }
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
const change = (el, v) => { if (el.type === 'checkbox') el.checked = v; else el.value = v; el.dispatchEvent(new w.Event('change', { bubbles: true })); };
const origErr = console.error;
console.error = (...a) => { errors.push(a.map(String).join(' ')); origErr(...a); };
w.addEventListener('error', (e) => errors.push('window error: ' + e.message));
process.on('unhandledRejection', (e) => errors.push('unhandledRejection: ' + (e?.stack || e)));

const stURL = pathToFileURL(path.join(TMP, 'public/script.js')).href;
const extURL = pathToFileURL(path.join(TMP, 'public/scripts/extensions.js')).href;
const { eventSource, event_types, stub } = await import(stURL);
const { extension_settings, ctx } = await import(extURL);

// the chat DOM of SillyTavern
let mesCount = 0;
function addMes(html, { user = false, last = true } = {}) {
    $$('.mes.last_mes').forEach((m) => m.classList.remove('last_mes'));
    const m = document.createElement('div');
    m.className = 'mes' + (last ? ' last_mes' : '');
    m.setAttribute('mesid', String(mesCount++));
    m.setAttribute('is_user', String(user));
    m.setAttribute('is_system', 'false');
    m.innerHTML = `<div class="mes_block"><div class="ch_name">${user ? 'User' : 'Alice'}</div><div class="mes_text">${html}</div></div>`;
    $('#chat').appendChild(m);
    return m;
}

// ================================================================ 1. boot
console.log('\n[1] boot');
await import(pathToFileURL(path.join(EXT, 'index.js')).href);
await until(() => $('.lt-pop'));
ok($('.lt-pop'), 'popup element created');
ok($('#lt_open'), 'settings drawer mounted');
ok($('#lt_menu_open'), 'wand-menu item mounted');
ok($('#lt_mic'), 'mic button mounted');
ok($('#lt_quick_open') && getComputedStyle($('#lt_quick_open')).display !== 'none', 'quick access button mounted and visible');
const S0 = extension_settings.lingua_tavern;
ok(S0 && S0.lang === 'en' && S0.levelEn === 'B1', 'default settings written (en, B1)');
ok(stub.prompts.lingua_tavern?.value.includes('B1'), 'tutor instruction injected into the prompt', JSON.stringify(stub.prompts.lingua_tavern));

// ================================================================ 2. tap to translate
console.log('\n[2] tap-to-translate');
const m1 = addMes('<p>She decided to postpone the meeting because of the unexpected illness. *smiles*</p>');
const mu = addMes('<p>I goed to school yesterday.</p>', { user: true });
await until(() => $('.lt-w', m1));
const words = $$('.lt-w', m1);
ok(words.length >= 9, 'words wrapped in spans', 'n=' + words.length);
ok($('.lt-bar', m1) && $('.lt-bar [data-a="tr"]', m1), 'message bar with translate button');
ok($('.lt-bar [data-a="check"]', mu), 'user message has the check button');
const above = $$('.lt-above', m1).map((x) => x.dataset.w);
console.log('     above B1:', above.join(', ') || '(none)', '| badge:', $('.lt-badge', m1)?.textContent);
ok(above.includes('postpone') || above.includes('unexpected'), 'harder words are marked (above B1)');
const below = $$('.lt-w', m1).filter((x) => ['She', 'the', 'because'].includes(x.dataset.w));
ok(below.every((x) => !x.classList.contains('lt-above')), 'easy words are not marked');

const target = words.find((x) => x.dataset.w === 'postpone');
click(target);
ok($('.lt-pop.open'), 'popup opens on click');
await until(() => $('.lt-pop-tr')?.textContent.includes('RU['));
ok($('.lt-pop-tr')?.textContent === 'RU[postpone]', 'translation shown', $('.lt-pop-tr')?.textContent);
const call = calls.translate.at(-1);
ok(call?.url.endsWith('/api/translate/google') && call.body.lang === 'ru' && call.body.text === 'postpone', 'server translate called with {text, lang:ru}', JSON.stringify(call?.body));
ok(call?.headers?.['X-CSRF-Token'] === 't', 'request carries ST headers');
ok($('.lt-pop-word')?.textContent === 'postpone', 'popup shows the word');
ok($('.lt-pop-ctx')?.textContent.includes('postpone the meeting'), 'popup shows sentence context');
await until(() => $('.lt-pop-defs'));
ok($('.lt-pop-defs'), 'english definition from the dictionary shown');
click($('.lt-pop [data-a="save"]'));
const key = 'en:postpone';
ok(extension_settings.lingua_tavern.vocab[key]?.tr === 'RU[postpone]', 'word saved to the dictionary with translation', JSON.stringify(extension_settings.lingua_tavern.vocab[key]));
ok(target.classList.contains('lt-saved'), 'saved word gets highlighted');
click($('.lt-pop [data-a="ignore"]'));
ok(!target.classList.contains('lt-above') && extension_settings.lingua_tavern.ignored['en:postpone'], 'ignored word is no longer highlighted');
click($('.lt-pop [data-a="known"]'));
ok(extension_settings.lingua_tavern.known[key] === 1, '"I know it" recorded');
ok(!target.classList.contains('lt-above'), 'known word is no longer marked');
click($('.lt-pop [data-a="close"]'));
ok(!$('.lt-pop.open'), 'popup closes');

// ST replaces extension_settings.lingua_tavern when it reloads settings: writes must land in the live object
{
    const stateMod = await import(pathToFileURL(path.join(EXT, 'src/state.js')).href);
    extension_settings.lingua_tavern = structuredClone(extension_settings.lingua_tavern);
    const live = extension_settings.lingua_tavern;
    delete live.dailyGoal; // an older saved copy without a newer default key
    ok(stateMod.get().dailyGoal > 0 && live.dailyGoal > 0, 'missing defaults are filled in on a replaced settings object');
    stateMod.saveWord({ lang: 'en', w: 'reload-probe', tr: 'x' });
    ok(live.vocab[stateMod.vkey('en', 'reload-probe')]?.tr === 'x', 'state follows a replaced settings object (no stale copy)');
    stateMod.removeWord('en', 'reload-probe');
    ok(!live.vocab[stateMod.vkey('en', 'reload-probe')], 'removal also hits the live settings object');
}

// inflected form: "decided" -> lemma "decide"
click(words.find((x) => x.dataset.w === 'decided'));
ok($('.lt-pop-lemma')?.textContent.includes('decide'), 'inflected form shows its base word', $('.lt-pop-lemma')?.textContent);
click($('.lt-pop [data-a="close"]'));

// message translation + simplification
click($('.lt-bar [data-a="tr"]', m1));
await until(() => $('.lt-out .lt-out-text', m1));
ok($('.lt-out .lt-out-text', m1)?.textContent.startsWith('RU['), 'whole-message translation block appears');

// ================================================================ 3. swipe resets everything
console.log('\n[3] swipe / regenerate resets');
click(words.find((x) => x.dataset.w === 'meeting'));
ok($('.lt-pop.open'), 'popup open before swipe');
await eventSource.emit(event_types.MESSAGE_SWIPED, m1.getAttribute('mesid'));
ok(!$('.lt-pop.open'), 'swipe closes the popup');
ok(!$('.lt-out', m1), 'swipe removes the translation block');
// ST re-renders the message text on swipe
$('.mes_text', m1).innerHTML = '<p>The weather was magnificent, so they hurried to the harbour.</p>';
await until(() => $('.lt-w', m1) && $('.mes_text', m1).textContent.includes('magnificent') && $$('.lt-w', m1).some((x) => x.dataset.w === 'magnificent'));
ok($$('.lt-w', m1).some((x) => x.dataset.w === 'magnificent'), 'new swipe text is wrapped again');
ok(!$('.lt-out', m1), 'no stale outputs after re-render');
click($('.lt-bar [data-a="tr"]', m1));
await until(() => $('.lt-out .lt-out-text', m1));
ok($('.lt-out .lt-out-text', m1)?.textContent.includes('magnificent') || $('.lt-out .lt-out-text', m1)?.textContent.includes('weather'), 'translation of the NEW text');
await eventSource.emit(event_types.MESSAGE_SWIPED, m1.getAttribute('mesid'));
ok(!$('.lt-out', m1), 'second swipe resets again');
await eventSource.emit(event_types.GENERATION_STARTED);
click(!!$$('.lt-w', m1)[0] ? $$('.lt-w', m1)[0] : m1);
ok(true, 'click during generation does not throw');
await eventSource.emit(event_types.GENERATION_ENDED);

// edit + chat change
click($$('.lt-w', m1)[2]);
await eventSource.emit(event_types.CHAT_CHANGED);
ok(!$('.lt-pop.open'), 'chat change closes the popup');

// ================================================================ 4. settings → live restyle
console.log('\n[4] settings');
const sel = (k) => $(`[data-k="${k}"]`);
change(sel('highlight'), 'levels');
await until(() => $('.lt-lv', m1));
ok($('.lt-lv', m1), 'highlight mode "levels" colours words');
change(sel('highlight'), 'above');
change(sel('levelEn'), 'A2');
await until(() => $$('.lt-above', m1).length > 0);
ok(extension_settings.lingua_tavern.levelEn === 'A2', 'level saved');
ok(stub.prompts.lingua_tavern.value.includes('A2'), 'tutor instruction follows the level');
change(sel('levelEn'), 'B1');
change(sel('tutorFollowUp'), true);
change(sel('tutorRecast'), true);
ok(/question/.test(stub.prompts.lingua_tavern.value) && /recast/i.test(stub.prompts.lingua_tavern.value), 'follow-up and recast instructions injected');
change(sel('tutorLevel'), false); change(sel('tutorFollowUp'), false); change(sel('tutorRecast'), false);
ok(stub.prompts.lingua_tavern.value === '', 'all tutor options off → prompt cleared');
change(sel('tutorLevel'), true);
change(sel('msgBar'), 'last');
await until(() => !$('.lt-bar', $('.mes[mesid="0"]')));
ok(!$('.lt-bar', $$('.mes')[0]) && $('.lt-bar', $$('.mes').at(-1)), 'bar only on the last message');
change(sel('msgBar'), 'all');
await until(() => $('.lt-bar', $$('.mes')[0]));

// ================================================================ 5. hub tabs
console.log('\n[5] hub tabs');
click($('#lt_open'));
await until(() => $('.lt-hub'));
ok($('.lt-hub') && $$('.lt-tab').length === 6, 'hub opens with 6 tabs');
const tab = async (id) => { click($(`.lt-tab[data-tab="${id}"]`)); await wait(60); };
await until(() => $('.lt-bigword'));
ok($('.lt-bigword'), 'learn: shows a word card');
const wordShown = $('.lt-bigword').textContent;
click($('[data-a="learn"]'));
await until(() => extension_settings.lingua_tavern.vocab['en:' + wordShown]);
ok(extension_settings.lingua_tavern.vocab['en:' + wordShown], 'learn: "Учить" adds the word to the dictionary');
click($('[data-a="mode"][data-m="sents"]'));
await until(() => $('.lt-sent'));
ok($('.lt-sent'), 'learn: sentence mode shows a sentence');
click($('[data-a="lvl"][data-n="2"]'));
await wait(80);
ok($('.lt-chipbtn.on')?.textContent === 'A2', 'learn: level chip switches');

await tab('cards');
ok($('.lt-bigword') && $('[data-a="flip"]'), 'cards: a due/new card is offered');
click($('[data-a="flip"]'));
ok($('[data-a="g"][data-g="2"]'), 'cards: grade buttons after flip');
click($('[data-a="g"][data-g="2"]'));
const wv = Object.values(extension_settings.lingua_tavern.vocab).find((v) => v.last > 0);
ok(wv && wv.ivl >= 1, 'cards: review updates the interval', JSON.stringify(wv));

await tab('dict');
ok($$('.lt-item').length >= 2, 'dictionary lists saved words', 'n=' + $$('.lt-item').length);
const q = $('[data-r="q"]'); q.value = 'postpone'; q.dispatchEvent(new w.Event('input', { bubbles: true }));
await wait(250);
ok($$('.lt-item').length === 1, 'dictionary search filters');

await tab('write');
$('[data-r="ta"]').value = 'I goed to school yesterday.';
$('[data-r="ta"]').dispatchEvent(new w.Event('input', { bubbles: true }));
click($('.lt-hub [data-a="check"]'));
await until(() => $('.lt-score'));
ok($('.lt-score') && $('.lt-diffbox ins, .lt-diffbox .lt-ins'), 'write: correction with a diff is shown');
ok($('.lt-err .lt-cat')?.textContent === 'Времена глаголов', 'write: error category localised', $('.lt-err .lt-cat')?.textContent);
ok(extension_settings.lingua_tavern.stats.mistakes.tense === 1, 'write: mistake category logged');
click($('[data-a="r-chat"]'));
ok($('#send_textarea').value === 'I went to school yesterday.', 'write: corrected text goes to the chat input', $('#send_textarea').value);
click($('[data-a="mode"][data-m="say"]'));
$('[data-r="ta"]').value = 'хочу перенести встречу';
click($('[data-a="say-go"]'));
await until(() => $$('.lt-opt').length === 3);
ok($$('.lt-opt').length === 3, 'write: "how to say" gives 3 options');
click($('[data-a="kw"]'));
ok(extension_settings.lingua_tavern.vocab['en:reschedule'], 'write: keyword saved to the dictionary');
click($('[data-a="mode"][data-m="task"]'));
ok($('.lt-task-title') && $('.lt-hub [data-a="check"]'), 'write: task shown');
click($('[data-a="mode"][data-m="drill"]'));
click($('[data-a="drill-go"]'));
await until(() => $('.lt-gap'));
ok($('.lt-gap'), 'write: gap-fill exercise');
const gapBtn = $$('[data-a="pick"]').find((b) => b.dataset.o === 'went') || $$('[data-a="pick"]')[0];
click(gapBtn);
ok(gapBtn.classList.contains('good') || $('.lt-chipbtn.good'), 'write: correct option highlighted');

await tab('speak');
ok($('[data-a="rec"]') || $('.lt-empty'), 'speak: shadowing screen');
await until(() => $('[data-a="rec"]'));
const target1 = $('.lt-sent').textContent;
sr.say.push(target1);
click($('[data-a="rec"]'));
await until(() => $('.lt-scorebig'));
ok($('.lt-scorebig')?.textContent.startsWith('100'), 'speak: perfect repetition scores 100', $('.lt-scorebig')?.textContent);
ok(extension_settings.lingua_tavern.stats.speaking.at(-1)?.kind === 'shadow', 'speak: score logged');
sr.say.push('totally different words here');
click($('[data-a="rec"]'));
await until(() => $('.lt-scorebig') && Number.parseInt($('.lt-scorebig').textContent, 10) < 50);
ok(Number.parseInt($('.lt-scorebig').textContent, 10) < 50, 'speak: wrong repetition scores low', $('.lt-scorebig')?.textContent);
click($('[data-a="mode"][data-m="answer"]'));
await wait(50);
ok($('.lt-sent'), 'speak: question shown');
sr.say.push('I likes tea');
click($('[data-a="a-rec"]'));
await until(() => $('[data-r="ta"]').value.includes('likes'));
ok($('[data-r="ta"]').value.includes('I likes tea'), 'speak: speech recognised into the answer box', $('[data-r="ta"]').value);
click($('[data-a="a-check"]'));
await until(() => $('.lt-natural'));
ok($('.lt-natural')?.textContent.includes('relaxes') && $('.lt-err'), 'speak: answer reviewed (corrected, improved, errors)');
ok(extension_settings.lingua_tavern.stats.speaking.at(-1)?.kind === 'answer', 'speak: answer logged');
click($('[data-a="mode"][data-m="drills"]'));
await wait(50);
ok($$('.lt-item.lt-click').length >= 5, 'speak: pronunciation drills listed');
click($('.lt-item.lt-click'));
await until(() => $('[data-a="rec"]'));
ok($('[data-a="rec"]') && $('.lt-note'), 'speak: drill opens as repetition with a hint');

await tab('stats');
await until(() => $('.lt-stats-top'));
ok($('.lt-stats-top') && $$('.lt-lvrow').length >= 3, 'stats: dashboard with level map');
ok($('[data-a="drill"]'), 'stats: weak-spot button');
click($('[data-a="drill"]'));
await wait(80);
ok($('.lt-chipbtn.on')?.textContent === 'Времена глаголов', 'stats → write: drill on the weakest category', $('.lt-chipbtn.on')?.textContent);
click($('.lt-hub [data-a="close"]'));
ok(!$('.lt-hub'), 'hub closes');

// ================================================================ 6. chat → hub shortcuts
console.log('\n[6] shortcuts from the chat');
click($('#lt_quick_open'));
await until(() => $('.lt-hub'));
ok($('.lt-hub'), 'quick access opens Lingua Tavern');
click($('.lt-hub [data-a="close"]'));
click($('.lt-bar [data-a="check"]', mu));
await until(() => $('.lt-hub'));
ok($('[data-r="ta"]')?.value === 'I goed to school yesterday.', 'user message "check" opens Write with the text', $('[data-r="ta"]')?.value);
click($('.lt-hub [data-a="close"]'));
click($('.lt-bar [data-a="shadow"]', m1));
await until(() => $('.lt-hub [data-a="rec"]'));
ok($('.lt-hub .lt-sent'), 'message "repeat aloud" opens Speak with its sentences');
click($('.lt-hub [data-a="close"]'));

// ================================================================ 7. microphone button + coach
console.log('\n[7] mic button and coach');
$('#send_textarea').value = '';
sr.say.push('Hello there my friend');
click($('#lt_mic'));
await until(() => $('#send_textarea').value.includes('friend'));
ok($('#send_textarea').value === 'Hello there my friend', 'mic: dictation fills the message box', $('#send_textarea').value);
change(sel('coachAuto'), true);
const mu2 = addMes('<p>I goed to the shop.</p>', { user: true });
const bot = addMes('<p>Nice, what did you buy there?</p>');
await eventSource.emit(event_types.CHARACTER_MESSAGE_RENDERED, bot.getAttribute('mesid'));
await until(() => $('.lt-coach .lt-coach-line', mu2), 3000);
ok($('.lt-coach .lt-coach-line', mu2), 'coach: inline correction under the user message');
await eventSource.emit(event_types.MESSAGE_SWIPED, bot.getAttribute('mesid'));
ok($('.lt-coach', mu2), 'coach: survives a swipe of the character reply');

// ================================================================ 8. Chinese
console.log('\n[8] Chinese');
change(sel('lang'), 'zh');
await wait(100);
const zhm = addMes('<p>我今天想去商店买一些苹果，因为明天有朋友来。</p>');
await until(() => $('.lt-w', zhm), 4000);
const zw = $$('.lt-w', zhm);
ok(zw.length >= 6, 'zh: sentence segmented into words', zw.map((x) => x.dataset.w).join(' | '));
ok($('rt', zhm), 'zh: pinyin shown above words');
click(zw.find((x) => x.dataset.w === '苹果') || zw[3]);
await until(() => $('.lt-pop-tr')?.textContent.includes('RU['));
ok($('.lt-pop-ipa')?.textContent.length > 0, 'zh: pinyin in the popup', $('.lt-pop-ipa')?.textContent);
ok(calls.translate.at(-1).body.lang === 'ru', 'zh: translated to the native language');
ok(/汉语|Chinese/.test(stub.prompts.lingua_tavern.value) || /Chinese/.test(stub.prompts.lingua_tavern.value), 'zh: tutor instruction switches language', stub.prompts.lingua_tavern.value.slice(0, 80));
change(sel('lang'), 'en');
await wait(100);

// ================================================================ 9. disable
console.log('\n[9] disable');
change(sel('enabled'), false);
await wait(100);
ok($$('.lt-w').length === 0 && $$('.lt-bar').length === 0, 'disabled: spans and bars removed');
ok(stub.prompts.lingua_tavern.value === '', 'disabled: prompt injection removed');
ok(!$('.mes_text').innerHTML.includes('lt-'), 'disabled: message text restored');

// ================================================================ summary
const failed = results.filter((r) => !r.cond);
console.log('\nconsole errors during run:', errors.length);
errors.slice(0, 8).forEach((e) => console.log('   !', e.slice(0, 300)));
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
fs.rmSync(TMP, { recursive: true, force: true });
process.exit(failed.length || errors.length ? 1 : 0);
