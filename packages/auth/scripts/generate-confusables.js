/* eslint-disable no-console */
// Writes lib/confusables-data.js from confusables.txt of Unicode's security data (UTS #39), as one text of pairs:
// a character, then its prototype (the characters it looks like), each pair ended by \u0001. lib/confusables.js reads
// it into a map the first time skeleton() is called.
//
//   curl -o confusables.txt https://www.unicode.org/Public/security/latest/confusables.txt
//   node scripts/generate-confusables.js confusables.txt
import fs from 'node:fs';
import path from 'node:path';

const NOTICE = `// Data from confusables.txt of the Unicode Character Database (UTS #39, Unicode Security Mechanisms).
//
// UNICODE LICENSE V3
//
// COPYRIGHT AND PERMISSION NOTICE
//
// Copyright © 1991-2026 Unicode, Inc.
//
// NOTICE TO USER: Carefully read the following legal agreement. BY DOWNLOADING, INSTALLING, COPYING OR OTHERWISE
// USING DATA FILES, AND/OR SOFTWARE, YOU UNEQUIVOCALLY ACCEPT, AND AGREE TO BE BOUND BY, ALL OF THE TERMS AND
// CONDITIONS OF THIS AGREEMENT. IF YOU DO NOT AGREE, DO NOT DOWNLOAD, INSTALL, COPY, DISTRIBUTE OR USE THE DATA FILES
// OR SOFTWARE.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy of data files and any associated
// documentation (the "Data Files") or software and any associated documentation (the "Software") to deal in the Data
// Files or Software without restriction, including without limitation the rights to use, copy, modify, merge,
// publish, distribute, and/or sell copies of the Data Files or Software, and to permit persons to whom the Data Files
// or Software are furnished to do so, provided that either (a) this copyright and permission notice appear with all
// copies of the Data Files or Software, or (b) this copyright and permission notice appear in associated
// Documentation.
//
// THE DATA FILES AND SOFTWARE ARE PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
// NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT OF THIRD
// PARTY RIGHTS. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR HOLDERS INCLUDED IN THIS NOTICE BE LIABLE FOR ANY CLAIM, OR
// ANY SPECIAL INDIRECT OR CONSEQUENTIAL DAMAGES, OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR
// PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH
// THE USE OR PERFORMANCE OF THE DATA FILES OR SOFTWARE.
//
// Except as contained in this notice, the name of a copyright holder shall not be used in advertising or otherwise
// to promote the sale, use or other dealings in these Data Files or Software without prior written authorization of
// the copyright holder.`;

const file = process.argv[2];
if (!file) {
  console.error('node scripts/generate-confusables.js <confusables.txt>');
  process.exit(1);
}
const text = fs.readFileSync(file, 'utf8');
const date = (/^# Date: (.+)$/m.exec(text) || [])[1] || 'unknown';
const version = (/^# Version: (.+)$/m.exec(text) || [])[1];
const fromHex = (field) =>
  field
    .trim()
    .split(/\s+/)
    .map((hex) => String.fromCodePoint(parseInt(hex, 16)))
    .join('');
const pairs = [];
for (const line of text.split('\n')) {
  const data = line.replace(/#.*$/, '').trim();
  if (!data) continue;
  const [source, target] = data.split(';');
  pairs.push(`${fromHex(source)}${fromHex(target)}\u0001`);
}
// Each source is one character (a code point): the prototype is what follows it until \u0001.
const out = `${NOTICE}
//
// confusables.txt of ${date}${version ? `, version ${version}` : ''}: ${pairs.length} characters and their prototypes,
// written by scripts/generate-confusables.js (do not edit).

export default ${JSON.stringify(pairs.join(''))};
`;
fs.writeFileSync(path.join(import.meta.dirname, '../lib/confusables-data.js'), out);
console.log(`Wrote lib/confusables-data.js: ${pairs.length} characters (${Math.round(out.length / 1024)} KB)`);
