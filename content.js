// Built-in practice material that works without any AI connection.

export const WRITING_TOPICS = {
    en: [
        { title: 'My weekend', task: 'Опишите, как вы обычно проводите выходные: что делаете, с кем и что любите больше всего.', min: 50, phrases: ['I usually…', 'On Saturday I…', 'What I like most is…', 'After that…'] },
        { title: 'A person I admire', task: 'Расскажите о человеке, которым вы восхищаетесь, и объясните почему.', min: 60, phrases: ['I admire … because…', 'He/She is the kind of person who…', 'One thing I learned from …'] },
        { title: 'My last holiday', task: 'Расскажите о последней поездке или отпуске: где были, что делали, что понравилось.', min: 60, phrases: ['Last summer I went to…', 'We stayed at…', 'The best part was…', 'I would like to go back because…'] },
        { title: 'A problem and a solution', task: 'Опишите небольшую проблему, которая у вас была, и как вы её решили.', min: 60, phrases: ['The problem was…', 'At first I tried…', 'In the end…', 'Next time I will…'] },
        { title: 'My ideal day', task: 'Опишите свой идеальный день с утра до вечера.', min: 60, phrases: ['I would start the day by…', 'Then I would…', 'In the evening…'] },
        { title: 'Technology in my life', task: 'Какие технологии вы используете каждый день? Что в них удобно, а что раздражает?', min: 60, phrases: ['I can’t live without…', 'It helps me to…', 'On the other hand…'] },
        { title: 'A film or a book', task: 'Расскажите о фильме или книге, которая вам понравилась: о чём она и почему её стоит посмотреть/прочитать.', min: 70, phrases: ['It’s about…', 'The main character is…', 'I would recommend it because…'] },
        { title: 'My city', task: 'Расскажите о своём городе гостю, который приезжает впервые: что посмотреть, где поесть, чего избегать.', min: 70, phrases: ['You should visit…', 'It’s famous for…', 'I would avoid…'] },
        { title: 'Plans for the future', task: 'Какие у вас планы на следующий год? Чему вы хотите научиться?', min: 60, phrases: ['I’m going to…', 'I hope to…', 'By the end of next year…'] },
        { title: 'A funny story', task: 'Расскажите смешную или необычную историю, которая случилась с вами или вашими знакомыми.', min: 70, phrases: ['It all started when…', 'Suddenly…', 'I couldn’t believe…', 'Looking back…'] },
        { title: 'Ask for help (email)', task: 'Напишите короткое письмо коллеге или знакомому: вам нужна помощь с задачей, объясните, что именно и к какому сроку.', min: 50, phrases: ['I was wondering if you could…', 'Would it be possible to…', 'Thank you in advance.'] },
        { title: 'Pros and cons', task: 'Обсудите плюсы и минусы жизни в большом городе или онлайн-обучения.', min: 80, phrases: ['One advantage is…', 'A disadvantage is…', 'In my opinion…', 'All things considered…'] },
    ],
    zh: [
        { title: '我的一天', task: 'Опишите свой обычный день простыми предложениями (время, действия).', min: 40, phrases: ['我每天…', '早上我…', '然后我…', '晚上我…'] },
        { title: '我的家人', task: 'Расскажите о своей семье: кто в ней, чем занимаются.', min: 40, phrases: ['我家有…口人', '他/她是…', '他/她喜欢…'] },
        { title: '我喜欢的食物', task: 'Расскажите, какую еду вы любите и почему.', min: 40, phrases: ['我喜欢吃…', '因为…', '很好吃'] },
        { title: '周末', task: 'Что вы делаете на выходных?', min: 40, phrases: ['周末我常常…', '有时候我…', '我觉得…'] },
    ],
};

