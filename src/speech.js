// Text-to-speech and speech recognition through the browser's Web Speech API.
import * as S from './state.js';
import { splitSentences } from './text.js';

const hasWindow = typeof window !== 'undefined';
const TAG = { en: 'en-US', zh: 'zh-CN' };
let voices = [];
let token = 0;
let audioEl = null;

const refresh = () => { if (ttsSupported()) voices = speechSynthesis.getVoices() || []; };
export const ttsSupported = () => hasWindow && 'speechSynthesis' in window;
if (ttsSupported()) { refresh(); speechSynthesis.addEventListener?.('voiceschanged', refresh); }

export function voicesFor(lang) {
    refresh();
    const p = lang === 'zh' ? 'zh' : 'en';
    return voices.filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith(p));
}

export function pickVoice(lang, name = '') {
    const list = voicesFor(lang);
    return list.find((v) => v.voiceURI === name || v.name === name)
        || list.find((v) => v.lang.toLowerCase().replace('_', '-') === TAG[lang].toLowerCase())
        || list[0] || null;
}

export function stop() {
    token++;
    if (ttsSupported()) speechSynthesis.cancel();
    if (audioEl) { audioEl.pause(); audioEl = null; }
}

function chunks(text, lang) {
    const out = [];
    for (const s of splitSentences(text, lang)) {
        let t = s.text;
        while (t.length > 220) {
            let cut = t.lastIndexOf(',', 220);
            if (cut < 60) cut = t.lastIndexOf(' ', 220);
            if (cut < 60) cut = 220;
            out.push(t.slice(0, cut + 1).trim());
            t = t.slice(cut + 1).trim();
        }
        if (t) out.push(t);
    }
    return out;
}

/** Speaks text sentence by sentence. Resolves true when finished, false if interrupted or unsupported. */
export function speak(text, { lang = S.get().lang, rate, voice } = {}) {
    if (!ttsSupported()) return Promise.resolve(false);
    stop();
    const my = token;
    const s = S.get();
    const v = pickVoice(lang, voice ?? (lang === 'zh' ? s.voiceZh : s.voiceEn));
    const list = chunks(String(text), lang).filter((t) => /[\p{L}\p{N}]/u.test(t));
    return new Promise((resolve) => {
        let i = 0;
        const next = () => {
            if (my !== token) return resolve(false);
            if (i >= list.length) return resolve(true);
            const u = new SpeechSynthesisUtterance(list[i++]);
            u.lang = v?.lang || TAG[lang];
            if (v) u.voice = v;
            u.rate = rate ?? s.ttsRate ?? 0.9;
            u.onend = next;
            u.onerror = () => resolve(my === token && i >= list.length);
            speechSynthesis.speak(u);
        };
        next();
    });
}

export function playUrl(url) {
    stop();
    audioEl = new Audio(url);
    return audioEl.play().then(() => true).catch(() => false);
}

// ------------------------------------------------------------------ recognition

const SR = hasWindow ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
export const asrSupported = () => !!SR;

export function micIssue() {
    if (!SR) return 'Распознавание речи не поддерживается этим браузером. Откройте SillyTavern в Chrome, Edge или Safari.';
    if (hasWindow && window.isSecureContext === false) return 'Для микрофона нужен защищённый адрес: https:// или localhost. Сейчас страница открыта по обычному http — браузер блокирует микрофон.';
    return '';
}

const ERR = {
    'not-allowed': 'Нет доступа к микрофону. Разрешите его для этого сайта в настройках браузера (значок замка у адреса).',
    'service-not-allowed': 'Нет доступа к микрофону или распознаванию речи в этом браузере.',
    'audio-capture': 'Микрофон не найден или занят другим приложением.',
    'network': 'Сервис распознавания речи недоступен — проверьте интернет.',
    'language-not-supported': 'Этот язык не поддерживается распознаванием в вашем браузере.',
};

/**
 * Records speech. Returns { promise, stop }.
 * promise → { text, confidence, empty }. Rejects with a readable Error on permission/network problems.
 */
export function listen({ lang = S.get().lang, continuous = false, onInterim } = {}) {
    const issue = micIssue();
    if (issue) return { promise: Promise.reject(new Error(issue)), stop() { } };
    stop();
    const rec = new SR();
    rec.lang = TAG[lang] || 'en-US';
    rec.interimResults = true;
    rec.continuous = continuous;
    rec.maxAlternatives = 1;
    const finals = [];
    const confs = [];
    let interim = '';
    let done = false;
    const promise = new Promise((resolve, reject) => {
        rec.onresult = (e) => {
            interim = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
                const r = e.results[i];
                if (r.isFinal) { finals.push(r[0].transcript.trim()); if (r[0].confidence) confs.push(r[0].confidence); }
                else interim += r[0].transcript;
            }
            onInterim?.((finals.join(' ') + ' ' + interim).trim());
        };
        rec.onerror = (e) => {
            if (e.error === 'no-speech' || e.error === 'aborted') return;
            done = true;
            reject(new Error(ERR[e.error] || ('Ошибка распознавания: ' + e.error)));
        };
        rec.onend = () => {
            if (done) return;
            done = true;
            const text = (finals.join(' ') + (interim && !finals.length ? interim : '')).trim();
            resolve({ text, confidence: confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : 0, empty: !text });
        };
        try { rec.start(); } catch (err) { done = true; reject(err); }
    });
    return { promise, stop: () => { try { rec.stop(); } catch { /* already stopped */ } } };
}
