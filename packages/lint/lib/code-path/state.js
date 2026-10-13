// The state of a code path while its tree is walked: where the walk is (forkContext: its head is the current
// segments) and the constructs it is in, each a context in a stack: choices (if, ?:, &&, ||, ??, their assignments,
// the tests of loops), optional chains, switches, tries, loops and what break leaves. The analyzer calls a method of it
// at each place where the paths fork or join; each makes the segments that follow. The order segments are made in is
// ESLint's: their ids depend on it.

import { CodePathSegment } from './segment.js';
import { ForkContext } from './fork-context.js';

// The contexts. A break context: where break goes (a breakable statement, or a label), and the paths that break.
const breakContext = (upper, breakable, label, forkContext) => ({
  upper,
  breakable,
  label,
  brokenForkContext: ForkContext.newEmpty(forkContext),
});

// A choice: the paths when the test is true, false, nullish (for ??). `processed` once a nested choice (a && b as a
// test) has put its paths in these.
const choiceContext = (upper, kind, isForkingAsResult, forkContext) => ({
  upper,
  kind,
  isForkingAsResult,
  trueForkContext: ForkContext.newEmpty(forkContext),
  falseForkContext: ForkContext.newEmpty(forkContext),
  nullishForkContext: ForkContext.newEmpty(forkContext),
  processed: false,
});

// A loop: its type, label, the paths that break out of it, and the segments its parts start and end at.
function loopContext(upper, type, label, breakContextOfLoop, forkContext) {
  const context = { upper, type, label, brokenForkContext: breakContextOfLoop.brokenForkContext };
  switch (type) {
    case 'WhileStatement':
      return Object.assign(context, { test: undefined, continueDestSegments: null });
    case 'DoWhileStatement':
      return Object.assign(context, {
        test: undefined,
        entrySegments: null,
        continueForkContext: ForkContext.newEmpty(forkContext),
      });
    case 'ForStatement':
      return Object.assign(context, {
        test: undefined,
        endOfInitSegments: null,
        testSegments: null,
        endOfTestSegments: null,
        updateSegments: null,
        endOfUpdateSegments: null,
        continueDestSegments: null,
      });
    case 'ForInStatement':
    case 'ForOfStatement':
      return Object.assign(context, {
        prevSegments: null,
        leftSegments: null,
        endOfLeftSegments: null,
        continueDestSegments: null,
      });
    default:
      throw new Error(`unknown type: "${type}"`);
  }
}

// The segments a return or a throw adds to the final ones of the code path (each once in all of them).
function addLeaving(dest, others, all, segments) {
  for (const segment of segments) {
    dest.push(segment);
    if (!others.includes(segment)) all.push(segment);
  }
}

// Where continue goes: the loop of the label, or the innermost.
function continueContextOf(state, label) {
  if (!label) return state.loopContext;
  for (let context = state.loopContext; context; context = context.upper) if (context.label === label) return context;
  return null;
}

// Where break goes: the statement of the label, or the innermost breakable one.
function breakContextOf(state, label) {
  for (let context = state.breakContext; context; context = context.upper) {
    if (label ? context.label === label : context.breakable) return context;
  }
  return null;
}

// Where return goes: a try with a finally not in it yet, or the end of the code path.
function returnContextOf(state) {
  for (let context = state.tryContext; context; context = context.upper) {
    if (context.hasFinalizer && context.position !== 'finally') return context;
  }
  return state;
}

// Where throw goes: a try being in its block (or its catch, with a finally), or the end of the code path.
function throwContextOf(state) {
  for (let context = state.tryContext; context; context = context.upper) {
    if (context.position === 'try' || (context.hasFinalizer && context.position === 'catch')) return context;
  }
  return state;
}

const removeFrom = (elements, value) => elements.splice(elements.indexOf(value), 1);

// The links between segments, removed (each with the one at its index).
function disconnectSegments(prevSegments, nextSegments) {
  for (let i = 0; i < prevSegments.length; ++i) {
    const prev = prevSegments[i];
    const next = nextSegments[i];
    removeFrom(prev.nextSegments, next);
    removeFrom(prev.allNextSegments, next);
    removeFrom(next.prevSegments, prev);
    removeFrom(next.allPrevSegments, prev);
  }
}

