// The ONLY module that imports SillyTavern internals. Everything else goes through this adapter.
import {
    eventSource, event_types, saveSettingsDebounced, generateRaw, getRequestHeaders,
    setExtensionPrompt, extension_prompt_types, extension_prompt_roles,
} from '../../../../../script.js';
import { extension_settings, getContext } from '../../../../extensions.js';

export const MODULE = 'lingua_tavern';
export const baseUrl = new URL('../data/', import.meta.url).href;
export const events = event_types;

export const root = () => (extension_settings[MODULE] ??= {});
export const saveSettings = () => saveSettingsDebounced();
export const on = (name, fn) => eventSource.on(event_types[name] ?? name, fn);
export const chatArray = () => getContext().chat || [];
export const userName = () => getContext().name1;
export const charName = () => getContext().name2;
export const headers = () => getRequestHeaders();

export function toast(kind, msg) {
    try { (window.toastr?.[kind] || window.toastr?.info)?.(msg, 'Lingua Tavern'); } catch { /* ignore */ }
}

/** Silent generation with the user's current ST connection (no chat context). Resolves to plain text. */
export async function generate({ prompt, system = '', maxTokens = 800 }) {
    if (generateRaw.length > 0) {
        // very old SillyTavern: positional signature
        return generateRaw(prompt, null, false, false, system, maxTokens);
    }
    return generateRaw({ prompt, systemPrompt: system, responseLength: maxTokens, trimNames: false });
}

/** Injects (or clears, when text is empty) a hidden instruction into the prompt of the roleplay. */
export function setPrompt(key, text, depth = 1) {
    setExtensionPrompt(key, text || '', extension_prompt_types.IN_CHAT, depth, false, extension_prompt_roles.SYSTEM);
}

export const textarea = () => document.getElementById('send_textarea');

export function setInput(text) {
    const t = textarea();
    if (!t) return;
    t.value = text;
    t.dispatchEvent(new Event('input', { bubbles: true }));
    t.focus();
}

export function send() {
    document.getElementById('send_but')?.click();
}
