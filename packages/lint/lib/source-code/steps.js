// The steps of a traversal of a file, in order, as SourceCode#traverse() gives them: visiting a node (entering it,
// phase 1, or leaving it, phase 2) and calling a method of the visitor (the events of code paths).
//
// A visit is two fields (there are two for each node): its type and kind are those of every visit, and its args
// ([node], as ESLint's) are made when read, which the linter does not (lib/ast/listeners.js).

class VisitStep {
  constructor(target, phase) {
    this.target = target;
    this.phase = phase;
  }

  get args() {
    return [this.target];
  }
}
VisitStep.prototype.type = 'visit';
VisitStep.prototype.kind = 1;

const visitStep = (target, phase) => new VisitStep(target, phase);
const callStep = (target, args) => ({ type: 'call', kind: 2, target, args });

export { visitStep, callStep };
