// A code path: the paths of a program, a function, a class field's initializer or a static block (origin), as segments
// from its initial one to its final ones (those that return and those that throw). Code paths nest: upper and
// childCodePaths. Rules get them in onCodePathStart/End; their fields and traverseSegments are ESLint's.

import { CodePathState } from './state.js';

// Ids with a prefix and a number from 1: s1, s2...; s1_1, s1_2... for the segments of s1.
class IdGenerator {
  constructor(prefix) {
    this.prefix = String(prefix);
    this.n = 0;
  }

  next() {
    this.n = (1 + this.n) | 0;
    if (this.n < 0) this.n = 1;
    return this.prefix + this.n;
  }
}

class CodePath {
  constructor({ id, origin, upper, onLooped }) {
    this.id = id;
    this.origin = origin;
    this.upper = upper;
    this.childCodePaths = [];
    // Not for rules: the state of the analysis.
    Object.defineProperty(this, 'internal', { value: new CodePathState(new IdGenerator(`${id}_`), onLooped) });
    if (upper) upper.childCodePaths.push(this);
  }

  static getState(codePath) {
    return codePath.internal;
  }

  get initialSegment() {
    return this.internal.initialSegment;
  }

  get finalSegments() {
    return this.internal.finalSegments;
  }

  get returnedSegments() {
    return this.internal.returnedForkContext;
  }

  get thrownSegments() {
    return this.internal.thrownForkContext;
  }

  /**
   * Calls `callback(segment, controller)` on the segments from the initial one (or options.first, to options.last),
   * each after all the segments before it (but those of loops back): in the order code runs. controller.skip() leaves
   * out the segments only that one leads to; controller.break() ends the walk.
   */
  traverseSegments(optionsOrCallback, callback) {
    let options;
    let visit;
    if (typeof optionsOrCallback === 'function') {
      visit = optionsOrCallback;
      options = {};
    } else {
      options = optionsOrCallback || {};
      visit = callback;
    }
    const startSegment = options.first || this.internal.initialSegment;
    const lastSegment = options.last;
    const visited = new Set();
    const skipped = new Set();
    const stack = [[startSegment, 0]];
    let segment = null;
    let broken = false;
    const controller = {
      skip() {
        skipped.add(segment);
      },
      break() {
        broken = true;
      },
    };
    const isVisited = (prev) => visited.has(prev) || segment.isLoopedPrevSegment(prev);
    const isSkipped = (prev) => skipped.has(prev) || segment.isLoopedPrevSegment(prev);
    while (stack.length > 0) {
      const record = stack.at(-1);
      segment = record[0];
      const index = record[1];
      if (index === 0) {
        if (visited.has(segment)) {
          stack.pop();
          continue;
        }
        // Not until every segment before it (but those looping back) is visited.
        if (segment !== startSegment && segment.prevSegments.length > 0 && !segment.prevSegments.every(isVisited)) {
          stack.pop();
          continue;
        }
        visited.add(segment);
        const shouldSkip = skipped.size > 0 && segment.prevSegments.length > 0 && segment.prevSegments.every(isSkipped);
        if (shouldSkip) {
          skipped.add(segment);
        } else {
          visit.call(this, segment, controller);
          if (segment === lastSegment) controller.skip();
          if (broken) break;
        }
      }
      const end = segment.nextSegments.length - 1;
      if (index < end) {
        record[1] += 1;
        stack.push([segment.nextSegments[index], 0]);
      } else if (index === end) {
        record[0] = segment.nextSegments[index];
        record[1] = 0;
      } else {
        stack.pop();
      }
    }
  }
}

export { CodePath, IdGenerator };
