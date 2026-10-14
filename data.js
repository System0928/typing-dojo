/* ============================================================
   指尖修行 · 数据层
   ============================================================ */

/* ---------- 手指代号 ---------- */
const FINGER_NAMES = {
  l5: '左手小指', l4: '左手无名指', l3: '左手中指', l2: '左手食指',
  r2: '右手食指', r3: '右手中指', r4: '右手无名指', r5: '右手小指',
  thumb: '大拇指'
};

const FINGER_SHORT = {
  l5: '小', l4: '无', l3: '中', l2: '食', r2: '食', r3: '中', r4: '无', r5: '小', thumb: '拇'
};

/* ---------- 键盘布局 ---------- */
const KEY_ROWS = [
  [
    { t: '`', s: '~', w: 1, f: 'l5' },
    { t: '1', s: '!', w: 1, f: 'l5' },
    { t: '2', s: '@', w: 1, f: 'l4' },
    { t: '3', s: '#', w: 1, f: 'l3' },
    { t: '4', s: '$', w: 1, f: 'l2' },
    { t: '5', s: '%', w: 1, f: 'l2' },
    { t: '6', s: '^', w: 1, f: 'r2' },
    { t: '7', s: '&', w: 1, f: 'r2' },
    { t: '8', s: '*', w: 1, f: 'r3' },
    { t: '9', s: '(', w: 1, f: 'r4' },
    { t: '0', s: ')', w: 1, f: 'r5' },
    { t: '-', s: '_', w: 1, f: 'r5' },
    { t: '=', s: '+', w: 1, f: 'r5' },
    { t: 'Backspace', label: '⌫ Back', w: 2, wide: true }
  ],
  [
    { t: 'Tab', label: 'Tab', w: 1.5, wide: true },
    { t: 'q', w: 1, f: 'l5' },
    { t: 'w', w: 1, f: 'l4' },
    { t: 'e', w: 1, f: 'l3' },
    { t: 'r', w: 1, f: 'l2' },
    { t: 't', w: 1, f: 'l2' },
    { t: 'y', w: 1, f: 'r2' },
    { t: 'u', w: 1, f: 'r2' },
    { t: 'i', w: 1, f: 'r3' },
    { t: 'o', w: 1, f: 'r4' },
    { t: 'p', w: 1, f: 'r5' },
    { t: '[', s: '{', w: 1, f: 'r5' },
    { t: ']', s: '}', w: 1, f: 'r5' },
    { t: '\\', s: '|', w: 1, f: 'r5' }
  ],
  [
    { t: 'CapsLock', label: 'Caps', w: 1.75, wide: true },
    { t: 'a', w: 1, f: 'l5' },
    { t: 's', w: 1, f: 'l4' },
    { t: 'd', w: 1, f: 'l3' },
    { t: 'f', w: 1, f: 'l2', home: true },
    { t: 'g', w: 1, f: 'l2' },
    { t: 'h', w: 1, f: 'r2' },
    { t: 'j', w: 1, f: 'r2', home: true },
    { t: 'k', w: 1, f: 'r3' },
    { t: 'l', w: 1, f: 'r4' },
    { t: ';', s: ':', w: 1, f: 'r5' },
    { t: "'", s: '"', w: 1, f: 'r5' },
    { t: 'Enter', label: 'Enter ⏎', w: 2, wide: true }
  ],
  [
    { t: 'ShiftLeft', label: 'Shift', w: 2.25, wide: true, shift: 'L' },
    { t: 'z', w: 1, f: 'l5' },
    { t: 'x', w: 1, f: 'l4' },
    { t: 'c', w: 1, f: 'l3' },
    { t: 'v', w: 1, f: 'l2' },
    { t: 'b', w: 1, f: 'l2' },
    { t: 'n', w: 1, f: 'r2' },
    { t: 'm', w: 1, f: 'r2' },
    { t: ',', s: '<', w: 1, f: 'r3' },
    { t: '.', s: '>', w: 1, f: 'r4' },
    { t: '/', s: '?', w: 1, f: 'r5' },
    { t: 'ShiftRight', label: 'Shift', w: 2.75, wide: true, shift: 'R' }
  ],
  [
    { t: 'ControlLeft', label: 'Ctrl', w: 1.25, wide: true },
    { t: 'MetaLeft', label: 'Win', w: 1.25, wide: true },
    { t: 'AltLeft', label: 'Alt', w: 1.25, wide: true },
    { t: ' ', label: '空格', w: 6.5, f: 'thumb' },
    { t: 'AltRight', label: 'Alt', w: 1.25, wide: true },
    { t: 'MetaRight', label: 'Win', w: 1.25, wide: true },
    { t: 'ContextMenu', label: '≡', w: 1.25, wide: true },
    { t: 'ControlRight', label: 'Ctrl', w: 1.25, wide: true }
  ]
];

