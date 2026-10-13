// @xufa/lint: the text of the line being written is kept as its pieces (what write() was given), not concatenated:
// trim() looks at the last pieces only, where concatenating made V8 flatten each line before reading its end (at every
// line break), and the whole text is joined once at the end.

const isIndentation = (code) => code === 32 || code === 9; // ' ' or '\t'

class printResult {
  /** @type {string[]} */
  #settledTexts = [];
  /** @type {string[]} */
  #unsettledParts = [];
  #settledTextLength = 0;
  /** @type {number[]} */
  #settledPositions = [];
  /** @type {number[]} */
  #unsettledPositions = [];

  #unsettledLength() {
    let length = 0;
    for (const part of this.#unsettledParts) length += part.length;
    return length;
  }

  #settle() {
    const parts = this.#unsettledParts;
    if (parts.length > 0) {
      // (One string for the line: the text is joined once, from its lines.)
      let line = parts[0];
      for (let index = 1; index < parts.length; index++) {
        line += parts[index];
      }
      this.#settledTexts.push(line);
      this.#settledTextLength += line.length;
      parts.length = 0;
    }

    for (const position of this.#unsettledPositions) {
      this.#settledPositions.push(Math.min(position, this.#settledTextLength));
    }
    this.#unsettledPositions.length = 0;
  }

  markPosition() {
    if (this.#settledPositions.length + this.#unsettledPositions.length >= 2) {
      throw new Error("There are too many 'cursor' in doc.");
    }

    this.#unsettledPositions.push(this.#settledTextLength + this.#unsettledLength());
  }

  /**
  @param {string} text
  */
  write(text) {
    if (text !== '') {
      this.#unsettledParts.push(text);
    }
  }

  // Trailing tabs and spaces of the text not settled, out (as trimIndentation() did): how many.
  trim() {
    const parts = this.#unsettledParts;
    let count = 0;
    while (parts.length > 0) {
      const last = parts[parts.length - 1];
      let end = last.length;
      while (end > 0 && isIndentation(last.charCodeAt(end - 1))) {
        end--;
      }
      count += last.length - end;
      if (end > 0) {
        if (end < last.length) {
          parts[parts.length - 1] = last.slice(0, end);
        }
        break;
      }
      parts.pop();
    }
    this.#settle();

    return count;
  }

  finish() {
    this.#settle();

    return {
      text: this.#settledTexts.join(''),
      positions: this.#settledPositions,
    };
  }
}

export default printResult;