// A loop back from segments to others (the end of a loop's body to its test...), told to the analyzer.
function makeLooped(state, fromSegmentsUnflattened, toSegmentsUnflattened) {
  const fromSegments = CodePathSegment.flattenUnusedSegments(fromSegmentsUnflattened);
  const toSegments = CodePathSegment.flattenUnusedSegments(toSegmentsUnflattened);
  const end = Math.min(fromSegments.length, toSegments.length);
  for (let i = 0; i < end; ++i) {
    const from = fromSegments[i];
    const to = toSegments[i];
    if (to.reachable) from.nextSegments.push(to);
    if (from.reachable) to.prevSegments.push(from);
    from.allNextSegments.push(to);
    to.allPrevSegments.push(from);
    if (to.allPrevSegments.length >= 2) CodePathSegment.markPrevSegmentAsLooped(to, from);
    state.notifyLooped(from, to);
  }
}

// The test of a for loop done: what it leaves on false breaks out, the body follows on true.
function finalizeTestSegmentsOfFor(context, choice, head) {
  if (!choice.processed) {
    choice.trueForkContext.add(head);
    choice.falseForkContext.add(head);
    choice.nullishForkContext.add(head);
  }
  if (context.test !== true) context.brokenForkContext.addAll(choice.falseForkContext);
  context.endOfTestSegments = choice.trueForkContext.makeNext(0, -1);
}

class CodePathState {
  constructor(idGenerator, onLooped) {
    this.idGenerator = idGenerator;
    this.notifyLooped = onLooped;
    this.forkContext = ForkContext.newRoot(idGenerator);
    this.choiceContext = null;
    this.switchContext = null;
    this.tryContext = null;
    this.loopContext = null;
    this.breakContext = null;
    this.chainContext = null;
    this.currentSegments = [];
    this.initialSegment = this.forkContext.head[0];
    this.finalSegments = [];
    // The segments that return and that throw (arrays with an `add` that keeps finalSegments).
    this.returnedForkContext = [];
    this.thrownForkContext = [];
    const { finalSegments, returnedForkContext, thrownForkContext } = this;
    returnedForkContext.add = (segments) => addLeaving(returnedForkContext, thrownForkContext, finalSegments, segments);
    thrownForkContext.add = (segments) => addLeaving(thrownForkContext, returnedForkContext, finalSegments, segments);
  }

  get headSegments() {
    return this.forkContext.head;
  }

  get parentForkContext() {
    return this.forkContext && this.forkContext.upper;
  }

  pushForkContext(forkLeavingPath) {
    this.forkContext = ForkContext.newEmpty(this.forkContext, forkLeavingPath);
    return this.forkContext;
  }

  popForkContext() {
    const last = this.forkContext;
    this.forkContext = last.upper;
    this.forkContext.replaceHead(last.makeNext(0, -1));
    return last;
  }

  forkPath() {
    this.forkContext.add(this.parentForkContext.makeNext(-1, -1));
  }

  forkBypassPath() {
    this.forkContext.add(this.parentForkContext.head);
  }

  // Choices.

  pushChoiceContext(kind, isForkingAsResult) {
    this.choiceContext = choiceContext(this.choiceContext, kind, isForkingAsResult, this.forkContext);
  }

  popChoiceContext() {
    const popped = this.choiceContext;
    const { forkContext } = this;
    const head = forkContext.head;
    this.choiceContext = popped.upper;
    switch (popped.kind) {
      case '&&':
      case '||':
      case '??':
        if (!popped.processed) {
          popped.trueForkContext.add(head);
          popped.falseForkContext.add(head);
          popped.nullishForkContext.add(head);
        }
        // A test of another choice: its paths are that choice's.
        if (popped.isForkingAsResult) {
          const parent = this.choiceContext;
          parent.trueForkContext.addAll(popped.trueForkContext);
          parent.falseForkContext.addAll(popped.falseForkContext);
          parent.nullishForkContext.addAll(popped.nullishForkContext);
          parent.processed = true;
          return popped;
        }
        break;
      case 'test':
        if (!popped.processed) {
          popped.trueForkContext.clear();
          popped.trueForkContext.add(head);
        } else {
          popped.falseForkContext.clear();
          popped.falseForkContext.add(head);
        }
        break;
      case 'loop':
        return popped;
      default:
        throw new Error('unreachable');
    }
    const combined = popped.trueForkContext;
    combined.addAll(popped.falseForkContext);
    forkContext.replaceHead(combined.makeNext(0, -1));
    return popped;
  }

