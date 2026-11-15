import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setData, lookupEn, wordInfo, analyzeText, lookupZh, pinyinOf, splitZhWord, levelLabel, setHskStandard } from '../src/levels.js';
import { splitSentences, stripMarkup, tokenizeEn, segmentZh, sentenceAt } from '../src/text.js';
import { scoreSpeech, diffWords, diffHtml, sameAnswer, similarity } from '../src/diff.js';
import { review, buildQueue, streak, dayKey, DAY } from '../src/srs.js';
import { extractJson } from '../src/llm-parse.js';

const D = new URL('../data/', import.meta.url);
const read = (n) => JSON.parse(fs.readFileSync(new URL(n, D), 'utf8'));
setData({ en: read('en_cefr.json'), forms: read('en_forms.json'), zh: read('zh_hsk.json'), chars: read('zh_chars.json') });

test('english levels and lemmas', () => {
    const lv = (w) => lookupEn(w);
    assert.equal(lv('apple').lemma, 'apple');
    assert.equal(lv('apples').lemma, 'apple');
    assert.equal(lv('walked').lemma, 'walk');
    assert.equal(lv('jumping').lemma, 'jump');
    assert.equal(lv('cities').lemma, 'city');
    assert.equal(lv('studied').lemma, 'study');
    assert.equal(lv('went').lemma, 'go');
    assert.equal(lv('children').lemma, 'child');
    assert.match(lv('carefully').lemma, /^careful/);
    assert.equal(lv('don\'t').lemma, 'do');
    assert.equal(lv('John\'s'), null);
    assert.equal(lv('xqzvw'), null);
    assert.equal(wordInfo('en', 'Happily').known, true);
    assert.ok(lv('go').idx <= 1, 'go is basic');
    assert.ok(lv('ubiquitous') === null || lv('ubiquitous').idx >= 4);
});

test('text analysis gives sensible levels', () => {
    const easy = analyzeText('I like my dog. He is big and he runs fast.', 'en', 3);
    const hard = analyzeText('The ubiquitous bureaucracy meticulously exacerbated the predicament of the beleaguered populace.', 'en', 3);
    assert.ok(easy.level <= 2, 'easy level ' + easy.level);
    assert.ok(hard.level >= 4 || hard.unknown >= 3, `hard level ${hard.level} unknown ${hard.unknown}`);
    assert.ok(hard.share > easy.share);
    assert.equal(levelLabel('en', 3), 'B1');
});

test('sentences and markup', () => {
    const s = splitSentences('Mr. Smith went home. "Where are you?" she asked! Wait... Really?', 'en').map((x) => x.text);
    assert.deepEqual(s, ['Mr. Smith went home.', '"Where are you?" she asked!', 'Wait...', 'Really?']);
    assert.equal(stripMarkup('*smiles* Hello **there** <b>friend</b> [link](http://x)'), 'smiles Hello there friend link');
    assert.equal(tokenizeEn('Don\'t stop, it\'s fine').length, 4);
    assert.equal(sentenceAt('One two. Three four.', 10, 'en'), 'Three four.');
    assert.deepEqual(splitSentences('我喜欢茶。你呢？', 'zh').map((x) => x.text), ['我喜欢茶。', '你呢？']);
});

test('chinese data and segmentation', () => {
    setHskStandard(3);
    const hello = lookupZh('喜欢');
    assert.ok(hello && hello.level === 1, JSON.stringify(hello));
    assert.match(pinyinOf('你'), /nǐ/);
    assert.match(pinyinOf('你好'), /nǐ hǎo|nǐ hǎo/);
    assert.ok(pinyinOf('汤姆').length > 0);
    const segs = segmentZh('我喜欢喝茶，谢谢！').filter((x) => x.word).map((x) => x.text);
    assert.ok(segs.length >= 3, segs.join('|'));
    assert.deepEqual(splitZhWord('你好'), ['你好']);
    assert.deepEqual(splitZhWord('我喜欢喝茶谢谢', 4).length > 1, true);
    assert.equal(levelLabel('zh', 7), 'HSK 7–9');
    const a = analyzeText('我喜欢喝茶。', 'zh', 3);
    assert.ok(a.level >= 1 && a.level <= 3, 'zh level ' + a.level);
});

test('speech scoring', () => {
    const t = 'I would like a cup of tea, please.';
    assert.equal(scoreSpeech(t, 'I would like a cup of tea please').score, 100);
    const r = scoreSpeech(t, 'I would like cup of tea please');
    assert.equal(r.tokens.find((x) => x.t === 'a').status, 'miss');
    assert.ok(r.score >= 80 && r.score < 100, 'score ' + r.score);
    const w = scoreSpeech(t, 'I would like a cop of tea please');
    assert.ok(['wrong', 'near'].includes(w.tokens.find((x) => x.t === 'cup').status));
    const bad = scoreSpeech(t, 'banana');
    assert.ok(bad.score < 20);
    assert.equal(scoreSpeech('你好吗', '你好吗', 'zh').score, 100);
    assert.ok(scoreSpeech('你好吗', '你好', 'zh').score < 100);
});

test('diff', () => {
    const ops = diffWords('I goed to school yesterday', 'I went to school yesterday');
    assert.deepEqual(ops.filter((o) => o.op !== 'eq').map((o) => `${o.op}:${o.text}`), ['del:goed', 'ins:went']);
    assert.match(diffHtml('a <b>', 'a c'), /<del class="lt-del">&lt;<\/del>|<ins/);
    assert.ok(sameAnswer('Hello, World!', 'hello world'));
    assert.ok(similarity('kitten', 'sitting') < 0.6);
});

test('srs scheduling', () => {
    const now = 1_000_000_000_000;
    let c = review({}, 2, now);
    assert.equal(c.ivl, 1);
    c = review(c, 2, now + DAY);
    assert.equal(c.ivl, 3);
    c = review(c, 2, now + 4 * DAY);
    assert.ok(c.ivl >= 7);
    const lapsed = review(c, 0, now + 20 * DAY);
    assert.equal(lapsed.ivl, 0);
    assert.equal(lapsed.lapses, 1);
    const q = buildQueue([{ added: 1, ...review({}, 2, now), last: now }, { added: 2, reps: 0, ivl: 0, ease: 2.5, due: now, last: 0, status: 'learning' }], { now: now + 2 * DAY, newLimit: 5 });
    assert.equal(q.length, 2);
    const days = { [dayKey(now)]: 1, [dayKey(now - DAY)]: 1, [dayKey(now - 2 * DAY)]: 1 };
    assert.equal(streak(days, now), 3);
});

test('llm json extraction', () => {
    assert.deepEqual(extractJson('```json\n{"a":1,"b":[1,2]}\n```'), { a: 1, b: [1, 2] });
    assert.deepEqual(extractJson('Sure! Here: {"a":"x } y","n":2} hope it helps'), { a: 'x } y', n: 2 });
    assert.deepEqual(extractJson('{"a":1,}'), { a: 1 });
    assert.deepEqual(extractJson('<think>hmm {no}</think>{"ok":true}'), { ok: true });
    assert.equal(extractJson('no json here'), null);
    assert.deepEqual(extractJson('[{"x":1}]'), [{ x: 1 }]);
});
