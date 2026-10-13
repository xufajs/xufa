// The paths a part of a code path forks into, kept apart: `count` parallel paths (a finally block doubles them: the
// normal path and the one leaving by return or throw), and a list of their segments, one array of `count` per step
// (segmentsList). Its head is the last step. New segments are made after a range of steps, path by path.

import { CodePathSegment } from './segment.js';

const isReachable = (segment) => segment.reachable;

class ForkContext {
  constructor(idGenerator, upper, count) {
    this.idGenerator = idGenerator;
    this.upper = upper;
    this.count = count;
    this.segmentsList = [];
  }

  get head() {
    return this.segmentsList.length === 0 ? [] : this.segmentsList.at(-1);
  }

  get empty() {
    return this.segmentsList.length === 0;
  }

  get reachable() {
    const segments = this.head;
    return segments.length > 0 && segments.some(isReachable);
  }

  // For each path, a segment made after the segments of the steps from start to end (negative: from the end).
  #make(start, end, create) {
    const list = this.segmentsList;
    const from = start >= 0 ? start : list.length + start;
    const to = end >= 0 ? end : list.length + end;
    const segments = [];
    for (let i = 0; i < this.count; ++i) {
      const prev = [];
      for (let j = from; j <= to; ++j) prev.push(list[j][i]);
      segments.push(create(this.idGenerator.next(), prev));
    }
    return segments;
  }

  makeNext(start, end) {
    return this.#make(start, end, CodePathSegment.newNext);
  }

  makeUnreachable(start, end) {
    return this.#make(start, end, CodePathSegment.newUnreachable);
  }

  makeDisconnected(start, end) {
    return this.#make(start, end, CodePathSegment.newDisconnected);
  }

  // More segments than paths are merged in pairs (the first half with the second) until they are as many.
  #merge(segments) {
    let current = segments;
    while (current.length > this.count) {
      const half = Math.floor(current.length / 2);
      const merged = [];
      for (let i = 0; i < half; ++i)
        merged.push(CodePathSegment.newNext(this.idGenerator.next(), [current[i], current[i + half]]));
      current = merged;
    }
    return current;
  }

  /** A new step. */
  add(segments) {
    if (!(segments.length >= this.count)) throw new Error(`${segments.length} >= ${this.count}`);
    this.segmentsList.push(this.#merge(segments));
  }

  /** The last step, replaced. */
  replaceHead(segments) {
    if (!(segments.length >= this.count)) throw new Error(`${segments.length} >= ${this.count}`);
    this.segmentsList.splice(-1, 1, this.#merge(segments));
  }

  /** The steps of another context of as many paths, added. */
  addAll(other) {
    if (other.count !== this.count) throw new Error('Assertion failed.');
    this.segmentsList.push(...other.segmentsList);
  }

  clear() {
    this.segmentsList = [];
  }

  /** The context of a new code path: one path, its first segment. */
  static newRoot(idGenerator) {
    const context = new ForkContext(idGenerator, null, 1);
    context.add([CodePathSegment.newRoot(idGenerator.next())]);
    return context;
  }

  /** An empty context inside another: as many paths, or twice as many when it forks the leaving path (finally). */
  static newEmpty(parent, forkLeavingPath) {
    return new ForkContext(parent.idGenerator, parent, (forkLeavingPath ? 2 : 1) * parent.count);
  }
}

export { ForkContext };
