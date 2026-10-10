// The data of the benchmark, the same for Django and xufa: genres, languages, authors, books and their copies, made
// from a fixed seed (the same rows on every run), and two users: a reader with loans and a librarian who edits.
//
//   node data.mjs [out.json] [--authors 500] [--books 2000] [--copies 6000]
import fs from 'node:fs';

const PASSWORD = 'bench-library-password';

// mulberry32: a small generator of numbers from a seed.
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = (
  'river stone light shadow garden winter summer city empire night morning song silence glass iron paper ' +
  'island mountain letter journey memory machine harbor forest window storm crown ladder mirror lantern'
).split(' ');
const FIRST =
  'Ana Bruno Clara Diego Elena Felix Greta Hugo Ines Jonas Karin Luis Marta Nora Oscar Paula Rosa Teo'.split(' ');
const LAST = 'Abad Berg Costa Duarte Engel Ferrer Gallo Haas Ibarra Jensen Klein Lopes Moreau Novak Ortiz Petit'.split(
  ' '
);
const GENRES = 'Fantasy|Science Fiction|Poetry|History|Mystery|Romance|Biography|Horror|Travel|Philosophy'.split('|');
const LANGUAGES = ['English', 'French', 'Spanish', 'German', 'Italian'];
const STATUSES = ['a', 'a', 'a', 'o', 'd', 'r'];

function generate({ authors = 500, books = 2000, copies = 6000, seed = 20261008 } = {}) {
  const next = random(seed);
  const pick = (list) => list[Math.floor(next() * list.length)];
  const day = (from, span) =>
    new Date(Date.UTC(from, 0, 1) + Math.floor(next() * span) * 86400000).toISOString().slice(0, 10);
  const uuid = () => {
    const hex = Array.from({ length: 32 }, () => Math.floor(next() * 16).toString(16));
    hex[12] = '4';
    hex[16] = '89ab'[Math.floor(next() * 4)];
    const s = hex.join('');
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
  };
  const title = () => {
    const n = 2 + Math.floor(next() * 3);
    const words = Array.from({ length: n }, () => pick(WORDS));
    return words.map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');
  };
  const data = {
    password: PASSWORD,
    genres: GENRES.map((name) => ({ name })),
    languages: LANGUAGES.map((name) => ({ name })),
    authors: Array.from({ length: authors }, () => {
      const born = day(1800, 200 * 365);
      return {
        firstName: pick(FIRST),
        lastName: pick(LAST),
        dateOfBirth: born,
        dateOfDeath: next() < 0.6 ? day(Number(born.slice(0, 4)) + 30, 60 * 365) : null,
      };
    }),
    books: Array.from({ length: books }, (_, i) => ({
      title: title(),
      author: Math.floor(next() * authors),
      summary: Array.from({ length: 24 }, () => pick(WORDS)).join(' '),
      isbn: String(9780000000000 + i),
      genres: [...new Set([Math.floor(next() * GENRES.length), Math.floor(next() * GENRES.length)])].slice(
        0,
        next() < 0.5 ? 1 : 2
      ),
      language: Math.floor(next() * LANGUAGES.length),
    })),
    copies: [],
    users: [
      { username: 'reader', email: 'reader@example.com', role: 'reader' },
      { username: 'librarian', email: 'librarian@example.com', role: 'librarian' },
    ],
  };
  for (let i = 0; i < copies; i += 1) {
    // The first 12 copies are on loan to the reader (their page of loans); the rest by chance, never borrowed.
    const loaned = i < 12;
    const status = loaned ? 'o' : pick(STATUSES.filter((s) => s !== 'o'));
    data.copies.push({
      id: uuid(),
      book: Math.floor(next() * books),
      imprint: `${pick(WORDS)} press, ${1950 + Math.floor(next() * 70)}`,
      dueBack: loaned ? day(2026, 60) : status === 'a' ? null : day(2026, 60),
      status,
      borrower: loaned ? 'reader' : null,
    });
  }
  return data;
}

function parse(argv) {
  const options = {};
  let out = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) {
      options[argv[i].slice(2)] = Number(argv[i + 1]);
      i += 1;
    } else out = argv[i];
  }
  return { out, options };
}

if (process.argv[1] === import.meta.filename) {
  const { out, options } = parse(process.argv.slice(2));
  const text = JSON.stringify(generate(options));
  if (out) fs.writeFileSync(out, text);
  else process.stdout.write(text);
}

export { generate, PASSWORD };
