// Prompts for the language tutor and parsing of the replies. Uses the user's current SillyTavern connection.
import * as st from './st.js';
import * as S from './state.js';
import { extractJson } from './llm-parse.js';
import { levelLabel } from './levels.js';

const NAME = { en: 'English', zh: 'Mandarin Chinese (Simplified characters)' };

export const CATS = {
    en: ['article', 'tense', 'preposition', 'agreement', 'plural', 'word_order', 'vocabulary', 'spelling', 'punctuation', 'other'],
    zh: ['measure_word', 'particle', 'word_order', 'vocabulary', 'characters', 'grammar', 'punctuation', 'other'],
};
export const CAT_RU = {
    article: 'Артикли', tense: 'Времена глаголов', preposition: 'Предлоги', agreement: 'Согласование', plural: 'Множественное число',
    word_order: 'Порядок слов', vocabulary: 'Выбор слова', spelling: 'Орфография', punctuation: 'Пунктуация', other: 'Другое',
    measure_word: 'Счётные слова', particle: 'Частицы', characters: 'Иероглифы', grammar: 'Грамматика',
};

export function context() {
    const s = S.get();
    return { lang: s.lang, level: levelLabel(s.lang, S.userLevel()), native: S.nativeName() };
}

const system = (c) => `You are a patient, precise ${NAME[c.lang]} tutor for a ${c.native}-speaking learner at level ${c.level}. Reply with ONE valid JSON value only: no markdown fences, no text before or after it. Write every explanation in ${c.native}; keep examples and corrections in ${NAME[c.lang]}.`;

async function askJson(c, user, maxTokens = 900) {
    let raw = await st.generate({ prompt: user, system: system(c), maxTokens });
    let j = extractJson(raw);
    if (!j) {
        raw = await st.generate({ prompt: user + '\n\nIMPORTANT: answer with valid JSON only.', system: system(c), maxTokens: maxTokens + 300 });
        j = extractJson(raw);
    }
    if (!j) throw new Error('Модель ответила не в том формате. Попробуйте ещё раз или выберите другую модель.');
    return j;
}

const arr = (x) => (Array.isArray(x) ? x : []);
const str = (x) => (x == null ? '' : String(x));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

export function normErrors(list) {
    return arr(list).slice(0, 8).map((e) => ({ wrong: str(e.wrong), right: str(e.right), cat: str(e.cat || 'other').toLowerCase(), why: str(e.why) }));
}

export async function checkWriting(text, c = context()) {
    const user = `Learner text:\n"""\n${text}\n"""\n\nReturn a JSON object with these keys:\n- "corrected": the text with mistakes fixed using the smallest possible changes (keep the learner's meaning, voice and level),\n- "natural": how a native speaker would naturally say the same thing, at about ${c.level} level,\n- "score": integer 1-5 (5 = no mistakes),\n- "errors": array (max 8, most important first) of {"wrong": exact wrong fragment from the text, "right": corrected fragment, "cat": one of [${CATS[c.lang].join(', ')}], "why": one short sentence explaining the rule in ${c.native}},\n- "praise": one short sentence in ${c.native} about what was done well,\n- "tip": one short concrete tip in ${c.native} on what to practise next.\nIf there are no mistakes, "corrected" equals the text and "errors" is [].`;
    const j = await askJson(c, user, 1100);
    return { corrected: str(j.corrected ?? text), natural: str(j.natural), score: clamp(Math.round(+j.score || 0), 1, 5), errors: normErrors(j.errors), praise: str(j.praise), tip: str(j.tip) };
}

export async function howToSay(text, c = context()) {
    const user = `The learner wants to say this (any language, possibly rough):\n"""\n${text}\n"""\n\nReturn a JSON object:\n- "options": array of exactly 3 objects {"text": the ${NAME[c.lang]} sentence, "style": "simple" | "natural" | "advanced", "note": one short note in ${c.native} on when to use it or what is tricky}. The "simple" one must use only ${c.level} or easier vocabulary and grammar.\n- "keywords": array (max 4) of {"w": useful word or phrase from the options, "tr": its ${c.native} translation}.`;
    const j = await askJson(c, user, 900);
    return {
        options: arr(j.options).slice(0, 3).map((o) => ({ text: str(o.text), style: str(o.style), note: str(o.note) })).filter((o) => o.text),
        keywords: arr(j.keywords).slice(0, 4).map((k) => ({ w: str(k.w), tr: str(k.tr) })),
    };
}

export async function explainWord(word, sentence, c = context()) {
    const user = `Word: "${word}"\nSentence it appears in: "${sentence}"\n\nExplain the word AS USED in this sentence. Return a JSON object:\n- "translation": short ${c.native} translation for this context,\n- "pos": part of speech (short, ${c.native}),\n- "meaning": a simple definition in ${NAME[c.lang]} using ${c.level} or easier vocabulary,\n- "example": one new example sentence in ${NAME[c.lang]} at ${c.level} level,\n- "example_tr": ${c.native} translation of the example,\n- "note": one short remark in ${c.native} (usage, register, common mistake, collocation), or "".`;
    const j = await askJson(c, user, 600);
    return { translation: str(j.translation), pos: str(j.pos), meaning: str(j.meaning), example: str(j.example), example_tr: str(j.example_tr), note: str(j.note) };
}

