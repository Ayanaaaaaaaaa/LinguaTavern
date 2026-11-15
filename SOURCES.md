# Data sources and attributions

All files in this folder are derived from the open datasets below. Keep this notice when you redistribute the extension.

| File | What it is | Derived from | Licence |
|---|---|---|---|
| `en_cefr.json` | English word lists by CEFR level (A1–C2). Words under the `"~"` key have *approximate* levels estimated from word frequency. | **CEFR-J Wordlist v1.5** (Tono Laboratory, Tokyo University of Foreign Studies, via Open Language Profiles: https://github.com/openlanguageprofiles/olp-en-cefrj); **Octanove Vocabulary Profile C1/C2 v1.0** (Octanove Labs, same repository); frequency estimates from the Python package **wordfreq** | CEFR-J: free for research and commercial use with citation (© Tono Laboratory, TUFS). Octanove C1/C2: CC BY-SA 4.0. wordfreq: Apache-2.0 code, data under CC BY-SA 4.0 |
| `en_forms.json` | Irregular English word forms mapped to their base word | Generated with **lemminflect** (MIT) over the words of `en_cefr.json` | MIT |
| `zh_hsk.json` | Chinese words with HSK 2.0 and 3.0 levels, pinyin and short English glosses | **complete-hsk-vocabulary** by drkameleon (https://github.com/drkameleon/complete-hsk-vocabulary); definitions originate from **CC-CEDICT** (https://www.mdbg.net/chinese/dictionary) | MIT (word lists); CC-CEDICT: CC BY-SA 4.0 |
| `zh_chars.json` | Pinyin and frequency data for single characters | Generated with **pypinyin** (MIT) and **wordfreq** | see above |
| `sentences_en.json` | Graded English–Russian sentence pairs. Level = level of the hardest word, computed with the extension's own word lists. | Part of the pairs come from the **Tatoeba** corpus (https://tatoeba.org) as published in the LASER Tatoeba test set (2018-11-17 snapshot), filtered by level and topic. The remaining pairs were written for this extension. | Tatoeba: CC BY 2.0 FR — © Tatoeba contributors. Hand-written pairs: same terms as the extension |
| `sentences_zh.json` | Graded Mandarin sentences with pinyin and an English translation | **Tatoeba** Mandarin–English pairs (LASER Tatoeba test set), segmented with **jieba** (MIT), pinyin by **pypinyin** | Tatoeba: CC BY 2.0 FR — © Tatoeba contributors |

## Required attribution

- Sentence data © Tatoeba contributors, licensed CC BY 2.0 FR — https://tatoeba.org
- English vocabulary levels: The CEFR-J Wordlist Version 1.5, compiled by Yukio Tono, Tokyo University of Foreign Studies (http://www.cefr-j.org); Octanove Vocabulary Profile C1/C2 (CC BY-SA 4.0).
- Chinese definitions: CC-CEDICT, CC BY-SA 4.0 — https://cc-cedict.org

## Known limits

- The Tatoeba sentence pool used here is a ~1000-sentence sample per language pair, so the built-in bank is small (English: A1 273, A2 331, B1 117, B2 53, C1 6; Chinese: 257 in total); the "Ещё от ИИ" button generates more with your own model.
- Chinese sentences carry English (not Russian) translations.
- Sentence levels measure vocabulary, not grammar.