  // The right side of &&, || or ??: reached when the left one does not decide.
  makeLogicalRight() {
    const choice = this.choiceContext;
    const { forkContext } = this;
    if (choice.processed) {
      let prev;
      if (choice.kind === '&&') prev = choice.trueForkContext;
      else if (choice.kind === '||') prev = choice.falseForkContext;
      else if (choice.kind === '??') prev = choice.nullishForkContext;
      else throw new Error('unreachable');
      forkContext.replaceHead(prev.makeNext(0, -1));
      prev.clear();
      choice.processed = false;
    } else {
      if (choice.kind === '&&') {
        choice.falseForkContext.add(forkContext.head);
        choice.nullishForkContext.add(forkContext.head);
      } else if (choice.kind === '||') {
        choice.trueForkContext.add(forkContext.head);
      } else if (choice.kind === '??') {
        choice.trueForkContext.add(forkContext.head);
        choice.falseForkContext.add(forkContext.head);
      } else {
        throw new Error('unreachable');
      }
      forkContext.replaceHead(forkContext.makeNext(-1, -1));
    }
  }

  makeIfConsequent() {
    const choice = this.choiceContext;
    const { forkContext } = this;
    if (!choice.processed) {
      choice.trueForkContext.add(forkContext.head);
      choice.falseForkContext.add(forkContext.head);
      choice.nullishForkContext.add(forkContext.head);
    }
    choice.processed = false;
    forkContext.replaceHead(choice.trueForkContext.makeNext(0, -1));
  }

  makeIfAlternate() {
    const choice = this.choiceContext;
    const { forkContext } = this;
    choice.trueForkContext.clear();
    choice.trueForkContext.add(forkContext.head);
    choice.processed = true;
    forkContext.replaceHead(choice.falseForkContext.makeNext(0, -1));
  }

  // Optional chains: each ?. a choice (nullish ends the chain), all closed with the chain.

  pushChainContext() {
    this.chainContext = { upper: this.chainContext, choiceContextCount: 0 };
  }

  popChainContext() {
    const context = this.chainContext;
    this.chainContext = context.upper;
    for (let i = context.choiceContextCount; i > 0; --i) this.popChoiceContext();
  }

  makeOptionalNode() {
    if (this.chainContext) {
      this.chainContext.choiceContextCount += 1;
      this.pushChoiceContext('??', false);
    }
  }

  makeOptionalRight() {
    if (this.chainContext) this.makeLogicalRight();
  }

  // Switches.

  pushSwitchContext(hasCase, label) {
    this.switchContext = {
      upper: this.switchContext,
      hasCase,
      defaultSegments: null,
      defaultBodySegments: null,
      foundEmptyDefault: false,
      lastIsDefault: false,
      forkCount: 0,
    };
    this.pushBreakContext(true, label);
  }

  popSwitchContext() {
    const context = this.switchContext;
    this.switchContext = context.upper;
    const { forkContext } = this;
    const brokenForkContext = this.popBreakContext().brokenForkContext;
    if (context.forkCount === 0) {
      // No case bodies: only what breaks joins after the switch.
      if (!brokenForkContext.empty) {
        brokenForkContext.add(forkContext.makeNext(-1, -1));
        forkContext.replaceHead(brokenForkContext.makeNext(0, -1));
      }
      return;
    }
    const lastSegments = forkContext.head;
    this.forkBypassPath();
    const lastCaseSegments = forkContext.head;
    brokenForkContext.add(lastSegments);
    // A default not last: when no case matches, its body (and those after it) run.
    if (!context.lastIsDefault) {
      if (context.defaultBodySegments) {
        disconnectSegments(context.defaultSegments, context.defaultBodySegments);
        makeLooped(this, lastCaseSegments, context.defaultBodySegments);
      } else {
        brokenForkContext.add(lastCaseSegments);
      }
    }
    for (let i = 0; i < context.forkCount; ++i) this.forkContext = this.forkContext.upper;
    this.forkContext.replaceHead(brokenForkContext.makeNext(0, -1));
  }