export async function simplifyText(text, c = context()) {
    const raw = await st.generate({
        system: `You rewrite ${NAME[c.lang]} texts for learners. Output ONLY the rewritten text, nothing else.`,
        prompt: `Rewrite the text below so a ${c.level} learner understands it: use ${c.level} or easier vocabulary and shorter sentences, keep every event, the tone and the speaker's voice, keep direct speech and action markers like *...* as they are.\n\nText:\n${text}`,
        maxTokens: Math.min(1500, 200 + text.length),
    });
    return str(raw).trim();
}

export async function translateLLM(text, to = 'ru') {
    const target = { ru: 'Russian', en: 'English', uk: 'Ukrainian', kk: 'Kazakh' }[to] || 'Russian';
    const raw = await st.generate({
        system: 'You are a translation engine. Output ONLY the translation, with no notes or quotes.',
        prompt: `Translate into ${target}:\n\n${text}`,
        maxTokens: Math.min(1800, 150 + text.length * 2),
    });
    return str(raw).trim();
}

export async function genSentences({ n = 6, words = [], topic = '' } = {}, c = context()) {
    const w = words.length ? `Each sentence should use one of these words (vary them): ${words.join(', ')}.` : '';
    const user = `Write ${n} natural, self-contained ${NAME[c.lang]} sentences for a ${c.level} learner (${c.lang === 'zh' ? 'vocabulary within the HSK level' : 'vocabulary and grammar at that level'}), 6-14 words each. ${w} ${topic ? 'Topic: ' + topic + '.' : 'Everyday situations.'}\nReturn {"items":[{"target": the sentence, "tr": its ${c.native} translation}]}.`;
    const j = await askJson(c, user, 900);
    return arr(j.items).map((x) => ({ target: str(x.target), tr: str(x.tr) })).filter((x) => x.target);
}

export async function genQuestions({ n = 5, topic = '' } = {}, c = context()) {
    const user = `Write ${n} open questions in ${NAME[c.lang]} that a ${c.level} learner can answer aloud in 3-5 sentences. ${topic ? 'Topic: ' + topic + '.' : 'Mix everyday topics: daily life, opinions, past experiences, plans.'} Vary the question types.\nReturn {"items":[question strings]}.`;
    const j = await askJson(c, user, 500);
    return arr(j.items).map(str).filter(Boolean);
}

export async function genGapFill({ cat, n = 5 }, c = context()) {
    const user = `Create ${n} fill-in-the-gap exercises in ${NAME[c.lang]} for a ${c.level} learner, all practising this mistake category: "${cat}". Each sentence has exactly one gap written as ___ .\nReturn {"items":[{"sentence": sentence with ___, "answer": the correct word(s), "options": 3 choices including the answer, "why": one short explanation in ${c.native}}]}.`;
    const j = await askJson(c, user, 900);
    return arr(j.items).map((x) => ({ sentence: str(x.sentence), answer: str(x.answer), options: arr(x.options).map(str), why: str(x.why) })).filter((x) => x.sentence.includes('___') && x.answer);
}

export async function genWritingTask({ topic = '' } = {}, c = context()) {
    const user = `Invent one short writing task for a ${c.level} learner of ${NAME[c.lang]}. ${topic ? 'Topic: ' + topic + '.' : 'Pick an everyday topic.'}\nReturn {"title": 2-5 words in ${NAME[c.lang]}, "task": the instruction in ${c.native} (1-2 sentences), "min_words": a sensible number (${c.lang === 'zh' ? 'Chinese characters, 40-120' : '40-120'}), "phrases": 4 useful ${NAME[c.lang]} phrases or structures to use}.`;
    const j = await askJson(c, user, 500);
    return { title: str(j.title), task: str(j.task), minWords: clamp(+j.min_words || 50, 20, 250), phrases: arr(j.phrases).map(str).slice(0, 5) };
}

export async function checkSpeech({ question, transcript }, c = context()) {
    const user = `A learner answered a spoken question. The answer below comes from speech recognition, so ignore capitalisation and punctuation; judge grammar, word choice and naturalness.\nQuestion: "${question}"\nAnswer: "${transcript}"\n\nReturn a JSON object:\n- "corrected": the answer with grammar/word mistakes fixed (minimal changes),\n- "improved": a better, fuller version of the answer that is still easy to say for a ${c.level} learner (3-5 sentences),\n- "errors": array (max 6) of {"wrong","right","cat" (one of [${CATS[c.lang].join(', ')}]),"why" (short, ${c.native})},\n- "fluency_tip": one concrete speaking tip in ${c.native} (structure, linking words, filler phrases, length),\n- "praise": one short sentence in ${c.native} about what was good.`;
    const j = await askJson(c, user, 1000);
    return { corrected: str(j.corrected), improved: str(j.improved), errors: normErrors(j.errors), tip: str(j.fluency_tip), praise: str(j.praise) };
}

export async function reviewSentence({ word, sentence }, c = context()) {
    const user = `The learner must write a sentence that uses the word/phrase "${word}".\nTheir sentence: "${sentence}"\n\nReturn {"ok": true if the word is used correctly and the sentence is acceptable, "corrected": the corrected sentence (same as theirs if fine), "feedback": 1-2 short sentences in ${c.native} (what is right/wrong), "errors": [{"wrong","right","cat" (one of [${CATS[c.lang].join(', ')}]),"why"}]}.`;
    const j = await askJson(c, user, 600);
    return { ok: !!j.ok, corrected: str(j.corrected || sentence), feedback: str(j.feedback), errors: normErrors(j.errors) };
}