/* Shift 上排符号 → 基准键 */
const SHIFT_MAP = {
  '~': '`', '!': '1', '@': '2', '#': '3', '$': '4', '%': '5', '^': '6', '&': '7',
  '*': '8', '(': '9', ')': '0', '_': '-', '+': '=', '{': '[', '}': ']', '|': '\\',
  ':': ';', '"': "'", '<': ',', '>': '.', '?': '/'
};

/* 中文标点 → 对应按键 */
const PUNCT_KEY = {
  '，': ',', '。': '.', '、': '\\', '？': '/', '！': '1', '：': ';', '；': ';',
  '“': '[', '”': ']', '「': '[', '」': ']', '《': ',', '》': '.', '（': '9', '）': '0',
  '—': '-', '…': '6', '·': '`'
};

/* ---------- 关卡数据 ---------- */
const CHAPTERS = [
  {
    id: 'ch1',
    no: '01',
    title: '第一章 · 认识键盘',
    sub: '从基准键位开始，建立手指的肌肉记忆',
    color: '#4c6ef5',
    levels: [
      {
        id: '1-1', name: '基准键位', sub: 'A S D F  J K L ;',
        type: 'drill', keys: 'asdfjkl;', len: 110, target: 70,
        tip: '左手食指放 F，右手食指放 J——键帽上的小凸起就是你的定位点。其余手指依次排开，手腕悬空，不要压在桌面上。'
      },
      {
        id: '1-2', name: '上排键位', sub: 'Q W E R  U I O P',
        type: 'drill', keys: 'qweruiop', len: 110, target: 85,
        tip: '敲完上排键要立刻回到基准键位，这叫「归位」。手指走最短的路，不要整只手乱飞。'
      },
      {
        id: '1-3', name: '下排键位', sub: 'Z X C V  B N M , . /',
        type: 'drill', keys: 'zxcvbnm,./', len: 110, target: 85,
        tip: '下排键用「向下压」而不是「向前伸」。手指弯曲着往下够，手掌位置保持不动。'
      },
      {
        id: '1-4', name: '数字行', sub: '1 2 3 4 5 6 7 8 9 0',
        type: 'drill', keys: '1234567890', len: 100, target: 95,
        tip: '数字键离基准键最远，尽量盲打。敲完马上归位，眼睛不要看键盘。'
      },
      {
        id: '1-5', name: '左右开弓', sub: '全字母混合',
        type: 'drill', keys: 'abcdefghijklmnopqrstuvwxyz', len: 130, target: 110,
        tip: '左右手交替击键时节奏最稳。试着用「哒-哒-哒」的均匀节奏，而不是一阵快一阵慢。'
      }
    ]
  },
  {
    id: 'ch2',
    no: '02',
    title: '第二章 · 单词与句子',
    sub: '把单个字母连成有意义的词',
    color: '#0ca678',
    levels: [
      {
        id: '2-1', name: '高频单词', sub: '最常用的英文短词',
        type: 'text', target: 115,
        text: 'the and you that was for are with his they this have from one had word but not what all were when we there can an your which their said if do',
        tip: '英文里最高频的词几乎都是短词。把它们练成条件反射，速度会肉眼可见地涨。'
      },
      {
        id: '2-2', name: '大写与 Shift', sub: '左右 Shift 的分工',
        type: 'text', target: 105,
        text: 'Monday Tuesday Friday Alice Beijing London Hello World Good Morning Thank You I am a Student',
        tip: '打左手区的字母用右 Shift，打右手区的字母用左 Shift。这样两只手都不用离开基准位。'
      },
      {
        id: '2-3', name: '标点符号', sub: '常用符号的位置',
        type: 'text', target: 95,
        text: "Hello, world! How are you? I'm fine; thanks. (Really?) Yes... 100% sure - let's go.",
        tip: '逗号、句号、问号都在右手区；分号和引号在右手小指区。记住它们和基准键的相对位置。'
      },
      {
        id: '2-4', name: '英文短句', sub: '连词成句',
        type: 'text', target: 125,
        text: 'Practice makes perfect. Keep your eyes on the screen. Let your fingers do the work. Small steps every day lead to big progress.',
        tip: '不要盯着键盘找字母，眼睛看着屏幕上的字。错了就错了，先保证节奏不断。'
      }
    ]
  },
  {
    id: 'ch3',
    no: '03',
    title: '第三章 · 英文美文',
    sub: '在优美的文字里提速',
    color: '#f08c00',
    levels: [
      {
        id: '3-1', name: '晨光', sub: 'The Morning Light',
        type: 'text', target: 140,
        text: 'The morning light falls softly on the desk. A small bird sings outside the window. Take a deep breath, and let your fingers find their rhythm.',
        tip: '这段文字节奏舒缓，适合练习「匀速」。不要忽快忽慢，让单词之间的间隔保持一致。'
      },
      {
        id: '3-2', name: '一点点', sub: 'Little by Little',
        type: 'text', target: 150,
        text: 'Little by little, a little becomes a lot. Every keystroke you practice today becomes speed tomorrow. Be patient with yourself, and keep going.',
        tip: '重复出现的字母组合（如 tt、ee、ll）可以连击，手指不用完全抬起，能省下不少时间。'
      },
      {
        id: '3-3', name: '读书与写作', sub: 'Of Reading and Writing',
        type: 'text', target: 160,
        text: 'Reading makes a full man, conference a ready man, and writing an exact man. Words are the small bricks with which we build our thoughts.',
        tip: '长单词不要一个字母一个字母地想，按音节分组输入，例如 con-fe-rence。'
      }
    ]
  },
  {
    id: 'ch4',
    no: '04',
    title: '第四章 · 中文之美',
    sub: '拼音输入法实战 · 请切换到中文输入法',
    color: '#e8590c',
    levels: [
      {
        id: '4-1', name: '成语四则', sub: '拼音输入 + 选词',
        type: 'zh', target: 55,
        text: '学而不厌 温故知新 锲而不舍 专心致志 持之以恒 一丝不苟',
        pinyin: [
          'xue', 'er', 'bu', 'yan', ' ',
          'wen', 'gu', 'zhi', 'xin', ' ',
          'qie', 'er', 'bu', 'she', ' ',
          'zhuan', 'xin', 'zhi', 'zhi', ' ',
          'chi', 'zhi', 'yi', 'heng', ' ',
          'yi', 'si', 'bu', 'gou'
        ],
        tip: '中文输入按「词」而不是按「字」。输入 xueerbuyan 一次就能打出「学而不厌」，比拼四个单字快得多。'
      },
      {
        id: '4-2', name: '语文短句', sub: '古诗名句',
        type: 'zh', target: 60,
        text: '读书破万卷，下笔如有神。',
        pinyin: ['du', 'shu', 'po', 'wan', 'juan', '，', 'xia', 'bi', 'ru', 'you', 'shen', '。'],
        tip: '中文标点：逗号「，」按 , 键，句号「。」按 . 键（需在中文标点状态下）。'
      },
      {
        id: '4-3', name: '春日小记', sub: '语文小短文',
        type: 'zh', target: 55,
        text: '春天来了，小草从泥土里钻出来。柳枝吐出嫩芽，燕子飞回屋檐下。',
        pinyin: [
          'chun', 'tian', 'lai', 'le', '，',
          'xiao', 'cao', 'cong', 'ni', 'tu', 'li', 'zuan', 'chu', 'lai', '。',
          'liu', 'zhi', 'tu', 'chu', 'nen', 'ya', '，',
          'yan', 'zi', 'fei', 'hui', 'wu', 'yan', 'xia', '。'
        ],
        tip: '长句可以一口气打完再选词。输入法会记住你常用的短语，越打越准。'
      }
    ]
  },
  {
    id: 'ch5',
    no: '05',
    title: '第五章 · 代码修行',
    sub: '程序员的符号手速',
    color: '#7048e8',
    levels: [
      {
        id: '5-1', name: '符号基石', sub: '括号与运算符',
        type: 'drill', keys: `(){}[]<>;:,._-=+*/&|!?@#$%^~'\``, len: 96, target: 65,
        tip: '符号大多需要 Shift。记住：左手区的符号用右 Shift，右手区的符号用左 Shift。'
      },
      {
        id: '5-2', name: 'HTML 片段', sub: '标签与属性',
        type: 'code', target: 75,
        text: '<div class="card">\n  <h1>Hello</h1>\n  <p>Keep typing.</p>\n</div>',
        tip: '尖括号 < > 用 Shift+逗号 / Shift+句号，引号用 Shift+单引号。HTML 里这两类符号出现频率极高。'
      },
      {
        id: '5-3', name: 'JavaScript', sub: '数组与箭头函数',
        type: 'code', target: 80,
        text: 'const nums = [1, 2, 3];\nnums.forEach(n => {\n  console.log(n * 2);\n});',
        tip: '箭头 => 是等号加右尖括号。花括号 {} 和方括号 [] 要分清左右手，别打混。'
      },
      {
        id: '5-4', name: 'Python', sub: '函数与缩进',
        type: 'code', target: 80,
        text: 'def greet(name):\n    return "Hello, " + name\n\nprint(greet("World"))',
        tip: 'Python 用 4 个空格缩进。回车后按 4 次空格，养成稳定的肌肉记忆。'
      }
    ]
  }
];

