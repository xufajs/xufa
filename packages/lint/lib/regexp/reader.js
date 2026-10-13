// The text of a pattern, read a character at a time: a UTF-16 code unit, or with the u and v flags a code point (a
// surrogate pair is one). The reader sees the current character and the three after it (-1 past the end).

const unitAt = (text, end, i) => (i < end ? text.charCodeAt(i) : -1);
const pointAt = (text, end, i) => (i < end ? text.codePointAt(i) : -1);
const pointWidth = (cp) => (cp > 0xffff ? 2 : 1);
const unitWidth = () => 1;

class Reader {
  constructor() {
    this.source = '';
    this.index = 0;
    this.end = 0;
    this.at = unitAt;
    this.width = unitWidth;
    // The current character and the three after it, and the widths of the first three.
    this.cp1 = -1;
    this.cp2 = -1;
    this.cp3 = -1;
    this.cp4 = -1;
    this.w1 = 1;
    this.w2 = 1;
    this.w3 = 1;
  }

  get currentCodePoint() {
    return this.cp1;
  }

  get nextCodePoint() {
    return this.cp2;
  }

  get nextCodePoint2() {
    return this.cp3;
  }

  get nextCodePoint3() {
    return this.cp4;
  }

  reset(source, start, end, codePoints) {
    this.source = source;
    this.end = end;
    this.at = codePoints ? pointAt : unitAt;
    this.width = codePoints ? pointWidth : unitWidth;
    this.rewind(start);
  }

  rewind(index) {
    const { source, end, at, width } = this;
    this.index = index;
    this.cp1 = at(source, end, index);
    this.w1 = width(this.cp1);
    this.cp2 = at(source, end, index + this.w1);
    this.w2 = width(this.cp2);
    this.cp3 = at(source, end, index + this.w1 + this.w2);
    this.w3 = width(this.cp3);
    this.cp4 = at(source, end, index + this.w1 + this.w2 + this.w3);
  }

  advance() {
    if (this.cp1 === -1) return;
    this.index += this.w1;
    this.cp1 = this.cp2;
    this.w1 = this.w2;
    this.cp2 = this.cp3;
    this.w2 = this.width(this.cp2);
    this.cp3 = this.cp4;
    this.w3 = this.width(this.cp3);
    this.cp4 = this.at(this.source, this.end, this.index + this.w1 + this.w2 + this.w3);
  }

  // The given characters, next: then they are read.
  eat(cp) {
    if (this.cp1 !== cp) return false;
    this.advance();
    return true;
  }

  eat2(cp1, cp2) {
    if (this.cp1 !== cp1 || this.cp2 !== cp2) return false;
    this.advance();
    this.advance();
    return true;
  }

  eat3(cp1, cp2, cp3) {
    if (this.cp1 !== cp1 || this.cp2 !== cp2 || this.cp3 !== cp3) return false;
    this.advance();
    this.advance();
    this.advance();
    return true;
  }
}

export { Reader };
