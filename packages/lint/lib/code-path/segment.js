// A segment of a code path: a run of code without branches. Segments link to those before and after them: all of
// them (allPrevSegments, allNextSegments) and the reachable ones (prevSegments, nextSegments). A segment is linked
// to the ones before it when it is used (the walk reaches it); one made but not used is skipped over: the segments
// after it link to those before it.

const isReachable = (segment) => segment.reachable;

class CodePathSegment {
  constructor(id, allPrevSegments, reachable) {
    this.id = id;
    this.nextSegments = [];
    this.prevSegments = allPrevSegments.filter(isReachable);
    this.allNextSegments = [];
    this.allPrevSegments = allPrevSegments;
    this.reachable = reachable;
    // Not for rules: whether it is used, and the segments before it that a loop links back from.
    Object.defineProperty(this, 'internal', { value: { used: false, loopedPrevSegments: [] } });
  }

  /** Whether a segment before this one links to it by looping back. */
  isLoopedPrevSegment(segment) {
    return this.internal.loopedPrevSegments.includes(segment);
  }

  /** The first segment of a code path. */
  static newRoot(id) {
    return new CodePathSegment(id, [], true);
  }

  /** A segment after others: reachable if one of them is. */
  static newNext(id, allPrevSegments) {
    return new CodePathSegment(
      id,
      CodePathSegment.flattenUnusedSegments(allPrevSegments),
      allPrevSegments.some(isReachable)
    );
  }

  /** A segment no path reaches (after a return...): used at once, linked to those before it. */
  static newUnreachable(id, allPrevSegments) {
    const segment = new CodePathSegment(id, CodePathSegment.flattenUnusedSegments(allPrevSegments), false);
    CodePathSegment.markUsed(segment);
    return segment;
  }

  /** A segment linked to nothing yet (a loop's update, a for-in's left side: linked when the loop is known). */
  static newDisconnected(id, allPrevSegments) {
    return new CodePathSegment(id, [], allPrevSegments.some(isReachable));
  }

  /** A segment the walk reached: the segments before it link to it. */
  static markUsed(segment) {
    if (segment.internal.used) return;
    segment.internal.used = true;
    for (const prev of segment.allPrevSegments) {
      prev.allNextSegments.push(segment);
      if (segment.reachable) prev.nextSegments.push(segment);
    }
  }

  static markPrevSegmentAsLooped(segment, prevSegment) {
    segment.internal.loopedPrevSegments.push(prevSegment);
  }

  /** Segments, those not used replaced by the segments before them (each once). */
  static flattenUnusedSegments(segments) {
    const done = new Set();
    for (const segment of segments) {
      if (done.has(segment)) continue;
      if (segment.internal.used) done.add(segment);
      else for (const prev of segment.allPrevSegments) done.add(prev);
    }
    return [...done];
  }
}

export { CodePathSegment };
