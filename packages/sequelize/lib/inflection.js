// The rules of the inflection package (1.13.4), with which Sequelize 6 makes the names of tables (User -> Users)
// and of accessors (getTasks, addTask): copied as they are, so the names are the same.
//
// inflection: Copyright (c) 2011 Ben Lin <ben@dreamerslab.com>, MIT Licensed.
/* eslint-disable */

const uncountable_words = [
  'accommodation',
  'adulthood',
  'advertising',
  'advice',
  'aggression',
  'aid',
  'air',
  'aircraft',
  'alcohol',
  'anger',
  'applause',
  'arithmetic',

  'assistance',
  'athletics',

  'bacon',
  'baggage',

  'beef',

  'biology',

  'blood',
  'botany',

  'bread',

  'butter',

  'carbon',
  'cardboard',
  'cash',
  'chalk',
  'chaos',
  'chess',
  'crossroads',
  'countryside',

  'dancing',

  'deer',

  'dignity',
  'dirt',

  'dust',

  'economics',
  'education',
  'electricity',

  'engineering',
  'enjoyment',

  'envy',
  'equipment',
  'ethics',
  'evidence',
  'evolution',

  'fame',
  'fiction',

  'flour',
  'flu',
  'food',

  'fuel',
  'fun',

  'furniture',

  'gallows',
  'garbage',
  'garlic',

  'genetics',

  'gold',
  'golf',
  'gossip',

  'gratitude',
  'grief',

  'guilt',
  'gymnastics',

  'happiness',
  'hardware',
  'harm',
  'hate',
  'hatred',
  'health',
  'heat',

  'help',
  'homework',
  'honesty',
  'honey',
  'hospitality',
  'housework',
  'humour',
  'hunger',
  'hydrogen',

  'ice',
  'importance',
  'inflation',
  'information',

  'innocence',

  'iron',
  'irony',

  'jam',

  'jewelry',

  'judo',

  'karate',

  'knowledge',

  'lack',

  'laughter',
  'lava',
  'leather',
  'leisure',
  'lightning',
  'linguine',
  'linguini',
  'linguistics',
  'literature',
  'litter',
  'livestock',
  'logic',
  'loneliness',

  'luck',
  'luggage',

  'macaroni',
  'machinery',
  'magic',

  'management',
  'mankind',
  'marble',
  'mathematics',
  'mayonnaise',
  'measles',

  'methane',
  'milk',
  'minus',
  'money',

  'mud',
  'music',
  'mumps',

  'nature',
  'news',
  'nitrogen',
  'nonsense',
  'nurture',
  'nutrition',

  'obedience',
  'obesity',

  'oxygen',

  'pasta',
  'patience',

  'physics',
  'poetry',
  'pollution',
  'poverty',

  'pride',

  'psychology',
  'publicity',
  'punctuation',

  'quartz',

  'racism',

  'relaxation',
  'reliability',
  'research',
  'respect',
  'revenge',
  'rice',
  'rubbish',
  'rum',

  'safety',

  'scenery',
  'seafood',
  'seaside',
  'series',
  'shame',
  'sheep',
  'shopping',

  'sleep',

  'smoke',
  'smoking',
  'snow',
  'soap',
  'software',
  'soil',

  'spaghetti',

  'species',

  'steam',

  'stuff',
  'stupidity',

  'sunshine',
  'symmetry',

  'tennis',
  'thirst',
  'thunder',
  'timber',

  'traffic',
  'transportation',

  'trust',

  'underwear',
  'unemployment',
  'unity',

  'validity',
  'veal',
  'vegetation',
  'vegetarianism',
  'vengeance',
  'violence',

  'vitality',

  'warmth',

  'wealth',
  'weather',

  'welfare',
  'wheat',

  'wildlife',

  'wisdom',

  'yoga',

  'zinc',
  'zoology',
];