export const SPEAK_QUESTIONS = {
    en: [
        { l: 1, q: 'What did you eat for breakfast today?' },
        { l: 1, q: 'Can you describe your room?' },
        { l: 1, q: 'What do you usually do in the evening?' },
        { l: 2, q: 'What did you do last weekend?' },
        { l: 2, q: 'Tell me about your best friend. What is he or she like?' },
        { l: 2, q: 'What is your favourite place in your city and why?' },
        { l: 2, q: 'How do you usually get to work or school?' },
        { l: 3, q: 'Tell me about a trip you really enjoyed. What made it special?' },
        { l: 3, q: 'What do you think is the most useful app on your phone? Why?' },
        { l: 3, q: 'Describe a problem you had recently and how you solved it.' },
        { l: 3, q: 'What are you planning to do in the next few months?' },
        { l: 3, q: 'If you could learn any new skill quickly, what would it be and why?' },
        { l: 4, q: 'Do you think social media makes people happier or lonelier? Explain your opinion.' },
        { l: 4, q: 'What would you change about the way people work today?' },
        { l: 4, q: 'Describe a time when you had to make a difficult decision.' },
        { l: 4, q: 'How has technology changed the way we learn languages?' },
    ],
    zh: [
        { l: 1, q: '你今天早上吃了什么？' },
        { l: 1, q: '你叫什么名字？你是哪国人？' },
        { l: 2, q: '你周末常常做什么？' },
        { l: 2, q: '你喜欢什么样的天气？为什么？' },
        { l: 3, q: '请介绍一下你的家乡。' },
        { l: 3, q: '你为什么学习汉语？' },
    ],
};

/** Pronunciation drills. Each item is a phrase to say; `hint` is shown in Russian. */
export const DRILLS = {
    en: [
        { id: 'th', title: 'Звуки th [θ] [ð]', hint: 'Кончик языка между зубами, без «с/з» и «ф/в».', items: ['think', 'three thousand', 'thank you very much', 'this and that', 'the weather together', 'I think that this is the third thing.'] },
        { id: 'wv', title: 'W и V', hint: 'W — губы «трубочкой», без зубов. V — верхние зубы касаются нижней губы.', items: ['very well', 'we visit Victor', 'a vine and a wine', 'Wendy went west with Victor.', 'What would you like to drink?'] },
        { id: 'ii', title: 'Краткий [ɪ] и долгий [iː]', hint: 'ship — sheep, bit — beat: разница в долготе и напряжении.', items: ['ship sheep', 'live leave', 'bit beat', 'Did he leave his seat?', 'These sheep are big.'] },
        { id: 'h', title: 'Звук h', hint: 'Лёгкий выдох из горла, не русское «х».', items: ['house', 'happy holiday', 'he has a huge horse', 'How are you here?'] },
        { id: 'rl', title: 'R и L', hint: 'R — язык не касается нёба; L — кончик языка упирается в бугорки за зубами.', items: ['right light', 'red lorry yellow lorry', 'I really like long walks.', 'Please read the letter.'] },
        { id: 'ed', title: 'Окончания -ed', hint: 'worked [t], played [d], wanted [ɪd] — не «эд» везде.', items: ['worked', 'played', 'wanted', 'I watched, listened and waited.', 'She started and finished it.'] },
        { id: 'end', title: 'Конечные согласные', hint: 'Не оглушайте: bed ≠ bet, dog ≠ dock.', items: ['bed bet', 'dog dock', 'bag back', 'She asked him to wait.', 'Good food is a good mood.'] },
        { id: 'tw', title: 'Скороговорки', hint: 'Сначала медленно, потом быстрее.', items: ['She sells seashells by the seashore.', 'Peter Piper picked a peck of pickled peppers.', 'How much wood would a woodchuck chuck if a woodchuck could chuck wood?'] },
    ],
    zh: [
        { id: 'tones', title: 'Четыре тона', hint: 'mā (ровный) má (вверх) mǎ (вниз-вверх) mà (вниз).', items: ['妈', '麻', '马', '骂', '妈妈骑马', '我想买一匹马。'] },
        { id: 'zcs', title: 'zh ch sh r', hint: 'Язык загнут к нёбу.', items: ['吃饭', '十四', '老师', '热水', '我是老师。'] },
        { id: 'tw', title: 'Скороговорки', hint: 'Сначала медленно.', items: ['四是四，十是十，十四是十四，四十是四十。', '吃葡萄不吐葡萄皮。'] },
    ],
};
