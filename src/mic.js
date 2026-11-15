// Microphone button next to the message box: dictate your message in the target language instead of typing.
import * as st from './st.js';
import * as S from './state.js';
import * as speech from './speech.js';
import * as hub from './hub.js';
import { el } from './ui.js';

let btn = null;
let quick = null;
let rec = null;
let quickObserver = null;
let quickMoved = false;

function restoreQuickPosition() {
    if (!quick) return;
    const saved = S.get().quickPosition;
    if (!saved || !Number.isFinite(saved.left) || !Number.isFinite(saved.top)) return;
    quick.style.left = `${saved.left}px`;
    quick.style.top = `${saved.top}px`;
    quick.style.right = 'auto';
    quick.style.transform = 'none';
}

function enableQuickDrag() {
    if (!quick || quick.dataset.dragReady) return;
    quick.dataset.dragReady = '1';
    let active = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    quick.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        const r = quick.getBoundingClientRect();
        active = true;
        quickMoved = false;
        startX = e.clientX;
        startY = e.clientY;
        startLeft = r.left;
        startTop = r.top;
        quick.style.left = `${r.left}px`;
        quick.style.top = `${r.top}px`;
        quick.style.right = 'auto';
        quick.style.transform = 'none';
        quick.setPointerCapture?.(e.pointerId);
        e.preventDefault();
    });
    quick.addEventListener('pointermove', (e) => {
        if (!active) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (Math.abs(dx) + Math.abs(dy) > 6) quickMoved = true;
        const maxLeft = Math.max(0, window.innerWidth - quick.offsetWidth);
        const maxTop = Math.max(0, window.innerHeight - quick.offsetHeight);
        quick.style.left = `${Math.min(maxLeft, Math.max(0, startLeft + dx))}px`;
        quick.style.top = `${Math.min(maxTop, Math.max(0, startTop + dy))}px`;
    });
    const finish = (e) => {
        if (!active) return;
        active = false;
        quick.releasePointerCapture?.(e.pointerId);
        if (quickMoved) {
            const r = quick.getBoundingClientRect();
            S.get().quickPosition = {
                left: Math.round(r.left), top: Math.round(r.top),
            };
            S.save();
        }
    };
    quick.addEventListener('pointerup', finish);
    quick.addEventListener('pointercancel', finish);
    quick.addEventListener('click', (e) => {
        if (quickMoved) {
            e.preventDefault();
            e.stopImmediatePropagation();
            quickMoved = false;
        }
    }, true);
}

async function toggle() {
    if (rec) { rec.stop(); return; }
    const t = st.textarea();
    if (!t) return;
    const issue = speech.micIssue();
    if (issue) { st.toast('warning', issue); return; }
    const base = t.value.trim() ? t.value.trimEnd() + ' ' : '';
    btn.classList.add('on');
    const r = speech.listen({ lang: S.get().lang, continuous: true, onInterim: (txt) => st.setInput(base + txt) });
    rec = r;
    try {
        const out = await r.promise;
        if (out.empty) { st.toast('info', 'Ничего не расслышал — попробуйте ещё раз.'); return; }
        st.setInput(base + out.text);
        S.bump('spoken');
        if (S.get().voiceAutoSend) st.send();
    } catch (e) {
        st.toast('error', e.message || String(e));
    } finally {
        rec = null;
        btn?.classList.remove('on');
    }
}

export function setVisible(on) {
    if (btn) btn.style.display = on ? '' : 'none';
    // The hub shortcut must remain available even when word highlighting is disabled.
    if (quick) {
        quick.hidden = false;
        quick.removeAttribute('hidden');
        quick.style.setProperty('display', 'flex', 'important');
    }
}

export function init() {
    const host = document.getElementById('leftSendForm') || document.getElementById('send_form');
    if (!btn && host) {
        btn = el('<div id="lt_mic" class="lt-micbtn fa-solid fa-microphone interactable" title="Продиктовать сообщение (Lingua Tavern)" role="button" tabindex="0"></div>');
        btn.addEventListener('click', toggle);
        btn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
        host.append(btn);
    }
    if (!quick) {
        quick = document.getElementById('lt_quick_open') || el('<button id="lt_quick_open" class="lt-quickbtn lt-quick-fab interactable" title="Открыть Lingua Tavern" aria-label="Открыть Lingua Tavern" type="button">🎓 <span>Lingua</span></button>');
        if (!quick.textContent.trim()) quick.innerHTML = '🎓 <span>Lingua</span>';
        quick.addEventListener('click', () => hub.openHub('learn'));
    }
    if (quick.parentElement !== document.body) document.body.append(quick);
    restoreQuickPosition();
    enableQuickDrag();
    setVisible(S.get().enabled);
    quickObserver ||= new MutationObserver(() => {
        if (!quick.isConnected) document.body.append(quick);
        setVisible(S.get().enabled);
    });
    quickObserver.observe(document.body, { childList: true });
}