  makeSwitchCaseBody(isCaseBodyEmpty, isDefaultCase) {
    const context = this.switchContext;
    if (!context.hasCase) return;
    const parentForkContext = this.forkContext;
    const forkContext = this.pushForkContext();
    forkContext.add(parentForkContext.makeNext(0, -1));
    if (isDefaultCase) {
      context.defaultSegments = parentForkContext.head;
      if (isCaseBodyEmpty) context.foundEmptyDefault = true;
      else context.defaultBodySegments = forkContext.head;
    } else if (!isCaseBodyEmpty && context.foundEmptyDefault) {
      context.foundEmptyDefault = false;
      context.defaultBodySegments = forkContext.head;
    }
    context.lastIsDefault = isDefaultCase;
    context.forkCount += 1;
  }

  // Try statements.

  pushTryContext(hasFinalizer) {
    this.tryContext = {
      upper: this.tryContext,
      hasFinalizer,
      position: 'try',
      returnedForkContext: hasFinalizer ? ForkContext.newEmpty(this.forkContext) : null,
      thrownForkContext: ForkContext.newEmpty(this.forkContext),
      lastOfTryIsReachable: false,
      lastOfCatchIsReachable: false,
    };
  }

  popTryContext() {
    const context = this.tryContext;
    this.tryContext = context.upper;
    if (context.position === 'catch') {
      this.popForkContext();
      return;
    }
    const returned = context.returnedForkContext;
    const thrown = context.thrownForkContext;
    if (returned.empty && thrown.empty) return;
    // After a finally: its normal paths go on, its leaving paths return or throw further.
    const headSegments = this.forkContext.head;
    this.forkContext = this.forkContext.upper;
    const half = (headSegments.length / 2) | 0;
    const normalSegments = headSegments.slice(0, half);
    const leavingSegments = headSegments.slice(half);
    if (!returned.empty) returnContextOf(this).returnedForkContext.add(leavingSegments);
    if (!thrown.empty) throwContextOf(this).thrownForkContext.add(leavingSegments);
    this.forkContext.replaceHead(normalSegments);
    // ESLint makes these and drops them (they take ids).
    if (!context.lastOfTryIsReachable && !context.lastOfCatchIsReachable) this.forkContext.makeUnreachable();
  }

  makeCatchBlock() {
    const context = this.tryContext;
    const { forkContext } = this;
    const thrown = context.thrownForkContext;
    context.position = 'catch';
    context.thrownForkContext = ForkContext.newEmpty(forkContext);
    context.lastOfTryIsReachable = forkContext.reachable;
    thrown.add(forkContext.head);
    const thrownSegments = thrown.makeNext(0, -1);
    this.pushForkContext();
    this.forkBypassPath();
    this.forkContext.add(thrownSegments);
  }

  makeFinallyBlock() {
    const context = this.tryContext;
    let { forkContext } = this;
    const returned = context.returnedForkContext;
    const thrown = context.thrownForkContext;
    const headOfLeavingSegments = forkContext.head;
    if (context.position === 'catch') {
      this.popForkContext();
      forkContext = this.forkContext;
      context.lastOfCatchIsReachable = forkContext.reachable;
    } else {
      context.lastOfTryIsReachable = forkContext.reachable;
    }
    context.position = 'finally';
    if (returned.empty && thrown.empty) return;
    // The finally runs twice over: on the normal paths, and on those that leave (by return or throw).
    const segments = forkContext.makeNext(-1, -1);
    for (let i = 0; i < forkContext.count; ++i) {
      const prev = [headOfLeavingSegments[i]];
      for (const step of returned.segmentsList) prev.push(step[i]);
      for (const step of thrown.segmentsList) prev.push(step[i]);
      segments.push(CodePathSegment.newNext(this.idGenerator.next(), prev));
    }
    this.pushForkContext(true);
    this.forkContext.add(segments);
  }