const regex = {
  plural: {
    men: new RegExp('^(m|wom)en$', 'gi'),
    people: new RegExp('(pe)ople$', 'gi'),
    children: new RegExp('(child)ren$', 'gi'),
    tia: new RegExp('([ti])a$', 'gi'),
    analyses: new RegExp('((a)naly|(b)a|(d)iagno|(p)arenthe|(p)rogno|(s)ynop|(t)he)ses$', 'gi'),
    databases: new RegExp('(database)s$', 'gi'),
    drives: new RegExp('(drive)s$', 'gi'),
    hives: new RegExp('(hi|ti)ves$', 'gi'),
    curves: new RegExp('(curve)s$', 'gi'),
    lrves: new RegExp('([lr])ves$', 'gi'),
    aves: new RegExp('([a])ves$', 'gi'),
    foves: new RegExp('([^fo])ves$', 'gi'),
    movies: new RegExp('(m)ovies$', 'gi'),
    aeiouyies: new RegExp('([^aeiouy]|qu)ies$', 'gi'),
    series: new RegExp('(s)eries$', 'gi'),
    xes: new RegExp('(x|ch|ss|sh)es$', 'gi'),
    mice: new RegExp('([m|l])ice$', 'gi'),
    buses: new RegExp('(bus)es$', 'gi'),
    oes: new RegExp('(o)es$', 'gi'),
    shoes: new RegExp('(shoe)s$', 'gi'),
    crises: new RegExp('(cris|ax|test)es$', 'gi'),
    octopuses: new RegExp('(octop|vir)uses$', 'gi'),
    aliases: new RegExp('(alias|canvas|status|campus)es$', 'gi'),
    summonses: new RegExp('^(summons|bonus)es$', 'gi'),
    oxen: new RegExp('^(ox)en', 'gi'),
    matrices: new RegExp('(matr)ices$', 'gi'),
    vertices: new RegExp('(vert|ind)ices$', 'gi'),
    feet: new RegExp('^feet$', 'gi'),
    teeth: new RegExp('^teeth$', 'gi'),
    geese: new RegExp('^geese$', 'gi'),
    quizzes: new RegExp('(quiz)zes$', 'gi'),
    whereases: new RegExp('^(whereas)es$', 'gi'),
    criteria: new RegExp('^(criteri)a$', 'gi'),
    genera: new RegExp('^genera$', 'gi'),
    ss: new RegExp('ss$', 'gi'),
    s: new RegExp('s$', 'gi'),
  },

  singular: {
    man: new RegExp('^(m|wom)an$', 'gi'),
    person: new RegExp('(pe)rson$', 'gi'),
    child: new RegExp('(child)$', 'gi'),
    drive: new RegExp('(drive)$', 'gi'),
    ox: new RegExp('^(ox)$', 'gi'),
    axis: new RegExp('(ax|test)is$', 'gi'),
    octopus: new RegExp('(octop|vir)us$', 'gi'),
    alias: new RegExp('(alias|status|canvas|campus)$', 'gi'),
    summons: new RegExp('^(summons|bonus)$', 'gi'),
    bus: new RegExp('(bu)s$', 'gi'),
    buffalo: new RegExp('(buffal|tomat|potat)o$', 'gi'),
    tium: new RegExp('([ti])um$', 'gi'),
    sis: new RegExp('sis$', 'gi'),
    ffe: new RegExp('(?:([^f])fe|([lr])f)$', 'gi'),
    hive: new RegExp('(hi|ti)ve$', 'gi'),
    aeiouyy: new RegExp('([^aeiouy]|qu)y$', 'gi'),
    x: new RegExp('(x|ch|ss|sh)$', 'gi'),
    matrix: new RegExp('(matr)ix$', 'gi'),
    vertex: new RegExp('(vert|ind)ex$', 'gi'),
    mouse: new RegExp('([m|l])ouse$', 'gi'),
    foot: new RegExp('^foot$', 'gi'),
    tooth: new RegExp('^tooth$', 'gi'),
    goose: new RegExp('^goose$', 'gi'),
    quiz: new RegExp('(quiz)$', 'gi'),
    whereas: new RegExp('^(whereas)$', 'gi'),
    criterion: new RegExp('^(criteri)on$', 'gi'),
    genus: new RegExp('^genus$', 'gi'),
    s: new RegExp('s$', 'gi'),
    common: new RegExp('$', 'gi'),
  },
};

