// Turns the roleplay into practice: level-adjusted replies, a question at the end of each reply, gentle recasting, and an inline mini-check of your own messages.
import * as st from './st.js';
import * as S from './state.js';
import * as llm from './llm.js';
import { levelLabel } from './levels.js';
import { diffHtml } from './diff.js';
import { hashStr, countUnits } from './text.js';
import { visibleText } from './wordtap.js';
import { $, $$, el, esc, emit } from './ui.js';

const KEY = 'lingua_tavern';
const LANG_NAME = { en: 'English', zh: 'Simplified Chinese' };

/** The hidden instruction for the roleplay model, or '' when nothing is switched on. */
export function buildInstruction(s = S.get()) {
    if (!s.enabled) return '';
    const lang = s.lang;
    const name = LANG_NAME[lang] || 'English';
    const lvl = levelLabel(lang, S.userLevel());
    const parts = [];
    if (s.tutorLevel) {
        parts.push(`The user is learning ${name} (level ${lvl}) through this roleplay. Write your replies in ${name} using vocabulary and grammar at about ${lvl} level: common words, clear sentences of moderate length, no rare idioms or heavy slang unless the user asks. Stay fully in character and keep the story moving.`);
    }
    if (s.tutorFollowUp) {
        parts.push('End every reply with a short, natural question or prompt from your character that invites the user to answer in a few sentences.');
    }
    if (s.tutorRecast) {
        parts.push('If the user\'s last message contains language mistakes, naturally use the correct form in your reply (recasting) without pointing out the error, without explaining grammar and without leaving the character.');
    }
    return parts.length ? `[Language-learning mode. ${parts.join(' ')}]` : '';
}

export function apply() {
    try { st.setPrompt(KEY, buildInstruction(), 1); } catch { /* ST without this API: skip */ }
}

// ------------------------------------------------------------------ inline coach

const done = new Map();           // message id -> hash of the text that was checked

function userMesText(mes) {
    const t = $('.mes_text', mes);
    return t ? visibleText(t) : '';
}

function worthChecking(text, lang) {
    if (lang === 'zh') return /[㐀-鿿]/.test(text);
    return countUnits(text, 'en') >= 3 && /[A-Za-z]{2}/.test(text);
}

function show(mes, html, h) {
    $$('.lt-coach', mes).forEach((x) => x.remove());
    const box = el(`<div class="lt-coach" data-h="${h}">${html}</div>`);
    const anchor = $('.lt-bar', mes) || $('.mes_text', mes);
    anchor.insertAdjacentElement('afterend', box);
    return box;
}

async function coach(mes) {
    const s = S.get();
    if (!s.enabled || !s.coachAuto) return;
    const text = userMesText(mes);
    if (!worthChecking(text, s.lang)) return;
    const id = mes.getAttribute('mesid');
    const h = hashStr(text) + s.lang;
    if (done.get(id) === h) return;
    done.set(id, h);
    const box = show(mes, `<span class="lt-spin"></span> Проверяю ваше сообщение…`, h);
    try {
        const r = await llm.checkWriting(text);
        if (!box.isConnected || userMesText(mes) !== text) return;
        S.logMistakes(r.errors);
        S.bump('checked');
        const clean = r.corrected.trim() === text.trim() || !r.errors.length;
        box.innerHTML = clean
            ? `<span class="lt-coach-ok">✓ Без ошибок</span>${r.praise ? ` <span class="lt-why">${esc(r.praise)}</span>` : ''}`
            : `<div class="lt-coach-line">✏️ <span lang="${s.lang}">${diffHtml(text, r.corrected)}</span></div>
               <div class="lt-why">${esc(r.errors.slice(0, 2).map((e) => `${e.wrong} → ${e.right}${e.why ? ' — ' + e.why : ''}`).join(' · '))}</div>
               <button class="lt-link" data-a="coach-more">Подробнее</button>`;
        box.querySelector('[data-a="coach-more"]')?.addEventListener('click', () => emit('lt:check', { text }));
    } catch {
        box.remove();                 // silent: the coach is a bonus, never an error popup
        done.delete(id);
    }
}

function lastUserMes() {
    const all = $$('#chat .mes[is_user="true"]');
    return all[all.length - 1] || null;
}

export function init() {
    apply();
    // Run after the character has answered, so the check never competes with the roleplay request.
    st.on('CHARACTER_MESSAGE_RENDERED', () => setTimeout(() => { const m = lastUserMes(); if (m) coach(m); }, 400));
    st.on('CHAT_CHANGED', () => { done.clear(); apply(); });
    st.on('MESSAGE_EDITED', (id) => { done.delete(String(id)); });
}