/* ---------- 每日一练题库 ---------- */
const DAILY_POOL = [
  {
    kind: '英文美文', target: 150,
    text: 'A journey of a thousand miles begins with a single step. Type slowly and correctly first, and speed will follow you home.'
  },
  {
    kind: '英文美文', target: 150,
    text: 'The best time to plant a tree was twenty years ago. The second best time is now. Open your editor and write one more line.'
  },
  {
    kind: '英文美文', target: 155,
    text: 'Quiet minds move quickly. When your shoulders relax and your breathing slows, your fingers will find a rhythm you did not know you had.'
  },
  {
    kind: '英文美文', target: 145,
    text: 'Do not fear the blank page. Every word you type is a small act of courage, and courage, like typing, is a skill you can practice.'
  },
  {
    kind: '中文短文', target: 55,
    text: '不积跬步，无以至千里；不积小流，无以成江海。',
    pinyin: [
      'bu', 'ji', 'kui', 'bu', '，', 'wu', 'yi', 'zhi', 'qian', 'li', '；',
      'bu', 'ji', 'xiao', 'liu', '，', 'wu', 'yi', 'cheng', 'jiang', 'hai', '。'
    ]
  },
  {
    kind: '中文短文', target: 55,
    text: '纸上得来终觉浅，绝知此事要躬行。',
    pinyin: ['zhi', 'shang', 'de', 'lai', 'zhong', 'jue', 'qian', '，', 'jue', 'zhi', 'ci', 'shi', 'yao', 'gong', 'xing', '。']
  },
  {
    kind: '中文短文', target: 55,
    text: '落霞与孤鹜齐飞，秋水共长天一色。',
    pinyin: ['luo', 'xia', 'yu', 'gu', 'wu', 'qi', 'fei', '，', 'qiu', 'shui', 'gong', 'chang', 'tian', 'yi', 'se', '。']
  },
  {
    kind: '代码片段', target: 80,
    text: 'const ok = items.filter(x => x.done);\nconsole.log(ok.length);'
  },
  {
    kind: '代码片段', target: 75,
    text: '<ul class="list">\n  <li>one</li>\n  <li>two</li>\n</ul>'
  },
  {
    kind: '代码片段', target: 80,
    text: 'def total(nums):\n    return sum(nums) / len(nums)'
  }
];