  // The first thing that may throw in a try block: a path to its catch from there.
  makeFirstThrowablePathInTryBlock() {
    const { forkContext } = this;
    if (!forkContext.reachable) return;
    const context = throwContextOf(this);
    if (context === this || context.position !== 'try' || !context.thrownForkContext.empty) return;
    context.thrownForkContext.add(forkContext.head);
    forkContext.replaceHead(forkContext.makeNext(-1, -1));
  }

  // Loops.

  pushLoopContext(type, label) {
    const { forkContext } = this;
    const breakContextOfLoop = this.pushBreakContext(true, label);
    if (type === 'WhileStatement' || type === 'DoWhileStatement' || type === 'ForStatement') {
      this.pushChoiceContext('loop', false);
    }
    this.loopContext = loopContext(this.loopContext, type, label, breakContextOfLoop, forkContext);
  }

  popLoopContext() {
    const context = this.loopContext;
    this.loopContext = context.upper;
    const { forkContext } = this;
    const brokenForkContext = this.popBreakContext().brokenForkContext;
    switch (context.type) {
      case 'WhileStatement':
      case 'ForStatement':
        this.popChoiceContext();
        makeLooped(this, forkContext.head, context.continueDestSegments);
        break;
      case 'DoWhileStatement': {
        const choice = this.popChoiceContext();
        if (!choice.processed) {
          choice.trueForkContext.add(forkContext.head);
          choice.falseForkContext.add(forkContext.head);
        }
        if (context.test !== true) brokenForkContext.addAll(choice.falseForkContext);
        for (const segments of choice.trueForkContext.segmentsList) makeLooped(this, segments, context.entrySegments);
        break;
      }
      case 'ForInStatement':
      case 'ForOfStatement':
        brokenForkContext.add(forkContext.head);
        makeLooped(this, forkContext.head, context.leftSegments);
        break;
      default:
        throw new Error('unreachable');
    }
    // After the loop: what breaks out of it, or nothing.
    if (brokenForkContext.empty) forkContext.replaceHead(forkContext.makeUnreachable(-1, -1));
    else forkContext.replaceHead(brokenForkContext.makeNext(0, -1));
  }

  makeWhileTest(test) {
    const context = this.loopContext;
    const testSegments = this.forkContext.makeNext(0, -1);
    context.test = test;
    context.continueDestSegments = testSegments;
    this.forkContext.replaceHead(testSegments);
  }

  makeWhileBody() {
    const context = this.loopContext;
    const choice = this.choiceContext;
    const { forkContext } = this;
    if (!choice.processed) {
      choice.trueForkContext.add(forkContext.head);
      choice.falseForkContext.add(forkContext.head);
    }
    if (context.test !== true) context.brokenForkContext.addAll(choice.falseForkContext);
    forkContext.replaceHead(choice.trueForkContext.makeNext(0, -1));
  }

  makeDoWhileBody() {
    const bodySegments = this.forkContext.makeNext(-1, -1);
    this.loopContext.entrySegments = bodySegments;
    this.forkContext.replaceHead(bodySegments);
  }

  makeDoWhileTest(test) {
    const context = this.loopContext;
    const { forkContext } = this;
    context.test = test;
    // The test after continue too.
    if (!context.continueForkContext.empty) {
      context.continueForkContext.add(forkContext.head);
      forkContext.replaceHead(context.continueForkContext.makeNext(0, -1));
    }
  }

  makeForTest(test) {
    const context = this.loopContext;
    const { forkContext } = this;
    const endOfInitSegments = forkContext.head;
    const testSegments = forkContext.makeNext(-1, -1);
    context.test = test;
    context.endOfInitSegments = endOfInitSegments;
    context.continueDestSegments = context.testSegments = testSegments;
    forkContext.replaceHead(testSegments);
  }

  makeForUpdate() {
    const context = this.loopContext;
    const { forkContext } = this;
    if (context.testSegments) finalizeTestSegmentsOfFor(context, this.choiceContext, forkContext.head);
    else context.endOfInitSegments = forkContext.head;
    const updateSegments = forkContext.makeDisconnected(-1, -1);
    context.continueDestSegments = context.updateSegments = updateSegments;
    forkContext.replaceHead(updateSegments);
  }