const plural_rules = [
  [regex.plural.men],
  [regex.plural.people],
  [regex.plural.children],
  [regex.plural.tia],
  [regex.plural.analyses],
  [regex.plural.databases],
  [regex.plural.drives],
  [regex.plural.hives],
  [regex.plural.curves],
  [regex.plural.lrves],
  [regex.plural.foves],
  [regex.plural.aeiouyies],
  [regex.plural.series],
  [regex.plural.movies],
  [regex.plural.xes],
  [regex.plural.mice],
  [regex.plural.buses],
  [regex.plural.oes],
  [regex.plural.shoes],
  [regex.plural.crises],
  [regex.plural.octopuses],
  [regex.plural.aliases],
  [regex.plural.summonses],
  [regex.plural.oxen],
  [regex.plural.matrices],
  [regex.plural.feet],
  [regex.plural.teeth],
  [regex.plural.geese],
  [regex.plural.quizzes],
  [regex.plural.whereases],
  [regex.plural.criteria],
  [regex.plural.genera],

  [regex.singular.man, '$1en'],
  [regex.singular.person, '$1ople'],
  [regex.singular.child, '$1ren'],
  [regex.singular.drive, '$1s'],
  [regex.singular.ox, '$1en'],
  [regex.singular.axis, '$1es'],
  [regex.singular.octopus, '$1uses'],
  [regex.singular.alias, '$1es'],
  [regex.singular.summons, '$1es'],
  [regex.singular.bus, '$1ses'],
  [regex.singular.buffalo, '$1oes'],
  [regex.singular.tium, '$1a'],
  [regex.singular.sis, 'ses'],
  [regex.singular.ffe, '$1$2ves'],
  [regex.singular.hive, '$1ves'],
  [regex.singular.aeiouyy, '$1ies'],
  [regex.singular.matrix, '$1ices'],
  [regex.singular.vertex, '$1ices'],
  [regex.singular.x, '$1es'],
  [regex.singular.mouse, '$1ice'],
  [regex.singular.foot, 'feet'],
  [regex.singular.tooth, 'teeth'],
  [regex.singular.goose, 'geese'],
  [regex.singular.quiz, '$1zes'],
  [regex.singular.whereas, '$1es'],
  [regex.singular.criterion, '$1a'],
  [regex.singular.genus, 'genera'],

  [regex.singular.s, 's'],
  [regex.singular.common, 's'],
];

const singular_rules = [
  [regex.singular.man],
  [regex.singular.person],
  [regex.singular.child],
  [regex.singular.drive],
  [regex.singular.ox],
  [regex.singular.axis],
  [regex.singular.octopus],
  [regex.singular.alias],
  [regex.singular.summons],
  [regex.singular.bus],
  [regex.singular.buffalo],
  [regex.singular.tium],
  [regex.singular.sis],
  [regex.singular.ffe],
  [regex.singular.hive],
  [regex.singular.aeiouyy],
  [regex.singular.x],
  [regex.singular.matrix],
  [regex.singular.mouse],
  [regex.singular.foot],
  [regex.singular.tooth],
  [regex.singular.goose],
  [regex.singular.quiz],
  [regex.singular.whereas],
  [regex.singular.criterion],
  [regex.singular.genus],

  [regex.plural.men, '$1an'],
  [regex.plural.people, '$1rson'],
  [regex.plural.children, '$1'],
  [regex.plural.databases, '$1'],
  [regex.plural.drives, '$1'],
  [regex.plural.genera, 'genus'],
  [regex.plural.criteria, '$1on'],
  [regex.plural.tia, '$1um'],
  [regex.plural.analyses, '$1$2sis'],
  [regex.plural.hives, '$1ve'],
  [regex.plural.curves, '$1'],
  [regex.plural.lrves, '$1f'],
  [regex.plural.aves, '$1ve'],
  [regex.plural.foves, '$1fe'],
  [regex.plural.movies, '$1ovie'],
  [regex.plural.aeiouyies, '$1y'],
  [regex.plural.series, '$1eries'],
  [regex.plural.xes, '$1'],
  [regex.plural.mice, '$1ouse'],
  [regex.plural.buses, '$1'],
  [regex.plural.oes, '$1'],
  [regex.plural.shoes, '$1'],
  [regex.plural.crises, '$1is'],
  [regex.plural.octopuses, '$1us'],
  [regex.plural.aliases, '$1'],
  [regex.plural.summonses, '$1'],
  [regex.plural.oxen, '$1'],
  [regex.plural.matrices, '$1ix'],
  [regex.plural.vertices, '$1ex'],
  [regex.plural.feet, 'foot'],
  [regex.plural.teeth, 'tooth'],
  [regex.plural.geese, 'goose'],
  [regex.plural.quizzes, '$1'],
  [regex.plural.whereases, '$1'],

  [regex.plural.ss, 'ss'],
  [regex.plural.s, ''],
];

// As inflection's _apply_rules: the first rule that matches (words of uncountable_words stay as they are).
function applyRules(str, rules, skip) {
  if (skip.includes(str.toLowerCase())) return str;
  for (let i = 0; i < rules.length; i += 1) {
    if (str.match(rules[i][0])) {
      if (rules[i][1] !== undefined) str = str.replace(rules[i][0], rules[i][1]);
      break;
    }
  }
  return str;
}

const pluralize = (str) => applyRules(str, plural_rules, uncountable_words);
const singularize = (str) => applyRules(str, singular_rules, uncountable_words);

module.exports = { pluralize, singularize };