/* ---------- 成就 ---------- */
const ACHIEVEMENTS = [
  { id: 'first', name: '初次上路', desc: '完成第一个关卡' },
  { id: 'perfect', name: '零失误', desc: '以 100% 正确率完成一关' },
  { id: 'combo50', name: '行云流水', desc: '单关最高连击达到 50' },
  { id: 'combo100', name: '一气呵成', desc: '单关最高连击达到 100' },
  { id: 'cpm100', name: '突破一百', desc: '速度达到 100 字/分' },
  { id: 'cpm150', name: '风驰电掣', desc: '速度达到 150 字/分' },
  { id: 'cpm200', name: '指尖生风', desc: '速度达到 200 字/分' },
  { id: 'zh', name: '中文达人', desc: '通关第四章全部关卡' },
  { id: 'code', name: '代码之手', desc: '通关第五章全部关卡' },
  { id: 'stars20', name: '三星收藏家', desc: '累计获得 20 颗星' },
  { id: 'stars57', name: '满星道场', desc: '全部 19 关拿到三星' },
  { id: 'time30', name: '持之以恒', desc: '累计练习满 30 分钟' },
  { id: 'daily3', name: '三日之约', desc: '连续打卡 3 天' },
  { id: 'daily7', name: '七日之约', desc: '连续打卡 7 天' },
  { id: 'daily30', name: '月度修行', desc: '连续打卡 30 天' },
  { id: 'allclear', name: '通关道场', desc: '19 关全部至少一星' }
];