  makeForBody() {
    const context = this.loopContext;
    const { forkContext } = this;
    if (context.updateSegments) {
      context.endOfUpdateSegments = forkContext.head;
      if (context.testSegments) makeLooped(this, context.endOfUpdateSegments, context.testSegments);
    } else if (context.testSegments) {
      finalizeTestSegmentsOfFor(context, this.choiceContext, forkContext.head);
    } else {
      context.endOfInitSegments = forkContext.head;
    }
    let bodySegments = context.endOfTestSegments;
    // No test: the body follows the init (and the update).
    if (!bodySegments) {
      const prev = ForkContext.newEmpty(forkContext);
      prev.add(context.endOfInitSegments);
      if (context.endOfUpdateSegments) prev.add(context.endOfUpdateSegments);
      bodySegments = prev.makeNext(0, -1);
    }
    context.continueDestSegments = context.continueDestSegments || bodySegments;
    forkContext.replaceHead(bodySegments);
  }

  makeForInOfLeft() {
    const context = this.loopContext;
    const { forkContext } = this;
    const leftSegments = forkContext.makeDisconnected(-1, -1);
    context.prevSegments = forkContext.head;
    context.leftSegments = context.continueDestSegments = leftSegments;
    forkContext.replaceHead(leftSegments);
  }

  makeForInOfRight() {
    const context = this.loopContext;
    const { forkContext } = this;
    const temp = ForkContext.newEmpty(forkContext);
    temp.add(context.prevSegments);
    const rightSegments = temp.makeNext(-1, -1);
    context.endOfLeftSegments = forkContext.head;
    forkContext.replaceHead(rightSegments);
  }

  makeForInOfBody() {
    const context = this.loopContext;
    const { forkContext } = this;
    const temp = ForkContext.newEmpty(forkContext);
    temp.add(context.endOfLeftSegments);
    const bodySegments = temp.makeNext(-1, -1);
    makeLooped(this, forkContext.head, context.leftSegments);
    context.brokenForkContext.add(forkContext.head);
    forkContext.replaceHead(bodySegments);
  }

  // Breaks, continues, returns, throws.

  pushBreakContext(breakable, label) {
    this.breakContext = breakContext(this.breakContext, breakable, label, this.forkContext);
    return this.breakContext;
  }

  popBreakContext() {
    const context = this.breakContext;
    const { forkContext } = this;
    this.breakContext = context.upper;
    // A labeled statement that is not a loop or switch: its breaks join after it.
    if (!context.breakable) {
      const broken = context.brokenForkContext;
      if (!broken.empty) {
        broken.add(forkContext.head);
        forkContext.replaceHead(broken.makeNext(0, -1));
      }
    }
    return context;
  }

  makeBreak(label) {
    const { forkContext } = this;
    if (!forkContext.reachable) return;
    const context = breakContextOf(this, label);
    if (context) context.brokenForkContext.add(forkContext.head);
    forkContext.replaceHead(forkContext.makeUnreachable(-1, -1));
  }

  makeContinue(label) {
    const { forkContext } = this;
    if (!forkContext.reachable) return;
    const context = continueContextOf(this, label);
    if (context) {
      if (context.continueDestSegments) {
        makeLooped(this, forkContext.head, context.continueDestSegments);
        if (context.type === 'ForInStatement' || context.type === 'ForOfStatement') {
          context.brokenForkContext.add(forkContext.head);
        }
      } else {
        context.continueForkContext.add(forkContext.head);
      }
    }
    forkContext.replaceHead(forkContext.makeUnreachable(-1, -1));
  }

  makeReturn() {
    const { forkContext } = this;
    if (forkContext.reachable) {
      returnContextOf(this).returnedForkContext.add(forkContext.head);
      forkContext.replaceHead(forkContext.makeUnreachable(-1, -1));
    }
  }

  makeThrow() {
    const { forkContext } = this;
    if (forkContext.reachable) {
      throwContextOf(this).thrownForkContext.add(forkContext.head);
      forkContext.replaceHead(forkContext.makeUnreachable(-1, -1));
    }
  }

  /** The end of the code path: its last segments return (if reachable). */
  makeFinal() {
    const segments = this.currentSegments;
    if (segments.length > 0 && segments[0].reachable) this.returnedForkContext.add(segments);
  }
}

export { CodePathState };
