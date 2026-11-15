// Microphone button next to the message box: dictate your message in the target language instead of typing.
import * as st from './st.js';
import * as S from './state.js';
import * as speech from './speech.js';
import { el } from './ui.js';

let btn = null;
let rec = null;

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
}

export function init() {
    const host = document.getElementById('leftSendForm') || document.getElementById('send_form');
    if (!host || btn) return;
    btn = el('<div id="lt_mic" class="lt-micbtn fa-solid fa-microphone interactable" title="Продиктовать сообщение (Lingua Tavern)" role="button" tabindex="0"></div>');
    btn.addEventListener('click', toggle);
    btn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    host.appendChild(btn);
    setVisible(S.get().enabled);
}