/* ---------- 双拼（小鹤）映射 ---------- */
const PINYIN_INITIALS = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'y', 'w'];
const XIAOHE_INITIAL = { zh: 'v', ch: 'i', sh: 'u' };
const XIAOHE_FINAL = {
  a: 'a', ai: 'd', an: 'j', ang: 'h', ao: 'c',
  e: 'e', ei: 'w', en: 'f', eng: 'g', er: 'er',
  i: 'i', ia: 'x', ian: 'm', iang: 'l', iao: 'n', ie: 'p', in: 'b', ing: 'k', iong: 's', iu: 'q',
  o: 'o', ong: 's', ou: 'z',
  u: 'u', ua: 'x', uai: 'k', uan: 'r', uang: 'l', ui: 'v', un: 'y', uo: 'o',
  v: 'v', ve: 't', van: 'r', vn: 'y', ue: 't'
};

/* ---------- 水平测试文本（60 秒计时） ---------- */
const PLACEMENT_SECONDS = 60;
const PLACEMENT_TEXT =
  'Every good typist knows that speed follows accuracy. Keep your wrists relaxed and your eyes on the screen. ' +
  'The quick brown fox jumps over the lazy dog while five dozen liquor jugs wait quietly on the shelf. ' +
  'Practice a little every day, and your fingers will learn the rhythm by heart. Numbers matter too: 1234567890 and 9876543210. ' +
  'Now take a slow breath, keep your shoulders down, and type the next word without looking at the keyboard. ' +
  'A calm and steady rhythm will always beat a fast and uneven one.';

/* ---------- 训练方案库 ---------- */
const TRAINING_PACKS = [
  {
    id: 'pk-basic', name: '标准指法 · 基础', desc: 'ASDF JKL; 八键起步',
    type: 'drill', keys: 'asdfjkl;', len: 110, target: 70,
    tip: '八个基准键是所有动作的家。练到不用看键盘就能找到它们。'
  },
  {
    id: 'pk-adv', name: '标准指法 · 进阶', desc: '全字母混合 · 练归位',
    type: 'drill', keys: 'abcdefghijklmnopqrstuvwxyz', len: 130, target: 110,
    tip: '每一次击键结束都要回到基准键位。手指走最短的路，速度自然上来。'
  },
  {
    id: 'pk-num', name: '数字与符号', desc: '上排数字 + 常用符号',
    type: 'drill', keys: '1234567890-=;,.', len: 100, target: 80,
    tip: '数字键离基准位最远，尽量盲打。敲完马上归位。'
  },
  {
    id: 'pk-code', name: '代码符号流', desc: '括号运算符密集训练',
    type: 'drill', keys: `(){}[]<>;:,._-=+*/&|!?@#$%^~'\``, len: 96, target: 65,
    tip: '左手区的符号用右 Shift，右手区的符号用左 Shift。'
  },
  {
    id: 'pk-en', name: '英文高频词', desc: '最常用的英文短词',
    type: 'text', target: 115,
    text: 'the and you that was for are with his they this have from one had word but not what all were when we there can an your which their said if do will each about how up out them then she many some her would make like him into time has look two more write go see number way could people',
    tip: '高频词几乎都是短词，练成条件反射之后速度会肉眼可见地涨。'
  },
  {
    id: 'pk-cn', name: '中文高频词', desc: '拼音整词输入',
    type: 'zh', target: 55,
    text: '我们 你们 他们 什么 时候 现在 因为 所以 可以 知道 觉得 应该',
    pinyin: [
      'wo', 'men', ' ', 'ni', 'men', ' ', 'ta', 'men', ' ', 'shen', 'me', ' ',
      'shi', 'hou', ' ', 'xian', 'zai', ' ', 'yin', 'wei', ' ', 'suo', 'yi', ' ',
      'ke', 'yi', ' ', 'zhi', 'dao', ' ', 'jue', 'de', ' ', 'ying', 'gai'
    ],
    tip: '中文输入按词打。输入 women 一次就能打出「我们」，比单字快得多。'
  },
  {
    id: 'pk-sp', name: '双拼入门', desc: '小鹤双拼常用音节',
    type: 'zh', target: 50,
    text: '小鹤 双拼 输入 学习 中文 打字 速度 提升',
    pinyin: [
      'xiao', 'he', ' ', 'shuang', 'pin', ' ', 'shu', 'ru', ' ', 'xue', 'xi', ' ',
      'zhong', 'wen', ' ', 'da', 'zi', ' ', 'su', 'du', ' ', 'ti', 'sheng'
    ],
    tip: '双拼把每个音节压缩成两键。先在设置里把输入方案切成「小鹤双拼」，再跟着键盘提示练。'
  }
];

/* ---------- 符号速查表 ---------- */
const SYMBOL_TABLE = [
  ['`', '`', '反引号 / 模板字符串'],
  ['~', 'Shift + `', '波浪号'],
  ['!', 'Shift + 1', '逻辑非 / 感叹号'],
  ['@', 'Shift + 2', 'at 符号 / 装饰器'],
  ['#', 'Shift + 3', '井号 / 私有字段'],
  ['$', 'Shift + 4', '美元符 / 模板变量'],
  ['%', 'Shift + 5', '取模'],
  ['^', 'Shift + 6', '异或 / 脱字符'],
  ['&', 'Shift + 7', '按位与 / 引用'],
  ['*', 'Shift + 8', '乘号 / 通配符'],
  ['(', 'Shift + 9', '左圆括号'],
  [')', 'Shift + 0', '右圆括号'],
  ['-', '-', '减号 / 连字符'],
  ['_', 'Shift + -', '下划线'],
  ['=', '=', '赋值 / 等号'],
  ['+', 'Shift + =', '加号'],
  ['[', '[', '左方括号 / 索引'],
  [']', ']', '右方括号'],
  ['{', 'Shift + [', '左花括号 / 代码块'],
  ['}', 'Shift + ]', '右花括号'],
  ['\\', '\\', '反斜杠 / 转义'],
  ['|', 'Shift + \\', '竖线 / 管道'],
  [';', ';', '分号 / 语句结束'],
  [':', 'Shift + ;', '冒号'],
  ["'", "'", '单引号'],
  ['"', "Shift + '", '双引号 / 字符串'],
  [',', ',', '逗号'],
  ['<', 'Shift + ,', '小于号 / 泛型'],
  ['.', '.', '句点 / 成员访问'],
  ['>', 'Shift + .', '大于号 / 箭头'],
  ['/', '/', '斜杠 / 注释 / 除号'],
  ['?', 'Shift + /', '问号 / 三元 / 可选链']
];
