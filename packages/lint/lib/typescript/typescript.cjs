/*! *****************************************************************************
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0

THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
MERCHANTABILITY OR NON-INFRINGEMENT.

See the Apache Version 2.0 License for specific language governing permissions
and limitations under the License.
***************************************************************************** */
// @xufa/lint: TypeScript 6.0.3's parser for the formatter, what lib/prettier/parse uses of typescript.js and
// what that needs (scripts/build-typescript.mjs): do not edit.
"use strict";
var versionMajorMinor = "6.0";
var version = "6.0.3";
var emptyArray = [];
var emptyMap = /* @__PURE__ */ new Map();
function length(array) {
  return array !== void 0 ? array.length : 0;
}
function forEach(array, callback) {
  if (array !== void 0) {
    for (let i = 0; i < array.length; i++) {
      const result = callback(array[i], i);
      if (result) {
        return result;
      }
    }
  }
  return void 0;
}
function zipWith(arrayA, arrayB, callback) {
  const result = [];
  Debug.assertEqual(arrayA.length, arrayB.length);
  for (let i = 0; i < arrayA.length; i++) {
    result.push(callback(arrayA[i], arrayB[i], i));
  }
  return result;
}
function every(array, callback) {
  if (array !== void 0) {
    for (let i = 0; i < array.length; i++) {
      if (!callback(array[i], i)) {
        return false;
      }
    }
  }
  return true;
}
function find(array, predicate, startIndex) {
  if (array === void 0) return void 0;
  for (let i = startIndex ?? 0; i < array.length; i++) {
    const value = array[i];
    if (predicate(value, i)) {
      return value;
    }
  }
  return void 0;
}
function findIndex(array, predicate, startIndex) {
  if (array === void 0) return -1;
  for (let i = startIndex ?? 0; i < array.length; i++) {
    if (predicate(array[i], i)) {
      return i;
    }
  }
  return -1;
}
function contains(array, value, equalityComparer = equateValues) {
  if (array !== void 0) {
    for (let i = 0; i < array.length; i++) {
      if (equalityComparer(array[i], value)) {
        return true;
      }
    }
  }
  return false;
}
function filter(array, f) {
  if (array !== void 0) {
    const len = array.length;
    let i = 0;
    while (i < len && f(array[i])) i++;
    if (i < len) {
      const result = array.slice(0, i);
      i++;
      while (i < len) {
        const item = array[i];
        if (f(item)) {
          result.push(item);
        }
        i++;
      }
      return result;
    }
  }
  return array;
}
function map(array, f) {
  let result;
  if (array !== void 0) {
    result = [];
    for (let i = 0; i < array.length; i++) {
      result.push(f(array[i], i));
    }
  }
  return result;
}
function sameMap(array, f) {
  if (array !== void 0) {
    for (let i = 0; i < array.length; i++) {
      const item = array[i];
      const mapped = f(item, i);
      if (item !== mapped) {
        const result = array.slice(0, i);
        result.push(mapped);
        for (i++; i < array.length; i++) {
          result.push(f(array[i], i));
        }
        return result;
      }
    }
  }
  return array;
}
function flatMap(array, mapfn) {
  let result;
  if (array !== void 0) {
    for (let i = 0; i < array.length; i++) {
      const v = mapfn(array[i], i);
      if (v) {
        if (isArray(v)) {
          result = addRange(result, v);
        } else {
          result = append(result, v);
        }
      }
    }
  }
  return result ?? emptyArray;
}
function sameFlatMap(array, mapfn) {
  let result;
  if (array !== void 0) {
    for (let i = 0; i < array.length; i++) {
      const item = array[i];
      const mapped = mapfn(item, i);
      if (result || item !== mapped || isArray(mapped)) {
        if (!result) {
          result = array.slice(0, i);
        }
        if (isArray(mapped)) {
          addRange(result, mapped);
        } else {
          result.push(mapped);
        }
      }
    }
  }
  return result ?? array;
}
function mapDefined(array, mapFn) {
  const result = [];
  if (array !== void 0) {
    for (let i = 0; i < array.length; i++) {
      const mapped = mapFn(array[i], i);
      if (mapped !== void 0) {
        result.push(mapped);
      }
    }
  }
  return result;
}
function some(array, predicate) {
  if (array !== void 0) {
    if (predicate !== void 0) {
      for (let i = 0; i < array.length; i++) {
        if (predicate(array[i])) {
          return true;
        }
      }
    } else {
      return array.length > 0;
    }
  }
  return false;
}
function concatenate(array1, array2) {
  if (array2 === void 0 || array2.length === 0) return array1;
  if (array1 === void 0 || array1.length === 0) return array2;
  return [...array1, ...array2];
}
function arrayIsEqualTo(array1, array2, equalityComparer = equateValues) {
  if (array1 === void 0 || array2 === void 0) {
    return array1 === array2;
  }
  if (array1.length !== array2.length) {
    return false;
  }
  for (let i = 0; i < array1.length; i++) {
    if (!equalityComparer(array1[i], array2[i], i)) {
      return false;
    }
  }
  return true;
}
function append(to, value) {
  if (value === void 0) return to;
  if (to === void 0) return [value];
  to.push(value);
  return to;
}
function toOffset(array, offset) {
  return offset < 0 ? array.length + offset : offset;
}
function addRange(to, from, start, end) {
  if (from === void 0 || from.length === 0) return to;
  if (to === void 0) return from.slice(start, end);
  start = start === void 0 ? 0 : toOffset(from, start);
  end = end === void 0 ? from.length : toOffset(from, end);
  for (let i = start; i < end && i < from.length; i++) {
    if (from[i] !== void 0) {
      to.push(from[i]);
    }
  }
  return to;
}
function pushIfUnique(array, toAdd, equalityComparer) {
  if (contains(array, toAdd, equalityComparer)) {
    return false;
  } else {
    array.push(toAdd);
    return true;
  }
}
function appendIfUnique(array, toAdd, equalityComparer) {
  if (array !== void 0) {
    pushIfUnique(array, toAdd, equalityComparer);
    return array;
  } else {
    return [toAdd];
  }
}
function toSorted(array, comparer) {
  return array.length === 0 ? emptyArray : array.slice().sort(comparer);
}
function firstOrUndefined(array) {
  return array === void 0 || array.length === 0 ? void 0 : array[0];
}
function lastOrUndefined(array) {
  return array === void 0 || array.length === 0 ? void 0 : array[array.length - 1];
}
function last(array) {
  Debug.assert(array.length !== 0);
  return array[array.length - 1];
}
function singleOrUndefined(array) {
  return array !== void 0 && array.length === 1 ? array[0] : void 0;
}
function binarySearch(array, value, keySelector, keyComparer, offset) {
  return binarySearchKey(array, keySelector(value), keySelector, keyComparer, offset);
}
function binarySearchKey(array, key, keySelector, keyComparer, offset) {
  if (!some(array)) {
    return -1;
  }
  let low = offset ?? 0;
  let high = array.length - 1;
  while (low <= high) {
    const middle = low + (high - low >> 1);
    const midKey = keySelector(array[middle], middle);
    switch (Math.sign(keyComparer(midKey, key))) {
      case -1 /* LessThan */:
        low = middle + 1;
        break;
      case 0 /* EqualTo */:
        return middle;
      case 1 /* GreaterThan */:
        high = middle - 1;
        break;
    }
  }
  return ~low;
}
function reduceLeft(array, f, initial, start, count) {
  if (array && array.length > 0) {
    const size = array.length;
    if (size > 0) {
      let pos = start === void 0 || start < 0 ? 0 : start;
      const end = count === void 0 || pos + count > size - 1 ? size - 1 : pos + count;
      let result;
      if (arguments.length <= 2) {
        result = array[pos];
        pos++;
      } else {
        result = initial;
      }
      while (pos <= end) {
        result = f(result, array[pos], pos);
        pos++;
      }
      return result;
    }
  }
  return initial;
}
var hasOwnProperty = Object.prototype.hasOwnProperty;
function hasProperty(map2, key) {
  return hasOwnProperty.call(map2, key);
}
function getOwnKeys(map2) {
  const keys = [];
  for (const key in map2) {
    if (hasOwnProperty.call(map2, key)) {
      keys.push(key);
    }
  }
  return keys;
}
function createMultiMap() {
  const map2 = /* @__PURE__ */ new Map();
  map2.add = multiMapAdd;
  map2.remove = multiMapRemove;
  return map2;
}
function multiMapAdd(key, value) {
  let values = this.get(key);
  if (values !== void 0) {
    values.push(value);
  } else {
    this.set(key, values = [value]);
  }
  return values;
}
function multiMapRemove(key, value) {
  const values = this.get(key);
  if (values !== void 0) {
    unorderedRemoveItem(values, value);
    if (!values.length) {
      this.delete(key);
    }
  }
}
function isArray(value) {
  return Array.isArray(value);
}
function toArray(value) {
  return isArray(value) ? value : [value];
}
function isString(text) {
  return typeof text === "string";
}
function tryCast(value, test) {
  return value !== void 0 && test(value) ? value : void 0;
}
function cast(value, test) {
  if (value !== void 0 && test(value)) return value;
  return Debug.fail(`Invalid cast. The supplied value ${value} did not pass the test '${Debug.getFunctionName(test)}'.`);
}
function noop(_) {
}
function returnTrue() {
  return true;
}
function identity(x) {
  return x;
}
function notImplemented() {
  throw new Error("Not implemented");
}
function memoize(callback) {
  let value;
  return () => {
    if (callback) {
      value = callback();
      callback = void 0;
    }
    return value;
  };
}
function memoizeOne(callback) {
  const map2 = /* @__PURE__ */ new Map();
  return (arg) => {
    const key = `${typeof arg}:${arg}`;
    let value = map2.get(key);
    if (value === void 0 && !map2.has(key)) {
      value = callback(arg);
      map2.set(key, value);
    }
    return value;
  };
}
function equateValues(a, b) {
  return a === b;
}
function equateStringsCaseInsensitive(a, b) {
  return a === b || a !== void 0 && b !== void 0 && a.toUpperCase() === b.toUpperCase();
}
function equateStringsCaseSensitive(a, b) {
  return equateValues(a, b);
}
function compareComparableValues(a, b) {
  return a === b ? 0 /* EqualTo */ : a === void 0 ? -1 /* LessThan */ : b === void 0 ? 1 /* GreaterThan */ : a < b ? -1 /* LessThan */ : 1 /* GreaterThan */;
}
function compareValues(a, b) {
  return compareComparableValues(a, b);
}
function maxBy(arr, init, mapper) {
  for (let i = 0; i < arr.length; i++) {
    init = Math.max(init, mapper(arr[i]));
  }
  return init;
}
function getSpellingSuggestion(name, candidates, getName) {
  const maximumLengthDifference = Math.max(2, Math.floor(name.length * 0.34));
  let bestDistance = Math.floor(name.length * 0.4) + 1;
  let bestCandidate;
  for (const candidate of candidates) {
    const candidateName = getName(candidate);
    if (candidateName !== void 0 && Math.abs(candidateName.length - name.length) <= maximumLengthDifference) {
      if (candidateName === name) {
        continue;
      }
      if (candidateName.length < 3 && candidateName.toLowerCase() !== name.toLowerCase()) {
        continue;
      }
      const distance = levenshteinWithMax(name, candidateName, bestDistance - 0.1);
      if (distance === void 0) {
        continue;
      }
      Debug.assert(distance < bestDistance);
      bestDistance = distance;
      bestCandidate = candidate;
    }
  }
  return bestCandidate;
}
function levenshteinWithMax(s1, s2, max) {
  let previous = new Array(s2.length + 1);
  let current = new Array(s2.length + 1);
  const big = max + 0.01;
  for (let i = 0; i <= s2.length; i++) {
    previous[i] = i;
  }
  for (let i = 1; i <= s1.length; i++) {
    const c1 = s1.charCodeAt(i - 1);
    const minJ = Math.ceil(i > max ? i - max : 1);
    const maxJ = Math.floor(s2.length > max + i ? max + i : s2.length);
    current[0] = i;
    let colMin = i;
    for (let j = 1; j < minJ; j++) {
      current[j] = big;
    }
    for (let j = minJ; j <= maxJ; j++) {
      const substitutionDistance = s1[i - 1].toLowerCase() === s2[j - 1].toLowerCase() ? previous[j - 1] + 0.1 : previous[j - 1] + 2;
      const dist = c1 === s2.charCodeAt(j - 1) ? previous[j - 1] : Math.min(
        /*delete*/
        previous[j] + 1,
        /*insert*/
        current[j - 1] + 1,
        /*substitute*/
        substitutionDistance
      );
      current[j] = dist;
      colMin = Math.min(colMin, dist);
    }
    for (let j = maxJ + 1; j <= s2.length; j++) {
      current[j] = big;
    }
    if (colMin > max) {
      return void 0;
    }
    const temp = previous;
    previous = current;
    current = temp;
  }
  const res = previous[s2.length];
  return res > max ? void 0 : res;
}
function endsWith(str, suffix, ignoreCase) {
  const expectedPos = str.length - suffix.length;
  return expectedPos >= 0 && (ignoreCase ? equateStringsCaseInsensitive(str.slice(expectedPos), suffix) : str.indexOf(suffix, expectedPos) === expectedPos);
}
function unorderedRemoveItemAt(array, index) {
  array[index] = array[array.length - 1];
  array.pop();
}
function unorderedRemoveItem(array, item) {
  return unorderedRemoveFirstItemWhere(array, (element) => element === item);
}
function unorderedRemoveFirstItemWhere(array, predicate) {
  for (let i = 0; i < array.length; i++) {
    if (predicate(array[i])) {
      unorderedRemoveItemAt(array, i);
      return true;
    }
  }
  return false;
}
function startsWith(str, prefix, ignoreCase) {
  return ignoreCase ? equateStringsCaseInsensitive(str.slice(0, prefix.length), prefix) : str.lastIndexOf(prefix, 0) === 0;
}
function isNodeLikeSystem() {
  return typeof process !== "undefined" && !!process.nextTick && !process.browser && typeof require !== "undefined";
}
var Debug;
((Debug2) => {
  let currentAssertionLevel = 0 /* None */;
  Debug2.currentLogLevel = 2 /* Warning */;
  Debug2.isDebugging = false;
  function shouldLog(level) {
    return Debug2.currentLogLevel <= level;
  }
  Debug2.shouldLog = shouldLog;
  function logMessage(level, s) {
    if (Debug2.loggingHost && shouldLog(level)) {
      Debug2.loggingHost.log(level, s);
    }
  }
  function log(s) {
    logMessage(3 /* Info */, s);
  }
  Debug2.log = log;
  ((_log) => {
    function error2(s) {
      logMessage(1 /* Error */, s);
    }
    _log.error = error2;
    function warn(s) {
      logMessage(2 /* Warning */, s);
    }
    _log.warn = warn;
    function log2(s) {
      logMessage(3 /* Info */, s);
    }
    _log.log = log2;
    function trace2(s) {
      logMessage(4 /* Verbose */, s);
    }
    _log.trace = trace2;
  })(log = Debug2.log || (Debug2.log = {}));
  const assertionCache = {};
  function getAssertionLevel() {
    return currentAssertionLevel;
  }
  Debug2.getAssertionLevel = getAssertionLevel;
  function setAssertionLevel(level) {
    const prevAssertionLevel = currentAssertionLevel;
    currentAssertionLevel = level;
    if (level > prevAssertionLevel) {
      for (const key of getOwnKeys(assertionCache)) {
        const cachedFunc = assertionCache[key];
        if (cachedFunc !== void 0 && Debug2[key] !== cachedFunc.assertion && level >= cachedFunc.level) {
          Debug2[key] = cachedFunc;
          assertionCache[key] = void 0;
        }
      }
    }
  }
  Debug2.setAssertionLevel = setAssertionLevel;
  function shouldAssert(level) {
    return currentAssertionLevel >= level;
  }
  Debug2.shouldAssert = shouldAssert;
  function shouldAssertFunction(level, name) {
    if (!shouldAssert(level)) {
      assertionCache[name] = { level, assertion: Debug2[name] };
      Debug2[name] = noop;
      return false;
    }
    return true;
  }
  function fail(message, stackCrawlMark) {
    debugger;
    const e = new Error(message ? `Debug Failure. ${message}` : "Debug Failure.");
    if (Error.captureStackTrace) {
      Error.captureStackTrace(e, stackCrawlMark || fail);
    }
    throw e;
  }
  Debug2.fail = fail;
  function failBadSyntaxKind(node, message, stackCrawlMark) {
    return fail(
      `${message || "Unexpected node."}\r
Node ${formatSyntaxKind(node.kind)} was unexpected.`,
      stackCrawlMark || failBadSyntaxKind
    );
  }
  Debug2.failBadSyntaxKind = failBadSyntaxKind;
  function assert(expression, message, verboseDebugInfo, stackCrawlMark) {
    if (!expression) {
      message = message ? `False expression: ${message}` : "False expression.";
      if (verboseDebugInfo) {
        message += "\r\nVerbose Debug Information: " + (typeof verboseDebugInfo === "string" ? verboseDebugInfo : verboseDebugInfo());
      }
      fail(message, stackCrawlMark || assert);
    }
  }
  Debug2.assert = assert;
  function assertEqual(a, b, msg, msg2, stackCrawlMark) {
    if (a !== b) {
      const message = msg ? msg2 ? `${msg} ${msg2}` : msg : "";
      fail(`Expected ${a} === ${b}. ${message}`, stackCrawlMark || assertEqual);
    }
  }
  Debug2.assertEqual = assertEqual;
  function assertLessThan(a, b, msg, stackCrawlMark) {
    if (a >= b) {
      fail(`Expected ${a} < ${b}. ${msg || ""}`, stackCrawlMark || assertLessThan);
    }
  }
  Debug2.assertLessThan = assertLessThan;
  function assertLessThanOrEqual(a, b, stackCrawlMark) {
    if (a > b) {
      fail(`Expected ${a} <= ${b}`, stackCrawlMark || assertLessThanOrEqual);
    }
  }
  Debug2.assertLessThanOrEqual = assertLessThanOrEqual;
  function assertGreaterThanOrEqual(a, b, stackCrawlMark) {
    if (a < b) {
      fail(`Expected ${a} >= ${b}`, stackCrawlMark || assertGreaterThanOrEqual);
    }
  }
  Debug2.assertGreaterThanOrEqual = assertGreaterThanOrEqual;
  function assertIsDefined(value, message, stackCrawlMark) {
    if (value === void 0 || value === null) {
      fail(message, stackCrawlMark || assertIsDefined);
    }
  }
  Debug2.assertIsDefined = assertIsDefined;
  function checkDefined(value, message, stackCrawlMark) {
    assertIsDefined(value, message, stackCrawlMark || checkDefined);
    return value;
  }
  Debug2.checkDefined = checkDefined;
  function assertEachIsDefined(value, message, stackCrawlMark) {
    for (const v of value) {
      assertIsDefined(v, message, stackCrawlMark || assertEachIsDefined);
    }
  }
  Debug2.assertEachIsDefined = assertEachIsDefined;
  function checkEachDefined(value, message, stackCrawlMark) {
    assertEachIsDefined(value, message, stackCrawlMark || checkEachDefined);
    return value;
  }
  Debug2.checkEachDefined = checkEachDefined;
  function assertNever(member, message = "Illegal value:", stackCrawlMark) {
    const detail = typeof member === "object" && hasProperty(member, "kind") && hasProperty(member, "pos") ? "SyntaxKind: " + formatSyntaxKind(member.kind) : JSON.stringify(member);
    return fail(`${message} ${detail}`, stackCrawlMark || assertNever);
  }
  Debug2.assertNever = assertNever;
  function assertEachNode(nodes, test, message, stackCrawlMark) {
    if (shouldAssertFunction(1 /* Normal */, "assertEachNode")) {
      assert(
        test === void 0 || every(nodes, test),
        message || "Unexpected node.",
        () => `Node array did not pass test '${getFunctionName(test)}'.`,
        stackCrawlMark || assertEachNode
      );
    }
  }
  Debug2.assertEachNode = assertEachNode;
  function assertNode(node, test, message, stackCrawlMark) {
    if (shouldAssertFunction(1 /* Normal */, "assertNode")) {
      assert(
        node !== void 0 && (test === void 0 || test(node)),
        message || "Unexpected node.",
        () => `Node ${formatSyntaxKind(node == null ? void 0 : node.kind)} did not pass test '${getFunctionName(test)}'.`,
        stackCrawlMark || assertNode
      );
    }
  }
  Debug2.assertNode = assertNode;
  function assertNotNode(node, test, message, stackCrawlMark) {
    if (shouldAssertFunction(1 /* Normal */, "assertNotNode")) {
      assert(
        node === void 0 || test === void 0 || !test(node),
        message || "Unexpected node.",
        () => `Node ${formatSyntaxKind(node.kind)} should not have passed test '${getFunctionName(test)}'.`,
        stackCrawlMark || assertNotNode
      );
    }
  }
  Debug2.assertNotNode = assertNotNode;
  function assertOptionalNode(node, test, message, stackCrawlMark) {
    if (shouldAssertFunction(1 /* Normal */, "assertOptionalNode")) {
      assert(
        test === void 0 || node === void 0 || test(node),
        message || "Unexpected node.",
        () => `Node ${formatSyntaxKind(node == null ? void 0 : node.kind)} did not pass test '${getFunctionName(test)}'.`,
        stackCrawlMark || assertOptionalNode
      );
    }
  }
  Debug2.assertOptionalNode = assertOptionalNode;
  function assertOptionalToken(node, kind, message, stackCrawlMark) {
    if (shouldAssertFunction(1 /* Normal */, "assertOptionalToken")) {
      assert(
        kind === void 0 || node === void 0 || node.kind === kind,
        message || "Unexpected node.",
        () => `Node ${formatSyntaxKind(node == null ? void 0 : node.kind)} was not a '${formatSyntaxKind(kind)}' token.`,
        stackCrawlMark || assertOptionalToken
      );
    }
  }
  Debug2.assertOptionalToken = assertOptionalToken;
  function assertMissingNode(node, message, stackCrawlMark) {
    if (shouldAssertFunction(1 /* Normal */, "assertMissingNode")) {
      assert(
        node === void 0,
        message || "Unexpected node.",
        () => `Node ${formatSyntaxKind(node.kind)} was unexpected'.`,
        stackCrawlMark || assertMissingNode
      );
    }
  }
  Debug2.assertMissingNode = assertMissingNode;
  function type(_value) {
  }
  Debug2.type = type;
  function getFunctionName(func) {
    if (typeof func !== "function") {
      return "";
    } else if (hasProperty(func, "name")) {
      return func.name;
    } else {
      const text = Function.prototype.toString.call(func);
      const match = /^function\s+([\w$]+)\s*\(/.exec(text);
      return match ? match[1] : "";
    }
  }
  Debug2.getFunctionName = getFunctionName;
  function formatSymbol(symbol) {
    return `{ name: ${unescapeLeadingUnderscores(symbol.escapedName)}; flags: ${formatSymbolFlags(symbol.flags)}; declarations: ${map(symbol.declarations, (node) => formatSyntaxKind(node.kind))} }`;
  }
  Debug2.formatSymbol = formatSymbol;
  function formatEnum(value = 0, enumObject, isFlags) {
    const members = getEnumMembers(enumObject);
    if (value === 0) {
      return members.length > 0 && members[0][0] === 0 ? members[0][1] : "0";
    }
    if (isFlags) {
      const result = [];
      let remainingFlags = value;
      for (const [enumValue, enumName] of members) {
        if (enumValue > value) {
          break;
        }
        if (enumValue !== 0 && enumValue & value) {
          result.push(enumName);
          remainingFlags &= ~enumValue;
        }
      }
      if (remainingFlags === 0) {
        return result.join("|");
      }
    } else {
      for (const [enumValue, enumName] of members) {
        if (enumValue === value) {
          return enumName;
        }
      }
    }
    return value.toString();
  }
  Debug2.formatEnum = formatEnum;
  const enumMemberCache = /* @__PURE__ */ new Map();
  function getEnumMembers(enumObject) {
    const existing = enumMemberCache.get(enumObject);
    if (existing) {
      return existing;
    }
    const result = [];
    for (const name in enumObject) {
      const value = enumObject[name];
      if (typeof value === "number") {
        result.push([value, name]);
      }
    }
    const sorted = toSorted(result, (x, y) => compareValues(x[0], y[0]));
    enumMemberCache.set(enumObject, sorted);
    return sorted;
  }
  function formatSyntaxKind(kind) {
    return formatEnum(
      kind,
      SyntaxKind,
      /*isFlags*/
      false
    );
  }
  Debug2.formatSyntaxKind = formatSyntaxKind;
  function formatSnippetKind(kind) {
    return formatEnum(
      kind,
      SnippetKind,
      /*isFlags*/
      false
    );
  }
  Debug2.formatSnippetKind = formatSnippetKind;
  function formatScriptKind(kind) {
    return formatEnum(
      kind,
      ScriptKind,
      /*isFlags*/
      false
    );
  }
  Debug2.formatScriptKind = formatScriptKind;
  function formatNodeFlags(flags) {
    return formatEnum(
      flags,
      NodeFlags,
      /*isFlags*/
      true
    );
  }
  Debug2.formatNodeFlags = formatNodeFlags;
  function formatNodeCheckFlags(flags) {
    return formatEnum(
      flags,
      NodeCheckFlags,
      /*isFlags*/
      true
    );
  }
  Debug2.formatNodeCheckFlags = formatNodeCheckFlags;
  function formatModifierFlags(flags) {
    return formatEnum(
      flags,
      ModifierFlags,
      /*isFlags*/
      true
    );
  }
  Debug2.formatModifierFlags = formatModifierFlags;
  function formatTransformFlags(flags) {
    return formatEnum(
      flags,
      TransformFlags,
      /*isFlags*/
      true
    );
  }
  Debug2.formatTransformFlags = formatTransformFlags;
  function formatEmitFlags(flags) {
    return formatEnum(
      flags,
      EmitFlags,
      /*isFlags*/
      true
    );
  }
  Debug2.formatEmitFlags = formatEmitFlags;
  function formatSymbolFlags(flags) {
    return formatEnum(
      flags,
      SymbolFlags,
      /*isFlags*/
      true
    );
  }
  Debug2.formatSymbolFlags = formatSymbolFlags;
  function formatTypeFlags(flags) {
    return formatEnum(
      flags,
      TypeFlags,
      /*isFlags*/
      true
    );
  }
  Debug2.formatTypeFlags = formatTypeFlags;
  function formatSignatureFlags(flags) {
    return formatEnum(
      flags,
      SignatureFlags,
      /*isFlags*/
      true
    );
  }
  Debug2.formatSignatureFlags = formatSignatureFlags;
  function formatObjectFlags(flags) {
    return formatEnum(
      flags,
      ObjectFlags,
      /*isFlags*/
      true
    );
  }
  Debug2.formatObjectFlags = formatObjectFlags;
  function formatFlowFlags(flags) {
    return formatEnum(
      flags,
      FlowFlags,
      /*isFlags*/
      true
    );
  }
  Debug2.formatFlowFlags = formatFlowFlags;
  function formatRelationComparisonResult(result) {
    return formatEnum(
      result,
      RelationComparisonResult,
      /*isFlags*/
      true
    );
  }
  Debug2.formatRelationComparisonResult = formatRelationComparisonResult;
  function formatCheckMode(mode) {
    return formatEnum(
      mode,
      CheckMode,
      /*isFlags*/
      true
    );
  }
  Debug2.formatCheckMode = formatCheckMode;
  function formatSignatureCheckMode(mode) {
    return formatEnum(
      mode,
      SignatureCheckMode,
      /*isFlags*/
      true
    );
  }
  Debug2.formatSignatureCheckMode = formatSignatureCheckMode;
  function formatTypeFacts(facts) {
    return formatEnum(
      facts,
      TypeFacts,
      /*isFlags*/
      true
    );
  }
  Debug2.formatTypeFacts = formatTypeFacts;
  let isDebugInfoEnabled = false;
  let flowNodeProto;
  function attachFlowNodeDebugInfoWorker(flowNode) {
    if (!("__debugFlowFlags" in flowNode)) {
      Object.defineProperties(flowNode, {
        // for use with vscode-js-debug's new customDescriptionGenerator in launch.json
        __tsDebuggerDisplay: {
          value() {
            const flowHeader = this.flags & 2 /* Start */ ? "FlowStart" : this.flags & 4 /* BranchLabel */ ? "FlowBranchLabel" : this.flags & 8 /* LoopLabel */ ? "FlowLoopLabel" : this.flags & 16 /* Assignment */ ? "FlowAssignment" : this.flags & 32 /* TrueCondition */ ? "FlowTrueCondition" : this.flags & 64 /* FalseCondition */ ? "FlowFalseCondition" : this.flags & 128 /* SwitchClause */ ? "FlowSwitchClause" : this.flags & 256 /* ArrayMutation */ ? "FlowArrayMutation" : this.flags & 512 /* Call */ ? "FlowCall" : this.flags & 1024 /* ReduceLabel */ ? "FlowReduceLabel" : this.flags & 1 /* Unreachable */ ? "FlowUnreachable" : "UnknownFlow";
            const remainingFlags = this.flags & ~(2048 /* Referenced */ - 1);
            return `${flowHeader}${remainingFlags ? ` (${formatFlowFlags(remainingFlags)})` : ""}`;
          }
        },
        __debugFlowFlags: {
          get() {
            return formatEnum(
              this.flags,
              FlowFlags,
              /*isFlags*/
              true
            );
          }
        },
        __debugToString: {
          value() {
            return formatControlFlowGraph(this);
          }
        }
      });
    }
  }
  function attachFlowNodeDebugInfo(flowNode) {
    if (isDebugInfoEnabled) {
      if (typeof Object.setPrototypeOf === "function") {
        if (!flowNodeProto) {
          flowNodeProto = Object.create(Object.prototype);
          attachFlowNodeDebugInfoWorker(flowNodeProto);
        }
        Object.setPrototypeOf(flowNode, flowNodeProto);
      } else {
        attachFlowNodeDebugInfoWorker(flowNode);
      }
    }
    return flowNode;
  }
  Debug2.attachFlowNodeDebugInfo = attachFlowNodeDebugInfo;
  let nodeArrayProto;
  function attachNodeArrayDebugInfoWorker(array) {
    if (!("__tsDebuggerDisplay" in array)) {
      Object.defineProperties(array, {
        __tsDebuggerDisplay: {
          value(defaultValue) {
            defaultValue = String(defaultValue).replace(/(?:,[\s\w]+:[^,]+)+\]$/, "]");
            return `NodeArray ${defaultValue}`;
          }
        }
      });
    }
  }
  function attachNodeArrayDebugInfo(array) {
    if (isDebugInfoEnabled) {
      if (typeof Object.setPrototypeOf === "function") {
        if (!nodeArrayProto) {
          nodeArrayProto = Object.create(Array.prototype);
          attachNodeArrayDebugInfoWorker(nodeArrayProto);
        }
        Object.setPrototypeOf(array, nodeArrayProto);
      } else {
        attachNodeArrayDebugInfoWorker(array);
      }
    }
  }
  Debug2.attachNodeArrayDebugInfo = attachNodeArrayDebugInfo;
  function enableDebugInfo() {
    if (isDebugInfoEnabled) return;
    const weakTypeTextMap = /* @__PURE__ */ new WeakMap();
    const weakNodeTextMap = /* @__PURE__ */ new WeakMap();
    Object.defineProperties(objectAllocator.getSymbolConstructor().prototype, {
      // for use with vscode-js-debug's new customDescriptionGenerator in launch.json
      __tsDebuggerDisplay: {
        value() {
          const symbolHeader = this.flags & 33554432 /* Transient */ ? "TransientSymbol" : "Symbol";
          const remainingSymbolFlags = this.flags & ~33554432 /* Transient */;
          return `${symbolHeader} '${symbolName(this)}'${remainingSymbolFlags ? ` (${formatSymbolFlags(remainingSymbolFlags)})` : ""}`;
        }
      },
      __debugFlags: {
        get() {
          return formatSymbolFlags(this.flags);
        }
      }
    });
    Object.defineProperties(objectAllocator.getTypeConstructor().prototype, {
      // for use with vscode-js-debug's new customDescriptionGenerator in launch.json
      __tsDebuggerDisplay: {
        value() {
          const typeHeader = this.flags & 402431 /* Intrinsic */ ? `IntrinsicType ${this.intrinsicName}${this.debugIntrinsicName ? ` (${this.debugIntrinsicName})` : ""}` : this.flags & 12 /* Nullable */ ? "NullableType" : this.flags & 3072 /* StringOrNumberLiteral */ ? `LiteralType ${JSON.stringify(this.value)}` : this.flags & 4096 /* BigIntLiteral */ ? `LiteralType ${this.value.negative ? "-" : ""}${this.value.base10Value}n` : this.flags & 16384 /* UniqueESSymbol */ ? "UniqueESSymbolType" : this.flags & 65536 /* Enum */ ? "EnumType" : this.flags & 134217728 /* Union */ ? "UnionType" : this.flags & 268435456 /* Intersection */ ? "IntersectionType" : this.flags & 2097152 /* Index */ ? "IndexType" : this.flags & 33554432 /* IndexedAccess */ ? "IndexedAccessType" : this.flags & 67108864 /* Conditional */ ? "ConditionalType" : this.flags & 16777216 /* Substitution */ ? "SubstitutionType" : this.flags & 524288 /* TypeParameter */ ? "TypeParameter" : this.flags & 1048576 /* Object */ ? this.objectFlags & 3 /* ClassOrInterface */ ? "InterfaceType" : this.objectFlags & 4 /* Reference */ ? "TypeReference" : this.objectFlags & 8 /* Tuple */ ? "TupleType" : this.objectFlags & 16 /* Anonymous */ ? "AnonymousType" : this.objectFlags & 32 /* Mapped */ ? "MappedType" : this.objectFlags & 1024 /* ReverseMapped */ ? "ReverseMappedType" : this.objectFlags & 256 /* EvolvingArray */ ? "EvolvingArrayType" : "ObjectType" : "Type";
          const remainingObjectFlags = this.flags & 1048576 /* Object */ ? this.objectFlags & ~142607679 /* ObjectTypeKindMask */ : 0;
          return `${typeHeader}${this.symbol ? ` '${symbolName(this.symbol)}'` : ""}${remainingObjectFlags ? ` (${formatObjectFlags(remainingObjectFlags)})` : ""}`;
        }
      },
      __debugFlags: {
        get() {
          return formatTypeFlags(this.flags);
        }
      },
      __debugObjectFlags: {
        get() {
          return this.flags & 1048576 /* Object */ ? formatObjectFlags(this.objectFlags) : "";
        }
      },
      __debugTypeToString: {
        value() {
          let text = weakTypeTextMap.get(this);
          if (text === void 0) {
            text = this.checker.typeToString(this);
            weakTypeTextMap.set(this, text);
          }
          return text;
        }
      }
    });
    Object.defineProperties(objectAllocator.getSignatureConstructor().prototype, {
      __debugFlags: {
        get() {
          return formatSignatureFlags(this.flags);
        }
      },
      __debugSignatureToString: {
        value() {
          var _a;
          return (_a = this.checker) == null ? void 0 : _a.signatureToString(this);
        }
      }
    });
    const nodeConstructors = [
      objectAllocator.getNodeConstructor(),
      objectAllocator.getIdentifierConstructor(),
      objectAllocator.getTokenConstructor(),
      objectAllocator.getSourceFileConstructor()
    ];
    for (const ctor of nodeConstructors) {
      if (!hasProperty(ctor.prototype, "__debugKind")) {
        Object.defineProperties(ctor.prototype, {
          // for use with vscode-js-debug's new customDescriptionGenerator in launch.json
          __tsDebuggerDisplay: {
            value() {
              const nodeHeader = isGeneratedIdentifier(this) ? "GeneratedIdentifier" : isIdentifier(this) ? `Identifier '${idText(this)}'` : isPrivateIdentifier(this) ? `PrivateIdentifier '${idText(this)}'` : isStringLiteral(this) ? `StringLiteral ${JSON.stringify(this.text.length < 10 ? this.text : this.text.slice(10) + "...")}` : isNumericLiteral(this) ? `NumericLiteral ${this.text}` : isBigIntLiteral(this) ? `BigIntLiteral ${this.text}n` : isTypeParameterDeclaration(this) ? "TypeParameterDeclaration" : isParameter(this) ? "ParameterDeclaration" : isConstructorDeclaration(this) ? "ConstructorDeclaration" : isGetAccessorDeclaration(this) ? "GetAccessorDeclaration" : isSetAccessorDeclaration(this) ? "SetAccessorDeclaration" : isCallSignatureDeclaration(this) ? "CallSignatureDeclaration" : isConstructSignatureDeclaration(this) ? "ConstructSignatureDeclaration" : isIndexSignatureDeclaration(this) ? "IndexSignatureDeclaration" : isTypePredicateNode(this) ? "TypePredicateNode" : isTypeReferenceNode(this) ? "TypeReferenceNode" : isFunctionTypeNode(this) ? "FunctionTypeNode" : isConstructorTypeNode(this) ? "ConstructorTypeNode" : isTypeQueryNode(this) ? "TypeQueryNode" : isTypeLiteralNode(this) ? "TypeLiteralNode" : isArrayTypeNode(this) ? "ArrayTypeNode" : isTupleTypeNode(this) ? "TupleTypeNode" : isOptionalTypeNode(this) ? "OptionalTypeNode" : isRestTypeNode(this) ? "RestTypeNode" : isUnionTypeNode(this) ? "UnionTypeNode" : isIntersectionTypeNode(this) ? "IntersectionTypeNode" : isConditionalTypeNode(this) ? "ConditionalTypeNode" : isInferTypeNode(this) ? "InferTypeNode" : isParenthesizedTypeNode(this) ? "ParenthesizedTypeNode" : isThisTypeNode(this) ? "ThisTypeNode" : isTypeOperatorNode(this) ? "TypeOperatorNode" : isIndexedAccessTypeNode(this) ? "IndexedAccessTypeNode" : isMappedTypeNode(this) ? "MappedTypeNode" : isLiteralTypeNode(this) ? "LiteralTypeNode" : isNamedTupleMember(this) ? "NamedTupleMember" : isImportTypeNode(this) ? "ImportTypeNode" : formatSyntaxKind(this.kind);
              return `${nodeHeader}${this.flags ? ` (${formatNodeFlags(this.flags)})` : ""}`;
            }
          },
          __debugKind: {
            get() {
              return formatSyntaxKind(this.kind);
            }
          },
          __debugNodeFlags: {
            get() {
              return formatNodeFlags(this.flags);
            }
          },
          __debugModifierFlags: {
            get() {
              return formatModifierFlags(getEffectiveModifierFlagsNoCache(this));
            }
          },
          __debugTransformFlags: {
            get() {
              return formatTransformFlags(this.transformFlags);
            }
          },
          __debugIsParseTreeNode: {
            get() {
              return isParseTreeNode(this);
            }
          },
          __debugEmitFlags: {
            get() {
              return formatEmitFlags(getEmitFlags(this));
            }
          },
          __debugGetText: {
            value(includeTrivia) {
              if (nodeIsSynthesized(this)) return "";
              let text = weakNodeTextMap.get(this);
              if (text === void 0) {
                const parseNode = getParseTreeNode(this);
                const sourceFile = parseNode && getSourceFileOfNode(parseNode);
                text = sourceFile ? getSourceTextOfNodeFromSourceFile(sourceFile, parseNode, includeTrivia) : "";
                weakNodeTextMap.set(this, text);
              }
              return text;
            }
          }
        });
      }
    }
    isDebugInfoEnabled = true;
  }
  Debug2.enableDebugInfo = enableDebugInfo;
  function formatVariance(varianceFlags) {
    const variance = varianceFlags & 7 /* VarianceMask */;
    let result = variance === 0 /* Invariant */ ? "in out" : variance === 3 /* Bivariant */ ? "[bivariant]" : variance === 2 /* Contravariant */ ? "in" : variance === 1 /* Covariant */ ? "out" : variance === 4 /* Independent */ ? "[independent]" : "";
    if (varianceFlags & 8 /* Unmeasurable */) {
      result += " (unmeasurable)";
    } else if (varianceFlags & 16 /* Unreliable */) {
      result += " (unreliable)";
    }
    return result;
  }
  Debug2.formatVariance = formatVariance;
  class DebugTypeMapper {
    __debugToString() {
      var _a;
      type(this);
      switch (this.kind) {
        case 3 /* Function */:
          return ((_a = this.debugInfo) == null ? void 0 : _a.call(this)) || "(function mapper)";
        case 0 /* Simple */:
          return `${this.source.__debugTypeToString()} -> ${this.target.__debugTypeToString()}`;
        case 1 /* Array */:
          return zipWith(
            this.sources,
            this.targets || map(this.sources, () => "any"),
            (s, t) => `${s.__debugTypeToString()} -> ${typeof t === "string" ? t : t.__debugTypeToString()}`
          ).join(", ");
        case 2 /* Deferred */:
          return zipWith(
            this.sources,
            this.targets,
            (s, t) => `${s.__debugTypeToString()} -> ${t().__debugTypeToString()}`
          ).join(", ");
        case 5 /* Merged */:
        case 4 /* Composite */:
          return `m1: ${this.mapper1.__debugToString().split("\n").join("\n    ")}
m2: ${this.mapper2.__debugToString().split("\n").join("\n    ")}`;
        default:
          return assertNever(this);
      }
    }
  }
  Debug2.DebugTypeMapper = DebugTypeMapper;
  function attachDebugPrototypeIfDebug(mapper) {
    if (Debug2.isDebugging) {
      return Object.setPrototypeOf(mapper, DebugTypeMapper.prototype);
    }
    return mapper;
  }
  Debug2.attachDebugPrototypeIfDebug = attachDebugPrototypeIfDebug;
  function printControlFlowGraph(flowNode) {
    return console.log(formatControlFlowGraph(flowNode));
  }
  Debug2.printControlFlowGraph = printControlFlowGraph;
  function formatControlFlowGraph(flowNode) {
    let nextDebugFlowId = -1;
    function getDebugFlowNodeId(f) {
      if (!f.id) {
        f.id = nextDebugFlowId;
        nextDebugFlowId--;
      }
      return f.id;
    }
    let BoxCharacter;
    ((BoxCharacter2) => {
      BoxCharacter2["lr"] = "\u2500";
      BoxCharacter2["ud"] = "\u2502";
      BoxCharacter2["dr"] = "\u256D";
      BoxCharacter2["dl"] = "\u256E";
      BoxCharacter2["ul"] = "\u256F";
      BoxCharacter2["ur"] = "\u2570";
      BoxCharacter2["udr"] = "\u251C";
      BoxCharacter2["udl"] = "\u2524";
      BoxCharacter2["dlr"] = "\u252C";
      BoxCharacter2["ulr"] = "\u2534";
      BoxCharacter2["udlr"] = "\u256B";
    })(BoxCharacter || (BoxCharacter = {}));
    let Connection;
    ((Connection2) => {
      Connection2[Connection2["None"] = 0] = "None";
      Connection2[Connection2["Up"] = 1] = "Up";
      Connection2[Connection2["Down"] = 2] = "Down";
      Connection2[Connection2["Left"] = 4] = "Left";
      Connection2[Connection2["Right"] = 8] = "Right";
      Connection2[Connection2["UpDown"] = 3] = "UpDown";
      Connection2[Connection2["LeftRight"] = 12] = "LeftRight";
      Connection2[Connection2["UpLeft"] = 5] = "UpLeft";
      Connection2[Connection2["UpRight"] = 9] = "UpRight";
      Connection2[Connection2["DownLeft"] = 6] = "DownLeft";
      Connection2[Connection2["DownRight"] = 10] = "DownRight";
      Connection2[Connection2["UpDownLeft"] = 7] = "UpDownLeft";
      Connection2[Connection2["UpDownRight"] = 11] = "UpDownRight";
      Connection2[Connection2["UpLeftRight"] = 13] = "UpLeftRight";
      Connection2[Connection2["DownLeftRight"] = 14] = "DownLeftRight";
      Connection2[Connection2["UpDownLeftRight"] = 15] = "UpDownLeftRight";
      Connection2[Connection2["NoChildren"] = 16] = "NoChildren";
    })(Connection || (Connection = {}));
    const hasAntecedentFlags = 16 /* Assignment */ | 96 /* Condition */ | 128 /* SwitchClause */ | 256 /* ArrayMutation */ | 512 /* Call */ | 1024 /* ReduceLabel */;
    const hasNodeFlags = 2 /* Start */ | 16 /* Assignment */ | 512 /* Call */ | 96 /* Condition */ | 256 /* ArrayMutation */;
    const links = /* @__PURE__ */ Object.create(
      /*o*/
      null
    );
    const nodes = [];
    const edges = [];
    const root = buildGraphNode(flowNode, /* @__PURE__ */ new Set());
    for (const node of nodes) {
      node.text = renderFlowNode(node.flowNode, node.circular);
      computeLevel(node);
    }
    const height = computeHeight(root);
    const columnWidths = computeColumnWidths(height);
    computeLanes(root, 0);
    return renderGraph();
    function isFlowSwitchClause(f) {
      return !!(f.flags & 128 /* SwitchClause */);
    }
    function hasAntecedents(f) {
      return !!(f.flags & 12 /* Label */) && !!f.antecedent;
    }
    function hasAntecedent(f) {
      return !!(f.flags & hasAntecedentFlags);
    }
    function hasNode(f) {
      return !!(f.flags & hasNodeFlags);
    }
    function getChildren(node) {
      const children = [];
      for (const edge of node.edges) {
        if (edge.source === node) {
          children.push(edge.target);
        }
      }
      return children;
    }
    function getParents(node) {
      const parents = [];
      for (const edge of node.edges) {
        if (edge.target === node) {
          parents.push(edge.source);
        }
      }
      return parents;
    }
    function buildGraphNode(flowNode2, seen) {
      const id = getDebugFlowNodeId(flowNode2);
      let graphNode = links[id];
      if (graphNode && seen.has(flowNode2)) {
        graphNode.circular = true;
        graphNode = {
          id: -1,
          flowNode: flowNode2,
          edges: [],
          text: "",
          lane: -1,
          endLane: -1,
          level: -1,
          circular: "circularity"
        };
        nodes.push(graphNode);
        return graphNode;
      }
      seen.add(flowNode2);
      if (!graphNode) {
        links[id] = graphNode = { id, flowNode: flowNode2, edges: [], text: "", lane: -1, endLane: -1, level: -1, circular: false };
        nodes.push(graphNode);
        if (hasAntecedents(flowNode2)) {
          for (const antecedent of flowNode2.antecedent) {
            buildGraphEdge(graphNode, antecedent, seen);
          }
        } else if (hasAntecedent(flowNode2)) {
          buildGraphEdge(graphNode, flowNode2.antecedent, seen);
        }
      }
      seen.delete(flowNode2);
      return graphNode;
    }
    function buildGraphEdge(source, antecedent, seen) {
      const target = buildGraphNode(antecedent, seen);
      const edge = { source, target };
      edges.push(edge);
      source.edges.push(edge);
      target.edges.push(edge);
    }
    function computeLevel(node) {
      if (node.level !== -1) {
        return node.level;
      }
      let level = 0;
      for (const parent2 of getParents(node)) {
        level = Math.max(level, computeLevel(parent2) + 1);
      }
      return node.level = level;
    }
    function computeHeight(node) {
      let height2 = 0;
      for (const child of getChildren(node)) {
        height2 = Math.max(height2, computeHeight(child));
      }
      return height2 + 1;
    }
    function computeColumnWidths(height2) {
      const columns = fill(Array(height2), 0);
      for (const node of nodes) {
        columns[node.level] = Math.max(columns[node.level], node.text.length);
      }
      return columns;
    }
    function computeLanes(node, lane) {
      if (node.lane === -1) {
        node.lane = lane;
        node.endLane = lane;
        const children = getChildren(node);
        for (let i = 0; i < children.length; i++) {
          if (i > 0) lane++;
          const child = children[i];
          computeLanes(child, lane);
          if (child.endLane > node.endLane) {
            lane = child.endLane;
          }
        }
        node.endLane = lane;
      }
    }
    function getHeader2(flags) {
      if (flags & 2 /* Start */) return "Start";
      if (flags & 4 /* BranchLabel */) return "Branch";
      if (flags & 8 /* LoopLabel */) return "Loop";
      if (flags & 16 /* Assignment */) return "Assignment";
      if (flags & 32 /* TrueCondition */) return "True";
      if (flags & 64 /* FalseCondition */) return "False";
      if (flags & 128 /* SwitchClause */) return "SwitchClause";
      if (flags & 256 /* ArrayMutation */) return "ArrayMutation";
      if (flags & 512 /* Call */) return "Call";
      if (flags & 1024 /* ReduceLabel */) return "ReduceLabel";
      if (flags & 1 /* Unreachable */) return "Unreachable";
      throw new Error();
    }
    function getNodeText(node) {
      const sourceFile = getSourceFileOfNode(node);
      return getSourceTextOfNodeFromSourceFile(
        sourceFile,
        node,
        /*includeTrivia*/
        false
      );
    }
    function renderFlowNode(flowNode2, circular) {
      let text = getHeader2(flowNode2.flags);
      if (circular) {
        text = `${text}#${getDebugFlowNodeId(flowNode2)}`;
      }
      if (isFlowSwitchClause(flowNode2)) {
        const clauses = [];
        const { switchStatement, clauseStart, clauseEnd } = flowNode2.node;
        for (let i = clauseStart; i < clauseEnd; i++) {
          const clause = switchStatement.caseBlock.clauses[i];
          if (isDefaultClause(clause)) {
            clauses.push("default");
          } else {
            clauses.push(getNodeText(clause.expression));
          }
        }
        text += ` (${clauses.join(", ")})`;
      } else if (hasNode(flowNode2)) {
        if (flowNode2.node) {
          text += ` (${getNodeText(flowNode2.node)})`;
        }
      }
      return circular === "circularity" ? `Circular(${text})` : text;
    }
    function renderGraph() {
      const columnCount = columnWidths.length;
      const laneCount = maxBy(nodes, 0, (n) => n.lane) + 1;
      const lanes = fill(Array(laneCount), "");
      const grid = columnWidths.map(() => Array(laneCount));
      const connectors = columnWidths.map(() => fill(Array(laneCount), 0));
      for (const node of nodes) {
        grid[node.level][node.lane] = node;
        const children = getChildren(node);
        for (let i = 0; i < children.length; i++) {
          const child = children[i];
          let connector = 8 /* Right */;
          if (child.lane === node.lane) connector |= 4 /* Left */;
          if (i > 0) connector |= 1 /* Up */;
          if (i < children.length - 1) connector |= 2 /* Down */;
          connectors[node.level][child.lane] |= connector;
        }
        if (children.length === 0) {
          connectors[node.level][node.lane] |= 16 /* NoChildren */;
        }
        const parents = getParents(node);
        for (let i = 0; i < parents.length; i++) {
          const parent2 = parents[i];
          let connector = 4 /* Left */;
          if (i > 0) connector |= 1 /* Up */;
          if (i < parents.length - 1) connector |= 2 /* Down */;
          connectors[node.level - 1][parent2.lane] |= connector;
        }
      }
      for (let column = 0; column < columnCount; column++) {
        for (let lane = 0; lane < laneCount; lane++) {
          const left = column > 0 ? connectors[column - 1][lane] : 0;
          const above = lane > 0 ? connectors[column][lane - 1] : 0;
          let connector = connectors[column][lane];
          if (!connector) {
            if (left & 8 /* Right */) connector |= 12 /* LeftRight */;
            if (above & 2 /* Down */) connector |= 3 /* UpDown */;
            connectors[column][lane] = connector;
          }
        }
      }
      for (let column = 0; column < columnCount; column++) {
        for (let lane = 0; lane < lanes.length; lane++) {
          const connector = connectors[column][lane];
          const fill2 = connector & 4 /* Left */ ? "\u2500" /* lr */ : " ";
          const node = grid[column][lane];
          if (!node) {
            if (column < columnCount - 1) {
              writeLane(lane, repeat(fill2, columnWidths[column] + 1));
            }
          } else {
            writeLane(lane, node.text);
            if (column < columnCount - 1) {
              writeLane(lane, " ");
              writeLane(lane, repeat(fill2, columnWidths[column] - node.text.length));
            }
          }
          writeLane(lane, getBoxCharacter(connector));
          writeLane(lane, connector & 8 /* Right */ && column < columnCount - 1 && !grid[column + 1][lane] ? "\u2500" /* lr */ : " ");
        }
      }
      return `
${lanes.join("\n")}
`;
      function writeLane(lane, text) {
        lanes[lane] += text;
      }
    }
    function getBoxCharacter(connector) {
      switch (connector) {
        case 3 /* UpDown */:
          return "\u2502" /* ud */;
        case 12 /* LeftRight */:
          return "\u2500" /* lr */;
        case 5 /* UpLeft */:
          return "\u256F" /* ul */;
        case 9 /* UpRight */:
          return "\u2570" /* ur */;
        case 6 /* DownLeft */:
          return "\u256E" /* dl */;
        case 10 /* DownRight */:
          return "\u256D" /* dr */;
        case 7 /* UpDownLeft */:
          return "\u2524" /* udl */;
        case 11 /* UpDownRight */:
          return "\u251C" /* udr */;
        case 13 /* UpLeftRight */:
          return "\u2534" /* ulr */;
        case 14 /* DownLeftRight */:
          return "\u252C" /* dlr */;
        case 15 /* UpDownLeftRight */:
          return "\u256B" /* udlr */;
      }
      return " ";
    }
    function fill(array, value) {
      if (array.fill) {
        array.fill(value);
      } else {
        for (let i = 0; i < array.length; i++) {
          array[i] = value;
        }
      }
      return array;
    }
    function repeat(ch, length2) {
      if (ch.repeat) {
        return length2 > 0 ? ch.repeat(length2) : "";
      }
      let s = "";
      while (s.length < length2) {
        s += ch;
      }
      return s;
    }
  }
  Debug2.formatControlFlowGraph = formatControlFlowGraph;
})(Debug || (Debug = {}));
function tryGetPerformance() {
  if (isNodeLikeSystem()) {
    try {
      const { performance: performance2 } = require("perf_hooks");
      if (performance2) {
        return {
          shouldWriteNativeEvents: false,
          performance: performance2
        };
      }
    } catch {
    }
  }
  if (typeof performance === "object") {
    return {
      shouldWriteNativeEvents: true,
      performance
    };
  }
  return void 0;
}
function tryGetPerformanceHooks() {
  const p = tryGetPerformance();
  if (!p) return void 0;
  const { shouldWriteNativeEvents, performance: performance2 } = p;
  const hooks = {
    shouldWriteNativeEvents,
    performance: void 0,
    performanceTime: void 0
  };
  if (typeof performance2.timeOrigin === "number" && typeof performance2.now === "function") {
    hooks.performanceTime = performance2;
  }
  if (hooks.performanceTime && typeof performance2.mark === "function" && typeof performance2.measure === "function" && typeof performance2.clearMarks === "function" && typeof performance2.clearMeasures === "function") {
    hooks.performance = performance2;
  }
  return hooks;
}
var nativePerformanceHooks = tryGetPerformanceHooks();
var nativePerformanceTime = nativePerformanceHooks == null ? void 0 : nativePerformanceHooks.performanceTime;
var timestamp = nativePerformanceTime ? () => nativePerformanceTime.now() : Date.now;
var performanceImpl;
var enabled = false;
var timeorigin = timestamp();
var marks = /* @__PURE__ */ new Map();
var counts = /* @__PURE__ */ new Map();
var durations = /* @__PURE__ */ new Map();
function mark(markName) {
  if (enabled) {
    const count = counts.get(markName) ?? 0;
    counts.set(markName, count + 1);
    marks.set(markName, timestamp());
    performanceImpl == null ? void 0 : performanceImpl.mark(markName);
    if (typeof onProfilerEvent === "function") {
      onProfilerEvent(markName);
    }
  }
}
function measure(measureName, startMarkName, endMarkName) {
  if (enabled) {
    const end = (endMarkName !== void 0 ? marks.get(endMarkName) : void 0) ?? timestamp();
    const start = (startMarkName !== void 0 ? marks.get(startMarkName) : void 0) ?? timeorigin;
    const previousDuration = durations.get(measureName) || 0;
    durations.set(measureName, previousDuration + (end - start));
    performanceImpl == null ? void 0 : performanceImpl.measure(measureName, startMarkName, endMarkName);
  }
}
var tracing;
var SyntaxKind = /* @__PURE__ */ ((SyntaxKind5) => {
  SyntaxKind5[SyntaxKind5["Unknown"] = 0] = "Unknown";
  SyntaxKind5[SyntaxKind5["EndOfFileToken"] = 1] = "EndOfFileToken";
  SyntaxKind5[SyntaxKind5["SingleLineCommentTrivia"] = 2] = "SingleLineCommentTrivia";
  SyntaxKind5[SyntaxKind5["MultiLineCommentTrivia"] = 3] = "MultiLineCommentTrivia";
  SyntaxKind5[SyntaxKind5["NewLineTrivia"] = 4] = "NewLineTrivia";
  SyntaxKind5[SyntaxKind5["WhitespaceTrivia"] = 5] = "WhitespaceTrivia";
  SyntaxKind5[SyntaxKind5["ShebangTrivia"] = 6] = "ShebangTrivia";
  SyntaxKind5[SyntaxKind5["ConflictMarkerTrivia"] = 7] = "ConflictMarkerTrivia";
  SyntaxKind5[SyntaxKind5["NonTextFileMarkerTrivia"] = 8] = "NonTextFileMarkerTrivia";
  SyntaxKind5[SyntaxKind5["NumericLiteral"] = 9] = "NumericLiteral";
  SyntaxKind5[SyntaxKind5["BigIntLiteral"] = 10] = "BigIntLiteral";
  SyntaxKind5[SyntaxKind5["StringLiteral"] = 11] = "StringLiteral";
  SyntaxKind5[SyntaxKind5["JsxText"] = 12] = "JsxText";
  SyntaxKind5[SyntaxKind5["JsxTextAllWhiteSpaces"] = 13] = "JsxTextAllWhiteSpaces";
  SyntaxKind5[SyntaxKind5["RegularExpressionLiteral"] = 14] = "RegularExpressionLiteral";
  SyntaxKind5[SyntaxKind5["NoSubstitutionTemplateLiteral"] = 15] = "NoSubstitutionTemplateLiteral";
  SyntaxKind5[SyntaxKind5["TemplateHead"] = 16] = "TemplateHead";
  SyntaxKind5[SyntaxKind5["TemplateMiddle"] = 17] = "TemplateMiddle";
  SyntaxKind5[SyntaxKind5["TemplateTail"] = 18] = "TemplateTail";
  SyntaxKind5[SyntaxKind5["OpenBraceToken"] = 19] = "OpenBraceToken";
  SyntaxKind5[SyntaxKind5["CloseBraceToken"] = 20] = "CloseBraceToken";
  SyntaxKind5[SyntaxKind5["OpenParenToken"] = 21] = "OpenParenToken";
  SyntaxKind5[SyntaxKind5["CloseParenToken"] = 22] = "CloseParenToken";
  SyntaxKind5[SyntaxKind5["OpenBracketToken"] = 23] = "OpenBracketToken";
  SyntaxKind5[SyntaxKind5["CloseBracketToken"] = 24] = "CloseBracketToken";
  SyntaxKind5[SyntaxKind5["DotToken"] = 25] = "DotToken";
  SyntaxKind5[SyntaxKind5["DotDotDotToken"] = 26] = "DotDotDotToken";
  SyntaxKind5[SyntaxKind5["SemicolonToken"] = 27] = "SemicolonToken";
  SyntaxKind5[SyntaxKind5["CommaToken"] = 28] = "CommaToken";
  SyntaxKind5[SyntaxKind5["QuestionDotToken"] = 29] = "QuestionDotToken";
  SyntaxKind5[SyntaxKind5["LessThanToken"] = 30] = "LessThanToken";
  SyntaxKind5[SyntaxKind5["LessThanSlashToken"] = 31] = "LessThanSlashToken";
  SyntaxKind5[SyntaxKind5["GreaterThanToken"] = 32] = "GreaterThanToken";
  SyntaxKind5[SyntaxKind5["LessThanEqualsToken"] = 33] = "LessThanEqualsToken";
  SyntaxKind5[SyntaxKind5["GreaterThanEqualsToken"] = 34] = "GreaterThanEqualsToken";
  SyntaxKind5[SyntaxKind5["EqualsEqualsToken"] = 35] = "EqualsEqualsToken";
  SyntaxKind5[SyntaxKind5["ExclamationEqualsToken"] = 36] = "ExclamationEqualsToken";
  SyntaxKind5[SyntaxKind5["EqualsEqualsEqualsToken"] = 37] = "EqualsEqualsEqualsToken";
  SyntaxKind5[SyntaxKind5["ExclamationEqualsEqualsToken"] = 38] = "ExclamationEqualsEqualsToken";
  SyntaxKind5[SyntaxKind5["EqualsGreaterThanToken"] = 39] = "EqualsGreaterThanToken";
  SyntaxKind5[SyntaxKind5["PlusToken"] = 40] = "PlusToken";
  SyntaxKind5[SyntaxKind5["MinusToken"] = 41] = "MinusToken";
  SyntaxKind5[SyntaxKind5["AsteriskToken"] = 42] = "AsteriskToken";
  SyntaxKind5[SyntaxKind5["AsteriskAsteriskToken"] = 43] = "AsteriskAsteriskToken";
  SyntaxKind5[SyntaxKind5["SlashToken"] = 44] = "SlashToken";
  SyntaxKind5[SyntaxKind5["PercentToken"] = 45] = "PercentToken";
  SyntaxKind5[SyntaxKind5["PlusPlusToken"] = 46] = "PlusPlusToken";
  SyntaxKind5[SyntaxKind5["MinusMinusToken"] = 47] = "MinusMinusToken";
  SyntaxKind5[SyntaxKind5["LessThanLessThanToken"] = 48] = "LessThanLessThanToken";
  SyntaxKind5[SyntaxKind5["GreaterThanGreaterThanToken"] = 49] = "GreaterThanGreaterThanToken";
  SyntaxKind5[SyntaxKind5["GreaterThanGreaterThanGreaterThanToken"] = 50] = "GreaterThanGreaterThanGreaterThanToken";
  SyntaxKind5[SyntaxKind5["AmpersandToken"] = 51] = "AmpersandToken";
  SyntaxKind5[SyntaxKind5["BarToken"] = 52] = "BarToken";
  SyntaxKind5[SyntaxKind5["CaretToken"] = 53] = "CaretToken";
  SyntaxKind5[SyntaxKind5["ExclamationToken"] = 54] = "ExclamationToken";
  SyntaxKind5[SyntaxKind5["TildeToken"] = 55] = "TildeToken";
  SyntaxKind5[SyntaxKind5["AmpersandAmpersandToken"] = 56] = "AmpersandAmpersandToken";
  SyntaxKind5[SyntaxKind5["BarBarToken"] = 57] = "BarBarToken";
  SyntaxKind5[SyntaxKind5["QuestionToken"] = 58] = "QuestionToken";
  SyntaxKind5[SyntaxKind5["ColonToken"] = 59] = "ColonToken";
  SyntaxKind5[SyntaxKind5["AtToken"] = 60] = "AtToken";
  SyntaxKind5[SyntaxKind5["QuestionQuestionToken"] = 61] = "QuestionQuestionToken";
  SyntaxKind5[SyntaxKind5["BacktickToken"] = 62] = "BacktickToken";
  SyntaxKind5[SyntaxKind5["HashToken"] = 63] = "HashToken";
  SyntaxKind5[SyntaxKind5["EqualsToken"] = 64] = "EqualsToken";
  SyntaxKind5[SyntaxKind5["PlusEqualsToken"] = 65] = "PlusEqualsToken";
  SyntaxKind5[SyntaxKind5["MinusEqualsToken"] = 66] = "MinusEqualsToken";
  SyntaxKind5[SyntaxKind5["AsteriskEqualsToken"] = 67] = "AsteriskEqualsToken";
  SyntaxKind5[SyntaxKind5["AsteriskAsteriskEqualsToken"] = 68] = "AsteriskAsteriskEqualsToken";
  SyntaxKind5[SyntaxKind5["SlashEqualsToken"] = 69] = "SlashEqualsToken";
  SyntaxKind5[SyntaxKind5["PercentEqualsToken"] = 70] = "PercentEqualsToken";
  SyntaxKind5[SyntaxKind5["LessThanLessThanEqualsToken"] = 71] = "LessThanLessThanEqualsToken";
  SyntaxKind5[SyntaxKind5["GreaterThanGreaterThanEqualsToken"] = 72] = "GreaterThanGreaterThanEqualsToken";
  SyntaxKind5[SyntaxKind5["GreaterThanGreaterThanGreaterThanEqualsToken"] = 73] = "GreaterThanGreaterThanGreaterThanEqualsToken";
  SyntaxKind5[SyntaxKind5["AmpersandEqualsToken"] = 74] = "AmpersandEqualsToken";
  SyntaxKind5[SyntaxKind5["BarEqualsToken"] = 75] = "BarEqualsToken";
  SyntaxKind5[SyntaxKind5["BarBarEqualsToken"] = 76] = "BarBarEqualsToken";
  SyntaxKind5[SyntaxKind5["AmpersandAmpersandEqualsToken"] = 77] = "AmpersandAmpersandEqualsToken";
  SyntaxKind5[SyntaxKind5["QuestionQuestionEqualsToken"] = 78] = "QuestionQuestionEqualsToken";
  SyntaxKind5[SyntaxKind5["CaretEqualsToken"] = 79] = "CaretEqualsToken";
  SyntaxKind5[SyntaxKind5["Identifier"] = 80] = "Identifier";
  SyntaxKind5[SyntaxKind5["PrivateIdentifier"] = 81] = "PrivateIdentifier";
  SyntaxKind5[SyntaxKind5["JSDocCommentTextToken"] = 82] = "JSDocCommentTextToken";
  SyntaxKind5[SyntaxKind5["BreakKeyword"] = 83] = "BreakKeyword";
  SyntaxKind5[SyntaxKind5["CaseKeyword"] = 84] = "CaseKeyword";
  SyntaxKind5[SyntaxKind5["CatchKeyword"] = 85] = "CatchKeyword";
  SyntaxKind5[SyntaxKind5["ClassKeyword"] = 86] = "ClassKeyword";
  SyntaxKind5[SyntaxKind5["ConstKeyword"] = 87] = "ConstKeyword";
  SyntaxKind5[SyntaxKind5["ContinueKeyword"] = 88] = "ContinueKeyword";
  SyntaxKind5[SyntaxKind5["DebuggerKeyword"] = 89] = "DebuggerKeyword";
  SyntaxKind5[SyntaxKind5["DefaultKeyword"] = 90] = "DefaultKeyword";
  SyntaxKind5[SyntaxKind5["DeleteKeyword"] = 91] = "DeleteKeyword";
  SyntaxKind5[SyntaxKind5["DoKeyword"] = 92] = "DoKeyword";
  SyntaxKind5[SyntaxKind5["ElseKeyword"] = 93] = "ElseKeyword";
  SyntaxKind5[SyntaxKind5["EnumKeyword"] = 94] = "EnumKeyword";
  SyntaxKind5[SyntaxKind5["ExportKeyword"] = 95] = "ExportKeyword";
  SyntaxKind5[SyntaxKind5["ExtendsKeyword"] = 96] = "ExtendsKeyword";
  SyntaxKind5[SyntaxKind5["FalseKeyword"] = 97] = "FalseKeyword";
  SyntaxKind5[SyntaxKind5["FinallyKeyword"] = 98] = "FinallyKeyword";
  SyntaxKind5[SyntaxKind5["ForKeyword"] = 99] = "ForKeyword";
  SyntaxKind5[SyntaxKind5["FunctionKeyword"] = 100] = "FunctionKeyword";
  SyntaxKind5[SyntaxKind5["IfKeyword"] = 101] = "IfKeyword";
  SyntaxKind5[SyntaxKind5["ImportKeyword"] = 102] = "ImportKeyword";
  SyntaxKind5[SyntaxKind5["InKeyword"] = 103] = "InKeyword";
  SyntaxKind5[SyntaxKind5["InstanceOfKeyword"] = 104] = "InstanceOfKeyword";
  SyntaxKind5[SyntaxKind5["NewKeyword"] = 105] = "NewKeyword";
  SyntaxKind5[SyntaxKind5["NullKeyword"] = 106] = "NullKeyword";
  SyntaxKind5[SyntaxKind5["ReturnKeyword"] = 107] = "ReturnKeyword";
  SyntaxKind5[SyntaxKind5["SuperKeyword"] = 108] = "SuperKeyword";
  SyntaxKind5[SyntaxKind5["SwitchKeyword"] = 109] = "SwitchKeyword";
  SyntaxKind5[SyntaxKind5["ThisKeyword"] = 110] = "ThisKeyword";
  SyntaxKind5[SyntaxKind5["ThrowKeyword"] = 111] = "ThrowKeyword";
  SyntaxKind5[SyntaxKind5["TrueKeyword"] = 112] = "TrueKeyword";
  SyntaxKind5[SyntaxKind5["TryKeyword"] = 113] = "TryKeyword";
  SyntaxKind5[SyntaxKind5["TypeOfKeyword"] = 114] = "TypeOfKeyword";
  SyntaxKind5[SyntaxKind5["VarKeyword"] = 115] = "VarKeyword";
  SyntaxKind5[SyntaxKind5["VoidKeyword"] = 116] = "VoidKeyword";
  SyntaxKind5[SyntaxKind5["WhileKeyword"] = 117] = "WhileKeyword";
  SyntaxKind5[SyntaxKind5["WithKeyword"] = 118] = "WithKeyword";
  SyntaxKind5[SyntaxKind5["ImplementsKeyword"] = 119] = "ImplementsKeyword";
  SyntaxKind5[SyntaxKind5["InterfaceKeyword"] = 120] = "InterfaceKeyword";
  SyntaxKind5[SyntaxKind5["LetKeyword"] = 121] = "LetKeyword";
  SyntaxKind5[SyntaxKind5["PackageKeyword"] = 122] = "PackageKeyword";
  SyntaxKind5[SyntaxKind5["PrivateKeyword"] = 123] = "PrivateKeyword";
  SyntaxKind5[SyntaxKind5["ProtectedKeyword"] = 124] = "ProtectedKeyword";
  SyntaxKind5[SyntaxKind5["PublicKeyword"] = 125] = "PublicKeyword";
  SyntaxKind5[SyntaxKind5["StaticKeyword"] = 126] = "StaticKeyword";
  SyntaxKind5[SyntaxKind5["YieldKeyword"] = 127] = "YieldKeyword";
  SyntaxKind5[SyntaxKind5["AbstractKeyword"] = 128] = "AbstractKeyword";
  SyntaxKind5[SyntaxKind5["AccessorKeyword"] = 129] = "AccessorKeyword";
  SyntaxKind5[SyntaxKind5["AsKeyword"] = 130] = "AsKeyword";
  SyntaxKind5[SyntaxKind5["AssertsKeyword"] = 131] = "AssertsKeyword";
  SyntaxKind5[SyntaxKind5["AssertKeyword"] = 132] = "AssertKeyword";
  SyntaxKind5[SyntaxKind5["AnyKeyword"] = 133] = "AnyKeyword";
  SyntaxKind5[SyntaxKind5["AsyncKeyword"] = 134] = "AsyncKeyword";
  SyntaxKind5[SyntaxKind5["AwaitKeyword"] = 135] = "AwaitKeyword";
  SyntaxKind5[SyntaxKind5["BooleanKeyword"] = 136] = "BooleanKeyword";
  SyntaxKind5[SyntaxKind5["ConstructorKeyword"] = 137] = "ConstructorKeyword";
  SyntaxKind5[SyntaxKind5["DeclareKeyword"] = 138] = "DeclareKeyword";
  SyntaxKind5[SyntaxKind5["GetKeyword"] = 139] = "GetKeyword";
  SyntaxKind5[SyntaxKind5["InferKeyword"] = 140] = "InferKeyword";
  SyntaxKind5[SyntaxKind5["IntrinsicKeyword"] = 141] = "IntrinsicKeyword";
  SyntaxKind5[SyntaxKind5["IsKeyword"] = 142] = "IsKeyword";
  SyntaxKind5[SyntaxKind5["KeyOfKeyword"] = 143] = "KeyOfKeyword";
  SyntaxKind5[SyntaxKind5["ModuleKeyword"] = 144] = "ModuleKeyword";
  SyntaxKind5[SyntaxKind5["NamespaceKeyword"] = 145] = "NamespaceKeyword";
  SyntaxKind5[SyntaxKind5["NeverKeyword"] = 146] = "NeverKeyword";
  SyntaxKind5[SyntaxKind5["OutKeyword"] = 147] = "OutKeyword";
  SyntaxKind5[SyntaxKind5["ReadonlyKeyword"] = 148] = "ReadonlyKeyword";
  SyntaxKind5[SyntaxKind5["RequireKeyword"] = 149] = "RequireKeyword";
  SyntaxKind5[SyntaxKind5["NumberKeyword"] = 150] = "NumberKeyword";
  SyntaxKind5[SyntaxKind5["ObjectKeyword"] = 151] = "ObjectKeyword";
  SyntaxKind5[SyntaxKind5["SatisfiesKeyword"] = 152] = "SatisfiesKeyword";
  SyntaxKind5[SyntaxKind5["SetKeyword"] = 153] = "SetKeyword";
  SyntaxKind5[SyntaxKind5["StringKeyword"] = 154] = "StringKeyword";
  SyntaxKind5[SyntaxKind5["SymbolKeyword"] = 155] = "SymbolKeyword";
  SyntaxKind5[SyntaxKind5["TypeKeyword"] = 156] = "TypeKeyword";
  SyntaxKind5[SyntaxKind5["UndefinedKeyword"] = 157] = "UndefinedKeyword";
  SyntaxKind5[SyntaxKind5["UniqueKeyword"] = 158] = "UniqueKeyword";
  SyntaxKind5[SyntaxKind5["UnknownKeyword"] = 159] = "UnknownKeyword";
  SyntaxKind5[SyntaxKind5["UsingKeyword"] = 160] = "UsingKeyword";
  SyntaxKind5[SyntaxKind5["FromKeyword"] = 161] = "FromKeyword";
  SyntaxKind5[SyntaxKind5["GlobalKeyword"] = 162] = "GlobalKeyword";
  SyntaxKind5[SyntaxKind5["BigIntKeyword"] = 163] = "BigIntKeyword";
  SyntaxKind5[SyntaxKind5["OverrideKeyword"] = 164] = "OverrideKeyword";
  SyntaxKind5[SyntaxKind5["OfKeyword"] = 165] = "OfKeyword";
  SyntaxKind5[SyntaxKind5["DeferKeyword"] = 166] = "DeferKeyword";
  SyntaxKind5[SyntaxKind5["QualifiedName"] = 167] = "QualifiedName";
  SyntaxKind5[SyntaxKind5["ComputedPropertyName"] = 168] = "ComputedPropertyName";
  SyntaxKind5[SyntaxKind5["TypeParameter"] = 169] = "TypeParameter";
  SyntaxKind5[SyntaxKind5["Parameter"] = 170] = "Parameter";
  SyntaxKind5[SyntaxKind5["Decorator"] = 171] = "Decorator";
  SyntaxKind5[SyntaxKind5["PropertySignature"] = 172] = "PropertySignature";
  SyntaxKind5[SyntaxKind5["PropertyDeclaration"] = 173] = "PropertyDeclaration";
  SyntaxKind5[SyntaxKind5["MethodSignature"] = 174] = "MethodSignature";
  SyntaxKind5[SyntaxKind5["MethodDeclaration"] = 175] = "MethodDeclaration";
  SyntaxKind5[SyntaxKind5["ClassStaticBlockDeclaration"] = 176] = "ClassStaticBlockDeclaration";
  SyntaxKind5[SyntaxKind5["Constructor"] = 177] = "Constructor";
  SyntaxKind5[SyntaxKind5["GetAccessor"] = 178] = "GetAccessor";
  SyntaxKind5[SyntaxKind5["SetAccessor"] = 179] = "SetAccessor";
  SyntaxKind5[SyntaxKind5["CallSignature"] = 180] = "CallSignature";
  SyntaxKind5[SyntaxKind5["ConstructSignature"] = 181] = "ConstructSignature";
  SyntaxKind5[SyntaxKind5["IndexSignature"] = 182] = "IndexSignature";
  SyntaxKind5[SyntaxKind5["TypePredicate"] = 183] = "TypePredicate";
  SyntaxKind5[SyntaxKind5["TypeReference"] = 184] = "TypeReference";
  SyntaxKind5[SyntaxKind5["FunctionType"] = 185] = "FunctionType";
  SyntaxKind5[SyntaxKind5["ConstructorType"] = 186] = "ConstructorType";
  SyntaxKind5[SyntaxKind5["TypeQuery"] = 187] = "TypeQuery";
  SyntaxKind5[SyntaxKind5["TypeLiteral"] = 188] = "TypeLiteral";
  SyntaxKind5[SyntaxKind5["ArrayType"] = 189] = "ArrayType";
  SyntaxKind5[SyntaxKind5["TupleType"] = 190] = "TupleType";
  SyntaxKind5[SyntaxKind5["OptionalType"] = 191] = "OptionalType";
  SyntaxKind5[SyntaxKind5["RestType"] = 192] = "RestType";
  SyntaxKind5[SyntaxKind5["UnionType"] = 193] = "UnionType";
  SyntaxKind5[SyntaxKind5["IntersectionType"] = 194] = "IntersectionType";
  SyntaxKind5[SyntaxKind5["ConditionalType"] = 195] = "ConditionalType";
  SyntaxKind5[SyntaxKind5["InferType"] = 196] = "InferType";
  SyntaxKind5[SyntaxKind5["ParenthesizedType"] = 197] = "ParenthesizedType";
  SyntaxKind5[SyntaxKind5["ThisType"] = 198] = "ThisType";
  SyntaxKind5[SyntaxKind5["TypeOperator"] = 199] = "TypeOperator";
  SyntaxKind5[SyntaxKind5["IndexedAccessType"] = 200] = "IndexedAccessType";
  SyntaxKind5[SyntaxKind5["MappedType"] = 201] = "MappedType";
  SyntaxKind5[SyntaxKind5["LiteralType"] = 202] = "LiteralType";
  SyntaxKind5[SyntaxKind5["NamedTupleMember"] = 203] = "NamedTupleMember";
  SyntaxKind5[SyntaxKind5["TemplateLiteralType"] = 204] = "TemplateLiteralType";
  SyntaxKind5[SyntaxKind5["TemplateLiteralTypeSpan"] = 205] = "TemplateLiteralTypeSpan";
  SyntaxKind5[SyntaxKind5["ImportType"] = 206] = "ImportType";
  SyntaxKind5[SyntaxKind5["ObjectBindingPattern"] = 207] = "ObjectBindingPattern";
  SyntaxKind5[SyntaxKind5["ArrayBindingPattern"] = 208] = "ArrayBindingPattern";
  SyntaxKind5[SyntaxKind5["BindingElement"] = 209] = "BindingElement";
  SyntaxKind5[SyntaxKind5["ArrayLiteralExpression"] = 210] = "ArrayLiteralExpression";
  SyntaxKind5[SyntaxKind5["ObjectLiteralExpression"] = 211] = "ObjectLiteralExpression";
  SyntaxKind5[SyntaxKind5["PropertyAccessExpression"] = 212] = "PropertyAccessExpression";
  SyntaxKind5[SyntaxKind5["ElementAccessExpression"] = 213] = "ElementAccessExpression";
  SyntaxKind5[SyntaxKind5["CallExpression"] = 214] = "CallExpression";
  SyntaxKind5[SyntaxKind5["NewExpression"] = 215] = "NewExpression";
  SyntaxKind5[SyntaxKind5["TaggedTemplateExpression"] = 216] = "TaggedTemplateExpression";
  SyntaxKind5[SyntaxKind5["TypeAssertionExpression"] = 217] = "TypeAssertionExpression";
  SyntaxKind5[SyntaxKind5["ParenthesizedExpression"] = 218] = "ParenthesizedExpression";
  SyntaxKind5[SyntaxKind5["FunctionExpression"] = 219] = "FunctionExpression";
  SyntaxKind5[SyntaxKind5["ArrowFunction"] = 220] = "ArrowFunction";
  SyntaxKind5[SyntaxKind5["DeleteExpression"] = 221] = "DeleteExpression";
  SyntaxKind5[SyntaxKind5["TypeOfExpression"] = 222] = "TypeOfExpression";
  SyntaxKind5[SyntaxKind5["VoidExpression"] = 223] = "VoidExpression";
  SyntaxKind5[SyntaxKind5["AwaitExpression"] = 224] = "AwaitExpression";
  SyntaxKind5[SyntaxKind5["PrefixUnaryExpression"] = 225] = "PrefixUnaryExpression";
  SyntaxKind5[SyntaxKind5["PostfixUnaryExpression"] = 226] = "PostfixUnaryExpression";
  SyntaxKind5[SyntaxKind5["BinaryExpression"] = 227] = "BinaryExpression";
  SyntaxKind5[SyntaxKind5["ConditionalExpression"] = 228] = "ConditionalExpression";
  SyntaxKind5[SyntaxKind5["TemplateExpression"] = 229] = "TemplateExpression";
  SyntaxKind5[SyntaxKind5["YieldExpression"] = 230] = "YieldExpression";
  SyntaxKind5[SyntaxKind5["SpreadElement"] = 231] = "SpreadElement";
  SyntaxKind5[SyntaxKind5["ClassExpression"] = 232] = "ClassExpression";
  SyntaxKind5[SyntaxKind5["OmittedExpression"] = 233] = "OmittedExpression";
  SyntaxKind5[SyntaxKind5["ExpressionWithTypeArguments"] = 234] = "ExpressionWithTypeArguments";
  SyntaxKind5[SyntaxKind5["AsExpression"] = 235] = "AsExpression";
  SyntaxKind5[SyntaxKind5["NonNullExpression"] = 236] = "NonNullExpression";
  SyntaxKind5[SyntaxKind5["MetaProperty"] = 237] = "MetaProperty";
  SyntaxKind5[SyntaxKind5["SyntheticExpression"] = 238] = "SyntheticExpression";
  SyntaxKind5[SyntaxKind5["SatisfiesExpression"] = 239] = "SatisfiesExpression";
  SyntaxKind5[SyntaxKind5["TemplateSpan"] = 240] = "TemplateSpan";
  SyntaxKind5[SyntaxKind5["SemicolonClassElement"] = 241] = "SemicolonClassElement";
  SyntaxKind5[SyntaxKind5["Block"] = 242] = "Block";
  SyntaxKind5[SyntaxKind5["EmptyStatement"] = 243] = "EmptyStatement";
  SyntaxKind5[SyntaxKind5["VariableStatement"] = 244] = "VariableStatement";
  SyntaxKind5[SyntaxKind5["ExpressionStatement"] = 245] = "ExpressionStatement";
  SyntaxKind5[SyntaxKind5["IfStatement"] = 246] = "IfStatement";
  SyntaxKind5[SyntaxKind5["DoStatement"] = 247] = "DoStatement";
  SyntaxKind5[SyntaxKind5["WhileStatement"] = 248] = "WhileStatement";
  SyntaxKind5[SyntaxKind5["ForStatement"] = 249] = "ForStatement";
  SyntaxKind5[SyntaxKind5["ForInStatement"] = 250] = "ForInStatement";
  SyntaxKind5[SyntaxKind5["ForOfStatement"] = 251] = "ForOfStatement";
  SyntaxKind5[SyntaxKind5["ContinueStatement"] = 252] = "ContinueStatement";
  SyntaxKind5[SyntaxKind5["BreakStatement"] = 253] = "BreakStatement";
  SyntaxKind5[SyntaxKind5["ReturnStatement"] = 254] = "ReturnStatement";
  SyntaxKind5[SyntaxKind5["WithStatement"] = 255] = "WithStatement";
  SyntaxKind5[SyntaxKind5["SwitchStatement"] = 256] = "SwitchStatement";
  SyntaxKind5[SyntaxKind5["LabeledStatement"] = 257] = "LabeledStatement";
  SyntaxKind5[SyntaxKind5["ThrowStatement"] = 258] = "ThrowStatement";
  SyntaxKind5[SyntaxKind5["TryStatement"] = 259] = "TryStatement";
  SyntaxKind5[SyntaxKind5["DebuggerStatement"] = 260] = "DebuggerStatement";
  SyntaxKind5[SyntaxKind5["VariableDeclaration"] = 261] = "VariableDeclaration";
  SyntaxKind5[SyntaxKind5["VariableDeclarationList"] = 262] = "VariableDeclarationList";
  SyntaxKind5[SyntaxKind5["FunctionDeclaration"] = 263] = "FunctionDeclaration";
  SyntaxKind5[SyntaxKind5["ClassDeclaration"] = 264] = "ClassDeclaration";
  SyntaxKind5[SyntaxKind5["InterfaceDeclaration"] = 265] = "InterfaceDeclaration";
  SyntaxKind5[SyntaxKind5["TypeAliasDeclaration"] = 266] = "TypeAliasDeclaration";
  SyntaxKind5[SyntaxKind5["EnumDeclaration"] = 267] = "EnumDeclaration";
  SyntaxKind5[SyntaxKind5["ModuleDeclaration"] = 268] = "ModuleDeclaration";
  SyntaxKind5[SyntaxKind5["ModuleBlock"] = 269] = "ModuleBlock";
  SyntaxKind5[SyntaxKind5["CaseBlock"] = 270] = "CaseBlock";
  SyntaxKind5[SyntaxKind5["NamespaceExportDeclaration"] = 271] = "NamespaceExportDeclaration";
  SyntaxKind5[SyntaxKind5["ImportEqualsDeclaration"] = 272] = "ImportEqualsDeclaration";
  SyntaxKind5[SyntaxKind5["ImportDeclaration"] = 273] = "ImportDeclaration";
  SyntaxKind5[SyntaxKind5["ImportClause"] = 274] = "ImportClause";
  SyntaxKind5[SyntaxKind5["NamespaceImport"] = 275] = "NamespaceImport";
  SyntaxKind5[SyntaxKind5["NamedImports"] = 276] = "NamedImports";
  SyntaxKind5[SyntaxKind5["ImportSpecifier"] = 277] = "ImportSpecifier";
  SyntaxKind5[SyntaxKind5["ExportAssignment"] = 278] = "ExportAssignment";
  SyntaxKind5[SyntaxKind5["ExportDeclaration"] = 279] = "ExportDeclaration";
  SyntaxKind5[SyntaxKind5["NamedExports"] = 280] = "NamedExports";
  SyntaxKind5[SyntaxKind5["NamespaceExport"] = 281] = "NamespaceExport";
  SyntaxKind5[SyntaxKind5["ExportSpecifier"] = 282] = "ExportSpecifier";
  SyntaxKind5[SyntaxKind5["MissingDeclaration"] = 283] = "MissingDeclaration";
  SyntaxKind5[SyntaxKind5["ExternalModuleReference"] = 284] = "ExternalModuleReference";
  SyntaxKind5[SyntaxKind5["JsxElement"] = 285] = "JsxElement";
  SyntaxKind5[SyntaxKind5["JsxSelfClosingElement"] = 286] = "JsxSelfClosingElement";
  SyntaxKind5[SyntaxKind5["JsxOpeningElement"] = 287] = "JsxOpeningElement";
  SyntaxKind5[SyntaxKind5["JsxClosingElement"] = 288] = "JsxClosingElement";
  SyntaxKind5[SyntaxKind5["JsxFragment"] = 289] = "JsxFragment";
  SyntaxKind5[SyntaxKind5["JsxOpeningFragment"] = 290] = "JsxOpeningFragment";
  SyntaxKind5[SyntaxKind5["JsxClosingFragment"] = 291] = "JsxClosingFragment";
  SyntaxKind5[SyntaxKind5["JsxAttribute"] = 292] = "JsxAttribute";
  SyntaxKind5[SyntaxKind5["JsxAttributes"] = 293] = "JsxAttributes";
  SyntaxKind5[SyntaxKind5["JsxSpreadAttribute"] = 294] = "JsxSpreadAttribute";
  SyntaxKind5[SyntaxKind5["JsxExpression"] = 295] = "JsxExpression";
  SyntaxKind5[SyntaxKind5["JsxNamespacedName"] = 296] = "JsxNamespacedName";
  SyntaxKind5[SyntaxKind5["CaseClause"] = 297] = "CaseClause";
  SyntaxKind5[SyntaxKind5["DefaultClause"] = 298] = "DefaultClause";
  SyntaxKind5[SyntaxKind5["HeritageClause"] = 299] = "HeritageClause";
  SyntaxKind5[SyntaxKind5["CatchClause"] = 300] = "CatchClause";
  SyntaxKind5[SyntaxKind5["ImportAttributes"] = 301] = "ImportAttributes";
  SyntaxKind5[SyntaxKind5["ImportAttribute"] = 302] = "ImportAttribute";
  SyntaxKind5[SyntaxKind5["AssertClause"] = 301 /* ImportAttributes */] = "AssertClause";
  SyntaxKind5[SyntaxKind5["AssertEntry"] = 302 /* ImportAttribute */] = "AssertEntry";
  SyntaxKind5[SyntaxKind5["ImportTypeAssertionContainer"] = 303] = "ImportTypeAssertionContainer";
  SyntaxKind5[SyntaxKind5["PropertyAssignment"] = 304] = "PropertyAssignment";
  SyntaxKind5[SyntaxKind5["ShorthandPropertyAssignment"] = 305] = "ShorthandPropertyAssignment";
  SyntaxKind5[SyntaxKind5["SpreadAssignment"] = 306] = "SpreadAssignment";
  SyntaxKind5[SyntaxKind5["EnumMember"] = 307] = "EnumMember";
  SyntaxKind5[SyntaxKind5["SourceFile"] = 308] = "SourceFile";
  SyntaxKind5[SyntaxKind5["Bundle"] = 309] = "Bundle";
  SyntaxKind5[SyntaxKind5["JSDocTypeExpression"] = 310] = "JSDocTypeExpression";
  SyntaxKind5[SyntaxKind5["JSDocNameReference"] = 311] = "JSDocNameReference";
  SyntaxKind5[SyntaxKind5["JSDocMemberName"] = 312] = "JSDocMemberName";
  SyntaxKind5[SyntaxKind5["JSDocAllType"] = 313] = "JSDocAllType";
  SyntaxKind5[SyntaxKind5["JSDocUnknownType"] = 314] = "JSDocUnknownType";
  SyntaxKind5[SyntaxKind5["JSDocNullableType"] = 315] = "JSDocNullableType";
  SyntaxKind5[SyntaxKind5["JSDocNonNullableType"] = 316] = "JSDocNonNullableType";
  SyntaxKind5[SyntaxKind5["JSDocOptionalType"] = 317] = "JSDocOptionalType";
  SyntaxKind5[SyntaxKind5["JSDocFunctionType"] = 318] = "JSDocFunctionType";
  SyntaxKind5[SyntaxKind5["JSDocVariadicType"] = 319] = "JSDocVariadicType";
  SyntaxKind5[SyntaxKind5["JSDocNamepathType"] = 320] = "JSDocNamepathType";
  SyntaxKind5[SyntaxKind5["JSDoc"] = 321] = "JSDoc";
  SyntaxKind5[SyntaxKind5["JSDocComment"] = 321 /* JSDoc */] = "JSDocComment";
  SyntaxKind5[SyntaxKind5["JSDocText"] = 322] = "JSDocText";
  SyntaxKind5[SyntaxKind5["JSDocTypeLiteral"] = 323] = "JSDocTypeLiteral";
  SyntaxKind5[SyntaxKind5["JSDocSignature"] = 324] = "JSDocSignature";
  SyntaxKind5[SyntaxKind5["JSDocLink"] = 325] = "JSDocLink";
  SyntaxKind5[SyntaxKind5["JSDocLinkCode"] = 326] = "JSDocLinkCode";
  SyntaxKind5[SyntaxKind5["JSDocLinkPlain"] = 327] = "JSDocLinkPlain";
  SyntaxKind5[SyntaxKind5["JSDocTag"] = 328] = "JSDocTag";
  SyntaxKind5[SyntaxKind5["JSDocAugmentsTag"] = 329] = "JSDocAugmentsTag";
  SyntaxKind5[SyntaxKind5["JSDocImplementsTag"] = 330] = "JSDocImplementsTag";
  SyntaxKind5[SyntaxKind5["JSDocAuthorTag"] = 331] = "JSDocAuthorTag";
  SyntaxKind5[SyntaxKind5["JSDocDeprecatedTag"] = 332] = "JSDocDeprecatedTag";
  SyntaxKind5[SyntaxKind5["JSDocClassTag"] = 333] = "JSDocClassTag";
  SyntaxKind5[SyntaxKind5["JSDocPublicTag"] = 334] = "JSDocPublicTag";
  SyntaxKind5[SyntaxKind5["JSDocPrivateTag"] = 335] = "JSDocPrivateTag";
  SyntaxKind5[SyntaxKind5["JSDocProtectedTag"] = 336] = "JSDocProtectedTag";
  SyntaxKind5[SyntaxKind5["JSDocReadonlyTag"] = 337] = "JSDocReadonlyTag";
  SyntaxKind5[SyntaxKind5["JSDocOverrideTag"] = 338] = "JSDocOverrideTag";
  SyntaxKind5[SyntaxKind5["JSDocCallbackTag"] = 339] = "JSDocCallbackTag";
  SyntaxKind5[SyntaxKind5["JSDocOverloadTag"] = 340] = "JSDocOverloadTag";
  SyntaxKind5[SyntaxKind5["JSDocEnumTag"] = 341] = "JSDocEnumTag";
  SyntaxKind5[SyntaxKind5["JSDocParameterTag"] = 342] = "JSDocParameterTag";
  SyntaxKind5[SyntaxKind5["JSDocReturnTag"] = 343] = "JSDocReturnTag";
  SyntaxKind5[SyntaxKind5["JSDocThisTag"] = 344] = "JSDocThisTag";
  SyntaxKind5[SyntaxKind5["JSDocTypeTag"] = 345] = "JSDocTypeTag";
  SyntaxKind5[SyntaxKind5["JSDocTemplateTag"] = 346] = "JSDocTemplateTag";
  SyntaxKind5[SyntaxKind5["JSDocTypedefTag"] = 347] = "JSDocTypedefTag";
  SyntaxKind5[SyntaxKind5["JSDocSeeTag"] = 348] = "JSDocSeeTag";
  SyntaxKind5[SyntaxKind5["JSDocPropertyTag"] = 349] = "JSDocPropertyTag";
  SyntaxKind5[SyntaxKind5["JSDocThrowsTag"] = 350] = "JSDocThrowsTag";
  SyntaxKind5[SyntaxKind5["JSDocSatisfiesTag"] = 351] = "JSDocSatisfiesTag";
  SyntaxKind5[SyntaxKind5["JSDocImportTag"] = 352] = "JSDocImportTag";
  SyntaxKind5[SyntaxKind5["SyntaxList"] = 353] = "SyntaxList";
  SyntaxKind5[SyntaxKind5["NotEmittedStatement"] = 354] = "NotEmittedStatement";
  SyntaxKind5[SyntaxKind5["NotEmittedTypeElement"] = 355] = "NotEmittedTypeElement";
  SyntaxKind5[SyntaxKind5["PartiallyEmittedExpression"] = 356] = "PartiallyEmittedExpression";
  SyntaxKind5[SyntaxKind5["CommaListExpression"] = 357] = "CommaListExpression";
  SyntaxKind5[SyntaxKind5["SyntheticReferenceExpression"] = 358] = "SyntheticReferenceExpression";
  SyntaxKind5[SyntaxKind5["Count"] = 359] = "Count";
  SyntaxKind5[SyntaxKind5["FirstAssignment"] = 64 /* EqualsToken */] = "FirstAssignment";
  SyntaxKind5[SyntaxKind5["LastAssignment"] = 79 /* CaretEqualsToken */] = "LastAssignment";
  SyntaxKind5[SyntaxKind5["FirstCompoundAssignment"] = 65 /* PlusEqualsToken */] = "FirstCompoundAssignment";
  SyntaxKind5[SyntaxKind5["LastCompoundAssignment"] = 79 /* CaretEqualsToken */] = "LastCompoundAssignment";
  SyntaxKind5[SyntaxKind5["FirstReservedWord"] = 83 /* BreakKeyword */] = "FirstReservedWord";
  SyntaxKind5[SyntaxKind5["LastReservedWord"] = 118 /* WithKeyword */] = "LastReservedWord";
  SyntaxKind5[SyntaxKind5["FirstKeyword"] = 83 /* BreakKeyword */] = "FirstKeyword";
  SyntaxKind5[SyntaxKind5["LastKeyword"] = 166 /* DeferKeyword */] = "LastKeyword";
  SyntaxKind5[SyntaxKind5["FirstFutureReservedWord"] = 119 /* ImplementsKeyword */] = "FirstFutureReservedWord";
  SyntaxKind5[SyntaxKind5["LastFutureReservedWord"] = 127 /* YieldKeyword */] = "LastFutureReservedWord";
  SyntaxKind5[SyntaxKind5["FirstTypeNode"] = 183 /* TypePredicate */] = "FirstTypeNode";
  SyntaxKind5[SyntaxKind5["LastTypeNode"] = 206 /* ImportType */] = "LastTypeNode";
  SyntaxKind5[SyntaxKind5["FirstPunctuation"] = 19 /* OpenBraceToken */] = "FirstPunctuation";
  SyntaxKind5[SyntaxKind5["LastPunctuation"] = 79 /* CaretEqualsToken */] = "LastPunctuation";
  SyntaxKind5[SyntaxKind5["FirstToken"] = 0 /* Unknown */] = "FirstToken";
  SyntaxKind5[SyntaxKind5["LastToken"] = 166 /* LastKeyword */] = "LastToken";
  SyntaxKind5[SyntaxKind5["FirstTriviaToken"] = 2 /* SingleLineCommentTrivia */] = "FirstTriviaToken";
  SyntaxKind5[SyntaxKind5["LastTriviaToken"] = 7 /* ConflictMarkerTrivia */] = "LastTriviaToken";
  SyntaxKind5[SyntaxKind5["FirstLiteralToken"] = 9 /* NumericLiteral */] = "FirstLiteralToken";
  SyntaxKind5[SyntaxKind5["LastLiteralToken"] = 15 /* NoSubstitutionTemplateLiteral */] = "LastLiteralToken";
  SyntaxKind5[SyntaxKind5["FirstTemplateToken"] = 15 /* NoSubstitutionTemplateLiteral */] = "FirstTemplateToken";
  SyntaxKind5[SyntaxKind5["LastTemplateToken"] = 18 /* TemplateTail */] = "LastTemplateToken";
  SyntaxKind5[SyntaxKind5["FirstBinaryOperator"] = 30 /* LessThanToken */] = "FirstBinaryOperator";
  SyntaxKind5[SyntaxKind5["LastBinaryOperator"] = 79 /* CaretEqualsToken */] = "LastBinaryOperator";
  SyntaxKind5[SyntaxKind5["FirstStatement"] = 244 /* VariableStatement */] = "FirstStatement";
  SyntaxKind5[SyntaxKind5["LastStatement"] = 260 /* DebuggerStatement */] = "LastStatement";
  SyntaxKind5[SyntaxKind5["FirstNode"] = 167 /* QualifiedName */] = "FirstNode";
  SyntaxKind5[SyntaxKind5["FirstJSDocNode"] = 310 /* JSDocTypeExpression */] = "FirstJSDocNode";
  SyntaxKind5[SyntaxKind5["LastJSDocNode"] = 352 /* JSDocImportTag */] = "LastJSDocNode";
  SyntaxKind5[SyntaxKind5["FirstJSDocTagNode"] = 328 /* JSDocTag */] = "FirstJSDocTagNode";
  SyntaxKind5[SyntaxKind5["LastJSDocTagNode"] = 352 /* JSDocImportTag */] = "LastJSDocTagNode";
  SyntaxKind5[SyntaxKind5["FirstContextualKeyword"] = 128 /* AbstractKeyword */] = "FirstContextualKeyword";
  SyntaxKind5[SyntaxKind5["LastContextualKeyword"] = 166 /* LastKeyword */] = "LastContextualKeyword";
  return SyntaxKind5;
})(SyntaxKind || {});
var NodeFlags = /* @__PURE__ */ ((NodeFlags3) => {
  NodeFlags3[NodeFlags3["None"] = 0] = "None";
  NodeFlags3[NodeFlags3["Let"] = 1] = "Let";
  NodeFlags3[NodeFlags3["Const"] = 2] = "Const";
  NodeFlags3[NodeFlags3["Using"] = 4] = "Using";
  NodeFlags3[NodeFlags3["AwaitUsing"] = 6] = "AwaitUsing";
  NodeFlags3[NodeFlags3["NestedNamespace"] = 8] = "NestedNamespace";
  NodeFlags3[NodeFlags3["Synthesized"] = 16] = "Synthesized";
  NodeFlags3[NodeFlags3["Namespace"] = 32] = "Namespace";
  NodeFlags3[NodeFlags3["OptionalChain"] = 64] = "OptionalChain";
  NodeFlags3[NodeFlags3["ExportContext"] = 128] = "ExportContext";
  NodeFlags3[NodeFlags3["ContainsThis"] = 256] = "ContainsThis";
  NodeFlags3[NodeFlags3["HasImplicitReturn"] = 512] = "HasImplicitReturn";
  NodeFlags3[NodeFlags3["HasExplicitReturn"] = 1024] = "HasExplicitReturn";
  NodeFlags3[NodeFlags3["GlobalAugmentation"] = 2048] = "GlobalAugmentation";
  NodeFlags3[NodeFlags3["HasAsyncFunctions"] = 4096] = "HasAsyncFunctions";
  NodeFlags3[NodeFlags3["DisallowInContext"] = 8192] = "DisallowInContext";
  NodeFlags3[NodeFlags3["YieldContext"] = 16384] = "YieldContext";
  NodeFlags3[NodeFlags3["DecoratorContext"] = 32768] = "DecoratorContext";
  NodeFlags3[NodeFlags3["AwaitContext"] = 65536] = "AwaitContext";
  NodeFlags3[NodeFlags3["DisallowConditionalTypesContext"] = 131072] = "DisallowConditionalTypesContext";
  NodeFlags3[NodeFlags3["ThisNodeHasError"] = 262144] = "ThisNodeHasError";
  NodeFlags3[NodeFlags3["JavaScriptFile"] = 524288] = "JavaScriptFile";
  NodeFlags3[NodeFlags3["ThisNodeOrAnySubNodesHasError"] = 1048576] = "ThisNodeOrAnySubNodesHasError";
  NodeFlags3[NodeFlags3["HasAggregatedChildData"] = 2097152] = "HasAggregatedChildData";
  NodeFlags3[NodeFlags3["PossiblyContainsDynamicImport"] = 4194304] = "PossiblyContainsDynamicImport";
  NodeFlags3[NodeFlags3["PossiblyContainsImportMeta"] = 8388608] = "PossiblyContainsImportMeta";
  NodeFlags3[NodeFlags3["JSDoc"] = 16777216] = "JSDoc";
  NodeFlags3[NodeFlags3["Ambient"] = 33554432] = "Ambient";
  NodeFlags3[NodeFlags3["InWithStatement"] = 67108864] = "InWithStatement";
  NodeFlags3[NodeFlags3["JsonFile"] = 134217728] = "JsonFile";
  NodeFlags3[NodeFlags3["TypeCached"] = 268435456] = "TypeCached";
  NodeFlags3[NodeFlags3["Deprecated"] = 536870912] = "Deprecated";
  NodeFlags3[NodeFlags3["Unreachable"] = 1073741824] = "Unreachable";
  NodeFlags3[NodeFlags3["BlockScoped"] = 7] = "BlockScoped";
  NodeFlags3[NodeFlags3["Constant"] = 6] = "Constant";
  NodeFlags3[NodeFlags3["ReachabilityCheckFlags"] = 1536] = "ReachabilityCheckFlags";
  NodeFlags3[NodeFlags3["ReachabilityAndEmitFlags"] = 5632] = "ReachabilityAndEmitFlags";
  NodeFlags3[NodeFlags3["ContextFlags"] = 101441536] = "ContextFlags";
  NodeFlags3[NodeFlags3["TypeExcludesFlags"] = 81920] = "TypeExcludesFlags";
  NodeFlags3[NodeFlags3["PermanentlySetIncrementalFlags"] = 12582912] = "PermanentlySetIncrementalFlags";
  NodeFlags3[NodeFlags3["IdentifierHasExtendedUnicodeEscape"] = 256 /* ContainsThis */] = "IdentifierHasExtendedUnicodeEscape";
  NodeFlags3[NodeFlags3["IdentifierIsInJSDocNamespace"] = 4096 /* HasAsyncFunctions */] = "IdentifierIsInJSDocNamespace";
  return NodeFlags3;
})(NodeFlags || {});
var ModifierFlags = /* @__PURE__ */ ((ModifierFlags3) => {
  ModifierFlags3[ModifierFlags3["None"] = 0] = "None";
  ModifierFlags3[ModifierFlags3["Public"] = 1] = "Public";
  ModifierFlags3[ModifierFlags3["Private"] = 2] = "Private";
  ModifierFlags3[ModifierFlags3["Protected"] = 4] = "Protected";
  ModifierFlags3[ModifierFlags3["Readonly"] = 8] = "Readonly";
  ModifierFlags3[ModifierFlags3["Override"] = 16] = "Override";
  ModifierFlags3[ModifierFlags3["Export"] = 32] = "Export";
  ModifierFlags3[ModifierFlags3["Abstract"] = 64] = "Abstract";
  ModifierFlags3[ModifierFlags3["Ambient"] = 128] = "Ambient";
  ModifierFlags3[ModifierFlags3["Static"] = 256] = "Static";
  ModifierFlags3[ModifierFlags3["Accessor"] = 512] = "Accessor";
  ModifierFlags3[ModifierFlags3["Async"] = 1024] = "Async";
  ModifierFlags3[ModifierFlags3["Default"] = 2048] = "Default";
  ModifierFlags3[ModifierFlags3["Const"] = 4096] = "Const";
  ModifierFlags3[ModifierFlags3["In"] = 8192] = "In";
  ModifierFlags3[ModifierFlags3["Out"] = 16384] = "Out";
  ModifierFlags3[ModifierFlags3["Decorator"] = 32768] = "Decorator";
  ModifierFlags3[ModifierFlags3["Deprecated"] = 65536] = "Deprecated";
  ModifierFlags3[ModifierFlags3["JSDocPublic"] = 8388608] = "JSDocPublic";
  ModifierFlags3[ModifierFlags3["JSDocPrivate"] = 16777216] = "JSDocPrivate";
  ModifierFlags3[ModifierFlags3["JSDocProtected"] = 33554432] = "JSDocProtected";
  ModifierFlags3[ModifierFlags3["JSDocReadonly"] = 67108864] = "JSDocReadonly";
  ModifierFlags3[ModifierFlags3["JSDocOverride"] = 134217728] = "JSDocOverride";
  ModifierFlags3[ModifierFlags3["SyntacticOrJSDocModifiers"] = 31] = "SyntacticOrJSDocModifiers";
  ModifierFlags3[ModifierFlags3["SyntacticOnlyModifiers"] = 65504] = "SyntacticOnlyModifiers";
  ModifierFlags3[ModifierFlags3["SyntacticModifiers"] = 65535] = "SyntacticModifiers";
  ModifierFlags3[ModifierFlags3["JSDocCacheOnlyModifiers"] = 260046848] = "JSDocCacheOnlyModifiers";
  ModifierFlags3[ModifierFlags3["JSDocOnlyModifiers"] = 65536 /* Deprecated */] = "JSDocOnlyModifiers";
  ModifierFlags3[ModifierFlags3["NonCacheOnlyModifiers"] = 131071] = "NonCacheOnlyModifiers";
  ModifierFlags3[ModifierFlags3["HasComputedJSDocModifiers"] = 268435456] = "HasComputedJSDocModifiers";
  ModifierFlags3[ModifierFlags3["HasComputedFlags"] = 536870912] = "HasComputedFlags";
  ModifierFlags3[ModifierFlags3["AccessibilityModifier"] = 7] = "AccessibilityModifier";
  ModifierFlags3[ModifierFlags3["ParameterPropertyModifier"] = 31] = "ParameterPropertyModifier";
  ModifierFlags3[ModifierFlags3["NonPublicAccessibilityModifier"] = 6] = "NonPublicAccessibilityModifier";
  ModifierFlags3[ModifierFlags3["TypeScriptModifier"] = 28895] = "TypeScriptModifier";
  ModifierFlags3[ModifierFlags3["ExportDefault"] = 2080] = "ExportDefault";
  ModifierFlags3[ModifierFlags3["All"] = 131071] = "All";
  ModifierFlags3[ModifierFlags3["Modifier"] = 98303] = "Modifier";
  return ModifierFlags3;
})(ModifierFlags || {});
var RelationComparisonResult = /* @__PURE__ */ ((RelationComparisonResult3) => {
  RelationComparisonResult3[RelationComparisonResult3["None"] = 0] = "None";
  RelationComparisonResult3[RelationComparisonResult3["Succeeded"] = 1] = "Succeeded";
  RelationComparisonResult3[RelationComparisonResult3["Failed"] = 2] = "Failed";
  RelationComparisonResult3[RelationComparisonResult3["ReportsUnmeasurable"] = 8] = "ReportsUnmeasurable";
  RelationComparisonResult3[RelationComparisonResult3["ReportsUnreliable"] = 16] = "ReportsUnreliable";
  RelationComparisonResult3[RelationComparisonResult3["ReportsMask"] = 24] = "ReportsMask";
  RelationComparisonResult3[RelationComparisonResult3["ComplexityOverflow"] = 32] = "ComplexityOverflow";
  RelationComparisonResult3[RelationComparisonResult3["StackDepthOverflow"] = 64] = "StackDepthOverflow";
  RelationComparisonResult3[RelationComparisonResult3["Overflow"] = 96] = "Overflow";
  return RelationComparisonResult3;
})(RelationComparisonResult || {});
var TokenFlags = /* @__PURE__ */ ((TokenFlags2) => {
  TokenFlags2[TokenFlags2["None"] = 0] = "None";
  TokenFlags2[TokenFlags2["PrecedingLineBreak"] = 1] = "PrecedingLineBreak";
  TokenFlags2[TokenFlags2["PrecedingJSDocComment"] = 2] = "PrecedingJSDocComment";
  TokenFlags2[TokenFlags2["Unterminated"] = 4] = "Unterminated";
  TokenFlags2[TokenFlags2["ExtendedUnicodeEscape"] = 8] = "ExtendedUnicodeEscape";
  TokenFlags2[TokenFlags2["Scientific"] = 16] = "Scientific";
  TokenFlags2[TokenFlags2["Octal"] = 32] = "Octal";
  TokenFlags2[TokenFlags2["HexSpecifier"] = 64] = "HexSpecifier";
  TokenFlags2[TokenFlags2["BinarySpecifier"] = 128] = "BinarySpecifier";
  TokenFlags2[TokenFlags2["OctalSpecifier"] = 256] = "OctalSpecifier";
  TokenFlags2[TokenFlags2["ContainsSeparator"] = 512] = "ContainsSeparator";
  TokenFlags2[TokenFlags2["UnicodeEscape"] = 1024] = "UnicodeEscape";
  TokenFlags2[TokenFlags2["ContainsInvalidEscape"] = 2048] = "ContainsInvalidEscape";
  TokenFlags2[TokenFlags2["HexEscape"] = 4096] = "HexEscape";
  TokenFlags2[TokenFlags2["ContainsLeadingZero"] = 8192] = "ContainsLeadingZero";
  TokenFlags2[TokenFlags2["ContainsInvalidSeparator"] = 16384] = "ContainsInvalidSeparator";
  TokenFlags2[TokenFlags2["PrecedingJSDocLeadingAsterisks"] = 32768] = "PrecedingJSDocLeadingAsterisks";
  TokenFlags2[TokenFlags2["BinaryOrOctalSpecifier"] = 384] = "BinaryOrOctalSpecifier";
  TokenFlags2[TokenFlags2["WithSpecifier"] = 448] = "WithSpecifier";
  TokenFlags2[TokenFlags2["StringLiteralFlags"] = 7176] = "StringLiteralFlags";
  TokenFlags2[TokenFlags2["NumericLiteralFlags"] = 25584] = "NumericLiteralFlags";
  TokenFlags2[TokenFlags2["TemplateLiteralLikeFlags"] = 7176] = "TemplateLiteralLikeFlags";
  TokenFlags2[TokenFlags2["IsInvalid"] = 26656] = "IsInvalid";
  return TokenFlags2;
})(TokenFlags || {});
var FlowFlags = /* @__PURE__ */ ((FlowFlags2) => {
  FlowFlags2[FlowFlags2["Unreachable"] = 1] = "Unreachable";
  FlowFlags2[FlowFlags2["Start"] = 2] = "Start";
  FlowFlags2[FlowFlags2["BranchLabel"] = 4] = "BranchLabel";
  FlowFlags2[FlowFlags2["LoopLabel"] = 8] = "LoopLabel";
  FlowFlags2[FlowFlags2["Assignment"] = 16] = "Assignment";
  FlowFlags2[FlowFlags2["TrueCondition"] = 32] = "TrueCondition";
  FlowFlags2[FlowFlags2["FalseCondition"] = 64] = "FalseCondition";
  FlowFlags2[FlowFlags2["SwitchClause"] = 128] = "SwitchClause";
  FlowFlags2[FlowFlags2["ArrayMutation"] = 256] = "ArrayMutation";
  FlowFlags2[FlowFlags2["Call"] = 512] = "Call";
  FlowFlags2[FlowFlags2["ReduceLabel"] = 1024] = "ReduceLabel";
  FlowFlags2[FlowFlags2["Referenced"] = 2048] = "Referenced";
  FlowFlags2[FlowFlags2["Shared"] = 4096] = "Shared";
  FlowFlags2[FlowFlags2["Label"] = 12] = "Label";
  FlowFlags2[FlowFlags2["Condition"] = 96] = "Condition";
  return FlowFlags2;
})(FlowFlags || {});
var SymbolFlags = /* @__PURE__ */ ((SymbolFlags3) => {
  SymbolFlags3[SymbolFlags3["None"] = 0] = "None";
  SymbolFlags3[SymbolFlags3["FunctionScopedVariable"] = 1] = "FunctionScopedVariable";
  SymbolFlags3[SymbolFlags3["BlockScopedVariable"] = 2] = "BlockScopedVariable";
  SymbolFlags3[SymbolFlags3["Property"] = 4] = "Property";
  SymbolFlags3[SymbolFlags3["EnumMember"] = 8] = "EnumMember";
  SymbolFlags3[SymbolFlags3["Function"] = 16] = "Function";
  SymbolFlags3[SymbolFlags3["Class"] = 32] = "Class";
  SymbolFlags3[SymbolFlags3["Interface"] = 64] = "Interface";
  SymbolFlags3[SymbolFlags3["ConstEnum"] = 128] = "ConstEnum";
  SymbolFlags3[SymbolFlags3["RegularEnum"] = 256] = "RegularEnum";
  SymbolFlags3[SymbolFlags3["ValueModule"] = 512] = "ValueModule";
  SymbolFlags3[SymbolFlags3["NamespaceModule"] = 1024] = "NamespaceModule";
  SymbolFlags3[SymbolFlags3["TypeLiteral"] = 2048] = "TypeLiteral";
  SymbolFlags3[SymbolFlags3["ObjectLiteral"] = 4096] = "ObjectLiteral";
  SymbolFlags3[SymbolFlags3["Method"] = 8192] = "Method";
  SymbolFlags3[SymbolFlags3["Constructor"] = 16384] = "Constructor";
  SymbolFlags3[SymbolFlags3["GetAccessor"] = 32768] = "GetAccessor";
  SymbolFlags3[SymbolFlags3["SetAccessor"] = 65536] = "SetAccessor";
  SymbolFlags3[SymbolFlags3["Signature"] = 131072] = "Signature";
  SymbolFlags3[SymbolFlags3["TypeParameter"] = 262144] = "TypeParameter";
  SymbolFlags3[SymbolFlags3["TypeAlias"] = 524288] = "TypeAlias";
  SymbolFlags3[SymbolFlags3["ExportValue"] = 1048576] = "ExportValue";
  SymbolFlags3[SymbolFlags3["Alias"] = 2097152] = "Alias";
  SymbolFlags3[SymbolFlags3["Prototype"] = 4194304] = "Prototype";
  SymbolFlags3[SymbolFlags3["ExportStar"] = 8388608] = "ExportStar";
  SymbolFlags3[SymbolFlags3["Optional"] = 16777216] = "Optional";
  SymbolFlags3[SymbolFlags3["Transient"] = 33554432] = "Transient";
  SymbolFlags3[SymbolFlags3["Assignment"] = 67108864] = "Assignment";
  SymbolFlags3[SymbolFlags3["ModuleExports"] = 134217728] = "ModuleExports";
  SymbolFlags3[SymbolFlags3["All"] = -1] = "All";
  SymbolFlags3[SymbolFlags3["Enum"] = 384] = "Enum";
  SymbolFlags3[SymbolFlags3["Variable"] = 3] = "Variable";
  SymbolFlags3[SymbolFlags3["Value"] = 111551] = "Value";
  SymbolFlags3[SymbolFlags3["Type"] = 788968] = "Type";
  SymbolFlags3[SymbolFlags3["Namespace"] = 1920] = "Namespace";
  SymbolFlags3[SymbolFlags3["Module"] = 1536] = "Module";
  SymbolFlags3[SymbolFlags3["Accessor"] = 98304] = "Accessor";
  SymbolFlags3[SymbolFlags3["FunctionScopedVariableExcludes"] = 111550] = "FunctionScopedVariableExcludes";
  SymbolFlags3[SymbolFlags3["BlockScopedVariableExcludes"] = 111551 /* Value */] = "BlockScopedVariableExcludes";
  SymbolFlags3[SymbolFlags3["ParameterExcludes"] = 111551 /* Value */] = "ParameterExcludes";
  SymbolFlags3[SymbolFlags3["PropertyExcludes"] = 0 /* None */] = "PropertyExcludes";
  SymbolFlags3[SymbolFlags3["EnumMemberExcludes"] = 900095] = "EnumMemberExcludes";
  SymbolFlags3[SymbolFlags3["FunctionExcludes"] = 110991] = "FunctionExcludes";
  SymbolFlags3[SymbolFlags3["ClassExcludes"] = 899503] = "ClassExcludes";
  SymbolFlags3[SymbolFlags3["InterfaceExcludes"] = 788872] = "InterfaceExcludes";
  SymbolFlags3[SymbolFlags3["RegularEnumExcludes"] = 899327] = "RegularEnumExcludes";
  SymbolFlags3[SymbolFlags3["ConstEnumExcludes"] = 899967] = "ConstEnumExcludes";
  SymbolFlags3[SymbolFlags3["ValueModuleExcludes"] = 110735] = "ValueModuleExcludes";
  SymbolFlags3[SymbolFlags3["NamespaceModuleExcludes"] = 0] = "NamespaceModuleExcludes";
  SymbolFlags3[SymbolFlags3["MethodExcludes"] = 103359] = "MethodExcludes";
  SymbolFlags3[SymbolFlags3["GetAccessorExcludes"] = 46015] = "GetAccessorExcludes";
  SymbolFlags3[SymbolFlags3["SetAccessorExcludes"] = 78783] = "SetAccessorExcludes";
  SymbolFlags3[SymbolFlags3["AccessorExcludes"] = 13247] = "AccessorExcludes";
  SymbolFlags3[SymbolFlags3["TypeParameterExcludes"] = 526824] = "TypeParameterExcludes";
  SymbolFlags3[SymbolFlags3["TypeAliasExcludes"] = 788968 /* Type */] = "TypeAliasExcludes";
  SymbolFlags3[SymbolFlags3["AliasExcludes"] = 2097152 /* Alias */] = "AliasExcludes";
  SymbolFlags3[SymbolFlags3["ModuleMember"] = 2623475] = "ModuleMember";
  SymbolFlags3[SymbolFlags3["ExportHasLocal"] = 944] = "ExportHasLocal";
  SymbolFlags3[SymbolFlags3["BlockScoped"] = 418] = "BlockScoped";
  SymbolFlags3[SymbolFlags3["PropertyOrAccessor"] = 98308] = "PropertyOrAccessor";
  SymbolFlags3[SymbolFlags3["ClassMember"] = 106500] = "ClassMember";
  SymbolFlags3[SymbolFlags3["ExportSupportsDefaultModifier"] = 112] = "ExportSupportsDefaultModifier";
  SymbolFlags3[SymbolFlags3["ExportDoesNotSupportDefaultModifier"] = -113] = "ExportDoesNotSupportDefaultModifier";
  SymbolFlags3[SymbolFlags3["Classifiable"] = 2885600] = "Classifiable";
  SymbolFlags3[SymbolFlags3["LateBindingContainer"] = 6256] = "LateBindingContainer";
  return SymbolFlags3;
})(SymbolFlags || {});
var NodeCheckFlags = /* @__PURE__ */ ((NodeCheckFlags3) => {
  NodeCheckFlags3[NodeCheckFlags3["None"] = 0] = "None";
  NodeCheckFlags3[NodeCheckFlags3["TypeChecked"] = 1] = "TypeChecked";
  NodeCheckFlags3[NodeCheckFlags3["LexicalThis"] = 2] = "LexicalThis";
  NodeCheckFlags3[NodeCheckFlags3["CaptureThis"] = 4] = "CaptureThis";
  NodeCheckFlags3[NodeCheckFlags3["CaptureNewTarget"] = 8] = "CaptureNewTarget";
  NodeCheckFlags3[NodeCheckFlags3["SuperInstance"] = 16] = "SuperInstance";
  NodeCheckFlags3[NodeCheckFlags3["SuperStatic"] = 32] = "SuperStatic";
  NodeCheckFlags3[NodeCheckFlags3["ContextChecked"] = 64] = "ContextChecked";
  NodeCheckFlags3[NodeCheckFlags3["MethodWithSuperPropertyAccessInAsync"] = 128] = "MethodWithSuperPropertyAccessInAsync";
  NodeCheckFlags3[NodeCheckFlags3["MethodWithSuperPropertyAssignmentInAsync"] = 256] = "MethodWithSuperPropertyAssignmentInAsync";
  NodeCheckFlags3[NodeCheckFlags3["CaptureArguments"] = 512] = "CaptureArguments";
  NodeCheckFlags3[NodeCheckFlags3["EnumValuesComputed"] = 1024] = "EnumValuesComputed";
  NodeCheckFlags3[NodeCheckFlags3["LexicalModuleMergesWithClass"] = 2048] = "LexicalModuleMergesWithClass";
  NodeCheckFlags3[NodeCheckFlags3["LoopWithCapturedBlockScopedBinding"] = 4096] = "LoopWithCapturedBlockScopedBinding";
  NodeCheckFlags3[NodeCheckFlags3["ContainsCapturedBlockScopeBinding"] = 8192] = "ContainsCapturedBlockScopeBinding";
  NodeCheckFlags3[NodeCheckFlags3["CapturedBlockScopedBinding"] = 16384] = "CapturedBlockScopedBinding";
  NodeCheckFlags3[NodeCheckFlags3["BlockScopedBindingInLoop"] = 32768] = "BlockScopedBindingInLoop";
  NodeCheckFlags3[NodeCheckFlags3["NeedsLoopOutParameter"] = 65536] = "NeedsLoopOutParameter";
  NodeCheckFlags3[NodeCheckFlags3["AssignmentsMarked"] = 131072] = "AssignmentsMarked";
  NodeCheckFlags3[NodeCheckFlags3["ContainsConstructorReference"] = 262144] = "ContainsConstructorReference";
  NodeCheckFlags3[NodeCheckFlags3["ConstructorReference"] = 536870912] = "ConstructorReference";
  NodeCheckFlags3[NodeCheckFlags3["ContainsClassWithPrivateIdentifiers"] = 1048576] = "ContainsClassWithPrivateIdentifiers";
  NodeCheckFlags3[NodeCheckFlags3["ContainsSuperPropertyInStaticInitializer"] = 2097152] = "ContainsSuperPropertyInStaticInitializer";
  NodeCheckFlags3[NodeCheckFlags3["InCheckIdentifier"] = 4194304] = "InCheckIdentifier";
  NodeCheckFlags3[NodeCheckFlags3["PartiallyTypeChecked"] = 8388608] = "PartiallyTypeChecked";
  NodeCheckFlags3[NodeCheckFlags3["LazyFlags"] = 539358128] = "LazyFlags";
  return NodeCheckFlags3;
})(NodeCheckFlags || {});
var TypeFlags = /* @__PURE__ */ ((TypeFlags2) => {
  TypeFlags2[TypeFlags2["Any"] = 1] = "Any";
  TypeFlags2[TypeFlags2["Unknown"] = 2] = "Unknown";
  TypeFlags2[TypeFlags2["Undefined"] = 4] = "Undefined";
  TypeFlags2[TypeFlags2["Null"] = 8] = "Null";
  TypeFlags2[TypeFlags2["Void"] = 16] = "Void";
  TypeFlags2[TypeFlags2["String"] = 32] = "String";
  TypeFlags2[TypeFlags2["Number"] = 64] = "Number";
  TypeFlags2[TypeFlags2["BigInt"] = 128] = "BigInt";
  TypeFlags2[TypeFlags2["Boolean"] = 256] = "Boolean";
  TypeFlags2[TypeFlags2["ESSymbol"] = 512] = "ESSymbol";
  TypeFlags2[TypeFlags2["StringLiteral"] = 1024] = "StringLiteral";
  TypeFlags2[TypeFlags2["NumberLiteral"] = 2048] = "NumberLiteral";
  TypeFlags2[TypeFlags2["BigIntLiteral"] = 4096] = "BigIntLiteral";
  TypeFlags2[TypeFlags2["BooleanLiteral"] = 8192] = "BooleanLiteral";
  TypeFlags2[TypeFlags2["UniqueESSymbol"] = 16384] = "UniqueESSymbol";
  TypeFlags2[TypeFlags2["EnumLiteral"] = 32768] = "EnumLiteral";
  TypeFlags2[TypeFlags2["Enum"] = 65536] = "Enum";
  TypeFlags2[TypeFlags2["NonPrimitive"] = 131072] = "NonPrimitive";
  TypeFlags2[TypeFlags2["Never"] = 262144] = "Never";
  TypeFlags2[TypeFlags2["TypeParameter"] = 524288] = "TypeParameter";
  TypeFlags2[TypeFlags2["Object"] = 1048576] = "Object";
  TypeFlags2[TypeFlags2["Index"] = 2097152] = "Index";
  TypeFlags2[TypeFlags2["TemplateLiteral"] = 4194304] = "TemplateLiteral";
  TypeFlags2[TypeFlags2["StringMapping"] = 8388608] = "StringMapping";
  TypeFlags2[TypeFlags2["Substitution"] = 16777216] = "Substitution";
  TypeFlags2[TypeFlags2["IndexedAccess"] = 33554432] = "IndexedAccess";
  TypeFlags2[TypeFlags2["Conditional"] = 67108864] = "Conditional";
  TypeFlags2[TypeFlags2["Union"] = 134217728] = "Union";
  TypeFlags2[TypeFlags2["Intersection"] = 268435456] = "Intersection";
  TypeFlags2[TypeFlags2["Reserved1"] = 536870912] = "Reserved1";
  TypeFlags2[TypeFlags2["Reserved2"] = 1073741824] = "Reserved2";
  TypeFlags2[TypeFlags2["Reserved3"] = -2147483648] = "Reserved3";
  TypeFlags2[TypeFlags2["AnyOrUnknown"] = 3] = "AnyOrUnknown";
  TypeFlags2[TypeFlags2["Nullable"] = 12] = "Nullable";
  TypeFlags2[TypeFlags2["Literal"] = 15360] = "Literal";
  TypeFlags2[TypeFlags2["Unit"] = 97292] = "Unit";
  TypeFlags2[TypeFlags2["Freshable"] = 80896] = "Freshable";
  TypeFlags2[TypeFlags2["StringOrNumberLiteral"] = 3072] = "StringOrNumberLiteral";
  TypeFlags2[TypeFlags2["StringOrNumberLiteralOrUnique"] = 19456] = "StringOrNumberLiteralOrUnique";
  TypeFlags2[TypeFlags2["DefinitelyFalsy"] = 15388] = "DefinitelyFalsy";
  TypeFlags2[TypeFlags2["PossiblyFalsy"] = 15868] = "PossiblyFalsy";
  TypeFlags2[TypeFlags2["Intrinsic"] = 402431] = "Intrinsic";
  TypeFlags2[TypeFlags2["StringLike"] = 12583968] = "StringLike";
  TypeFlags2[TypeFlags2["NumberLike"] = 67648] = "NumberLike";
  TypeFlags2[TypeFlags2["BigIntLike"] = 4224] = "BigIntLike";
  TypeFlags2[TypeFlags2["BooleanLike"] = 8448] = "BooleanLike";
  TypeFlags2[TypeFlags2["EnumLike"] = 98304] = "EnumLike";
  TypeFlags2[TypeFlags2["ESSymbolLike"] = 16896] = "ESSymbolLike";
  TypeFlags2[TypeFlags2["VoidLike"] = 20] = "VoidLike";
  TypeFlags2[TypeFlags2["Primitive"] = 12713980] = "Primitive";
  TypeFlags2[TypeFlags2["DefinitelyNonNullable"] = 13893600] = "DefinitelyNonNullable";
  TypeFlags2[TypeFlags2["DisjointDomains"] = 12812284] = "DisjointDomains";
  TypeFlags2[TypeFlags2["UnionOrIntersection"] = 402653184] = "UnionOrIntersection";
  TypeFlags2[TypeFlags2["StructuredType"] = 403701760] = "StructuredType";
  TypeFlags2[TypeFlags2["TypeVariable"] = 34078720] = "TypeVariable";
  TypeFlags2[TypeFlags2["InstantiableNonPrimitive"] = 117964800] = "InstantiableNonPrimitive";
  TypeFlags2[TypeFlags2["InstantiablePrimitive"] = 14680064] = "InstantiablePrimitive";
  TypeFlags2[TypeFlags2["Instantiable"] = 132644864] = "Instantiable";
  TypeFlags2[TypeFlags2["StructuredOrInstantiable"] = 536346624] = "StructuredOrInstantiable";
  TypeFlags2[TypeFlags2["ObjectFlagsType"] = 403963917] = "ObjectFlagsType";
  TypeFlags2[TypeFlags2["Simplifiable"] = 102760448] = "Simplifiable";
  TypeFlags2[TypeFlags2["Singleton"] = 394239] = "Singleton";
  TypeFlags2[TypeFlags2["Narrowable"] = 536575971] = "Narrowable";
  TypeFlags2[TypeFlags2["IncludesMask"] = 416808959] = "IncludesMask";
  TypeFlags2[TypeFlags2["IncludesMissingType"] = 524288 /* TypeParameter */] = "IncludesMissingType";
  TypeFlags2[TypeFlags2["IncludesNonWideningType"] = 2097152 /* Index */] = "IncludesNonWideningType";
  TypeFlags2[TypeFlags2["IncludesWildcard"] = 33554432 /* IndexedAccess */] = "IncludesWildcard";
  TypeFlags2[TypeFlags2["IncludesEmptyObject"] = 67108864 /* Conditional */] = "IncludesEmptyObject";
  TypeFlags2[TypeFlags2["IncludesInstantiable"] = 16777216 /* Substitution */] = "IncludesInstantiable";
  TypeFlags2[TypeFlags2["IncludesConstrainedTypeVariable"] = 536870912 /* Reserved1 */] = "IncludesConstrainedTypeVariable";
  TypeFlags2[TypeFlags2["IncludesError"] = 1073741824 /* Reserved2 */] = "IncludesError";
  TypeFlags2[TypeFlags2["NotPrimitiveUnion"] = 286523411] = "NotPrimitiveUnion";
  return TypeFlags2;
})(TypeFlags || {});
var ObjectFlags = /* @__PURE__ */ ((ObjectFlags3) => {
  ObjectFlags3[ObjectFlags3["None"] = 0] = "None";
  ObjectFlags3[ObjectFlags3["Class"] = 1] = "Class";
  ObjectFlags3[ObjectFlags3["Interface"] = 2] = "Interface";
  ObjectFlags3[ObjectFlags3["Reference"] = 4] = "Reference";
  ObjectFlags3[ObjectFlags3["Tuple"] = 8] = "Tuple";
  ObjectFlags3[ObjectFlags3["Anonymous"] = 16] = "Anonymous";
  ObjectFlags3[ObjectFlags3["Mapped"] = 32] = "Mapped";
  ObjectFlags3[ObjectFlags3["Instantiated"] = 64] = "Instantiated";
  ObjectFlags3[ObjectFlags3["ObjectLiteral"] = 128] = "ObjectLiteral";
  ObjectFlags3[ObjectFlags3["EvolvingArray"] = 256] = "EvolvingArray";
  ObjectFlags3[ObjectFlags3["ObjectLiteralPatternWithComputedProperties"] = 512] = "ObjectLiteralPatternWithComputedProperties";
  ObjectFlags3[ObjectFlags3["ReverseMapped"] = 1024] = "ReverseMapped";
  ObjectFlags3[ObjectFlags3["JsxAttributes"] = 2048] = "JsxAttributes";
  ObjectFlags3[ObjectFlags3["JSLiteral"] = 4096] = "JSLiteral";
  ObjectFlags3[ObjectFlags3["FreshLiteral"] = 8192] = "FreshLiteral";
  ObjectFlags3[ObjectFlags3["ArrayLiteral"] = 16384] = "ArrayLiteral";
  ObjectFlags3[ObjectFlags3["PrimitiveUnion"] = 32768] = "PrimitiveUnion";
  ObjectFlags3[ObjectFlags3["ContainsWideningType"] = 65536] = "ContainsWideningType";
  ObjectFlags3[ObjectFlags3["ContainsObjectOrArrayLiteral"] = 131072] = "ContainsObjectOrArrayLiteral";
  ObjectFlags3[ObjectFlags3["NonInferrableType"] = 262144] = "NonInferrableType";
  ObjectFlags3[ObjectFlags3["CouldContainTypeVariablesComputed"] = 524288] = "CouldContainTypeVariablesComputed";
  ObjectFlags3[ObjectFlags3["CouldContainTypeVariables"] = 1048576] = "CouldContainTypeVariables";
  ObjectFlags3[ObjectFlags3["SingleSignatureType"] = 134217728] = "SingleSignatureType";
  ObjectFlags3[ObjectFlags3["ClassOrInterface"] = 3] = "ClassOrInterface";
  ObjectFlags3[ObjectFlags3["RequiresWidening"] = 196608] = "RequiresWidening";
  ObjectFlags3[ObjectFlags3["PropagatingFlags"] = 458752] = "PropagatingFlags";
  ObjectFlags3[ObjectFlags3["InstantiatedMapped"] = 96] = "InstantiatedMapped";
  ObjectFlags3[ObjectFlags3["ContainsSpread"] = 2097152] = "ContainsSpread";
  ObjectFlags3[ObjectFlags3["ObjectRestType"] = 4194304] = "ObjectRestType";
  ObjectFlags3[ObjectFlags3["InstantiationExpressionType"] = 8388608] = "InstantiationExpressionType";
  ObjectFlags3[ObjectFlags3["ObjectTypeKindMask"] = 142607679] = "ObjectTypeKindMask";
  ObjectFlags3[ObjectFlags3["IsClassInstanceClone"] = 16777216] = "IsClassInstanceClone";
  ObjectFlags3[ObjectFlags3["IdenticalBaseTypeCalculated"] = 33554432] = "IdenticalBaseTypeCalculated";
  ObjectFlags3[ObjectFlags3["IdenticalBaseTypeExists"] = 67108864] = "IdenticalBaseTypeExists";
  ObjectFlags3[ObjectFlags3["IsGenericTypeComputed"] = 2097152] = "IsGenericTypeComputed";
  ObjectFlags3[ObjectFlags3["IsGenericObjectType"] = 4194304] = "IsGenericObjectType";
  ObjectFlags3[ObjectFlags3["IsGenericIndexType"] = 8388608] = "IsGenericIndexType";
  ObjectFlags3[ObjectFlags3["IsGenericType"] = 12582912] = "IsGenericType";
  ObjectFlags3[ObjectFlags3["ContainsIntersections"] = 16777216] = "ContainsIntersections";
  ObjectFlags3[ObjectFlags3["IsUnknownLikeUnionComputed"] = 33554432] = "IsUnknownLikeUnionComputed";
  ObjectFlags3[ObjectFlags3["IsUnknownLikeUnion"] = 67108864] = "IsUnknownLikeUnion";
  ObjectFlags3[ObjectFlags3["IsNeverIntersectionComputed"] = 16777216] = "IsNeverIntersectionComputed";
  ObjectFlags3[ObjectFlags3["IsNeverIntersection"] = 33554432] = "IsNeverIntersection";
  ObjectFlags3[ObjectFlags3["IsConstrainedTypeVariable"] = 67108864] = "IsConstrainedTypeVariable";
  return ObjectFlags3;
})(ObjectFlags || {});
var SignatureFlags = /* @__PURE__ */ ((SignatureFlags5) => {
  SignatureFlags5[SignatureFlags5["None"] = 0] = "None";
  SignatureFlags5[SignatureFlags5["HasRestParameter"] = 1] = "HasRestParameter";
  SignatureFlags5[SignatureFlags5["HasLiteralTypes"] = 2] = "HasLiteralTypes";
  SignatureFlags5[SignatureFlags5["Abstract"] = 4] = "Abstract";
  SignatureFlags5[SignatureFlags5["IsInnerCallChain"] = 8] = "IsInnerCallChain";
  SignatureFlags5[SignatureFlags5["IsOuterCallChain"] = 16] = "IsOuterCallChain";
  SignatureFlags5[SignatureFlags5["IsUntypedSignatureInJSFile"] = 32] = "IsUntypedSignatureInJSFile";
  SignatureFlags5[SignatureFlags5["IsNonInferrable"] = 64] = "IsNonInferrable";
  SignatureFlags5[SignatureFlags5["IsSignatureCandidateForOverloadFailure"] = 128] = "IsSignatureCandidateForOverloadFailure";
  SignatureFlags5[SignatureFlags5["PropagatingFlags"] = 167] = "PropagatingFlags";
  SignatureFlags5[SignatureFlags5["CallChainFlags"] = 24] = "CallChainFlags";
  return SignatureFlags5;
})(SignatureFlags || {});
var ScriptKind = /* @__PURE__ */ ((ScriptKind7) => {
  ScriptKind7[ScriptKind7["Unknown"] = 0] = "Unknown";
  ScriptKind7[ScriptKind7["JS"] = 1] = "JS";
  ScriptKind7[ScriptKind7["JSX"] = 2] = "JSX";
  ScriptKind7[ScriptKind7["TS"] = 3] = "TS";
  ScriptKind7[ScriptKind7["TSX"] = 4] = "TSX";
  ScriptKind7[ScriptKind7["External"] = 5] = "External";
  ScriptKind7[ScriptKind7["JSON"] = 6] = "JSON";
  ScriptKind7[ScriptKind7["Deferred"] = 7] = "Deferred";
  return ScriptKind7;
})(ScriptKind || {});
var ScriptTarget = /* @__PURE__ */ ((ScriptTarget12) => {
  ScriptTarget12[ScriptTarget12["ES3"] = 0] = "ES3";
  ScriptTarget12[ScriptTarget12["ES5"] = 1] = "ES5";
  ScriptTarget12[ScriptTarget12["ES2015"] = 2] = "ES2015";
  ScriptTarget12[ScriptTarget12["ES2016"] = 3] = "ES2016";
  ScriptTarget12[ScriptTarget12["ES2017"] = 4] = "ES2017";
  ScriptTarget12[ScriptTarget12["ES2018"] = 5] = "ES2018";
  ScriptTarget12[ScriptTarget12["ES2019"] = 6] = "ES2019";
  ScriptTarget12[ScriptTarget12["ES2020"] = 7] = "ES2020";
  ScriptTarget12[ScriptTarget12["ES2021"] = 8] = "ES2021";
  ScriptTarget12[ScriptTarget12["ES2022"] = 9] = "ES2022";
  ScriptTarget12[ScriptTarget12["ES2023"] = 10] = "ES2023";
  ScriptTarget12[ScriptTarget12["ES2024"] = 11] = "ES2024";
  ScriptTarget12[ScriptTarget12["ES2025"] = 12] = "ES2025";
  ScriptTarget12[ScriptTarget12["ESNext"] = 99] = "ESNext";
  ScriptTarget12[ScriptTarget12["JSON"] = 100] = "JSON";
  ScriptTarget12[ScriptTarget12["Latest"] = 99 /* ESNext */] = "Latest";
  ScriptTarget12[ScriptTarget12["LatestStandard"] = 12 /* ES2025 */] = "LatestStandard";
  return ScriptTarget12;
})(ScriptTarget || {});
var LanguageVariant = /* @__PURE__ */ ((LanguageVariant4) => {
  LanguageVariant4[LanguageVariant4["Standard"] = 0] = "Standard";
  LanguageVariant4[LanguageVariant4["JSX"] = 1] = "JSX";
  return LanguageVariant4;
})(LanguageVariant || {});
var TransformFlags = /* @__PURE__ */ ((TransformFlags3) => {
  TransformFlags3[TransformFlags3["None"] = 0] = "None";
  TransformFlags3[TransformFlags3["ContainsTypeScript"] = 1] = "ContainsTypeScript";
  TransformFlags3[TransformFlags3["ContainsJsx"] = 2] = "ContainsJsx";
  TransformFlags3[TransformFlags3["ContainsESNext"] = 4] = "ContainsESNext";
  TransformFlags3[TransformFlags3["ContainsES2022"] = 8] = "ContainsES2022";
  TransformFlags3[TransformFlags3["ContainsES2021"] = 16] = "ContainsES2021";
  TransformFlags3[TransformFlags3["ContainsES2020"] = 32] = "ContainsES2020";
  TransformFlags3[TransformFlags3["ContainsES2019"] = 64] = "ContainsES2019";
  TransformFlags3[TransformFlags3["ContainsES2018"] = 128] = "ContainsES2018";
  TransformFlags3[TransformFlags3["ContainsES2017"] = 256] = "ContainsES2017";
  TransformFlags3[TransformFlags3["ContainsES2016"] = 512] = "ContainsES2016";
  TransformFlags3[TransformFlags3["ContainsES2015"] = 1024] = "ContainsES2015";
  TransformFlags3[TransformFlags3["ContainsGenerator"] = 2048] = "ContainsGenerator";
  TransformFlags3[TransformFlags3["ContainsDestructuringAssignment"] = 4096] = "ContainsDestructuringAssignment";
  TransformFlags3[TransformFlags3["ContainsTypeScriptClassSyntax"] = 8192] = "ContainsTypeScriptClassSyntax";
  TransformFlags3[TransformFlags3["ContainsLexicalThis"] = 16384] = "ContainsLexicalThis";
  TransformFlags3[TransformFlags3["ContainsRestOrSpread"] = 32768] = "ContainsRestOrSpread";
  TransformFlags3[TransformFlags3["ContainsObjectRestOrSpread"] = 65536] = "ContainsObjectRestOrSpread";
  TransformFlags3[TransformFlags3["ContainsComputedPropertyName"] = 131072] = "ContainsComputedPropertyName";
  TransformFlags3[TransformFlags3["ContainsBlockScopedBinding"] = 262144] = "ContainsBlockScopedBinding";
  TransformFlags3[TransformFlags3["ContainsBindingPattern"] = 524288] = "ContainsBindingPattern";
  TransformFlags3[TransformFlags3["ContainsYield"] = 1048576] = "ContainsYield";
  TransformFlags3[TransformFlags3["ContainsAwait"] = 2097152] = "ContainsAwait";
  TransformFlags3[TransformFlags3["ContainsHoistedDeclarationOrCompletion"] = 4194304] = "ContainsHoistedDeclarationOrCompletion";
  TransformFlags3[TransformFlags3["ContainsDynamicImport"] = 8388608] = "ContainsDynamicImport";
  TransformFlags3[TransformFlags3["ContainsClassFields"] = 16777216] = "ContainsClassFields";
  TransformFlags3[TransformFlags3["ContainsDecorators"] = 33554432] = "ContainsDecorators";
  TransformFlags3[TransformFlags3["ContainsPossibleTopLevelAwait"] = 67108864] = "ContainsPossibleTopLevelAwait";
  TransformFlags3[TransformFlags3["ContainsLexicalSuper"] = 134217728] = "ContainsLexicalSuper";
  TransformFlags3[TransformFlags3["ContainsUpdateExpressionForIdentifier"] = 268435456] = "ContainsUpdateExpressionForIdentifier";
  TransformFlags3[TransformFlags3["ContainsPrivateIdentifierInExpression"] = 536870912] = "ContainsPrivateIdentifierInExpression";
  TransformFlags3[TransformFlags3["HasComputedFlags"] = -2147483648] = "HasComputedFlags";
  TransformFlags3[TransformFlags3["AssertTypeScript"] = 1 /* ContainsTypeScript */] = "AssertTypeScript";
  TransformFlags3[TransformFlags3["AssertJsx"] = 2 /* ContainsJsx */] = "AssertJsx";
  TransformFlags3[TransformFlags3["AssertESNext"] = 4 /* ContainsESNext */] = "AssertESNext";
  TransformFlags3[TransformFlags3["AssertES2022"] = 8 /* ContainsES2022 */] = "AssertES2022";
  TransformFlags3[TransformFlags3["AssertES2021"] = 16 /* ContainsES2021 */] = "AssertES2021";
  TransformFlags3[TransformFlags3["AssertES2020"] = 32 /* ContainsES2020 */] = "AssertES2020";
  TransformFlags3[TransformFlags3["AssertES2019"] = 64 /* ContainsES2019 */] = "AssertES2019";
  TransformFlags3[TransformFlags3["AssertES2018"] = 128 /* ContainsES2018 */] = "AssertES2018";
  TransformFlags3[TransformFlags3["AssertES2017"] = 256 /* ContainsES2017 */] = "AssertES2017";
  TransformFlags3[TransformFlags3["AssertES2016"] = 512 /* ContainsES2016 */] = "AssertES2016";
  TransformFlags3[TransformFlags3["AssertES2015"] = 1024 /* ContainsES2015 */] = "AssertES2015";
  TransformFlags3[TransformFlags3["AssertGenerator"] = 2048 /* ContainsGenerator */] = "AssertGenerator";
  TransformFlags3[TransformFlags3["AssertDestructuringAssignment"] = 4096 /* ContainsDestructuringAssignment */] = "AssertDestructuringAssignment";
  TransformFlags3[TransformFlags3["OuterExpressionExcludes"] = -2147483648 /* HasComputedFlags */] = "OuterExpressionExcludes";
  TransformFlags3[TransformFlags3["PropertyAccessExcludes"] = -2147483648 /* OuterExpressionExcludes */] = "PropertyAccessExcludes";
  TransformFlags3[TransformFlags3["NodeExcludes"] = -2147483648 /* PropertyAccessExcludes */] = "NodeExcludes";
  TransformFlags3[TransformFlags3["ArrowFunctionExcludes"] = -2072174592] = "ArrowFunctionExcludes";
  TransformFlags3[TransformFlags3["FunctionExcludes"] = -1937940480] = "FunctionExcludes";
  TransformFlags3[TransformFlags3["ConstructorExcludes"] = -1937948672] = "ConstructorExcludes";
  TransformFlags3[TransformFlags3["MethodOrAccessorExcludes"] = -2005057536] = "MethodOrAccessorExcludes";
  TransformFlags3[TransformFlags3["PropertyExcludes"] = -2013249536] = "PropertyExcludes";
  TransformFlags3[TransformFlags3["ClassExcludes"] = -2147344384] = "ClassExcludes";
  TransformFlags3[TransformFlags3["ModuleExcludes"] = -1941676032] = "ModuleExcludes";
  TransformFlags3[TransformFlags3["TypeExcludes"] = -2] = "TypeExcludes";
  TransformFlags3[TransformFlags3["ObjectLiteralExcludes"] = -2147278848] = "ObjectLiteralExcludes";
  TransformFlags3[TransformFlags3["ArrayLiteralOrCallOrNewExcludes"] = -2147450880] = "ArrayLiteralOrCallOrNewExcludes";
  TransformFlags3[TransformFlags3["VariableDeclarationListExcludes"] = -2146893824] = "VariableDeclarationListExcludes";
  TransformFlags3[TransformFlags3["ParameterExcludes"] = -2147483648 /* NodeExcludes */] = "ParameterExcludes";
  TransformFlags3[TransformFlags3["CatchClauseExcludes"] = -2147418112] = "CatchClauseExcludes";
  TransformFlags3[TransformFlags3["BindingPatternExcludes"] = -2147450880] = "BindingPatternExcludes";
  TransformFlags3[TransformFlags3["ContainsLexicalThisOrSuper"] = 134234112] = "ContainsLexicalThisOrSuper";
  TransformFlags3[TransformFlags3["PropertyNamePropagatingFlags"] = 134234112] = "PropertyNamePropagatingFlags";
  return TransformFlags3;
})(TransformFlags || {});
var SnippetKind = /* @__PURE__ */ ((SnippetKind3) => {
  SnippetKind3[SnippetKind3["TabStop"] = 0] = "TabStop";
  SnippetKind3[SnippetKind3["Placeholder"] = 1] = "Placeholder";
  SnippetKind3[SnippetKind3["Choice"] = 2] = "Choice";
  SnippetKind3[SnippetKind3["Variable"] = 3] = "Variable";
  return SnippetKind3;
})(SnippetKind || {});
var EmitFlags = /* @__PURE__ */ ((EmitFlags3) => {
  EmitFlags3[EmitFlags3["None"] = 0] = "None";
  EmitFlags3[EmitFlags3["SingleLine"] = 1] = "SingleLine";
  EmitFlags3[EmitFlags3["MultiLine"] = 2] = "MultiLine";
  EmitFlags3[EmitFlags3["AdviseOnEmitNode"] = 4] = "AdviseOnEmitNode";
  EmitFlags3[EmitFlags3["NoSubstitution"] = 8] = "NoSubstitution";
  EmitFlags3[EmitFlags3["CapturesThis"] = 16] = "CapturesThis";
  EmitFlags3[EmitFlags3["NoLeadingSourceMap"] = 32] = "NoLeadingSourceMap";
  EmitFlags3[EmitFlags3["NoTrailingSourceMap"] = 64] = "NoTrailingSourceMap";
  EmitFlags3[EmitFlags3["NoSourceMap"] = 96] = "NoSourceMap";
  EmitFlags3[EmitFlags3["NoNestedSourceMaps"] = 128] = "NoNestedSourceMaps";
  EmitFlags3[EmitFlags3["NoTokenLeadingSourceMaps"] = 256] = "NoTokenLeadingSourceMaps";
  EmitFlags3[EmitFlags3["NoTokenTrailingSourceMaps"] = 512] = "NoTokenTrailingSourceMaps";
  EmitFlags3[EmitFlags3["NoTokenSourceMaps"] = 768] = "NoTokenSourceMaps";
  EmitFlags3[EmitFlags3["NoLeadingComments"] = 1024] = "NoLeadingComments";
  EmitFlags3[EmitFlags3["NoTrailingComments"] = 2048] = "NoTrailingComments";
  EmitFlags3[EmitFlags3["NoComments"] = 3072] = "NoComments";
  EmitFlags3[EmitFlags3["NoNestedComments"] = 4096] = "NoNestedComments";
  EmitFlags3[EmitFlags3["HelperName"] = 8192] = "HelperName";
  EmitFlags3[EmitFlags3["ExportName"] = 16384] = "ExportName";
  EmitFlags3[EmitFlags3["LocalName"] = 32768] = "LocalName";
  EmitFlags3[EmitFlags3["InternalName"] = 65536] = "InternalName";
  EmitFlags3[EmitFlags3["Indented"] = 131072] = "Indented";
  EmitFlags3[EmitFlags3["NoIndentation"] = 262144] = "NoIndentation";
  EmitFlags3[EmitFlags3["AsyncFunctionBody"] = 524288] = "AsyncFunctionBody";
  EmitFlags3[EmitFlags3["ReuseTempVariableScope"] = 1048576] = "ReuseTempVariableScope";
  EmitFlags3[EmitFlags3["CustomPrologue"] = 2097152] = "CustomPrologue";
  EmitFlags3[EmitFlags3["NoHoisting"] = 4194304] = "NoHoisting";
  EmitFlags3[EmitFlags3["Iterator"] = 8388608] = "Iterator";
  EmitFlags3[EmitFlags3["NoAsciiEscaping"] = 16777216] = "NoAsciiEscaping";
  return EmitFlags3;
})(EmitFlags || {});
var LanguageFeatureMinimumTarget = {
  Classes: 2 /* ES2015 */,
  ForOf: 2 /* ES2015 */,
  Generators: 2 /* ES2015 */,
  Iteration: 2 /* ES2015 */,
  SpreadElements: 2 /* ES2015 */,
  RestElements: 2 /* ES2015 */,
  TaggedTemplates: 2 /* ES2015 */,
  DestructuringAssignment: 2 /* ES2015 */,
  BindingPatterns: 2 /* ES2015 */,
  ArrowFunctions: 2 /* ES2015 */,
  BlockScopedVariables: 2 /* ES2015 */,
  ObjectAssign: 2 /* ES2015 */,
  RegularExpressionFlagsUnicode: 2 /* ES2015 */,
  RegularExpressionFlagsSticky: 2 /* ES2015 */,
  Exponentiation: 3 /* ES2016 */,
  AsyncFunctions: 4 /* ES2017 */,
  ForAwaitOf: 5 /* ES2018 */,
  AsyncGenerators: 5 /* ES2018 */,
  AsyncIteration: 5 /* ES2018 */,
  ObjectSpreadRest: 5 /* ES2018 */,
  RegularExpressionFlagsDotAll: 5 /* ES2018 */,
  BindinglessCatch: 6 /* ES2019 */,
  BigInt: 7 /* ES2020 */,
  NullishCoalesce: 7 /* ES2020 */,
  OptionalChaining: 7 /* ES2020 */,
  LogicalAssignment: 8 /* ES2021 */,
  TopLevelAwait: 9 /* ES2022 */,
  ClassFields: 9 /* ES2022 */,
  PrivateNamesAndClassStaticBlocks: 9 /* ES2022 */,
  RegularExpressionFlagsHasIndices: 9 /* ES2022 */,
  ShebangComments: 10 /* ES2023 */,
  RegularExpressionFlagsUnicodeSets: 11 /* ES2024 */,
  UsingAndAwaitUsing: 99 /* ESNext */,
  ClassAndClassElementDecorators: 99 /* ESNext */
};
var commentPragmas = {
  "reference": {
    args: [
      { name: "types", optional: true, captureSpan: true },
      { name: "lib", optional: true, captureSpan: true },
      { name: "path", optional: true, captureSpan: true },
      { name: "no-default-lib", optional: true },
      { name: "resolution-mode", optional: true },
      { name: "preserve", optional: true }
    ],
    kind: 1 /* TripleSlashXML */
  },
  "amd-dependency": {
    args: [{ name: "path" }, { name: "name", optional: true }],
    kind: 1 /* TripleSlashXML */
  },
  "amd-module": {
    args: [{ name: "name" }],
    kind: 1 /* TripleSlashXML */
  },
  "ts-check": {
    kind: 2 /* SingleLine */
  },
  "ts-nocheck": {
    kind: 2 /* SingleLine */
  },
  "jsx": {
    args: [{ name: "factory" }],
    kind: 4 /* MultiLine */
  },
  "jsxfrag": {
    args: [{ name: "factory" }],
    kind: 4 /* MultiLine */
  },
  "jsximportsource": {
    args: [{ name: "factory" }],
    kind: 4 /* MultiLine */
  },
  "jsxruntime": {
    args: [{ name: "factory" }],
    kind: 4 /* MultiLine */
  }
};
var JSDocParsingMode = /* @__PURE__ */ ((JSDocParsingMode6) => {
  JSDocParsingMode6[JSDocParsingMode6["ParseAll"] = 0] = "ParseAll";
  JSDocParsingMode6[JSDocParsingMode6["ParseNone"] = 1] = "ParseNone";
  JSDocParsingMode6[JSDocParsingMode6["ParseForTypeErrors"] = 2] = "ParseForTypeErrors";
  JSDocParsingMode6[JSDocParsingMode6["ParseForTypeInfo"] = 3] = "ParseForTypeInfo";
  return JSDocParsingMode6;
})(JSDocParsingMode || {});
var directorySeparator = "/";
var altDirectorySeparator = "\\";
var urlSchemeSeparator = "://";
var backslashRegExp = /\\/g;
function isAnyDirectorySeparator(charCode) {
  return charCode === 47 /* slash */ || charCode === 92 /* backslash */;
}
function fileExtensionIs(path, extension) {
  return path.length > extension.length && endsWith(path, extension);
}
function hasTrailingDirectorySeparator(path) {
  return path.length > 0 && isAnyDirectorySeparator(path.charCodeAt(path.length - 1));
}
function isVolumeCharacter(charCode) {
  return charCode >= 97 /* a */ && charCode <= 122 /* z */ || charCode >= 65 /* A */ && charCode <= 90 /* Z */;
}
function getFileUrlVolumeSeparatorEnd(url, start) {
  const ch0 = url.charCodeAt(start);
  if (ch0 === 58 /* colon */) return start + 1;
  if (ch0 === 37 /* percent */ && url.charCodeAt(start + 1) === 51 /* _3 */) {
    const ch2 = url.charCodeAt(start + 2);
    if (ch2 === 97 /* a */ || ch2 === 65 /* A */) return start + 3;
  }
  return -1;
}
function getEncodedRootLength(path) {
  if (!path) return 0;
  const ch0 = path.charCodeAt(0);
  if (ch0 === 47 /* slash */ || ch0 === 92 /* backslash */) {
    if (path.charCodeAt(1) !== ch0) return 1;
    const p1 = path.indexOf(ch0 === 47 /* slash */ ? directorySeparator : altDirectorySeparator, 2);
    if (p1 < 0) return path.length;
    return p1 + 1;
  }
  if (isVolumeCharacter(ch0) && path.charCodeAt(1) === 58 /* colon */) {
    const ch2 = path.charCodeAt(2);
    if (ch2 === 47 /* slash */ || ch2 === 92 /* backslash */) return 3;
    if (path.length === 2) return 2;
  }
  const schemeEnd = path.indexOf(urlSchemeSeparator);
  if (schemeEnd !== -1) {
    const authorityStart = schemeEnd + urlSchemeSeparator.length;
    const authorityEnd = path.indexOf(directorySeparator, authorityStart);
    if (authorityEnd !== -1) {
      const scheme = path.slice(0, schemeEnd);
      const authority = path.slice(authorityStart, authorityEnd);
      if (scheme === "file" && (authority === "" || authority === "localhost") && isVolumeCharacter(path.charCodeAt(authorityEnd + 1))) {
        const volumeSeparatorEnd = getFileUrlVolumeSeparatorEnd(path, authorityEnd + 2);
        if (volumeSeparatorEnd !== -1) {
          if (path.charCodeAt(volumeSeparatorEnd) === 47 /* slash */) {
            return ~(volumeSeparatorEnd + 1);
          }
          if (volumeSeparatorEnd === path.length) {
            return ~volumeSeparatorEnd;
          }
        }
      }
      return ~(authorityEnd + 1);
    }
    return ~path.length;
  }
  return 0;
}
function getRootLength(path) {
  const rootLength = getEncodedRootLength(path);
  return rootLength < 0 ? ~rootLength : rootLength;
}
function getBaseFileName(path, extensions, ignoreCase) {
  path = normalizeSlashes(path);
  const rootLength = getRootLength(path);
  if (rootLength === path.length) return "";
  path = removeTrailingDirectorySeparator(path);
  const name = path.slice(Math.max(getRootLength(path), path.lastIndexOf(directorySeparator) + 1));
  const extension = extensions !== void 0 && ignoreCase !== void 0 ? getAnyExtensionFromPath(name, extensions, ignoreCase) : void 0;
  return extension ? name.slice(0, name.length - extension.length) : name;
}
function tryGetExtensionFromPath(path, extension, stringEqualityComparer) {
  if (!startsWith(extension, ".")) extension = "." + extension;
  if (path.length >= extension.length && path.charCodeAt(path.length - extension.length) === 46 /* dot */) {
    const pathExtension = path.slice(path.length - extension.length);
    if (stringEqualityComparer(pathExtension, extension)) {
      return pathExtension;
    }
  }
}
function getAnyExtensionFromPathWorker(path, extensions, stringEqualityComparer) {
  if (typeof extensions === "string") {
    return tryGetExtensionFromPath(path, extensions, stringEqualityComparer) || "";
  }
  for (const extension of extensions) {
    const result = tryGetExtensionFromPath(path, extension, stringEqualityComparer);
    if (result) return result;
  }
  return "";
}
function getAnyExtensionFromPath(path, extensions, ignoreCase) {
  if (extensions) {
    return getAnyExtensionFromPathWorker(removeTrailingDirectorySeparator(path), extensions, ignoreCase ? equateStringsCaseInsensitive : equateStringsCaseSensitive);
  }
  const baseFileName = getBaseFileName(path);
  const extensionIndex = baseFileName.lastIndexOf(".");
  if (extensionIndex >= 0) {
    return baseFileName.substring(extensionIndex);
  }
  return "";
}
function normalizeSlashes(path) {
  return path.includes("\\") ? path.replace(backslashRegExp, directorySeparator) : path;
}
function combinePaths(path, ...paths) {
  if (path) path = normalizeSlashes(path);
  for (let relativePath of paths) {
    if (!relativePath) continue;
    relativePath = normalizeSlashes(relativePath);
    if (!path || getRootLength(relativePath) !== 0) {
      path = relativePath;
    } else {
      path = ensureTrailingDirectorySeparator(path) + relativePath;
    }
  }
  return path;
}
function getNormalizedAbsolutePath(path, currentDirectory) {
  let rootLength = getRootLength(path);
  if (rootLength === 0 && currentDirectory) {
    path = combinePaths(currentDirectory, path);
    rootLength = getRootLength(path);
  } else {
    path = normalizeSlashes(path);
  }
  const simpleNormalized = simpleNormalizePath(path);
  if (simpleNormalized !== void 0) {
    return simpleNormalized.length > rootLength ? removeTrailingDirectorySeparator(simpleNormalized) : simpleNormalized;
  }
  const length2 = path.length;
  const root = path.substring(0, rootLength);
  let normalized;
  let index = rootLength;
  let segmentStart = index;
  let normalizedUpTo = index;
  let seenNonDotDotSegment = rootLength !== 0;
  while (index < length2) {
    segmentStart = index;
    let ch = path.charCodeAt(index);
    while (ch === 47 /* slash */ && index + 1 < length2) {
      index++;
      ch = path.charCodeAt(index);
    }
    if (index > segmentStart) {
      normalized ?? (normalized = path.substring(0, segmentStart - 1));
      segmentStart = index;
    }
    let segmentEnd = path.indexOf(directorySeparator, index + 1);
    if (segmentEnd === -1) {
      segmentEnd = length2;
    }
    const segmentLength = segmentEnd - segmentStart;
    if (segmentLength === 1 && path.charCodeAt(index) === 46 /* dot */) {
      normalized ?? (normalized = path.substring(0, normalizedUpTo));
    } else if (segmentLength === 2 && path.charCodeAt(index) === 46 /* dot */ && path.charCodeAt(index + 1) === 46 /* dot */) {
      if (!seenNonDotDotSegment) {
        if (normalized !== void 0) {
          normalized += normalized.length === rootLength ? ".." : "/..";
        } else {
          normalizedUpTo = index + 2;
        }
      } else if (normalized === void 0) {
        if (normalizedUpTo - 2 >= 0) {
          normalized = path.substring(0, Math.max(rootLength, path.lastIndexOf(directorySeparator, normalizedUpTo - 2)));
        } else {
          normalized = path.substring(0, normalizedUpTo);
        }
      } else {
        const lastSlash = normalized.lastIndexOf(directorySeparator);
        if (lastSlash !== -1) {
          normalized = normalized.substring(0, Math.max(rootLength, lastSlash));
        } else {
          normalized = root;
        }
        if (normalized.length === rootLength) {
          seenNonDotDotSegment = rootLength !== 0;
        }
      }
    } else if (normalized !== void 0) {
      if (normalized.length !== rootLength) {
        normalized += directorySeparator;
      }
      seenNonDotDotSegment = true;
      normalized += path.substring(segmentStart, segmentEnd);
    } else {
      seenNonDotDotSegment = true;
      normalizedUpTo = segmentEnd;
    }
    index = segmentEnd + 1;
  }
  return normalized ?? (length2 > rootLength ? removeTrailingDirectorySeparator(path) : path);
}
function normalizePath(path) {
  path = normalizeSlashes(path);
  let normalized = simpleNormalizePath(path);
  if (normalized !== void 0) {
    return normalized;
  }
  normalized = getNormalizedAbsolutePath(path, "");
  return normalized && hasTrailingDirectorySeparator(path) ? ensureTrailingDirectorySeparator(normalized) : normalized;
}
function simpleNormalizePath(path) {
  if (!relativePathSegmentRegExp.test(path)) {
    return path;
  }
  let simplified = path.replace(/\/\.\//g, "/");
  if (simplified.startsWith("./")) {
    simplified = simplified.slice(2);
  }
  if (simplified !== path) {
    path = simplified;
    if (!relativePathSegmentRegExp.test(path)) {
      return path;
    }
  }
  return void 0;
}
function removeTrailingDirectorySeparator(path) {
  if (hasTrailingDirectorySeparator(path)) {
    return path.substr(0, path.length - 1);
  }
  return path;
}
function ensureTrailingDirectorySeparator(path) {
  if (!hasTrailingDirectorySeparator(path)) {
    return path + directorySeparator;
  }
  return path;
}
var relativePathSegmentRegExp = /\/\/|(?:^|\/)\.\.?(?:$|\/)/;
function diag(code, category, key, message, reportsUnnecessary, elidedInCompatabilityPyramid, reportsDeprecated) {
  return { code, category, key, message, reportsUnnecessary, elidedInCompatabilityPyramid, reportsDeprecated };
}
var Diagnostics = {
  Unterminated_string_literal: diag(1002, 1 /* Error */, "Unterminated_string_literal_1002", "Unterminated string literal."),
  Identifier_expected: diag(1003, 1 /* Error */, "Identifier_expected_1003", "Identifier expected."),
  _0_expected: diag(1005, 1 /* Error */, "_0_expected_1005", "'{0}' expected."),
  The_parser_expected_to_find_a_1_to_match_the_0_token_here: diag(1007, 1 /* Error */, "The_parser_expected_to_find_a_1_to_match_the_0_token_here_1007", "The parser expected to find a '{1}' to match the '{0}' token here."),
  Asterisk_Slash_expected: diag(1010, 1 /* Error */, "Asterisk_Slash_expected_1010", "'*/' expected."),
  An_element_access_expression_should_take_an_argument: diag(1011, 1 /* Error */, "An_element_access_expression_should_take_an_argument_1011", "An element access expression should take an argument."),
  Unexpected_token: diag(1012, 1 /* Error */, "Unexpected_token_1012", "Unexpected token."),
  super_must_be_followed_by_an_argument_list_or_member_access: diag(1034, 1 /* Error */, "super_must_be_followed_by_an_argument_list_or_member_access_1034", "'super' must be followed by an argument list or member access."),
  Unexpected_token_A_constructor_method_accessor_or_property_was_expected: diag(1068, 1 /* Error */, "Unexpected_token_A_constructor_method_accessor_or_property_was_expected_1068", "Unexpected token. A constructor, method, accessor, or property was expected."),
  Unexpected_token_A_type_parameter_name_was_expected_without_curly_braces: diag(1069, 1 /* Error */, "Unexpected_token_A_type_parameter_name_was_expected_without_curly_braces_1069", "Unexpected token. A type parameter name was expected without curly braces."),
  Invalid_reference_directive_syntax: diag(1084, 1 /* Error */, "Invalid_reference_directive_syntax_1084", "Invalid 'reference' directive syntax."),
  Expression_expected: diag(1109, 1 /* Error */, "Expression_expected_1109", "Expression expected."),
  Type_expected: diag(1110, 1 /* Error */, "Type_expected_1110", "Type expected."),
  Octal_literals_are_not_allowed_Use_the_syntax_0: diag(1121, 1 /* Error */, "Octal_literals_are_not_allowed_Use_the_syntax_0_1121", "Octal literals are not allowed. Use the syntax '{0}'."),
  Digit_expected: diag(1124, 1 /* Error */, "Digit_expected_1124", "Digit expected."),
  Hexadecimal_digit_expected: diag(1125, 1 /* Error */, "Hexadecimal_digit_expected_1125", "Hexadecimal digit expected."),
  Unexpected_end_of_text: diag(1126, 1 /* Error */, "Unexpected_end_of_text_1126", "Unexpected end of text."),
  Invalid_character: diag(1127, 1 /* Error */, "Invalid_character_1127", "Invalid character."),
  Declaration_or_statement_expected: diag(1128, 1 /* Error */, "Declaration_or_statement_expected_1128", "Declaration or statement expected."),
  Statement_expected: diag(1129, 1 /* Error */, "Statement_expected_1129", "Statement expected."),
  case_or_default_expected: diag(1130, 1 /* Error */, "case_or_default_expected_1130", "'case' or 'default' expected."),
  Property_or_signature_expected: diag(1131, 1 /* Error */, "Property_or_signature_expected_1131", "Property or signature expected."),
  Enum_member_expected: diag(1132, 1 /* Error */, "Enum_member_expected_1132", "Enum member expected."),
  Variable_declaration_expected: diag(1134, 1 /* Error */, "Variable_declaration_expected_1134", "Variable declaration expected."),
  Argument_expression_expected: diag(1135, 1 /* Error */, "Argument_expression_expected_1135", "Argument expression expected."),
  Property_assignment_expected: diag(1136, 1 /* Error */, "Property_assignment_expected_1136", "Property assignment expected."),
  Expression_or_comma_expected: diag(1137, 1 /* Error */, "Expression_or_comma_expected_1137", "Expression or comma expected."),
  Parameter_declaration_expected: diag(1138, 1 /* Error */, "Parameter_declaration_expected_1138", "Parameter declaration expected."),
  Type_parameter_declaration_expected: diag(1139, 1 /* Error */, "Type_parameter_declaration_expected_1139", "Type parameter declaration expected."),
  Type_argument_expected: diag(1140, 1 /* Error */, "Type_argument_expected_1140", "Type argument expected."),
  Line_break_not_permitted_here: diag(1142, 1 /* Error */, "Line_break_not_permitted_here_1142", "Line break not permitted here."),
  or_expected: diag(1144, 1 /* Error */, "or_expected_1144", "'{' or ';' expected."),
  or_JSX_element_expected: diag(1145, 1 /* Error */, "or_JSX_element_expected_1145", "'{' or JSX element expected."),
  Declaration_expected: diag(1146, 1 /* Error */, "Declaration_expected_1146", "Declaration expected."),
  Unterminated_template_literal: diag(1160, 1 /* Error */, "Unterminated_template_literal_1160", "Unterminated template literal."),
  Unterminated_regular_expression_literal: diag(1161, 1 /* Error */, "Unterminated_regular_expression_literal_1161", "Unterminated regular expression literal."),
  Binary_digit_expected: diag(1177, 1 /* Error */, "Binary_digit_expected_1177", "Binary digit expected."),
  Octal_digit_expected: diag(1178, 1 /* Error */, "Octal_digit_expected_1178", "Octal digit expected."),
  Unexpected_token_expected: diag(1179, 1 /* Error */, "Unexpected_token_expected_1179", "Unexpected token. '{' expected."),
  Property_destructuring_pattern_expected: diag(1180, 1 /* Error */, "Property_destructuring_pattern_expected_1180", "Property destructuring pattern expected."),
  Array_element_destructuring_pattern_expected: diag(1181, 1 /* Error */, "Array_element_destructuring_pattern_expected_1181", "Array element destructuring pattern expected."),
  Merge_conflict_marker_encountered: diag(1185, 1 /* Error */, "Merge_conflict_marker_encountered_1185", "Merge conflict marker encountered."),
  An_extended_Unicode_escape_value_must_be_between_0x0_and_0x10FFFF_inclusive: diag(1198, 1 /* Error */, "An_extended_Unicode_escape_value_must_be_between_0x0_and_0x10FFFF_inclusive_1198", "An extended Unicode escape value must be between 0x0 and 0x10FFFF inclusive."),
  Unterminated_Unicode_escape_sequence: diag(1199, 1 /* Error */, "Unterminated_Unicode_escape_sequence_1199", "Unterminated Unicode escape sequence."),
  Invalid_optional_chain_from_new_expression_Did_you_mean_to_call_0: diag(1209, 1 /* Error */, "Invalid_optional_chain_from_new_expression_Did_you_mean_to_call_0_1209", "Invalid optional chain from new expression. Did you mean to call '{0}()'?"),
  _0_tag_already_specified: diag(1223, 1 /* Error */, "_0_tag_already_specified_1223", "'{0}' tag already specified."),
  A_type_predicate_is_only_allowed_in_return_type_position_for_functions_and_methods: diag(1228, 1 /* Error */, "A_type_predicate_is_only_allowed_in_return_type_position_for_functions_and_methods_1228", "A type predicate is only allowed in return type position for functions and methods."),
  Keywords_cannot_contain_escape_characters: diag(1260, 1 /* Error */, "Keywords_cannot_contain_escape_characters_1260", "Keywords cannot contain escape characters."),
  String_literal_with_double_quotes_expected: diag(1327, 1 /* Error */, "String_literal_with_double_quotes_expected_1327", "String literal with double quotes expected."),
  Property_value_can_only_be_string_literal_numeric_literal_true_false_null_object_literal_or_array_literal: diag(1328, 1 /* Error */, "Property_value_can_only_be_string_literal_numeric_literal_true_false_null_object_literal_or_array_li_1328", "Property value can only be string literal, numeric literal, 'true', 'false', 'null', object literal or array literal."),
  An_identifier_or_keyword_cannot_immediately_follow_a_numeric_literal: diag(1351, 1 /* Error */, "An_identifier_or_keyword_cannot_immediately_follow_a_numeric_literal_1351", "An identifier or keyword cannot immediately follow a numeric literal."),
  A_bigint_literal_cannot_use_exponential_notation: diag(1352, 1 /* Error */, "A_bigint_literal_cannot_use_exponential_notation_1352", "A bigint literal cannot use exponential notation."),
  A_bigint_literal_must_be_an_integer: diag(1353, 1 /* Error */, "A_bigint_literal_must_be_an_integer_1353", "A bigint literal must be an integer."),
  An_enum_member_name_must_be_followed_by_a_or: diag(1357, 1 /* Error */, "An_enum_member_name_must_be_followed_by_a_or_1357", "An enum member name must be followed by a ',', '=', or '}'."),
  Identifier_expected_0_is_a_reserved_word_that_cannot_be_used_here: diag(1359, 1 /* Error */, "Identifier_expected_0_is_a_reserved_word_that_cannot_be_used_here_1359", "Identifier expected. '{0}' is a reserved word that cannot be used here."),
  Did_you_mean_0: diag(1369, 3 /* Message */, "Did_you_mean_0_1369", "Did you mean '{0}'?"),
  Unexpected_token_Did_you_mean_or_rbrace: diag(1381, 1 /* Error */, "Unexpected_token_Did_you_mean_or_rbrace_1381", "Unexpected token. Did you mean `{'}'}` or `&rbrace;`?"),
  Unexpected_token_Did_you_mean_or_gt: diag(1382, 1 /* Error */, "Unexpected_token_Did_you_mean_or_gt_1382", "Unexpected token. Did you mean `{'>'}` or `&gt;`?"),
  Function_type_notation_must_be_parenthesized_when_used_in_a_union_type: diag(1385, 1 /* Error */, "Function_type_notation_must_be_parenthesized_when_used_in_a_union_type_1385", "Function type notation must be parenthesized when used in a union type."),
  Constructor_type_notation_must_be_parenthesized_when_used_in_a_union_type: diag(1386, 1 /* Error */, "Constructor_type_notation_must_be_parenthesized_when_used_in_a_union_type_1386", "Constructor type notation must be parenthesized when used in a union type."),
  Function_type_notation_must_be_parenthesized_when_used_in_an_intersection_type: diag(1387, 1 /* Error */, "Function_type_notation_must_be_parenthesized_when_used_in_an_intersection_type_1387", "Function type notation must be parenthesized when used in an intersection type."),
  Constructor_type_notation_must_be_parenthesized_when_used_in_an_intersection_type: diag(1388, 1 /* Error */, "Constructor_type_notation_must_be_parenthesized_when_used_in_an_intersection_type_1388", "Constructor type notation must be parenthesized when used in an intersection type."),
  _0_is_not_allowed_as_a_variable_declaration_name: diag(1389, 1 /* Error */, "_0_is_not_allowed_as_a_variable_declaration_name_1389", "'{0}' is not allowed as a variable declaration name."),
  _0_is_not_allowed_as_a_parameter_name: diag(1390, 1 /* Error */, "_0_is_not_allowed_as_a_parameter_name_1390", "'{0}' is not allowed as a parameter name."),
  Neither_decorators_nor_modifiers_may_be_applied_to_this_parameters: diag(1433, 1 /* Error */, "Neither_decorators_nor_modifiers_may_be_applied_to_this_parameters_1433", "Neither decorators nor modifiers may be applied to 'this' parameters."),
  Unexpected_keyword_or_identifier: diag(1434, 1 /* Error */, "Unexpected_keyword_or_identifier_1434", "Unexpected keyword or identifier."),
  Unknown_keyword_or_identifier_Did_you_mean_0: diag(1435, 1 /* Error */, "Unknown_keyword_or_identifier_Did_you_mean_0_1435", "Unknown keyword or identifier. Did you mean '{0}'?"),
  Decorators_must_precede_the_name_and_all_keywords_of_property_declarations: diag(1436, 1 /* Error */, "Decorators_must_precede_the_name_and_all_keywords_of_property_declarations_1436", "Decorators must precede the name and all keywords of property declarations."),
  Namespace_must_be_given_a_name: diag(1437, 1 /* Error */, "Namespace_must_be_given_a_name_1437", "Namespace must be given a name."),
  Interface_must_be_given_a_name: diag(1438, 1 /* Error */, "Interface_must_be_given_a_name_1438", "Interface must be given a name."),
  Type_alias_must_be_given_a_name: diag(1439, 1 /* Error */, "Type_alias_must_be_given_a_name_1439", "Type alias must be given a name."),
  Variable_declaration_not_allowed_at_this_location: diag(1440, 1 /* Error */, "Variable_declaration_not_allowed_at_this_location_1440", "Variable declaration not allowed at this location."),
  Cannot_start_a_function_call_in_a_type_annotation: diag(1441, 1 /* Error */, "Cannot_start_a_function_call_in_a_type_annotation_1441", "Cannot start a function call in a type annotation."),
  Expected_for_property_initializer: diag(1442, 1 /* Error */, "Expected_for_property_initializer_1442", "Expected '=' for property initializer."),
  Module_declaration_names_may_only_use_or_quoted_strings: diag(1443, 1 /* Error */, "Module_declaration_names_may_only_use_or_quoted_strings_1443", `Module declaration names may only use ' or " quoted strings.`),
  resolution_mode_should_be_either_require_or_import: diag(1453, 1 /* Error */, "resolution_mode_should_be_either_require_or_import_1453", "`resolution-mode` should be either `require` or `import`."),
  catch_or_finally_expected: diag(1472, 1 /* Error */, "catch_or_finally_expected_1472", "'catch' or 'finally' expected."),
  An_instantiation_expression_cannot_be_followed_by_a_property_access: diag(1477, 1 /* Error */, "An_instantiation_expression_cannot_be_followed_by_a_property_access_1477", "An instantiation expression cannot be followed by a property access."),
  Identifier_or_string_literal_expected: diag(1478, 1 /* Error */, "Identifier_or_string_literal_expected_1478", "Identifier or string literal expected."),
  Octal_escape_sequences_are_not_allowed_Use_the_syntax_0: diag(1487, 1 /* Error */, "Octal_escape_sequences_are_not_allowed_Use_the_syntax_0_1487", "Octal escape sequences are not allowed. Use the syntax '{0}'."),
  Escape_sequence_0_is_not_allowed: diag(1488, 1 /* Error */, "Escape_sequence_0_is_not_allowed_1488", "Escape sequence '{0}' is not allowed."),
  Decimals_with_leading_zeros_are_not_allowed: diag(1489, 1 /* Error */, "Decimals_with_leading_zeros_are_not_allowed_1489", "Decimals with leading zeros are not allowed."),
  File_appears_to_be_binary: diag(1490, 1 /* Error */, "File_appears_to_be_binary_1490", "File appears to be binary."),
  Unknown_regular_expression_flag: diag(1499, 1 /* Error */, "Unknown_regular_expression_flag_1499", "Unknown regular expression flag."),
  Duplicate_regular_expression_flag: diag(1500, 1 /* Error */, "Duplicate_regular_expression_flag_1500", "Duplicate regular expression flag."),
  This_regular_expression_flag_is_only_available_when_targeting_0_or_later: diag(1501, 1 /* Error */, "This_regular_expression_flag_is_only_available_when_targeting_0_or_later_1501", "This regular expression flag is only available when targeting '{0}' or later."),
  The_Unicode_u_flag_and_the_Unicode_Sets_v_flag_cannot_be_set_simultaneously: diag(1502, 1 /* Error */, "The_Unicode_u_flag_and_the_Unicode_Sets_v_flag_cannot_be_set_simultaneously_1502", "The Unicode (u) flag and the Unicode Sets (v) flag cannot be set simultaneously."),
  Named_capturing_groups_are_only_available_when_targeting_ES2018_or_later: diag(1503, 1 /* Error */, "Named_capturing_groups_are_only_available_when_targeting_ES2018_or_later_1503", "Named capturing groups are only available when targeting 'ES2018' or later."),
  Subpattern_flags_must_be_present_when_there_is_a_minus_sign: diag(1504, 1 /* Error */, "Subpattern_flags_must_be_present_when_there_is_a_minus_sign_1504", "Subpattern flags must be present when there is a minus sign."),
  Incomplete_quantifier_Digit_expected: diag(1505, 1 /* Error */, "Incomplete_quantifier_Digit_expected_1505", "Incomplete quantifier. Digit expected."),
  Numbers_out_of_order_in_quantifier: diag(1506, 1 /* Error */, "Numbers_out_of_order_in_quantifier_1506", "Numbers out of order in quantifier."),
  There_is_nothing_available_for_repetition: diag(1507, 1 /* Error */, "There_is_nothing_available_for_repetition_1507", "There is nothing available for repetition."),
  Unexpected_0_Did_you_mean_to_escape_it_with_backslash: diag(1508, 1 /* Error */, "Unexpected_0_Did_you_mean_to_escape_it_with_backslash_1508", "Unexpected '{0}'. Did you mean to escape it with backslash?"),
  This_regular_expression_flag_cannot_be_toggled_within_a_subpattern: diag(1509, 1 /* Error */, "This_regular_expression_flag_cannot_be_toggled_within_a_subpattern_1509", "This regular expression flag cannot be toggled within a subpattern."),
  k_must_be_followed_by_a_capturing_group_name_enclosed_in_angle_brackets: diag(1510, 1 /* Error */, "k_must_be_followed_by_a_capturing_group_name_enclosed_in_angle_brackets_1510", "'\\k' must be followed by a capturing group name enclosed in angle brackets."),
  q_is_only_available_inside_character_class: diag(1511, 1 /* Error */, "q_is_only_available_inside_character_class_1511", "'\\q' is only available inside character class."),
  c_must_be_followed_by_an_ASCII_letter: diag(1512, 1 /* Error */, "c_must_be_followed_by_an_ASCII_letter_1512", "'\\c' must be followed by an ASCII letter."),
  Undetermined_character_escape: diag(1513, 1 /* Error */, "Undetermined_character_escape_1513", "Undetermined character escape."),
  Expected_a_capturing_group_name: diag(1514, 1 /* Error */, "Expected_a_capturing_group_name_1514", "Expected a capturing group name."),
  Named_capturing_groups_with_the_same_name_must_be_mutually_exclusive_to_each_other: diag(1515, 1 /* Error */, "Named_capturing_groups_with_the_same_name_must_be_mutually_exclusive_to_each_other_1515", "Named capturing groups with the same name must be mutually exclusive to each other."),
  A_character_class_range_must_not_be_bounded_by_another_character_class: diag(1516, 1 /* Error */, "A_character_class_range_must_not_be_bounded_by_another_character_class_1516", "A character class range must not be bounded by another character class."),
  Range_out_of_order_in_character_class: diag(1517, 1 /* Error */, "Range_out_of_order_in_character_class_1517", "Range out of order in character class."),
  Anything_that_would_possibly_match_more_than_a_single_character_is_invalid_inside_a_negated_character_class: diag(1518, 1 /* Error */, "Anything_that_would_possibly_match_more_than_a_single_character_is_invalid_inside_a_negated_characte_1518", "Anything that would possibly match more than a single character is invalid inside a negated character class."),
  Operators_must_not_be_mixed_within_a_character_class_Wrap_it_in_a_nested_class_instead: diag(1519, 1 /* Error */, "Operators_must_not_be_mixed_within_a_character_class_Wrap_it_in_a_nested_class_instead_1519", "Operators must not be mixed within a character class. Wrap it in a nested class instead."),
  Expected_a_class_set_operand: diag(1520, 1 /* Error */, "Expected_a_class_set_operand_1520", "Expected a class set operand."),
  q_must_be_followed_by_string_alternatives_enclosed_in_braces: diag(1521, 1 /* Error */, "q_must_be_followed_by_string_alternatives_enclosed_in_braces_1521", "'\\q' must be followed by string alternatives enclosed in braces."),
  A_character_class_must_not_contain_a_reserved_double_punctuator_Did_you_mean_to_escape_it_with_backslash: diag(1522, 1 /* Error */, "A_character_class_must_not_contain_a_reserved_double_punctuator_Did_you_mean_to_escape_it_with_backs_1522", "A character class must not contain a reserved double punctuator. Did you mean to escape it with backslash?"),
  Expected_a_Unicode_property_name: diag(1523, 1 /* Error */, "Expected_a_Unicode_property_name_1523", "Expected a Unicode property name."),
  Unknown_Unicode_property_name: diag(1524, 1 /* Error */, "Unknown_Unicode_property_name_1524", "Unknown Unicode property name."),
  Expected_a_Unicode_property_value: diag(1525, 1 /* Error */, "Expected_a_Unicode_property_value_1525", "Expected a Unicode property value."),
  Unknown_Unicode_property_value: diag(1526, 1 /* Error */, "Unknown_Unicode_property_value_1526", "Unknown Unicode property value."),
  Expected_a_Unicode_property_name_or_value: diag(1527, 1 /* Error */, "Expected_a_Unicode_property_name_or_value_1527", "Expected a Unicode property name or value."),
  Any_Unicode_property_that_would_possibly_match_more_than_a_single_character_is_only_available_when_the_Unicode_Sets_v_flag_is_set: diag(1528, 1 /* Error */, "Any_Unicode_property_that_would_possibly_match_more_than_a_single_character_is_only_available_when_t_1528", "Any Unicode property that would possibly match more than a single character is only available when the Unicode Sets (v) flag is set."),
  Unknown_Unicode_property_name_or_value: diag(1529, 1 /* Error */, "Unknown_Unicode_property_name_or_value_1529", "Unknown Unicode property name or value."),
  Unicode_property_value_expressions_are_only_available_when_the_Unicode_u_flag_or_the_Unicode_Sets_v_flag_is_set: diag(1530, 1 /* Error */, "Unicode_property_value_expressions_are_only_available_when_the_Unicode_u_flag_or_the_Unicode_Sets_v__1530", "Unicode property value expressions are only available when the Unicode (u) flag or the Unicode Sets (v) flag is set."),
  _0_must_be_followed_by_a_Unicode_property_value_expression_enclosed_in_braces: diag(1531, 1 /* Error */, "_0_must_be_followed_by_a_Unicode_property_value_expression_enclosed_in_braces_1531", "'\\{0}' must be followed by a Unicode property value expression enclosed in braces."),
  There_is_no_capturing_group_named_0_in_this_regular_expression: diag(1532, 1 /* Error */, "There_is_no_capturing_group_named_0_in_this_regular_expression_1532", "There is no capturing group named '{0}' in this regular expression."),
  This_backreference_refers_to_a_group_that_does_not_exist_There_are_only_0_capturing_groups_in_this_regular_expression: diag(1533, 1 /* Error */, "This_backreference_refers_to_a_group_that_does_not_exist_There_are_only_0_capturing_groups_in_this_r_1533", "This backreference refers to a group that does not exist. There are only {0} capturing groups in this regular expression."),
  This_backreference_refers_to_a_group_that_does_not_exist_There_are_no_capturing_groups_in_this_regular_expression: diag(1534, 1 /* Error */, "This_backreference_refers_to_a_group_that_does_not_exist_There_are_no_capturing_groups_in_this_regul_1534", "This backreference refers to a group that does not exist. There are no capturing groups in this regular expression."),
  This_character_cannot_be_escaped_in_a_regular_expression: diag(1535, 1 /* Error */, "This_character_cannot_be_escaped_in_a_regular_expression_1535", "This character cannot be escaped in a regular expression."),
  Octal_escape_sequences_and_backreferences_are_not_allowed_in_a_character_class_If_this_was_intended_as_an_escape_sequence_use_the_syntax_0_instead: diag(1536, 1 /* Error */, "Octal_escape_sequences_and_backreferences_are_not_allowed_in_a_character_class_If_this_was_intended__1536", "Octal escape sequences and backreferences are not allowed in a character class. If this was intended as an escape sequence, use the syntax '{0}' instead."),
  Decimal_escape_sequences_and_backreferences_are_not_allowed_in_a_character_class: diag(1537, 1 /* Error */, "Decimal_escape_sequences_and_backreferences_are_not_allowed_in_a_character_class_1537", "Decimal escape sequences and backreferences are not allowed in a character class."),
  Unicode_escape_sequences_are_only_available_when_the_Unicode_u_flag_or_the_Unicode_Sets_v_flag_is_set: diag(1538, 1 /* Error */, "Unicode_escape_sequences_are_only_available_when_the_Unicode_u_flag_or_the_Unicode_Sets_v_flag_is_se_1538", "Unicode escape sequences are only available when the Unicode (u) flag or the Unicode Sets (v) flag is set."),
  Interface_name_cannot_be_0: diag(2427, 1 /* Error */, "Interface_name_cannot_be_0_2427", "Interface name cannot be '{0}'."),
  Type_alias_name_cannot_be_0: diag(2457, 1 /* Error */, "Type_alias_name_cannot_be_0_2457", "Type alias name cannot be '{0}'."),
  An_AMD_module_cannot_have_multiple_name_assignments: diag(2458, 1 /* Error */, "An_AMD_module_cannot_have_multiple_name_assignments_2458", "An AMD module cannot have multiple name assignments."),
  JSX_expressions_must_have_one_parent_element: diag(2657, 1 /* Error */, "JSX_expressions_must_have_one_parent_element_2657", "JSX expressions must have one parent element."),
  super_may_not_use_type_arguments: diag(2754, 1 /* Error */, "super_may_not_use_type_arguments_2754", "'super' may not use type arguments."),
  Declaration_or_statement_expected_This_follows_a_block_of_statements_so_if_you_intended_to_write_a_destructuring_assignment_you_might_need_to_wrap_the_whole_assignment_in_parentheses: diag(2809, 1 /* Error */, "Declaration_or_statement_expected_This_follows_a_block_of_statements_so_if_you_intended_to_write_a_d_2809", "Declaration or statement expected. This '=' follows a block of statements, so if you intended to write a destructuring assignment, you might need to wrap the whole assignment in parentheses."),
  Namespace_name_cannot_be_0: diag(2819, 1 /* Error */, "Namespace_name_cannot_be_0_2819", "Namespace name cannot be '{0}'."),
  Compiler_option_0_requires_a_value_of_type_1: diag(5024, 1 /* Error */, "Compiler_option_0_requires_a_value_of_type_1_5024", "Compiler option '{0}' requires a value of type {1}."),
  VERSION: diag(6036, 3 /* Message */, "VERSION_6036", "VERSION"),
  Numeric_separators_are_not_allowed_here: diag(6188, 1 /* Error */, "Numeric_separators_are_not_allowed_here_6188", "Numeric separators are not allowed here."),
  Multiple_consecutive_numeric_separators_are_not_permitted: diag(6189, 1 /* Error */, "Multiple_consecutive_numeric_separators_are_not_permitted_6189", "Multiple consecutive numeric separators are not permitted."),
  Language_and_Environment: diag(6254, 3 /* Message */, "Language_and_Environment_6254", "Language and Environment"),
  Set_the_JavaScript_language_version_for_emitted_JavaScript_and_include_compatible_library_declarations: diag(6705, 3 /* Message */, "Set_the_JavaScript_language_version_for_emitted_JavaScript_and_include_compatible_library_declaratio_6705", "Set the JavaScript language version for emitted JavaScript and include compatible library declarations."),
  The_0_modifier_can_only_be_used_in_TypeScript_files: diag(8009, 1 /* Error */, "The_0_modifier_can_only_be_used_in_TypeScript_files_8009", "The '{0}' modifier can only be used in TypeScript files."),
  A_JSDoc_typedef_comment_may_not_contain_multiple_type_tags: diag(8033, 1 /* Error */, "A_JSDoc_typedef_comment_may_not_contain_multiple_type_tags_8033", "A JSDoc '@typedef' comment may not contain multiple '@type' tags."),
  The_tag_was_first_specified_here: diag(8034, 1 /* Error */, "The_tag_was_first_specified_here_8034", "The tag was first specified here."),
  A_JSDoc_template_tag_may_not_follow_a_typedef_callback_or_overload_tag: diag(8039, 1 /* Error */, "A_JSDoc_template_tag_may_not_follow_a_typedef_callback_or_overload_tag_8039", "A JSDoc '@template' tag may not follow a '@typedef', '@callback', or '@overload' tag"),
  Expected_corresponding_JSX_closing_tag_for_0: diag(17002, 1 /* Error */, "Expected_corresponding_JSX_closing_tag_for_0_17002", "Expected corresponding JSX closing tag for '{0}'."),
  An_unary_expression_with_the_0_operator_is_not_allowed_in_the_left_hand_side_of_an_exponentiation_expression_Consider_enclosing_the_expression_in_parentheses: diag(17006, 1 /* Error */, "An_unary_expression_with_the_0_operator_is_not_allowed_in_the_left_hand_side_of_an_exponentiation_ex_17006", "An unary expression with the '{0}' operator is not allowed in the left-hand side of an exponentiation expression. Consider enclosing the expression in parentheses."),
  A_type_assertion_expression_is_not_allowed_in_the_left_hand_side_of_an_exponentiation_expression_Consider_enclosing_the_expression_in_parentheses: diag(17007, 1 /* Error */, "A_type_assertion_expression_is_not_allowed_in_the_left_hand_side_of_an_exponentiation_expression_Con_17007", "A type assertion expression is not allowed in the left-hand side of an exponentiation expression. Consider enclosing the expression in parentheses."),
  JSX_element_0_has_no_corresponding_closing_tag: diag(17008, 1 /* Error */, "JSX_element_0_has_no_corresponding_closing_tag_17008", "JSX element '{0}' has no corresponding closing tag."),
  JSX_fragment_has_no_corresponding_closing_tag: diag(17014, 1 /* Error */, "JSX_fragment_has_no_corresponding_closing_tag_17014", "JSX fragment has no corresponding closing tag."),
  Expected_corresponding_closing_tag_for_JSX_fragment: diag(17015, 1 /* Error */, "Expected_corresponding_closing_tag_for_JSX_fragment_17015", "Expected corresponding closing tag for JSX fragment."),
  Unicode_escape_sequence_cannot_appear_here: diag(17021, 1 /* Error */, "Unicode_escape_sequence_cannot_appear_here_17021", "Unicode escape sequence cannot appear here."),
  Private_identifiers_cannot_be_used_as_parameters: diag(18009, 1 /* Error */, "Private_identifiers_cannot_be_used_as_parameters_18009", "Private identifiers cannot be used as parameters."),
  Private_identifiers_are_not_allowed_outside_class_bodies: diag(18016, 1 /* Error */, "Private_identifiers_are_not_allowed_outside_class_bodies_18016", "Private identifiers are not allowed outside class bodies."),
  can_only_be_used_at_the_start_of_a_file: diag(18026, 1 /* Error */, "can_only_be_used_at_the_start_of_a_file_18026", "'#!' can only be used at the start of a file."),
  Private_identifiers_are_not_allowed_in_variable_declarations: diag(18029, 1 /* Error */, "Private_identifiers_are_not_allowed_in_variable_declarations_18029", "Private identifiers are not allowed in variable declarations."),
  An_optional_chain_cannot_contain_private_identifiers: diag(18030, 1 /* Error */, "An_optional_chain_cannot_contain_private_identifiers_18030", "An optional chain cannot contain private identifiers.")
};
function tokenIsIdentifierOrKeyword(token) {
  return token >= 80 /* Identifier */;
}
function tokenIsIdentifierOrKeywordOrGreaterThan(token) {
  return token === 32 /* GreaterThanToken */ || tokenIsIdentifierOrKeyword(token);
}
var textToKeywordObj = {
  abstract: 128 /* AbstractKeyword */,
  accessor: 129 /* AccessorKeyword */,
  any: 133 /* AnyKeyword */,
  as: 130 /* AsKeyword */,
  asserts: 131 /* AssertsKeyword */,
  assert: 132 /* AssertKeyword */,
  bigint: 163 /* BigIntKeyword */,
  boolean: 136 /* BooleanKeyword */,
  break: 83 /* BreakKeyword */,
  case: 84 /* CaseKeyword */,
  catch: 85 /* CatchKeyword */,
  class: 86 /* ClassKeyword */,
  continue: 88 /* ContinueKeyword */,
  const: 87 /* ConstKeyword */,
  ["constructor"]: 137 /* ConstructorKeyword */,
  debugger: 89 /* DebuggerKeyword */,
  declare: 138 /* DeclareKeyword */,
  default: 90 /* DefaultKeyword */,
  defer: 166 /* DeferKeyword */,
  delete: 91 /* DeleteKeyword */,
  do: 92 /* DoKeyword */,
  else: 93 /* ElseKeyword */,
  enum: 94 /* EnumKeyword */,
  export: 95 /* ExportKeyword */,
  extends: 96 /* ExtendsKeyword */,
  false: 97 /* FalseKeyword */,
  finally: 98 /* FinallyKeyword */,
  for: 99 /* ForKeyword */,
  from: 161 /* FromKeyword */,
  function: 100 /* FunctionKeyword */,
  get: 139 /* GetKeyword */,
  if: 101 /* IfKeyword */,
  implements: 119 /* ImplementsKeyword */,
  import: 102 /* ImportKeyword */,
  in: 103 /* InKeyword */,
  infer: 140 /* InferKeyword */,
  instanceof: 104 /* InstanceOfKeyword */,
  interface: 120 /* InterfaceKeyword */,
  intrinsic: 141 /* IntrinsicKeyword */,
  is: 142 /* IsKeyword */,
  keyof: 143 /* KeyOfKeyword */,
  let: 121 /* LetKeyword */,
  module: 144 /* ModuleKeyword */,
  namespace: 145 /* NamespaceKeyword */,
  never: 146 /* NeverKeyword */,
  new: 105 /* NewKeyword */,
  null: 106 /* NullKeyword */,
  number: 150 /* NumberKeyword */,
  object: 151 /* ObjectKeyword */,
  package: 122 /* PackageKeyword */,
  private: 123 /* PrivateKeyword */,
  protected: 124 /* ProtectedKeyword */,
  public: 125 /* PublicKeyword */,
  override: 164 /* OverrideKeyword */,
  out: 147 /* OutKeyword */,
  readonly: 148 /* ReadonlyKeyword */,
  require: 149 /* RequireKeyword */,
  global: 162 /* GlobalKeyword */,
  return: 107 /* ReturnKeyword */,
  satisfies: 152 /* SatisfiesKeyword */,
  set: 153 /* SetKeyword */,
  static: 126 /* StaticKeyword */,
  string: 154 /* StringKeyword */,
  super: 108 /* SuperKeyword */,
  switch: 109 /* SwitchKeyword */,
  symbol: 155 /* SymbolKeyword */,
  this: 110 /* ThisKeyword */,
  throw: 111 /* ThrowKeyword */,
  true: 112 /* TrueKeyword */,
  try: 113 /* TryKeyword */,
  type: 156 /* TypeKeyword */,
  typeof: 114 /* TypeOfKeyword */,
  undefined: 157 /* UndefinedKeyword */,
  unique: 158 /* UniqueKeyword */,
  unknown: 159 /* UnknownKeyword */,
  using: 160 /* UsingKeyword */,
  var: 115 /* VarKeyword */,
  void: 116 /* VoidKeyword */,
  while: 117 /* WhileKeyword */,
  with: 118 /* WithKeyword */,
  yield: 127 /* YieldKeyword */,
  async: 134 /* AsyncKeyword */,
  await: 135 /* AwaitKeyword */,
  of: 165 /* OfKeyword */
};
var textToKeyword = new Map(Object.entries(textToKeywordObj));
var textToToken = new Map(Object.entries({
  ...textToKeywordObj,
  "{": 19 /* OpenBraceToken */,
  "}": 20 /* CloseBraceToken */,
  "(": 21 /* OpenParenToken */,
  ")": 22 /* CloseParenToken */,
  "[": 23 /* OpenBracketToken */,
  "]": 24 /* CloseBracketToken */,
  ".": 25 /* DotToken */,
  "...": 26 /* DotDotDotToken */,
  ";": 27 /* SemicolonToken */,
  ",": 28 /* CommaToken */,
  "<": 30 /* LessThanToken */,
  ">": 32 /* GreaterThanToken */,
  "<=": 33 /* LessThanEqualsToken */,
  ">=": 34 /* GreaterThanEqualsToken */,
  "==": 35 /* EqualsEqualsToken */,
  "!=": 36 /* ExclamationEqualsToken */,
  "===": 37 /* EqualsEqualsEqualsToken */,
  "!==": 38 /* ExclamationEqualsEqualsToken */,
  "=>": 39 /* EqualsGreaterThanToken */,
  "+": 40 /* PlusToken */,
  "-": 41 /* MinusToken */,
  "**": 43 /* AsteriskAsteriskToken */,
  "*": 42 /* AsteriskToken */,
  "/": 44 /* SlashToken */,
  "%": 45 /* PercentToken */,
  "++": 46 /* PlusPlusToken */,
  "--": 47 /* MinusMinusToken */,
  "<<": 48 /* LessThanLessThanToken */,
  "</": 31 /* LessThanSlashToken */,
  ">>": 49 /* GreaterThanGreaterThanToken */,
  ">>>": 50 /* GreaterThanGreaterThanGreaterThanToken */,
  "&": 51 /* AmpersandToken */,
  "|": 52 /* BarToken */,
  "^": 53 /* CaretToken */,
  "!": 54 /* ExclamationToken */,
  "~": 55 /* TildeToken */,
  "&&": 56 /* AmpersandAmpersandToken */,
  "||": 57 /* BarBarToken */,
  "?": 58 /* QuestionToken */,
  "??": 61 /* QuestionQuestionToken */,
  "?.": 29 /* QuestionDotToken */,
  ":": 59 /* ColonToken */,
  "=": 64 /* EqualsToken */,
  "+=": 65 /* PlusEqualsToken */,
  "-=": 66 /* MinusEqualsToken */,
  "*=": 67 /* AsteriskEqualsToken */,
  "**=": 68 /* AsteriskAsteriskEqualsToken */,
  "/=": 69 /* SlashEqualsToken */,
  "%=": 70 /* PercentEqualsToken */,
  "<<=": 71 /* LessThanLessThanEqualsToken */,
  ">>=": 72 /* GreaterThanGreaterThanEqualsToken */,
  ">>>=": 73 /* GreaterThanGreaterThanGreaterThanEqualsToken */,
  "&=": 74 /* AmpersandEqualsToken */,
  "|=": 75 /* BarEqualsToken */,
  "^=": 79 /* CaretEqualsToken */,
  "||=": 76 /* BarBarEqualsToken */,
  "&&=": 77 /* AmpersandAmpersandEqualsToken */,
  "??=": 78 /* QuestionQuestionEqualsToken */,
  "@": 60 /* AtToken */,
  "#": 63 /* HashToken */,
  "`": 62 /* BacktickToken */
}));
var charCodeToRegExpFlag = /* @__PURE__ */ new Map([
  [100 /* d */, 1 /* HasIndices */],
  [103 /* g */, 2 /* Global */],
  [105 /* i */, 4 /* IgnoreCase */],
  [109 /* m */, 8 /* Multiline */],
  [115 /* s */, 16 /* DotAll */],
  [117 /* u */, 32 /* Unicode */],
  [118 /* v */, 64 /* UnicodeSets */],
  [121 /* y */, 128 /* Sticky */]
]);
var regExpFlagToFirstAvailableLanguageVersion = /* @__PURE__ */ new Map([
  [1 /* HasIndices */, LanguageFeatureMinimumTarget.RegularExpressionFlagsHasIndices],
  [16 /* DotAll */, LanguageFeatureMinimumTarget.RegularExpressionFlagsDotAll],
  [32 /* Unicode */, LanguageFeatureMinimumTarget.RegularExpressionFlagsUnicode],
  [64 /* UnicodeSets */, LanguageFeatureMinimumTarget.RegularExpressionFlagsUnicodeSets],
  [128 /* Sticky */, LanguageFeatureMinimumTarget.RegularExpressionFlagsSticky]
]);
var unicodeES5IdentifierStart = [170, 170, 181, 181, 186, 186, 192, 214, 216, 246, 248, 705, 710, 721, 736, 740, 748, 748, 750, 750, 880, 884, 886, 887, 890, 893, 902, 902, 904, 906, 908, 908, 910, 929, 931, 1013, 1015, 1153, 1162, 1319, 1329, 1366, 1369, 1369, 1377, 1415, 1488, 1514, 1520, 1522, 1568, 1610, 1646, 1647, 1649, 1747, 1749, 1749, 1765, 1766, 1774, 1775, 1786, 1788, 1791, 1791, 1808, 1808, 1810, 1839, 1869, 1957, 1969, 1969, 1994, 2026, 2036, 2037, 2042, 2042, 2048, 2069, 2074, 2074, 2084, 2084, 2088, 2088, 2112, 2136, 2208, 2208, 2210, 2220, 2308, 2361, 2365, 2365, 2384, 2384, 2392, 2401, 2417, 2423, 2425, 2431, 2437, 2444, 2447, 2448, 2451, 2472, 2474, 2480, 2482, 2482, 2486, 2489, 2493, 2493, 2510, 2510, 2524, 2525, 2527, 2529, 2544, 2545, 2565, 2570, 2575, 2576, 2579, 2600, 2602, 2608, 2610, 2611, 2613, 2614, 2616, 2617, 2649, 2652, 2654, 2654, 2674, 2676, 2693, 2701, 2703, 2705, 2707, 2728, 2730, 2736, 2738, 2739, 2741, 2745, 2749, 2749, 2768, 2768, 2784, 2785, 2821, 2828, 2831, 2832, 2835, 2856, 2858, 2864, 2866, 2867, 2869, 2873, 2877, 2877, 2908, 2909, 2911, 2913, 2929, 2929, 2947, 2947, 2949, 2954, 2958, 2960, 2962, 2965, 2969, 2970, 2972, 2972, 2974, 2975, 2979, 2980, 2984, 2986, 2990, 3001, 3024, 3024, 3077, 3084, 3086, 3088, 3090, 3112, 3114, 3123, 3125, 3129, 3133, 3133, 3160, 3161, 3168, 3169, 3205, 3212, 3214, 3216, 3218, 3240, 3242, 3251, 3253, 3257, 3261, 3261, 3294, 3294, 3296, 3297, 3313, 3314, 3333, 3340, 3342, 3344, 3346, 3386, 3389, 3389, 3406, 3406, 3424, 3425, 3450, 3455, 3461, 3478, 3482, 3505, 3507, 3515, 3517, 3517, 3520, 3526, 3585, 3632, 3634, 3635, 3648, 3654, 3713, 3714, 3716, 3716, 3719, 3720, 3722, 3722, 3725, 3725, 3732, 3735, 3737, 3743, 3745, 3747, 3749, 3749, 3751, 3751, 3754, 3755, 3757, 3760, 3762, 3763, 3773, 3773, 3776, 3780, 3782, 3782, 3804, 3807, 3840, 3840, 3904, 3911, 3913, 3948, 3976, 3980, 4096, 4138, 4159, 4159, 4176, 4181, 4186, 4189, 4193, 4193, 4197, 4198, 4206, 4208, 4213, 4225, 4238, 4238, 4256, 4293, 4295, 4295, 4301, 4301, 4304, 4346, 4348, 4680, 4682, 4685, 4688, 4694, 4696, 4696, 4698, 4701, 4704, 4744, 4746, 4749, 4752, 4784, 4786, 4789, 4792, 4798, 4800, 4800, 4802, 4805, 4808, 4822, 4824, 4880, 4882, 4885, 4888, 4954, 4992, 5007, 5024, 5108, 5121, 5740, 5743, 5759, 5761, 5786, 5792, 5866, 5870, 5872, 5888, 5900, 5902, 5905, 5920, 5937, 5952, 5969, 5984, 5996, 5998, 6e3, 6016, 6067, 6103, 6103, 6108, 6108, 6176, 6263, 6272, 6312, 6314, 6314, 6320, 6389, 6400, 6428, 6480, 6509, 6512, 6516, 6528, 6571, 6593, 6599, 6656, 6678, 6688, 6740, 6823, 6823, 6917, 6963, 6981, 6987, 7043, 7072, 7086, 7087, 7098, 7141, 7168, 7203, 7245, 7247, 7258, 7293, 7401, 7404, 7406, 7409, 7413, 7414, 7424, 7615, 7680, 7957, 7960, 7965, 7968, 8005, 8008, 8013, 8016, 8023, 8025, 8025, 8027, 8027, 8029, 8029, 8031, 8061, 8064, 8116, 8118, 8124, 8126, 8126, 8130, 8132, 8134, 8140, 8144, 8147, 8150, 8155, 8160, 8172, 8178, 8180, 8182, 8188, 8305, 8305, 8319, 8319, 8336, 8348, 8450, 8450, 8455, 8455, 8458, 8467, 8469, 8469, 8473, 8477, 8484, 8484, 8486, 8486, 8488, 8488, 8490, 8493, 8495, 8505, 8508, 8511, 8517, 8521, 8526, 8526, 8544, 8584, 11264, 11310, 11312, 11358, 11360, 11492, 11499, 11502, 11506, 11507, 11520, 11557, 11559, 11559, 11565, 11565, 11568, 11623, 11631, 11631, 11648, 11670, 11680, 11686, 11688, 11694, 11696, 11702, 11704, 11710, 11712, 11718, 11720, 11726, 11728, 11734, 11736, 11742, 11823, 11823, 12293, 12295, 12321, 12329, 12337, 12341, 12344, 12348, 12353, 12438, 12445, 12447, 12449, 12538, 12540, 12543, 12549, 12589, 12593, 12686, 12704, 12730, 12784, 12799, 13312, 19893, 19968, 40908, 40960, 42124, 42192, 42237, 42240, 42508, 42512, 42527, 42538, 42539, 42560, 42606, 42623, 42647, 42656, 42735, 42775, 42783, 42786, 42888, 42891, 42894, 42896, 42899, 42912, 42922, 43e3, 43009, 43011, 43013, 43015, 43018, 43020, 43042, 43072, 43123, 43138, 43187, 43250, 43255, 43259, 43259, 43274, 43301, 43312, 43334, 43360, 43388, 43396, 43442, 43471, 43471, 43520, 43560, 43584, 43586, 43588, 43595, 43616, 43638, 43642, 43642, 43648, 43695, 43697, 43697, 43701, 43702, 43705, 43709, 43712, 43712, 43714, 43714, 43739, 43741, 43744, 43754, 43762, 43764, 43777, 43782, 43785, 43790, 43793, 43798, 43808, 43814, 43816, 43822, 43968, 44002, 44032, 55203, 55216, 55238, 55243, 55291, 63744, 64109, 64112, 64217, 64256, 64262, 64275, 64279, 64285, 64285, 64287, 64296, 64298, 64310, 64312, 64316, 64318, 64318, 64320, 64321, 64323, 64324, 64326, 64433, 64467, 64829, 64848, 64911, 64914, 64967, 65008, 65019, 65136, 65140, 65142, 65276, 65313, 65338, 65345, 65370, 65382, 65470, 65474, 65479, 65482, 65487, 65490, 65495, 65498, 65500];
var unicodeES5IdentifierPart = [170, 170, 181, 181, 186, 186, 192, 214, 216, 246, 248, 705, 710, 721, 736, 740, 748, 748, 750, 750, 768, 884, 886, 887, 890, 893, 902, 902, 904, 906, 908, 908, 910, 929, 931, 1013, 1015, 1153, 1155, 1159, 1162, 1319, 1329, 1366, 1369, 1369, 1377, 1415, 1425, 1469, 1471, 1471, 1473, 1474, 1476, 1477, 1479, 1479, 1488, 1514, 1520, 1522, 1552, 1562, 1568, 1641, 1646, 1747, 1749, 1756, 1759, 1768, 1770, 1788, 1791, 1791, 1808, 1866, 1869, 1969, 1984, 2037, 2042, 2042, 2048, 2093, 2112, 2139, 2208, 2208, 2210, 2220, 2276, 2302, 2304, 2403, 2406, 2415, 2417, 2423, 2425, 2431, 2433, 2435, 2437, 2444, 2447, 2448, 2451, 2472, 2474, 2480, 2482, 2482, 2486, 2489, 2492, 2500, 2503, 2504, 2507, 2510, 2519, 2519, 2524, 2525, 2527, 2531, 2534, 2545, 2561, 2563, 2565, 2570, 2575, 2576, 2579, 2600, 2602, 2608, 2610, 2611, 2613, 2614, 2616, 2617, 2620, 2620, 2622, 2626, 2631, 2632, 2635, 2637, 2641, 2641, 2649, 2652, 2654, 2654, 2662, 2677, 2689, 2691, 2693, 2701, 2703, 2705, 2707, 2728, 2730, 2736, 2738, 2739, 2741, 2745, 2748, 2757, 2759, 2761, 2763, 2765, 2768, 2768, 2784, 2787, 2790, 2799, 2817, 2819, 2821, 2828, 2831, 2832, 2835, 2856, 2858, 2864, 2866, 2867, 2869, 2873, 2876, 2884, 2887, 2888, 2891, 2893, 2902, 2903, 2908, 2909, 2911, 2915, 2918, 2927, 2929, 2929, 2946, 2947, 2949, 2954, 2958, 2960, 2962, 2965, 2969, 2970, 2972, 2972, 2974, 2975, 2979, 2980, 2984, 2986, 2990, 3001, 3006, 3010, 3014, 3016, 3018, 3021, 3024, 3024, 3031, 3031, 3046, 3055, 3073, 3075, 3077, 3084, 3086, 3088, 3090, 3112, 3114, 3123, 3125, 3129, 3133, 3140, 3142, 3144, 3146, 3149, 3157, 3158, 3160, 3161, 3168, 3171, 3174, 3183, 3202, 3203, 3205, 3212, 3214, 3216, 3218, 3240, 3242, 3251, 3253, 3257, 3260, 3268, 3270, 3272, 3274, 3277, 3285, 3286, 3294, 3294, 3296, 3299, 3302, 3311, 3313, 3314, 3330, 3331, 3333, 3340, 3342, 3344, 3346, 3386, 3389, 3396, 3398, 3400, 3402, 3406, 3415, 3415, 3424, 3427, 3430, 3439, 3450, 3455, 3458, 3459, 3461, 3478, 3482, 3505, 3507, 3515, 3517, 3517, 3520, 3526, 3530, 3530, 3535, 3540, 3542, 3542, 3544, 3551, 3570, 3571, 3585, 3642, 3648, 3662, 3664, 3673, 3713, 3714, 3716, 3716, 3719, 3720, 3722, 3722, 3725, 3725, 3732, 3735, 3737, 3743, 3745, 3747, 3749, 3749, 3751, 3751, 3754, 3755, 3757, 3769, 3771, 3773, 3776, 3780, 3782, 3782, 3784, 3789, 3792, 3801, 3804, 3807, 3840, 3840, 3864, 3865, 3872, 3881, 3893, 3893, 3895, 3895, 3897, 3897, 3902, 3911, 3913, 3948, 3953, 3972, 3974, 3991, 3993, 4028, 4038, 4038, 4096, 4169, 4176, 4253, 4256, 4293, 4295, 4295, 4301, 4301, 4304, 4346, 4348, 4680, 4682, 4685, 4688, 4694, 4696, 4696, 4698, 4701, 4704, 4744, 4746, 4749, 4752, 4784, 4786, 4789, 4792, 4798, 4800, 4800, 4802, 4805, 4808, 4822, 4824, 4880, 4882, 4885, 4888, 4954, 4957, 4959, 4992, 5007, 5024, 5108, 5121, 5740, 5743, 5759, 5761, 5786, 5792, 5866, 5870, 5872, 5888, 5900, 5902, 5908, 5920, 5940, 5952, 5971, 5984, 5996, 5998, 6e3, 6002, 6003, 6016, 6099, 6103, 6103, 6108, 6109, 6112, 6121, 6155, 6157, 6160, 6169, 6176, 6263, 6272, 6314, 6320, 6389, 6400, 6428, 6432, 6443, 6448, 6459, 6470, 6509, 6512, 6516, 6528, 6571, 6576, 6601, 6608, 6617, 6656, 6683, 6688, 6750, 6752, 6780, 6783, 6793, 6800, 6809, 6823, 6823, 6912, 6987, 6992, 7001, 7019, 7027, 7040, 7155, 7168, 7223, 7232, 7241, 7245, 7293, 7376, 7378, 7380, 7414, 7424, 7654, 7676, 7957, 7960, 7965, 7968, 8005, 8008, 8013, 8016, 8023, 8025, 8025, 8027, 8027, 8029, 8029, 8031, 8061, 8064, 8116, 8118, 8124, 8126, 8126, 8130, 8132, 8134, 8140, 8144, 8147, 8150, 8155, 8160, 8172, 8178, 8180, 8182, 8188, 8204, 8205, 8255, 8256, 8276, 8276, 8305, 8305, 8319, 8319, 8336, 8348, 8400, 8412, 8417, 8417, 8421, 8432, 8450, 8450, 8455, 8455, 8458, 8467, 8469, 8469, 8473, 8477, 8484, 8484, 8486, 8486, 8488, 8488, 8490, 8493, 8495, 8505, 8508, 8511, 8517, 8521, 8526, 8526, 8544, 8584, 11264, 11310, 11312, 11358, 11360, 11492, 11499, 11507, 11520, 11557, 11559, 11559, 11565, 11565, 11568, 11623, 11631, 11631, 11647, 11670, 11680, 11686, 11688, 11694, 11696, 11702, 11704, 11710, 11712, 11718, 11720, 11726, 11728, 11734, 11736, 11742, 11744, 11775, 11823, 11823, 12293, 12295, 12321, 12335, 12337, 12341, 12344, 12348, 12353, 12438, 12441, 12442, 12445, 12447, 12449, 12538, 12540, 12543, 12549, 12589, 12593, 12686, 12704, 12730, 12784, 12799, 13312, 19893, 19968, 40908, 40960, 42124, 42192, 42237, 42240, 42508, 42512, 42539, 42560, 42607, 42612, 42621, 42623, 42647, 42655, 42737, 42775, 42783, 42786, 42888, 42891, 42894, 42896, 42899, 42912, 42922, 43e3, 43047, 43072, 43123, 43136, 43204, 43216, 43225, 43232, 43255, 43259, 43259, 43264, 43309, 43312, 43347, 43360, 43388, 43392, 43456, 43471, 43481, 43520, 43574, 43584, 43597, 43600, 43609, 43616, 43638, 43642, 43643, 43648, 43714, 43739, 43741, 43744, 43759, 43762, 43766, 43777, 43782, 43785, 43790, 43793, 43798, 43808, 43814, 43816, 43822, 43968, 44010, 44012, 44013, 44016, 44025, 44032, 55203, 55216, 55238, 55243, 55291, 63744, 64109, 64112, 64217, 64256, 64262, 64275, 64279, 64285, 64296, 64298, 64310, 64312, 64316, 64318, 64318, 64320, 64321, 64323, 64324, 64326, 64433, 64467, 64829, 64848, 64911, 64914, 64967, 65008, 65019, 65024, 65039, 65056, 65062, 65075, 65076, 65101, 65103, 65136, 65140, 65142, 65276, 65296, 65305, 65313, 65338, 65343, 65343, 65345, 65370, 65382, 65470, 65474, 65479, 65482, 65487, 65490, 65495, 65498, 65500];
var unicodeESNextIdentifierStart = [65, 90, 97, 122, 170, 170, 181, 181, 186, 186, 192, 214, 216, 246, 248, 705, 710, 721, 736, 740, 748, 748, 750, 750, 880, 884, 886, 887, 890, 893, 895, 895, 902, 902, 904, 906, 908, 908, 910, 929, 931, 1013, 1015, 1153, 1162, 1327, 1329, 1366, 1369, 1369, 1376, 1416, 1488, 1514, 1519, 1522, 1568, 1610, 1646, 1647, 1649, 1747, 1749, 1749, 1765, 1766, 1774, 1775, 1786, 1788, 1791, 1791, 1808, 1808, 1810, 1839, 1869, 1957, 1969, 1969, 1994, 2026, 2036, 2037, 2042, 2042, 2048, 2069, 2074, 2074, 2084, 2084, 2088, 2088, 2112, 2136, 2144, 2154, 2160, 2183, 2185, 2190, 2208, 2249, 2308, 2361, 2365, 2365, 2384, 2384, 2392, 2401, 2417, 2432, 2437, 2444, 2447, 2448, 2451, 2472, 2474, 2480, 2482, 2482, 2486, 2489, 2493, 2493, 2510, 2510, 2524, 2525, 2527, 2529, 2544, 2545, 2556, 2556, 2565, 2570, 2575, 2576, 2579, 2600, 2602, 2608, 2610, 2611, 2613, 2614, 2616, 2617, 2649, 2652, 2654, 2654, 2674, 2676, 2693, 2701, 2703, 2705, 2707, 2728, 2730, 2736, 2738, 2739, 2741, 2745, 2749, 2749, 2768, 2768, 2784, 2785, 2809, 2809, 2821, 2828, 2831, 2832, 2835, 2856, 2858, 2864, 2866, 2867, 2869, 2873, 2877, 2877, 2908, 2909, 2911, 2913, 2929, 2929, 2947, 2947, 2949, 2954, 2958, 2960, 2962, 2965, 2969, 2970, 2972, 2972, 2974, 2975, 2979, 2980, 2984, 2986, 2990, 3001, 3024, 3024, 3077, 3084, 3086, 3088, 3090, 3112, 3114, 3129, 3133, 3133, 3160, 3162, 3165, 3165, 3168, 3169, 3200, 3200, 3205, 3212, 3214, 3216, 3218, 3240, 3242, 3251, 3253, 3257, 3261, 3261, 3293, 3294, 3296, 3297, 3313, 3314, 3332, 3340, 3342, 3344, 3346, 3386, 3389, 3389, 3406, 3406, 3412, 3414, 3423, 3425, 3450, 3455, 3461, 3478, 3482, 3505, 3507, 3515, 3517, 3517, 3520, 3526, 3585, 3632, 3634, 3635, 3648, 3654, 3713, 3714, 3716, 3716, 3718, 3722, 3724, 3747, 3749, 3749, 3751, 3760, 3762, 3763, 3773, 3773, 3776, 3780, 3782, 3782, 3804, 3807, 3840, 3840, 3904, 3911, 3913, 3948, 3976, 3980, 4096, 4138, 4159, 4159, 4176, 4181, 4186, 4189, 4193, 4193, 4197, 4198, 4206, 4208, 4213, 4225, 4238, 4238, 4256, 4293, 4295, 4295, 4301, 4301, 4304, 4346, 4348, 4680, 4682, 4685, 4688, 4694, 4696, 4696, 4698, 4701, 4704, 4744, 4746, 4749, 4752, 4784, 4786, 4789, 4792, 4798, 4800, 4800, 4802, 4805, 4808, 4822, 4824, 4880, 4882, 4885, 4888, 4954, 4992, 5007, 5024, 5109, 5112, 5117, 5121, 5740, 5743, 5759, 5761, 5786, 5792, 5866, 5870, 5880, 5888, 5905, 5919, 5937, 5952, 5969, 5984, 5996, 5998, 6e3, 6016, 6067, 6103, 6103, 6108, 6108, 6176, 6264, 6272, 6312, 6314, 6314, 6320, 6389, 6400, 6430, 6480, 6509, 6512, 6516, 6528, 6571, 6576, 6601, 6656, 6678, 6688, 6740, 6823, 6823, 6917, 6963, 6981, 6988, 7043, 7072, 7086, 7087, 7098, 7141, 7168, 7203, 7245, 7247, 7258, 7293, 7296, 7304, 7312, 7354, 7357, 7359, 7401, 7404, 7406, 7411, 7413, 7414, 7418, 7418, 7424, 7615, 7680, 7957, 7960, 7965, 7968, 8005, 8008, 8013, 8016, 8023, 8025, 8025, 8027, 8027, 8029, 8029, 8031, 8061, 8064, 8116, 8118, 8124, 8126, 8126, 8130, 8132, 8134, 8140, 8144, 8147, 8150, 8155, 8160, 8172, 8178, 8180, 8182, 8188, 8305, 8305, 8319, 8319, 8336, 8348, 8450, 8450, 8455, 8455, 8458, 8467, 8469, 8469, 8472, 8477, 8484, 8484, 8486, 8486, 8488, 8488, 8490, 8505, 8508, 8511, 8517, 8521, 8526, 8526, 8544, 8584, 11264, 11492, 11499, 11502, 11506, 11507, 11520, 11557, 11559, 11559, 11565, 11565, 11568, 11623, 11631, 11631, 11648, 11670, 11680, 11686, 11688, 11694, 11696, 11702, 11704, 11710, 11712, 11718, 11720, 11726, 11728, 11734, 11736, 11742, 12293, 12295, 12321, 12329, 12337, 12341, 12344, 12348, 12353, 12438, 12443, 12447, 12449, 12538, 12540, 12543, 12549, 12591, 12593, 12686, 12704, 12735, 12784, 12799, 13312, 19903, 19968, 42124, 42192, 42237, 42240, 42508, 42512, 42527, 42538, 42539, 42560, 42606, 42623, 42653, 42656, 42735, 42775, 42783, 42786, 42888, 42891, 42954, 42960, 42961, 42963, 42963, 42965, 42969, 42994, 43009, 43011, 43013, 43015, 43018, 43020, 43042, 43072, 43123, 43138, 43187, 43250, 43255, 43259, 43259, 43261, 43262, 43274, 43301, 43312, 43334, 43360, 43388, 43396, 43442, 43471, 43471, 43488, 43492, 43494, 43503, 43514, 43518, 43520, 43560, 43584, 43586, 43588, 43595, 43616, 43638, 43642, 43642, 43646, 43695, 43697, 43697, 43701, 43702, 43705, 43709, 43712, 43712, 43714, 43714, 43739, 43741, 43744, 43754, 43762, 43764, 43777, 43782, 43785, 43790, 43793, 43798, 43808, 43814, 43816, 43822, 43824, 43866, 43868, 43881, 43888, 44002, 44032, 55203, 55216, 55238, 55243, 55291, 63744, 64109, 64112, 64217, 64256, 64262, 64275, 64279, 64285, 64285, 64287, 64296, 64298, 64310, 64312, 64316, 64318, 64318, 64320, 64321, 64323, 64324, 64326, 64433, 64467, 64829, 64848, 64911, 64914, 64967, 65008, 65019, 65136, 65140, 65142, 65276, 65313, 65338, 65345, 65370, 65382, 65470, 65474, 65479, 65482, 65487, 65490, 65495, 65498, 65500, 65536, 65547, 65549, 65574, 65576, 65594, 65596, 65597, 65599, 65613, 65616, 65629, 65664, 65786, 65856, 65908, 66176, 66204, 66208, 66256, 66304, 66335, 66349, 66378, 66384, 66421, 66432, 66461, 66464, 66499, 66504, 66511, 66513, 66517, 66560, 66717, 66736, 66771, 66776, 66811, 66816, 66855, 66864, 66915, 66928, 66938, 66940, 66954, 66956, 66962, 66964, 66965, 66967, 66977, 66979, 66993, 66995, 67001, 67003, 67004, 67072, 67382, 67392, 67413, 67424, 67431, 67456, 67461, 67463, 67504, 67506, 67514, 67584, 67589, 67592, 67592, 67594, 67637, 67639, 67640, 67644, 67644, 67647, 67669, 67680, 67702, 67712, 67742, 67808, 67826, 67828, 67829, 67840, 67861, 67872, 67897, 67968, 68023, 68030, 68031, 68096, 68096, 68112, 68115, 68117, 68119, 68121, 68149, 68192, 68220, 68224, 68252, 68288, 68295, 68297, 68324, 68352, 68405, 68416, 68437, 68448, 68466, 68480, 68497, 68608, 68680, 68736, 68786, 68800, 68850, 68864, 68899, 69248, 69289, 69296, 69297, 69376, 69404, 69415, 69415, 69424, 69445, 69488, 69505, 69552, 69572, 69600, 69622, 69635, 69687, 69745, 69746, 69749, 69749, 69763, 69807, 69840, 69864, 69891, 69926, 69956, 69956, 69959, 69959, 69968, 70002, 70006, 70006, 70019, 70066, 70081, 70084, 70106, 70106, 70108, 70108, 70144, 70161, 70163, 70187, 70207, 70208, 70272, 70278, 70280, 70280, 70282, 70285, 70287, 70301, 70303, 70312, 70320, 70366, 70405, 70412, 70415, 70416, 70419, 70440, 70442, 70448, 70450, 70451, 70453, 70457, 70461, 70461, 70480, 70480, 70493, 70497, 70656, 70708, 70727, 70730, 70751, 70753, 70784, 70831, 70852, 70853, 70855, 70855, 71040, 71086, 71128, 71131, 71168, 71215, 71236, 71236, 71296, 71338, 71352, 71352, 71424, 71450, 71488, 71494, 71680, 71723, 71840, 71903, 71935, 71942, 71945, 71945, 71948, 71955, 71957, 71958, 71960, 71983, 71999, 71999, 72001, 72001, 72096, 72103, 72106, 72144, 72161, 72161, 72163, 72163, 72192, 72192, 72203, 72242, 72250, 72250, 72272, 72272, 72284, 72329, 72349, 72349, 72368, 72440, 72704, 72712, 72714, 72750, 72768, 72768, 72818, 72847, 72960, 72966, 72968, 72969, 72971, 73008, 73030, 73030, 73056, 73061, 73063, 73064, 73066, 73097, 73112, 73112, 73440, 73458, 73474, 73474, 73476, 73488, 73490, 73523, 73648, 73648, 73728, 74649, 74752, 74862, 74880, 75075, 77712, 77808, 77824, 78895, 78913, 78918, 82944, 83526, 92160, 92728, 92736, 92766, 92784, 92862, 92880, 92909, 92928, 92975, 92992, 92995, 93027, 93047, 93053, 93071, 93760, 93823, 93952, 94026, 94032, 94032, 94099, 94111, 94176, 94177, 94179, 94179, 94208, 100343, 100352, 101589, 101632, 101640, 110576, 110579, 110581, 110587, 110589, 110590, 110592, 110882, 110898, 110898, 110928, 110930, 110933, 110933, 110948, 110951, 110960, 111355, 113664, 113770, 113776, 113788, 113792, 113800, 113808, 113817, 119808, 119892, 119894, 119964, 119966, 119967, 119970, 119970, 119973, 119974, 119977, 119980, 119982, 119993, 119995, 119995, 119997, 120003, 120005, 120069, 120071, 120074, 120077, 120084, 120086, 120092, 120094, 120121, 120123, 120126, 120128, 120132, 120134, 120134, 120138, 120144, 120146, 120485, 120488, 120512, 120514, 120538, 120540, 120570, 120572, 120596, 120598, 120628, 120630, 120654, 120656, 120686, 120688, 120712, 120714, 120744, 120746, 120770, 120772, 120779, 122624, 122654, 122661, 122666, 122928, 122989, 123136, 123180, 123191, 123197, 123214, 123214, 123536, 123565, 123584, 123627, 124112, 124139, 124896, 124902, 124904, 124907, 124909, 124910, 124912, 124926, 124928, 125124, 125184, 125251, 125259, 125259, 126464, 126467, 126469, 126495, 126497, 126498, 126500, 126500, 126503, 126503, 126505, 126514, 126516, 126519, 126521, 126521, 126523, 126523, 126530, 126530, 126535, 126535, 126537, 126537, 126539, 126539, 126541, 126543, 126545, 126546, 126548, 126548, 126551, 126551, 126553, 126553, 126555, 126555, 126557, 126557, 126559, 126559, 126561, 126562, 126564, 126564, 126567, 126570, 126572, 126578, 126580, 126583, 126585, 126588, 126590, 126590, 126592, 126601, 126603, 126619, 126625, 126627, 126629, 126633, 126635, 126651, 131072, 173791, 173824, 177977, 177984, 178205, 178208, 183969, 183984, 191456, 191472, 192093, 194560, 195101, 196608, 201546, 201552, 205743];
var unicodeESNextIdentifierPart = [48, 57, 65, 90, 95, 95, 97, 122, 170, 170, 181, 181, 183, 183, 186, 186, 192, 214, 216, 246, 248, 705, 710, 721, 736, 740, 748, 748, 750, 750, 768, 884, 886, 887, 890, 893, 895, 895, 902, 906, 908, 908, 910, 929, 931, 1013, 1015, 1153, 1155, 1159, 1162, 1327, 1329, 1366, 1369, 1369, 1376, 1416, 1425, 1469, 1471, 1471, 1473, 1474, 1476, 1477, 1479, 1479, 1488, 1514, 1519, 1522, 1552, 1562, 1568, 1641, 1646, 1747, 1749, 1756, 1759, 1768, 1770, 1788, 1791, 1791, 1808, 1866, 1869, 1969, 1984, 2037, 2042, 2042, 2045, 2045, 2048, 2093, 2112, 2139, 2144, 2154, 2160, 2183, 2185, 2190, 2200, 2273, 2275, 2403, 2406, 2415, 2417, 2435, 2437, 2444, 2447, 2448, 2451, 2472, 2474, 2480, 2482, 2482, 2486, 2489, 2492, 2500, 2503, 2504, 2507, 2510, 2519, 2519, 2524, 2525, 2527, 2531, 2534, 2545, 2556, 2556, 2558, 2558, 2561, 2563, 2565, 2570, 2575, 2576, 2579, 2600, 2602, 2608, 2610, 2611, 2613, 2614, 2616, 2617, 2620, 2620, 2622, 2626, 2631, 2632, 2635, 2637, 2641, 2641, 2649, 2652, 2654, 2654, 2662, 2677, 2689, 2691, 2693, 2701, 2703, 2705, 2707, 2728, 2730, 2736, 2738, 2739, 2741, 2745, 2748, 2757, 2759, 2761, 2763, 2765, 2768, 2768, 2784, 2787, 2790, 2799, 2809, 2815, 2817, 2819, 2821, 2828, 2831, 2832, 2835, 2856, 2858, 2864, 2866, 2867, 2869, 2873, 2876, 2884, 2887, 2888, 2891, 2893, 2901, 2903, 2908, 2909, 2911, 2915, 2918, 2927, 2929, 2929, 2946, 2947, 2949, 2954, 2958, 2960, 2962, 2965, 2969, 2970, 2972, 2972, 2974, 2975, 2979, 2980, 2984, 2986, 2990, 3001, 3006, 3010, 3014, 3016, 3018, 3021, 3024, 3024, 3031, 3031, 3046, 3055, 3072, 3084, 3086, 3088, 3090, 3112, 3114, 3129, 3132, 3140, 3142, 3144, 3146, 3149, 3157, 3158, 3160, 3162, 3165, 3165, 3168, 3171, 3174, 3183, 3200, 3203, 3205, 3212, 3214, 3216, 3218, 3240, 3242, 3251, 3253, 3257, 3260, 3268, 3270, 3272, 3274, 3277, 3285, 3286, 3293, 3294, 3296, 3299, 3302, 3311, 3313, 3315, 3328, 3340, 3342, 3344, 3346, 3396, 3398, 3400, 3402, 3406, 3412, 3415, 3423, 3427, 3430, 3439, 3450, 3455, 3457, 3459, 3461, 3478, 3482, 3505, 3507, 3515, 3517, 3517, 3520, 3526, 3530, 3530, 3535, 3540, 3542, 3542, 3544, 3551, 3558, 3567, 3570, 3571, 3585, 3642, 3648, 3662, 3664, 3673, 3713, 3714, 3716, 3716, 3718, 3722, 3724, 3747, 3749, 3749, 3751, 3773, 3776, 3780, 3782, 3782, 3784, 3790, 3792, 3801, 3804, 3807, 3840, 3840, 3864, 3865, 3872, 3881, 3893, 3893, 3895, 3895, 3897, 3897, 3902, 3911, 3913, 3948, 3953, 3972, 3974, 3991, 3993, 4028, 4038, 4038, 4096, 4169, 4176, 4253, 4256, 4293, 4295, 4295, 4301, 4301, 4304, 4346, 4348, 4680, 4682, 4685, 4688, 4694, 4696, 4696, 4698, 4701, 4704, 4744, 4746, 4749, 4752, 4784, 4786, 4789, 4792, 4798, 4800, 4800, 4802, 4805, 4808, 4822, 4824, 4880, 4882, 4885, 4888, 4954, 4957, 4959, 4969, 4977, 4992, 5007, 5024, 5109, 5112, 5117, 5121, 5740, 5743, 5759, 5761, 5786, 5792, 5866, 5870, 5880, 5888, 5909, 5919, 5940, 5952, 5971, 5984, 5996, 5998, 6e3, 6002, 6003, 6016, 6099, 6103, 6103, 6108, 6109, 6112, 6121, 6155, 6157, 6159, 6169, 6176, 6264, 6272, 6314, 6320, 6389, 6400, 6430, 6432, 6443, 6448, 6459, 6470, 6509, 6512, 6516, 6528, 6571, 6576, 6601, 6608, 6618, 6656, 6683, 6688, 6750, 6752, 6780, 6783, 6793, 6800, 6809, 6823, 6823, 6832, 6845, 6847, 6862, 6912, 6988, 6992, 7001, 7019, 7027, 7040, 7155, 7168, 7223, 7232, 7241, 7245, 7293, 7296, 7304, 7312, 7354, 7357, 7359, 7376, 7378, 7380, 7418, 7424, 7957, 7960, 7965, 7968, 8005, 8008, 8013, 8016, 8023, 8025, 8025, 8027, 8027, 8029, 8029, 8031, 8061, 8064, 8116, 8118, 8124, 8126, 8126, 8130, 8132, 8134, 8140, 8144, 8147, 8150, 8155, 8160, 8172, 8178, 8180, 8182, 8188, 8204, 8205, 8255, 8256, 8276, 8276, 8305, 8305, 8319, 8319, 8336, 8348, 8400, 8412, 8417, 8417, 8421, 8432, 8450, 8450, 8455, 8455, 8458, 8467, 8469, 8469, 8472, 8477, 8484, 8484, 8486, 8486, 8488, 8488, 8490, 8505, 8508, 8511, 8517, 8521, 8526, 8526, 8544, 8584, 11264, 11492, 11499, 11507, 11520, 11557, 11559, 11559, 11565, 11565, 11568, 11623, 11631, 11631, 11647, 11670, 11680, 11686, 11688, 11694, 11696, 11702, 11704, 11710, 11712, 11718, 11720, 11726, 11728, 11734, 11736, 11742, 11744, 11775, 12293, 12295, 12321, 12335, 12337, 12341, 12344, 12348, 12353, 12438, 12441, 12447, 12449, 12543, 12549, 12591, 12593, 12686, 12704, 12735, 12784, 12799, 13312, 19903, 19968, 42124, 42192, 42237, 42240, 42508, 42512, 42539, 42560, 42607, 42612, 42621, 42623, 42737, 42775, 42783, 42786, 42888, 42891, 42954, 42960, 42961, 42963, 42963, 42965, 42969, 42994, 43047, 43052, 43052, 43072, 43123, 43136, 43205, 43216, 43225, 43232, 43255, 43259, 43259, 43261, 43309, 43312, 43347, 43360, 43388, 43392, 43456, 43471, 43481, 43488, 43518, 43520, 43574, 43584, 43597, 43600, 43609, 43616, 43638, 43642, 43714, 43739, 43741, 43744, 43759, 43762, 43766, 43777, 43782, 43785, 43790, 43793, 43798, 43808, 43814, 43816, 43822, 43824, 43866, 43868, 43881, 43888, 44010, 44012, 44013, 44016, 44025, 44032, 55203, 55216, 55238, 55243, 55291, 63744, 64109, 64112, 64217, 64256, 64262, 64275, 64279, 64285, 64296, 64298, 64310, 64312, 64316, 64318, 64318, 64320, 64321, 64323, 64324, 64326, 64433, 64467, 64829, 64848, 64911, 64914, 64967, 65008, 65019, 65024, 65039, 65056, 65071, 65075, 65076, 65101, 65103, 65136, 65140, 65142, 65276, 65296, 65305, 65313, 65338, 65343, 65343, 65345, 65370, 65381, 65470, 65474, 65479, 65482, 65487, 65490, 65495, 65498, 65500, 65536, 65547, 65549, 65574, 65576, 65594, 65596, 65597, 65599, 65613, 65616, 65629, 65664, 65786, 65856, 65908, 66045, 66045, 66176, 66204, 66208, 66256, 66272, 66272, 66304, 66335, 66349, 66378, 66384, 66426, 66432, 66461, 66464, 66499, 66504, 66511, 66513, 66517, 66560, 66717, 66720, 66729, 66736, 66771, 66776, 66811, 66816, 66855, 66864, 66915, 66928, 66938, 66940, 66954, 66956, 66962, 66964, 66965, 66967, 66977, 66979, 66993, 66995, 67001, 67003, 67004, 67072, 67382, 67392, 67413, 67424, 67431, 67456, 67461, 67463, 67504, 67506, 67514, 67584, 67589, 67592, 67592, 67594, 67637, 67639, 67640, 67644, 67644, 67647, 67669, 67680, 67702, 67712, 67742, 67808, 67826, 67828, 67829, 67840, 67861, 67872, 67897, 67968, 68023, 68030, 68031, 68096, 68099, 68101, 68102, 68108, 68115, 68117, 68119, 68121, 68149, 68152, 68154, 68159, 68159, 68192, 68220, 68224, 68252, 68288, 68295, 68297, 68326, 68352, 68405, 68416, 68437, 68448, 68466, 68480, 68497, 68608, 68680, 68736, 68786, 68800, 68850, 68864, 68903, 68912, 68921, 69248, 69289, 69291, 69292, 69296, 69297, 69373, 69404, 69415, 69415, 69424, 69456, 69488, 69509, 69552, 69572, 69600, 69622, 69632, 69702, 69734, 69749, 69759, 69818, 69826, 69826, 69840, 69864, 69872, 69881, 69888, 69940, 69942, 69951, 69956, 69959, 69968, 70003, 70006, 70006, 70016, 70084, 70089, 70092, 70094, 70106, 70108, 70108, 70144, 70161, 70163, 70199, 70206, 70209, 70272, 70278, 70280, 70280, 70282, 70285, 70287, 70301, 70303, 70312, 70320, 70378, 70384, 70393, 70400, 70403, 70405, 70412, 70415, 70416, 70419, 70440, 70442, 70448, 70450, 70451, 70453, 70457, 70459, 70468, 70471, 70472, 70475, 70477, 70480, 70480, 70487, 70487, 70493, 70499, 70502, 70508, 70512, 70516, 70656, 70730, 70736, 70745, 70750, 70753, 70784, 70853, 70855, 70855, 70864, 70873, 71040, 71093, 71096, 71104, 71128, 71133, 71168, 71232, 71236, 71236, 71248, 71257, 71296, 71352, 71360, 71369, 71424, 71450, 71453, 71467, 71472, 71481, 71488, 71494, 71680, 71738, 71840, 71913, 71935, 71942, 71945, 71945, 71948, 71955, 71957, 71958, 71960, 71989, 71991, 71992, 71995, 72003, 72016, 72025, 72096, 72103, 72106, 72151, 72154, 72161, 72163, 72164, 72192, 72254, 72263, 72263, 72272, 72345, 72349, 72349, 72368, 72440, 72704, 72712, 72714, 72758, 72760, 72768, 72784, 72793, 72818, 72847, 72850, 72871, 72873, 72886, 72960, 72966, 72968, 72969, 72971, 73014, 73018, 73018, 73020, 73021, 73023, 73031, 73040, 73049, 73056, 73061, 73063, 73064, 73066, 73102, 73104, 73105, 73107, 73112, 73120, 73129, 73440, 73462, 73472, 73488, 73490, 73530, 73534, 73538, 73552, 73561, 73648, 73648, 73728, 74649, 74752, 74862, 74880, 75075, 77712, 77808, 77824, 78895, 78912, 78933, 82944, 83526, 92160, 92728, 92736, 92766, 92768, 92777, 92784, 92862, 92864, 92873, 92880, 92909, 92912, 92916, 92928, 92982, 92992, 92995, 93008, 93017, 93027, 93047, 93053, 93071, 93760, 93823, 93952, 94026, 94031, 94087, 94095, 94111, 94176, 94177, 94179, 94180, 94192, 94193, 94208, 100343, 100352, 101589, 101632, 101640, 110576, 110579, 110581, 110587, 110589, 110590, 110592, 110882, 110898, 110898, 110928, 110930, 110933, 110933, 110948, 110951, 110960, 111355, 113664, 113770, 113776, 113788, 113792, 113800, 113808, 113817, 113821, 113822, 118528, 118573, 118576, 118598, 119141, 119145, 119149, 119154, 119163, 119170, 119173, 119179, 119210, 119213, 119362, 119364, 119808, 119892, 119894, 119964, 119966, 119967, 119970, 119970, 119973, 119974, 119977, 119980, 119982, 119993, 119995, 119995, 119997, 120003, 120005, 120069, 120071, 120074, 120077, 120084, 120086, 120092, 120094, 120121, 120123, 120126, 120128, 120132, 120134, 120134, 120138, 120144, 120146, 120485, 120488, 120512, 120514, 120538, 120540, 120570, 120572, 120596, 120598, 120628, 120630, 120654, 120656, 120686, 120688, 120712, 120714, 120744, 120746, 120770, 120772, 120779, 120782, 120831, 121344, 121398, 121403, 121452, 121461, 121461, 121476, 121476, 121499, 121503, 121505, 121519, 122624, 122654, 122661, 122666, 122880, 122886, 122888, 122904, 122907, 122913, 122915, 122916, 122918, 122922, 122928, 122989, 123023, 123023, 123136, 123180, 123184, 123197, 123200, 123209, 123214, 123214, 123536, 123566, 123584, 123641, 124112, 124153, 124896, 124902, 124904, 124907, 124909, 124910, 124912, 124926, 124928, 125124, 125136, 125142, 125184, 125259, 125264, 125273, 126464, 126467, 126469, 126495, 126497, 126498, 126500, 126500, 126503, 126503, 126505, 126514, 126516, 126519, 126521, 126521, 126523, 126523, 126530, 126530, 126535, 126535, 126537, 126537, 126539, 126539, 126541, 126543, 126545, 126546, 126548, 126548, 126551, 126551, 126553, 126553, 126555, 126555, 126557, 126557, 126559, 126559, 126561, 126562, 126564, 126564, 126567, 126570, 126572, 126578, 126580, 126583, 126585, 126588, 126590, 126590, 126592, 126601, 126603, 126619, 126625, 126627, 126629, 126633, 126635, 126651, 130032, 130041, 131072, 173791, 173824, 177977, 177984, 178205, 178208, 183969, 183984, 191456, 191472, 192093, 194560, 195101, 196608, 201546, 201552, 205743, 917760, 917999];
var commentDirectiveRegExSingleLine = /^\/\/\/?\s*@(ts-expect-error|ts-ignore)/;
var commentDirectiveRegExMultiLine = /^(?:\/|\*)*\s*@(ts-expect-error|ts-ignore)/;
var jsDocSeeOrLink = /@(?:see|link)/i;
function lookupInUnicodeMap(code, map2) {
  if (code < map2[0]) {
    return false;
  }
  let lo = 0;
  let hi = map2.length;
  let mid;
  while (lo + 1 < hi) {
    mid = lo + (hi - lo) / 2;
    mid -= mid % 2;
    if (map2[mid] <= code && code <= map2[mid + 1]) {
      return true;
    }
    if (code < map2[mid]) {
      hi = mid;
    } else {
      lo = mid + 2;
    }
  }
  return false;
}
function isUnicodeIdentifierStart(code, languageVersion) {
  return languageVersion >= 2 /* ES2015 */ ? lookupInUnicodeMap(code, unicodeESNextIdentifierStart) : lookupInUnicodeMap(code, unicodeES5IdentifierStart);
}
function isUnicodeIdentifierPart(code, languageVersion) {
  return languageVersion >= 2 /* ES2015 */ ? lookupInUnicodeMap(code, unicodeESNextIdentifierPart) : lookupInUnicodeMap(code, unicodeES5IdentifierPart);
}
function makeReverseMap(source) {
  const result = [];
  source.forEach((value, name) => {
    result[value] = name;
  });
  return result;
}
var tokenStrings = makeReverseMap(textToToken);
function tokenToString(t) {
  return tokenStrings[t];
}
function stringToToken(s) {
  return textToToken.get(s);
}
function characterCodeToRegularExpressionFlag(ch) {
  return charCodeToRegExpFlag.get(ch);
}
function computeLineStarts(text) {
  const result = [];
  let pos = 0;
  let lineStart = 0;
  while (pos < text.length) {
    const ch = text.charCodeAt(pos);
    pos++;
    switch (ch) {
      case 13 /* carriageReturn */:
        if (text.charCodeAt(pos) === 10 /* lineFeed */) {
          pos++;
        }
      // falls through
      case 10 /* lineFeed */:
        result.push(lineStart);
        lineStart = pos;
        break;
      default:
        if (ch > 127 /* maxAsciiCharacter */ && isLineBreak(ch)) {
          result.push(lineStart);
          lineStart = pos;
        }
        break;
    }
  }
  result.push(lineStart);
  return result;
}
function computePositionOfLineAndCharacter(lineStarts, line, character, debugText, allowEdits) {
  if (line < 0 || line >= lineStarts.length) {
    if (allowEdits) {
      line = line < 0 ? 0 : line >= lineStarts.length ? lineStarts.length - 1 : line;
    } else {
      Debug.fail(`Bad line number. Line: ${line}, lineStarts.length: ${lineStarts.length} , line map is correct? ${debugText !== void 0 ? arrayIsEqualTo(lineStarts, computeLineStarts(debugText)) : "unknown"}`);
    }
  }
  const res = lineStarts[line] + character;
  if (allowEdits) {
    return res > lineStarts[line + 1] ? lineStarts[line + 1] : typeof debugText === "string" && res > debugText.length ? debugText.length : res;
  }
  if (line < lineStarts.length - 1) {
    Debug.assert(res < lineStarts[line + 1]);
  } else if (debugText !== void 0) {
    Debug.assert(res <= debugText.length);
  }
  return res;
}
function getLineStarts(sourceFile) {
  return sourceFile.lineMap || (sourceFile.lineMap = computeLineStarts(sourceFile.text));
}
function computeLineAndCharacterOfPosition(lineStarts, position) {
  const lineNumber = computeLineOfPosition(lineStarts, position);
  return {
    line: lineNumber,
    character: position - lineStarts[lineNumber]
  };
}
function computeLineOfPosition(lineStarts, position, lowerBound) {
  let lineNumber = binarySearch(lineStarts, position, identity, compareValues, lowerBound);
  if (lineNumber < 0) {
    lineNumber = ~lineNumber - 1;
    Debug.assert(lineNumber !== -1, "position cannot precede the beginning of the file");
  }
  return lineNumber;
}
function getLineAndCharacterOfPosition(sourceFile, position) {
  return computeLineAndCharacterOfPosition(getLineStarts(sourceFile), position);
}
function isWhiteSpaceLike(ch) {
  return isWhiteSpaceSingleLine(ch) || isLineBreak(ch);
}
function isWhiteSpaceSingleLine(ch) {
  return ch === 32 /* space */ || ch === 9 /* tab */ || ch === 11 /* verticalTab */ || ch === 12 /* formFeed */ || ch === 160 /* nonBreakingSpace */ || ch === 133 /* nextLine */ || ch === 5760 /* ogham */ || ch >= 8192 /* enQuad */ && ch <= 8203 /* zeroWidthSpace */ || ch === 8239 /* narrowNoBreakSpace */ || ch === 8287 /* mathematicalSpace */ || ch === 12288 /* ideographicSpace */ || ch === 65279 /* byteOrderMark */;
}
function isLineBreak(ch) {
  return ch === 10 /* lineFeed */ || ch === 13 /* carriageReturn */ || ch === 8232 /* lineSeparator */ || ch === 8233 /* paragraphSeparator */;
}
function isDigit(ch) {
  return ch >= 48 /* _0 */ && ch <= 57 /* _9 */;
}
function isHexDigit(ch) {
  return isDigit(ch) || ch >= 65 /* A */ && ch <= 70 /* F */ || ch >= 97 /* a */ && ch <= 102 /* f */;
}
function isASCIILetter(ch) {
  return ch >= 65 /* A */ && ch <= 90 /* Z */ || ch >= 97 /* a */ && ch <= 122 /* z */;
}
function isWordCharacter(ch) {
  return isASCIILetter(ch) || isDigit(ch) || ch === 95 /* _ */;
}
function isOctalDigit(ch) {
  return ch >= 48 /* _0 */ && ch <= 55 /* _7 */;
}
function skipTrivia(text, pos, stopAfterLineBreak, stopAtComments, inJSDoc) {
  if (positionIsSynthesized(pos)) {
    return pos;
  }
  let canConsumeStar = false;
  while (true) {
    const ch = text.charCodeAt(pos);
    switch (ch) {
      case 13 /* carriageReturn */:
        if (text.charCodeAt(pos + 1) === 10 /* lineFeed */) {
          pos++;
        }
      // falls through
      case 10 /* lineFeed */:
        pos++;
        if (stopAfterLineBreak) {
          return pos;
        }
        canConsumeStar = !!inJSDoc;
        continue;
      case 9 /* tab */:
      case 11 /* verticalTab */:
      case 12 /* formFeed */:
      case 32 /* space */:
        pos++;
        continue;
      case 47 /* slash */:
        if (stopAtComments) {
          break;
        }
        if (text.charCodeAt(pos + 1) === 47 /* slash */) {
          pos += 2;
          while (pos < text.length) {
            if (isLineBreak(text.charCodeAt(pos))) {
              break;
            }
            pos++;
          }
          canConsumeStar = false;
          continue;
        }
        if (text.charCodeAt(pos + 1) === 42 /* asterisk */) {
          pos += 2;
          while (pos < text.length) {
            if (text.charCodeAt(pos) === 42 /* asterisk */ && text.charCodeAt(pos + 1) === 47 /* slash */) {
              pos += 2;
              break;
            }
            pos++;
          }
          canConsumeStar = false;
          continue;
        }
        break;
      case 60 /* lessThan */:
      case 124 /* bar */:
      case 61 /* equals */:
      case 62 /* greaterThan */:
        if (isConflictMarkerTrivia(text, pos)) {
          pos = scanConflictMarkerTrivia(text, pos);
          canConsumeStar = false;
          continue;
        }
        break;
      case 35 /* hash */:
        if (pos === 0 && isShebangTrivia(text, pos)) {
          pos = scanShebangTrivia(text, pos);
          canConsumeStar = false;
          continue;
        }
        break;
      case 42 /* asterisk */:
        if (canConsumeStar) {
          pos++;
          canConsumeStar = false;
          continue;
        }
        break;
      default:
        if (ch > 127 /* maxAsciiCharacter */ && isWhiteSpaceLike(ch)) {
          pos++;
          continue;
        }
        break;
    }
    return pos;
  }
}
var mergeConflictMarkerLength = "<<<<<<<".length;
function isConflictMarkerTrivia(text, pos) {
  Debug.assert(pos >= 0);
  if (pos === 0 || isLineBreak(text.charCodeAt(pos - 1))) {
    const ch = text.charCodeAt(pos);
    if (pos + mergeConflictMarkerLength < text.length) {
      for (let i = 0; i < mergeConflictMarkerLength; i++) {
        if (text.charCodeAt(pos + i) !== ch) {
          return false;
        }
      }
      return ch === 61 /* equals */ || text.charCodeAt(pos + mergeConflictMarkerLength) === 32 /* space */;
    }
  }
  return false;
}
function scanConflictMarkerTrivia(text, pos, error2) {
  if (error2) {
    error2(Diagnostics.Merge_conflict_marker_encountered, pos, mergeConflictMarkerLength);
  }
  const ch = text.charCodeAt(pos);
  const len = text.length;
  if (ch === 60 /* lessThan */ || ch === 62 /* greaterThan */) {
    while (pos < len && !isLineBreak(text.charCodeAt(pos))) {
      pos++;
    }
  } else {
    Debug.assert(ch === 124 /* bar */ || ch === 61 /* equals */);
    while (pos < len) {
      const currentChar = text.charCodeAt(pos);
      if ((currentChar === 61 /* equals */ || currentChar === 62 /* greaterThan */) && currentChar !== ch && isConflictMarkerTrivia(text, pos)) {
        break;
      }
      pos++;
    }
  }
  return pos;
}
var shebangTriviaRegex = /^#!.*/;
function isShebangTrivia(text, pos) {
  Debug.assert(pos === 0);
  return shebangTriviaRegex.test(text);
}
function scanShebangTrivia(text, pos) {
  const shebang = shebangTriviaRegex.exec(text)[0];
  pos = pos + shebang.length;
  return pos;
}
function iterateCommentRanges(reduce, text, pos, trailing, cb, state, initial) {
  let pendingPos;
  let pendingEnd;
  let pendingKind;
  let pendingHasTrailingNewLine;
  let hasPendingCommentRange = false;
  let collecting = trailing;
  let accumulator = initial;
  if (pos === 0) {
    collecting = true;
    const shebang = getShebang(text);
    if (shebang) {
      pos = shebang.length;
    }
  }
  scan:
    while (pos >= 0 && pos < text.length) {
      const ch = text.charCodeAt(pos);
      switch (ch) {
        case 13 /* carriageReturn */:
          if (text.charCodeAt(pos + 1) === 10 /* lineFeed */) {
            pos++;
          }
        // falls through
        case 10 /* lineFeed */:
          pos++;
          if (trailing) {
            break scan;
          }
          collecting = true;
          if (hasPendingCommentRange) {
            pendingHasTrailingNewLine = true;
          }
          continue;
        case 9 /* tab */:
        case 11 /* verticalTab */:
        case 12 /* formFeed */:
        case 32 /* space */:
          pos++;
          continue;
        case 47 /* slash */:
          const nextChar = text.charCodeAt(pos + 1);
          let hasTrailingNewLine = false;
          if (nextChar === 47 /* slash */ || nextChar === 42 /* asterisk */) {
            const kind = nextChar === 47 /* slash */ ? 2 /* SingleLineCommentTrivia */ : 3 /* MultiLineCommentTrivia */;
            const startPos = pos;
            pos += 2;
            if (nextChar === 47 /* slash */) {
              while (pos < text.length) {
                if (isLineBreak(text.charCodeAt(pos))) {
                  hasTrailingNewLine = true;
                  break;
                }
                pos++;
              }
            } else {
              while (pos < text.length) {
                if (text.charCodeAt(pos) === 42 /* asterisk */ && text.charCodeAt(pos + 1) === 47 /* slash */) {
                  pos += 2;
                  break;
                }
                pos++;
              }
            }
            if (collecting) {
              if (hasPendingCommentRange) {
                accumulator = cb(pendingPos, pendingEnd, pendingKind, pendingHasTrailingNewLine, state, accumulator);
                if (!reduce && accumulator) {
                  return accumulator;
                }
              }
              pendingPos = startPos;
              pendingEnd = pos;
              pendingKind = kind;
              pendingHasTrailingNewLine = hasTrailingNewLine;
              hasPendingCommentRange = true;
            }
            continue;
          }
          break scan;
        default:
          if (ch > 127 /* maxAsciiCharacter */ && isWhiteSpaceLike(ch)) {
            if (hasPendingCommentRange && isLineBreak(ch)) {
              pendingHasTrailingNewLine = true;
            }
            pos++;
            continue;
          }
          break scan;
      }
    }
  if (hasPendingCommentRange) {
    accumulator = cb(pendingPos, pendingEnd, pendingKind, pendingHasTrailingNewLine, state, accumulator);
  }
  return accumulator;
}
function reduceEachLeadingCommentRange(text, pos, cb, state, initial) {
  return iterateCommentRanges(
    /*reduce*/
    true,
    text,
    pos,
    /*trailing*/
    false,
    cb,
    state,
    initial
  );
}
function reduceEachTrailingCommentRange(text, pos, cb, state, initial) {
  return iterateCommentRanges(
    /*reduce*/
    true,
    text,
    pos,
    /*trailing*/
    true,
    cb,
    state,
    initial
  );
}
function appendCommentRange(pos, end, kind, hasTrailingNewLine, _state, comments = []) {
  comments.push({ kind, pos, end, hasTrailingNewLine });
  return comments;
}
function getLeadingCommentRanges(text, pos) {
  return reduceEachLeadingCommentRange(
    text,
    pos,
    appendCommentRange,
    /*state*/
    void 0,
    /*initial*/
    void 0
  );
}
function getTrailingCommentRanges(text, pos) {
  return reduceEachTrailingCommentRange(
    text,
    pos,
    appendCommentRange,
    /*state*/
    void 0,
    /*initial*/
    void 0
  );
}
function getShebang(text) {
  const match = shebangTriviaRegex.exec(text);
  if (match) {
    return match[0];
  }
}
function isIdentifierStart(ch, languageVersion) {
  return isASCIILetter(ch) || ch === 36 /* $ */ || ch === 95 /* _ */ || ch > 127 /* maxAsciiCharacter */ && isUnicodeIdentifierStart(ch, languageVersion);
}
function isIdentifierPart(ch, languageVersion, identifierVariant) {
  return isWordCharacter(ch) || ch === 36 /* $ */ || // "-" and ":" are valid in JSX Identifiers
  (identifierVariant === 1 /* JSX */ ? ch === 45 /* minus */ || ch === 58 /* colon */ : false) || ch > 127 /* maxAsciiCharacter */ && isUnicodeIdentifierPart(ch, languageVersion);
}
function isIdentifierText(name, languageVersion, identifierVariant) {
  let ch = codePointAt(name, 0);
  if (!isIdentifierStart(ch, languageVersion)) {
    return false;
  }
  for (let i = charSize(ch); i < name.length; i += charSize(ch)) {
    if (!isIdentifierPart(ch = codePointAt(name, i), languageVersion, identifierVariant)) {
      return false;
    }
  }
  return true;
}
function createScanner(languageVersion, skipTrivia2, languageVariant = 0 /* Standard */, textInitial, onError, start, length2) {
  var text = textInitial;
  var pos;
  var end;
  var fullStartPos;
  var tokenStart;
  var token;
  var tokenValue;
  var tokenFlags;
  var commentDirectives;
  var skipJsDocLeadingAsterisks = 0;
  var scriptKind = 0 /* Unknown */;
  var jsDocParsingMode = 0 /* ParseAll */;
  setText(text, start, length2);
  var scanner2 = {
    getTokenFullStart: () => fullStartPos,
    getStartPos: () => fullStartPos,
    getTokenEnd: () => pos,
    getTextPos: () => pos,
    getToken: () => token,
    getTokenStart: () => tokenStart,
    getTokenPos: () => tokenStart,
    getTokenText: () => text.substring(tokenStart, pos),
    getTokenValue: () => tokenValue,
    hasUnicodeEscape: () => (tokenFlags & 1024 /* UnicodeEscape */) !== 0,
    hasExtendedUnicodeEscape: () => (tokenFlags & 8 /* ExtendedUnicodeEscape */) !== 0,
    hasPrecedingLineBreak: () => (tokenFlags & 1 /* PrecedingLineBreak */) !== 0,
    hasPrecedingJSDocComment: () => (tokenFlags & 2 /* PrecedingJSDocComment */) !== 0,
    hasPrecedingJSDocLeadingAsterisks: () => (tokenFlags & 32768 /* PrecedingJSDocLeadingAsterisks */) !== 0,
    isIdentifier: () => token === 80 /* Identifier */ || token > 118 /* LastReservedWord */,
    isReservedWord: () => token >= 83 /* FirstReservedWord */ && token <= 118 /* LastReservedWord */,
    isUnterminated: () => (tokenFlags & 4 /* Unterminated */) !== 0,
    getCommentDirectives: () => commentDirectives,
    getNumericLiteralFlags: () => tokenFlags & 25584 /* NumericLiteralFlags */,
    getTokenFlags: () => tokenFlags,
    reScanGreaterToken,
    reScanAsteriskEqualsToken,
    reScanSlashToken,
    reScanTemplateToken,
    reScanTemplateHeadOrNoSubstitutionTemplate,
    scanJsxIdentifier,
    scanJsxAttributeValue,
    reScanJsxAttributeValue,
    reScanJsxToken,
    reScanLessThanToken,
    reScanHashToken,
    reScanQuestionToken,
    reScanInvalidIdentifier,
    scanJsxToken,
    scanJsDocToken,
    scanJSDocCommentTextToken,
    scan,
    getText,
    clearCommentDirectives,
    setText,
    setScriptTarget,
    setLanguageVariant,
    setScriptKind,
    setJSDocParsingMode,
    setOnError,
    resetTokenState,
    setTextPos: resetTokenState,
    setSkipJsDocLeadingAsterisks,
    tryScan,
    lookAhead,
    scanRange
  };
  if (Debug.isDebugging) {
    Object.defineProperty(scanner2, "__debugShowCurrentPositionInText", {
      get: () => {
        const text2 = scanner2.getText();
        return text2.slice(0, scanner2.getTokenFullStart()) + "\u2551" + text2.slice(scanner2.getTokenFullStart());
      }
    });
  }
  return scanner2;
  function codePointUnchecked(pos2) {
    return codePointAt(text, pos2);
  }
  function codePointChecked(pos2) {
    return pos2 >= 0 && pos2 < end ? codePointUnchecked(pos2) : -1 /* EOF */;
  }
  function charCodeUnchecked(pos2) {
    return text.charCodeAt(pos2);
  }
  function charCodeChecked(pos2) {
    return pos2 >= 0 && pos2 < end ? charCodeUnchecked(pos2) : -1 /* EOF */;
  }
  function error2(message, errPos = pos, length3, arg0) {
    if (onError) {
      const oldPos = pos;
      pos = errPos;
      onError(message, length3 || 0, arg0);
      pos = oldPos;
    }
  }
  function scanNumberFragment() {
    let start2 = pos;
    let allowSeparator = false;
    let isPreviousTokenSeparator = false;
    let result = "";
    while (true) {
      const ch = charCodeUnchecked(pos);
      if (ch === 95 /* _ */) {
        tokenFlags |= 512 /* ContainsSeparator */;
        if (allowSeparator) {
          allowSeparator = false;
          isPreviousTokenSeparator = true;
          result += text.substring(start2, pos);
        } else {
          tokenFlags |= 16384 /* ContainsInvalidSeparator */;
          if (isPreviousTokenSeparator) {
            error2(Diagnostics.Multiple_consecutive_numeric_separators_are_not_permitted, pos, 1);
          } else {
            error2(Diagnostics.Numeric_separators_are_not_allowed_here, pos, 1);
          }
        }
        pos++;
        start2 = pos;
        continue;
      }
      if (isDigit(ch)) {
        allowSeparator = true;
        isPreviousTokenSeparator = false;
        pos++;
        continue;
      }
      break;
    }
    if (charCodeUnchecked(pos - 1) === 95 /* _ */) {
      tokenFlags |= 16384 /* ContainsInvalidSeparator */;
      error2(Diagnostics.Numeric_separators_are_not_allowed_here, pos - 1, 1);
    }
    return result + text.substring(start2, pos);
  }
  function scanNumber() {
    let start2 = pos;
    let mainFragment;
    if (charCodeUnchecked(pos) === 48 /* _0 */) {
      pos++;
      if (charCodeUnchecked(pos) === 95 /* _ */) {
        tokenFlags |= 512 /* ContainsSeparator */ | 16384 /* ContainsInvalidSeparator */;
        error2(Diagnostics.Numeric_separators_are_not_allowed_here, pos, 1);
        pos--;
        mainFragment = scanNumberFragment();
      } else if (!scanDigits()) {
        tokenFlags |= 8192 /* ContainsLeadingZero */;
        mainFragment = "" + +tokenValue;
      } else if (!tokenValue) {
        mainFragment = "0";
      } else {
        tokenValue = "" + parseInt(tokenValue, 8);
        tokenFlags |= 32 /* Octal */;
        const withMinus = token === 41 /* MinusToken */;
        const literal = (withMinus ? "-" : "") + "0o" + (+tokenValue).toString(8);
        if (withMinus) start2--;
        error2(Diagnostics.Octal_literals_are_not_allowed_Use_the_syntax_0, start2, pos - start2, literal);
        return 9 /* NumericLiteral */;
      }
    } else {
      mainFragment = scanNumberFragment();
    }
    let decimalFragment;
    let scientificFragment;
    if (charCodeUnchecked(pos) === 46 /* dot */) {
      pos++;
      decimalFragment = scanNumberFragment();
    }
    let end2 = pos;
    if (charCodeUnchecked(pos) === 69 /* E */ || charCodeUnchecked(pos) === 101 /* e */) {
      pos++;
      tokenFlags |= 16 /* Scientific */;
      if (charCodeUnchecked(pos) === 43 /* plus */ || charCodeUnchecked(pos) === 45 /* minus */) pos++;
      const preNumericPart = pos;
      const finalFragment = scanNumberFragment();
      if (!finalFragment) {
        error2(Diagnostics.Digit_expected);
      } else {
        scientificFragment = text.substring(end2, preNumericPart) + finalFragment;
        end2 = pos;
      }
    }
    let result;
    if (tokenFlags & 512 /* ContainsSeparator */) {
      result = mainFragment;
      if (decimalFragment) {
        result += "." + decimalFragment;
      }
      if (scientificFragment) {
        result += scientificFragment;
      }
    } else {
      result = text.substring(start2, end2);
    }
    if (tokenFlags & 8192 /* ContainsLeadingZero */) {
      error2(Diagnostics.Decimals_with_leading_zeros_are_not_allowed, start2, end2 - start2);
      tokenValue = "" + +result;
      return 9 /* NumericLiteral */;
    }
    if (decimalFragment !== void 0 || tokenFlags & 16 /* Scientific */) {
      checkForIdentifierStartAfterNumericLiteral(start2, decimalFragment === void 0 && !!(tokenFlags & 16 /* Scientific */));
      tokenValue = "" + +result;
      return 9 /* NumericLiteral */;
    } else {
      tokenValue = result;
      const type = checkBigIntSuffix();
      checkForIdentifierStartAfterNumericLiteral(start2);
      return type;
    }
  }
  function checkForIdentifierStartAfterNumericLiteral(numericStart, isScientific) {
    if (!isIdentifierStart(codePointUnchecked(pos), languageVersion)) {
      return;
    }
    const identifierStart = pos;
    const { length: length3 } = scanIdentifierParts();
    if (length3 === 1 && text[identifierStart] === "n") {
      if (isScientific) {
        error2(Diagnostics.A_bigint_literal_cannot_use_exponential_notation, numericStart, identifierStart - numericStart + 1);
      } else {
        error2(Diagnostics.A_bigint_literal_must_be_an_integer, numericStart, identifierStart - numericStart + 1);
      }
    } else {
      error2(Diagnostics.An_identifier_or_keyword_cannot_immediately_follow_a_numeric_literal, identifierStart, length3);
      pos = identifierStart;
    }
  }
  function scanDigits() {
    const start2 = pos;
    let isOctal = true;
    while (isDigit(charCodeChecked(pos))) {
      if (!isOctalDigit(charCodeUnchecked(pos))) {
        isOctal = false;
      }
      pos++;
    }
    tokenValue = text.substring(start2, pos);
    return isOctal;
  }
  function scanExactNumberOfHexDigits(count, canHaveSeparators) {
    const valueString = scanHexDigits(
      /*minCount*/
      count,
      /*scanAsManyAsPossible*/
      false,
      canHaveSeparators
    );
    return valueString ? parseInt(valueString, 16) : -1;
  }
  function scanMinimumNumberOfHexDigits(count, canHaveSeparators) {
    return scanHexDigits(
      /*minCount*/
      count,
      /*scanAsManyAsPossible*/
      true,
      canHaveSeparators
    );
  }
  function scanHexDigits(minCount, scanAsManyAsPossible, canHaveSeparators) {
    let valueChars = [];
    let allowSeparator = false;
    let isPreviousTokenSeparator = false;
    while (valueChars.length < minCount || scanAsManyAsPossible) {
      let ch = charCodeUnchecked(pos);
      if (canHaveSeparators && ch === 95 /* _ */) {
        tokenFlags |= 512 /* ContainsSeparator */;
        if (allowSeparator) {
          allowSeparator = false;
          isPreviousTokenSeparator = true;
        } else if (isPreviousTokenSeparator) {
          error2(Diagnostics.Multiple_consecutive_numeric_separators_are_not_permitted, pos, 1);
        } else {
          error2(Diagnostics.Numeric_separators_are_not_allowed_here, pos, 1);
        }
        pos++;
        continue;
      }
      allowSeparator = canHaveSeparators;
      if (ch >= 65 /* A */ && ch <= 70 /* F */) {
        ch += 97 /* a */ - 65 /* A */;
      } else if (!(ch >= 48 /* _0 */ && ch <= 57 /* _9 */ || ch >= 97 /* a */ && ch <= 102 /* f */)) {
        break;
      }
      valueChars.push(ch);
      pos++;
      isPreviousTokenSeparator = false;
    }
    if (valueChars.length < minCount) {
      valueChars = [];
    }
    if (charCodeUnchecked(pos - 1) === 95 /* _ */) {
      error2(Diagnostics.Numeric_separators_are_not_allowed_here, pos - 1, 1);
    }
    return String.fromCharCode(...valueChars);
  }
  function scanString(jsxAttributeString = false) {
    const quote2 = charCodeUnchecked(pos);
    pos++;
    let result = "";
    let start2 = pos;
    while (true) {
      if (pos >= end) {
        result += text.substring(start2, pos);
        tokenFlags |= 4 /* Unterminated */;
        error2(Diagnostics.Unterminated_string_literal);
        break;
      }
      const ch = charCodeUnchecked(pos);
      if (ch === quote2) {
        result += text.substring(start2, pos);
        pos++;
        break;
      }
      if (ch === 92 /* backslash */ && !jsxAttributeString) {
        result += text.substring(start2, pos);
        result += scanEscapeSequence(1 /* String */ | 2 /* ReportErrors */);
        start2 = pos;
        continue;
      }
      if ((ch === 10 /* lineFeed */ || ch === 13 /* carriageReturn */) && !jsxAttributeString) {
        result += text.substring(start2, pos);
        tokenFlags |= 4 /* Unterminated */;
        error2(Diagnostics.Unterminated_string_literal);
        break;
      }
      pos++;
    }
    return result;
  }
  function scanTemplateAndSetTokenValue(shouldEmitInvalidEscapeError) {
    const startedWithBacktick = charCodeUnchecked(pos) === 96 /* backtick */;
    pos++;
    let start2 = pos;
    let contents = "";
    let resultingToken;
    while (true) {
      if (pos >= end) {
        contents += text.substring(start2, pos);
        tokenFlags |= 4 /* Unterminated */;
        error2(Diagnostics.Unterminated_template_literal);
        resultingToken = startedWithBacktick ? 15 /* NoSubstitutionTemplateLiteral */ : 18 /* TemplateTail */;
        break;
      }
      const currChar = charCodeUnchecked(pos);
      if (currChar === 96 /* backtick */) {
        contents += text.substring(start2, pos);
        pos++;
        resultingToken = startedWithBacktick ? 15 /* NoSubstitutionTemplateLiteral */ : 18 /* TemplateTail */;
        break;
      }
      if (currChar === 36 /* $ */ && pos + 1 < end && charCodeUnchecked(pos + 1) === 123 /* openBrace */) {
        contents += text.substring(start2, pos);
        pos += 2;
        resultingToken = startedWithBacktick ? 16 /* TemplateHead */ : 17 /* TemplateMiddle */;
        break;
      }
      if (currChar === 92 /* backslash */) {
        contents += text.substring(start2, pos);
        contents += scanEscapeSequence(1 /* String */ | (shouldEmitInvalidEscapeError ? 2 /* ReportErrors */ : 0));
        start2 = pos;
        continue;
      }
      if (currChar === 13 /* carriageReturn */) {
        contents += text.substring(start2, pos);
        pos++;
        if (pos < end && charCodeUnchecked(pos) === 10 /* lineFeed */) {
          pos++;
        }
        contents += "\n";
        start2 = pos;
        continue;
      }
      pos++;
    }
    Debug.assert(resultingToken !== void 0);
    tokenValue = contents;
    return resultingToken;
  }
  function scanEscapeSequence(flags) {
    const start2 = pos;
    pos++;
    if (pos >= end) {
      error2(Diagnostics.Unexpected_end_of_text);
      return "";
    }
    const ch = charCodeUnchecked(pos);
    pos++;
    switch (ch) {
      case 48 /* _0 */:
        if (pos >= end || !isDigit(charCodeUnchecked(pos))) {
          return "\0";
        }
      // '\01', '\011'
      // falls through
      case 49 /* _1 */:
      case 50 /* _2 */:
      case 51 /* _3 */:
        if (pos < end && isOctalDigit(charCodeUnchecked(pos))) {
          pos++;
        }
      // '\17', '\177'
      // falls through
      case 52 /* _4 */:
      case 53 /* _5 */:
      case 54 /* _6 */:
      case 55 /* _7 */:
        if (pos < end && isOctalDigit(charCodeUnchecked(pos))) {
          pos++;
        }
        tokenFlags |= 2048 /* ContainsInvalidEscape */;
        if (flags & 6 /* ReportInvalidEscapeErrors */) {
          const code = parseInt(text.substring(start2 + 1, pos), 8);
          if (flags & 4 /* RegularExpression */ && !(flags & 32 /* AtomEscape */) && ch !== 48 /* _0 */) {
            error2(Diagnostics.Octal_escape_sequences_and_backreferences_are_not_allowed_in_a_character_class_If_this_was_intended_as_an_escape_sequence_use_the_syntax_0_instead, start2, pos - start2, "\\x" + code.toString(16).padStart(2, "0"));
          } else {
            error2(Diagnostics.Octal_escape_sequences_are_not_allowed_Use_the_syntax_0, start2, pos - start2, "\\x" + code.toString(16).padStart(2, "0"));
          }
          return String.fromCharCode(code);
        }
        return text.substring(start2, pos);
      case 56 /* _8 */:
      case 57 /* _9 */:
        tokenFlags |= 2048 /* ContainsInvalidEscape */;
        if (flags & 6 /* ReportInvalidEscapeErrors */) {
          if (flags & 4 /* RegularExpression */ && !(flags & 32 /* AtomEscape */)) {
            error2(Diagnostics.Decimal_escape_sequences_and_backreferences_are_not_allowed_in_a_character_class, start2, pos - start2);
          } else {
            error2(Diagnostics.Escape_sequence_0_is_not_allowed, start2, pos - start2, text.substring(start2, pos));
          }
          return String.fromCharCode(ch);
        }
        return text.substring(start2, pos);
      case 98 /* b */:
        return "\b";
      case 116 /* t */:
        return "	";
      case 110 /* n */:
        return "\n";
      case 118 /* v */:
        return "\v";
      case 102 /* f */:
        return "\f";
      case 114 /* r */:
        return "\r";
      case 39 /* singleQuote */:
        return "'";
      case 34 /* doubleQuote */:
        return '"';
      case 117 /* u */:
        if (pos < end && charCodeUnchecked(pos) === 123 /* openBrace */) {
          pos -= 2;
          const result = scanExtendedUnicodeEscape(!!(flags & 6 /* ReportInvalidEscapeErrors */));
          if (!(flags & 17 /* AllowExtendedUnicodeEscape */)) {
            tokenFlags |= 2048 /* ContainsInvalidEscape */;
            if (flags & 6 /* ReportInvalidEscapeErrors */) {
              error2(Diagnostics.Unicode_escape_sequences_are_only_available_when_the_Unicode_u_flag_or_the_Unicode_Sets_v_flag_is_set, start2, pos - start2);
            }
          }
          return result;
        }
        for (; pos < start2 + 6; pos++) {
          if (!(pos < end && isHexDigit(charCodeUnchecked(pos)))) {
            tokenFlags |= 2048 /* ContainsInvalidEscape */;
            if (flags & 6 /* ReportInvalidEscapeErrors */) {
              error2(Diagnostics.Hexadecimal_digit_expected);
            }
            return text.substring(start2, pos);
          }
        }
        tokenFlags |= 1024 /* UnicodeEscape */;
        const escapedValue = parseInt(text.substring(start2 + 2, pos), 16);
        const escapedValueString = String.fromCharCode(escapedValue);
        if (flags & 16 /* AnyUnicodeMode */ && escapedValue >= 55296 && escapedValue <= 56319 && pos + 6 < end && text.substring(pos, pos + 2) === "\\u" && charCodeUnchecked(pos + 2) !== 123 /* openBrace */) {
          const nextStart = pos;
          let nextPos = pos + 2;
          for (; nextPos < nextStart + 6; nextPos++) {
            if (!isHexDigit(charCodeUnchecked(nextPos))) {
              return escapedValueString;
            }
          }
          const nextEscapedValue = parseInt(text.substring(nextStart + 2, nextPos), 16);
          if (nextEscapedValue >= 56320 && nextEscapedValue <= 57343) {
            pos = nextPos;
            return escapedValueString + String.fromCharCode(nextEscapedValue);
          }
        }
        return escapedValueString;
      case 120 /* x */:
        for (; pos < start2 + 4; pos++) {
          if (!(pos < end && isHexDigit(charCodeUnchecked(pos)))) {
            tokenFlags |= 2048 /* ContainsInvalidEscape */;
            if (flags & 6 /* ReportInvalidEscapeErrors */) {
              error2(Diagnostics.Hexadecimal_digit_expected);
            }
            return text.substring(start2, pos);
          }
        }
        tokenFlags |= 4096 /* HexEscape */;
        return String.fromCharCode(parseInt(text.substring(start2 + 2, pos), 16));
      // when encountering a LineContinuation (i.e. a backslash and a line terminator sequence),
      // the line terminator is interpreted to be "the empty code unit sequence".
      case 13 /* carriageReturn */:
        if (pos < end && charCodeUnchecked(pos) === 10 /* lineFeed */) {
          pos++;
        }
      // falls through
      case 10 /* lineFeed */:
      case 8232 /* lineSeparator */:
      case 8233 /* paragraphSeparator */:
        return "";
      default:
        if (flags & 16 /* AnyUnicodeMode */ || flags & 4 /* RegularExpression */ && !(flags & 8 /* AnnexB */) && isIdentifierPart(ch, languageVersion)) {
          error2(Diagnostics.This_character_cannot_be_escaped_in_a_regular_expression, pos - 2, 2);
        }
        return String.fromCharCode(ch);
    }
  }
  function scanExtendedUnicodeEscape(shouldEmitInvalidEscapeError) {
    const start2 = pos;
    pos += 3;
    const escapedStart = pos;
    const escapedValueString = scanMinimumNumberOfHexDigits(
      1,
      /*canHaveSeparators*/
      false
    );
    const escapedValue = escapedValueString ? parseInt(escapedValueString, 16) : -1;
    let isInvalidExtendedEscape = false;
    if (escapedValue < 0) {
      if (shouldEmitInvalidEscapeError) {
        error2(Diagnostics.Hexadecimal_digit_expected);
      }
      isInvalidExtendedEscape = true;
    } else if (escapedValue > 1114111) {
      if (shouldEmitInvalidEscapeError) {
        error2(Diagnostics.An_extended_Unicode_escape_value_must_be_between_0x0_and_0x10FFFF_inclusive, escapedStart, pos - escapedStart);
      }
      isInvalidExtendedEscape = true;
    }
    if (pos >= end) {
      if (shouldEmitInvalidEscapeError) {
        error2(Diagnostics.Unexpected_end_of_text);
      }
      isInvalidExtendedEscape = true;
    } else if (charCodeUnchecked(pos) === 125 /* closeBrace */) {
      pos++;
    } else {
      if (shouldEmitInvalidEscapeError) {
        error2(Diagnostics.Unterminated_Unicode_escape_sequence);
      }
      isInvalidExtendedEscape = true;
    }
    if (isInvalidExtendedEscape) {
      tokenFlags |= 2048 /* ContainsInvalidEscape */;
      return text.substring(start2, pos);
    }
    tokenFlags |= 8 /* ExtendedUnicodeEscape */;
    return utf16EncodeAsString(escapedValue);
  }
  function peekUnicodeEscape() {
    if (pos + 5 < end && charCodeUnchecked(pos + 1) === 117 /* u */) {
      const start2 = pos;
      pos += 2;
      const value = scanExactNumberOfHexDigits(
        4,
        /*canHaveSeparators*/
        false
      );
      pos = start2;
      return value;
    }
    return -1;
  }
  function peekExtendedUnicodeEscape() {
    if (codePointUnchecked(pos + 1) === 117 /* u */ && codePointUnchecked(pos + 2) === 123 /* openBrace */) {
      const start2 = pos;
      pos += 3;
      const escapedValueString = scanMinimumNumberOfHexDigits(
        1,
        /*canHaveSeparators*/
        false
      );
      const escapedValue = escapedValueString ? parseInt(escapedValueString, 16) : -1;
      pos = start2;
      return escapedValue;
    }
    return -1;
  }
  function scanIdentifierParts() {
    let result = "";
    let start2 = pos;
    while (pos < end) {
      let ch = codePointUnchecked(pos);
      if (isIdentifierPart(ch, languageVersion)) {
        pos += charSize(ch);
      } else if (ch === 92 /* backslash */) {
        ch = peekExtendedUnicodeEscape();
        if (ch >= 0 && isIdentifierPart(ch, languageVersion)) {
          result += scanExtendedUnicodeEscape(
            /*shouldEmitInvalidEscapeError*/
            true
          );
          start2 = pos;
          continue;
        }
        ch = peekUnicodeEscape();
        if (!(ch >= 0 && isIdentifierPart(ch, languageVersion))) {
          break;
        }
        tokenFlags |= 1024 /* UnicodeEscape */;
        result += text.substring(start2, pos);
        result += utf16EncodeAsString(ch);
        pos += 6;
        start2 = pos;
      } else {
        break;
      }
    }
    result += text.substring(start2, pos);
    return result;
  }
  function getIdentifierToken() {
    const len = tokenValue.length;
    if (len >= 2 && len <= 12) {
      const ch = tokenValue.charCodeAt(0);
      if (ch >= 97 /* a */ && ch <= 122 /* z */) {
        const keyword = textToKeyword.get(tokenValue);
        if (keyword !== void 0) {
          return token = keyword;
        }
      }
    }
    return token = 80 /* Identifier */;
  }
  function scanBinaryOrOctalDigits(base) {
    let value = "";
    let separatorAllowed = false;
    let isPreviousTokenSeparator = false;
    while (true) {
      const ch = charCodeUnchecked(pos);
      if (ch === 95 /* _ */) {
        tokenFlags |= 512 /* ContainsSeparator */;
        if (separatorAllowed) {
          separatorAllowed = false;
          isPreviousTokenSeparator = true;
        } else if (isPreviousTokenSeparator) {
          error2(Diagnostics.Multiple_consecutive_numeric_separators_are_not_permitted, pos, 1);
        } else {
          error2(Diagnostics.Numeric_separators_are_not_allowed_here, pos, 1);
        }
        pos++;
        continue;
      }
      separatorAllowed = true;
      if (!isDigit(ch) || ch - 48 /* _0 */ >= base) {
        break;
      }
      value += text[pos];
      pos++;
      isPreviousTokenSeparator = false;
    }
    if (charCodeUnchecked(pos - 1) === 95 /* _ */) {
      error2(Diagnostics.Numeric_separators_are_not_allowed_here, pos - 1, 1);
    }
    return value;
  }
  function checkBigIntSuffix() {
    if (charCodeUnchecked(pos) === 110 /* n */) {
      tokenValue += "n";
      if (tokenFlags & 384 /* BinaryOrOctalSpecifier */) {
        tokenValue = parsePseudoBigInt(tokenValue) + "n";
      }
      pos++;
      return 10 /* BigIntLiteral */;
    } else {
      const numericValue = tokenFlags & 128 /* BinarySpecifier */ ? parseInt(tokenValue.slice(2), 2) : tokenFlags & 256 /* OctalSpecifier */ ? parseInt(tokenValue.slice(2), 8) : +tokenValue;
      tokenValue = "" + numericValue;
      return 9 /* NumericLiteral */;
    }
  }
  function scan() {
    fullStartPos = pos;
    tokenFlags = 0 /* None */;
    while (true) {
      tokenStart = pos;
      if (pos >= end) {
        return token = 1 /* EndOfFileToken */;
      }
      const ch = codePointUnchecked(pos);
      if (pos === 0) {
        if (ch === 35 /* hash */ && isShebangTrivia(text, pos)) {
          pos = scanShebangTrivia(text, pos);
          if (skipTrivia2) {
            continue;
          } else {
            return token = 6 /* ShebangTrivia */;
          }
        }
      }
      switch (ch) {
        case 10 /* lineFeed */:
        case 13 /* carriageReturn */:
          tokenFlags |= 1 /* PrecedingLineBreak */;
          if (skipTrivia2) {
            pos++;
            continue;
          } else {
            if (ch === 13 /* carriageReturn */ && pos + 1 < end && charCodeUnchecked(pos + 1) === 10 /* lineFeed */) {
              pos += 2;
            } else {
              pos++;
            }
            return token = 4 /* NewLineTrivia */;
          }
        case 9 /* tab */:
        case 11 /* verticalTab */:
        case 12 /* formFeed */:
        case 32 /* space */:
        case 160 /* nonBreakingSpace */:
        case 5760 /* ogham */:
        case 8192 /* enQuad */:
        case 8193 /* emQuad */:
        case 8194 /* enSpace */:
        case 8195 /* emSpace */:
        case 8196 /* threePerEmSpace */:
        case 8197 /* fourPerEmSpace */:
        case 8198 /* sixPerEmSpace */:
        case 8199 /* figureSpace */:
        case 8200 /* punctuationSpace */:
        case 8201 /* thinSpace */:
        case 8202 /* hairSpace */:
        case 8203 /* zeroWidthSpace */:
        case 8239 /* narrowNoBreakSpace */:
        case 8287 /* mathematicalSpace */:
        case 12288 /* ideographicSpace */:
        case 65279 /* byteOrderMark */:
          if (skipTrivia2) {
            pos++;
            continue;
          } else {
            while (pos < end && isWhiteSpaceSingleLine(charCodeUnchecked(pos))) {
              pos++;
            }
            return token = 5 /* WhitespaceTrivia */;
          }
        case 33 /* exclamation */:
          if (charCodeUnchecked(pos + 1) === 61 /* equals */) {
            if (charCodeUnchecked(pos + 2) === 61 /* equals */) {
              return pos += 3, token = 38 /* ExclamationEqualsEqualsToken */;
            }
            return pos += 2, token = 36 /* ExclamationEqualsToken */;
          }
          pos++;
          return token = 54 /* ExclamationToken */;
        case 34 /* doubleQuote */:
        case 39 /* singleQuote */:
          tokenValue = scanString();
          return token = 11 /* StringLiteral */;
        case 96 /* backtick */:
          return token = scanTemplateAndSetTokenValue(
            /*shouldEmitInvalidEscapeError*/
            false
          );
        case 37 /* percent */:
          if (charCodeUnchecked(pos + 1) === 61 /* equals */) {
            return pos += 2, token = 70 /* PercentEqualsToken */;
          }
          pos++;
          return token = 45 /* PercentToken */;
        case 38 /* ampersand */:
          if (charCodeUnchecked(pos + 1) === 38 /* ampersand */) {
            if (charCodeUnchecked(pos + 2) === 61 /* equals */) {
              return pos += 3, token = 77 /* AmpersandAmpersandEqualsToken */;
            }
            return pos += 2, token = 56 /* AmpersandAmpersandToken */;
          }
          if (charCodeUnchecked(pos + 1) === 61 /* equals */) {
            return pos += 2, token = 74 /* AmpersandEqualsToken */;
          }
          pos++;
          return token = 51 /* AmpersandToken */;
        case 40 /* openParen */:
          pos++;
          return token = 21 /* OpenParenToken */;
        case 41 /* closeParen */:
          pos++;
          return token = 22 /* CloseParenToken */;
        case 42 /* asterisk */:
          if (charCodeUnchecked(pos + 1) === 61 /* equals */) {
            return pos += 2, token = 67 /* AsteriskEqualsToken */;
          }
          if (charCodeUnchecked(pos + 1) === 42 /* asterisk */) {
            if (charCodeUnchecked(pos + 2) === 61 /* equals */) {
              return pos += 3, token = 68 /* AsteriskAsteriskEqualsToken */;
            }
            return pos += 2, token = 43 /* AsteriskAsteriskToken */;
          }
          pos++;
          if (skipJsDocLeadingAsterisks && (tokenFlags & 32768 /* PrecedingJSDocLeadingAsterisks */) === 0 && tokenFlags & 1 /* PrecedingLineBreak */) {
            tokenFlags |= 32768 /* PrecedingJSDocLeadingAsterisks */;
            continue;
          }
          return token = 42 /* AsteriskToken */;
        case 43 /* plus */:
          if (charCodeUnchecked(pos + 1) === 43 /* plus */) {
            return pos += 2, token = 46 /* PlusPlusToken */;
          }
          if (charCodeUnchecked(pos + 1) === 61 /* equals */) {
            return pos += 2, token = 65 /* PlusEqualsToken */;
          }
          pos++;
          return token = 40 /* PlusToken */;
        case 44 /* comma */:
          pos++;
          return token = 28 /* CommaToken */;
        case 45 /* minus */:
          if (charCodeUnchecked(pos + 1) === 45 /* minus */) {
            return pos += 2, token = 47 /* MinusMinusToken */;
          }
          if (charCodeUnchecked(pos + 1) === 61 /* equals */) {
            return pos += 2, token = 66 /* MinusEqualsToken */;
          }
          pos++;
          return token = 41 /* MinusToken */;
        case 46 /* dot */:
          if (isDigit(charCodeUnchecked(pos + 1))) {
            scanNumber();
            return token = 9 /* NumericLiteral */;
          }
          if (charCodeUnchecked(pos + 1) === 46 /* dot */ && charCodeUnchecked(pos + 2) === 46 /* dot */) {
            return pos += 3, token = 26 /* DotDotDotToken */;
          }
          pos++;
          return token = 25 /* DotToken */;
        case 47 /* slash */:
          if (charCodeUnchecked(pos + 1) === 47 /* slash */) {
            pos += 2;
            while (pos < end) {
              if (isLineBreak(charCodeUnchecked(pos))) {
                break;
              }
              pos++;
            }
            commentDirectives = appendIfCommentDirective(
              commentDirectives,
              text.slice(tokenStart, pos),
              commentDirectiveRegExSingleLine,
              tokenStart
            );
            if (skipTrivia2) {
              continue;
            } else {
              return token = 2 /* SingleLineCommentTrivia */;
            }
          }
          if (charCodeUnchecked(pos + 1) === 42 /* asterisk */) {
            pos += 2;
            const isJSDoc2 = charCodeUnchecked(pos) === 42 /* asterisk */ && charCodeUnchecked(pos + 1) !== 47 /* slash */;
            let commentClosed = false;
            let lastLineStart = tokenStart;
            while (pos < end) {
              const ch2 = charCodeUnchecked(pos);
              if (ch2 === 42 /* asterisk */ && charCodeUnchecked(pos + 1) === 47 /* slash */) {
                pos += 2;
                commentClosed = true;
                break;
              }
              pos++;
              if (isLineBreak(ch2)) {
                lastLineStart = pos;
                tokenFlags |= 1 /* PrecedingLineBreak */;
              }
            }
            if (isJSDoc2 && shouldParseJSDoc()) {
              tokenFlags |= 2 /* PrecedingJSDocComment */;
            }
            commentDirectives = appendIfCommentDirective(commentDirectives, text.slice(lastLineStart, pos), commentDirectiveRegExMultiLine, lastLineStart);
            if (!commentClosed) {
              error2(Diagnostics.Asterisk_Slash_expected);
            }
            if (skipTrivia2) {
              continue;
            } else {
              if (!commentClosed) {
                tokenFlags |= 4 /* Unterminated */;
              }
              return token = 3 /* MultiLineCommentTrivia */;
            }
          }
          if (charCodeUnchecked(pos + 1) === 61 /* equals */) {
            return pos += 2, token = 69 /* SlashEqualsToken */;
          }
          pos++;
          return token = 44 /* SlashToken */;
        case 48 /* _0 */:
          if (pos + 2 < end && (charCodeUnchecked(pos + 1) === 88 /* X */ || charCodeUnchecked(pos + 1) === 120 /* x */)) {
            pos += 2;
            tokenValue = scanMinimumNumberOfHexDigits(
              1,
              /*canHaveSeparators*/
              true
            );
            if (!tokenValue) {
              error2(Diagnostics.Hexadecimal_digit_expected);
              tokenValue = "0";
            }
            tokenValue = "0x" + tokenValue;
            tokenFlags |= 64 /* HexSpecifier */;
            return token = checkBigIntSuffix();
          } else if (pos + 2 < end && (charCodeUnchecked(pos + 1) === 66 /* B */ || charCodeUnchecked(pos + 1) === 98 /* b */)) {
            pos += 2;
            tokenValue = scanBinaryOrOctalDigits(
              /* base */
              2
            );
            if (!tokenValue) {
              error2(Diagnostics.Binary_digit_expected);
              tokenValue = "0";
            }
            tokenValue = "0b" + tokenValue;
            tokenFlags |= 128 /* BinarySpecifier */;
            return token = checkBigIntSuffix();
          } else if (pos + 2 < end && (charCodeUnchecked(pos + 1) === 79 /* O */ || charCodeUnchecked(pos + 1) === 111 /* o */)) {
            pos += 2;
            tokenValue = scanBinaryOrOctalDigits(
              /* base */
              8
            );
            if (!tokenValue) {
              error2(Diagnostics.Octal_digit_expected);
              tokenValue = "0";
            }
            tokenValue = "0o" + tokenValue;
            tokenFlags |= 256 /* OctalSpecifier */;
            return token = checkBigIntSuffix();
          }
        // falls through
        case 49 /* _1 */:
        case 50 /* _2 */:
        case 51 /* _3 */:
        case 52 /* _4 */:
        case 53 /* _5 */:
        case 54 /* _6 */:
        case 55 /* _7 */:
        case 56 /* _8 */:
        case 57 /* _9 */:
          return token = scanNumber();
        case 58 /* colon */:
          pos++;
          return token = 59 /* ColonToken */;
        case 59 /* semicolon */:
          pos++;
          return token = 27 /* SemicolonToken */;
        case 60 /* lessThan */:
          if (isConflictMarkerTrivia(text, pos)) {
            pos = scanConflictMarkerTrivia(text, pos, error2);
            if (skipTrivia2) {
              continue;
            } else {
              return token = 7 /* ConflictMarkerTrivia */;
            }
          }
          if (charCodeUnchecked(pos + 1) === 60 /* lessThan */) {
            if (charCodeUnchecked(pos + 2) === 61 /* equals */) {
              return pos += 3, token = 71 /* LessThanLessThanEqualsToken */;
            }
            return pos += 2, token = 48 /* LessThanLessThanToken */;
          }
          if (charCodeUnchecked(pos + 1) === 61 /* equals */) {
            return pos += 2, token = 33 /* LessThanEqualsToken */;
          }
          if (languageVariant === 1 /* JSX */ && charCodeUnchecked(pos + 1) === 47 /* slash */ && charCodeUnchecked(pos + 2) !== 42 /* asterisk */) {
            return pos += 2, token = 31 /* LessThanSlashToken */;
          }
          pos++;
          return token = 30 /* LessThanToken */;
        case 61 /* equals */:
          if (isConflictMarkerTrivia(text, pos)) {
            pos = scanConflictMarkerTrivia(text, pos, error2);
            if (skipTrivia2) {
              continue;
            } else {
              return token = 7 /* ConflictMarkerTrivia */;
            }
          }
          if (charCodeUnchecked(pos + 1) === 61 /* equals */) {
            if (charCodeUnchecked(pos + 2) === 61 /* equals */) {
              return pos += 3, token = 37 /* EqualsEqualsEqualsToken */;
            }
            return pos += 2, token = 35 /* EqualsEqualsToken */;
          }
          if (charCodeUnchecked(pos + 1) === 62 /* greaterThan */) {
            return pos += 2, token = 39 /* EqualsGreaterThanToken */;
          }
          pos++;
          return token = 64 /* EqualsToken */;
        case 62 /* greaterThan */:
          if (isConflictMarkerTrivia(text, pos)) {
            pos = scanConflictMarkerTrivia(text, pos, error2);
            if (skipTrivia2) {
              continue;
            } else {
              return token = 7 /* ConflictMarkerTrivia */;
            }
          }
          pos++;
          return token = 32 /* GreaterThanToken */;
        case 63 /* question */:
          if (charCodeUnchecked(pos + 1) === 46 /* dot */ && !isDigit(charCodeUnchecked(pos + 2))) {
            return pos += 2, token = 29 /* QuestionDotToken */;
          }
          if (charCodeUnchecked(pos + 1) === 63 /* question */) {
            if (charCodeUnchecked(pos + 2) === 61 /* equals */) {
              return pos += 3, token = 78 /* QuestionQuestionEqualsToken */;
            }
            return pos += 2, token = 61 /* QuestionQuestionToken */;
          }
          pos++;
          return token = 58 /* QuestionToken */;
        case 91 /* openBracket */:
          pos++;
          return token = 23 /* OpenBracketToken */;
        case 93 /* closeBracket */:
          pos++;
          return token = 24 /* CloseBracketToken */;
        case 94 /* caret */:
          if (charCodeUnchecked(pos + 1) === 61 /* equals */) {
            return pos += 2, token = 79 /* CaretEqualsToken */;
          }
          pos++;
          return token = 53 /* CaretToken */;
        case 123 /* openBrace */:
          pos++;
          return token = 19 /* OpenBraceToken */;
        case 124 /* bar */:
          if (isConflictMarkerTrivia(text, pos)) {
            pos = scanConflictMarkerTrivia(text, pos, error2);
            if (skipTrivia2) {
              continue;
            } else {
              return token = 7 /* ConflictMarkerTrivia */;
            }
          }
          if (charCodeUnchecked(pos + 1) === 124 /* bar */) {
            if (charCodeUnchecked(pos + 2) === 61 /* equals */) {
              return pos += 3, token = 76 /* BarBarEqualsToken */;
            }
            return pos += 2, token = 57 /* BarBarToken */;
          }
          if (charCodeUnchecked(pos + 1) === 61 /* equals */) {
            return pos += 2, token = 75 /* BarEqualsToken */;
          }
          pos++;
          return token = 52 /* BarToken */;
        case 125 /* closeBrace */:
          pos++;
          return token = 20 /* CloseBraceToken */;
        case 126 /* tilde */:
          pos++;
          return token = 55 /* TildeToken */;
        case 64 /* at */:
          pos++;
          return token = 60 /* AtToken */;
        case 92 /* backslash */:
          const extendedCookedChar = peekExtendedUnicodeEscape();
          if (extendedCookedChar >= 0 && isIdentifierStart(extendedCookedChar, languageVersion)) {
            tokenValue = scanExtendedUnicodeEscape(
              /*shouldEmitInvalidEscapeError*/
              true
            ) + scanIdentifierParts();
            return token = getIdentifierToken();
          }
          const cookedChar = peekUnicodeEscape();
          if (cookedChar >= 0 && isIdentifierStart(cookedChar, languageVersion)) {
            pos += 6;
            tokenFlags |= 1024 /* UnicodeEscape */;
            tokenValue = String.fromCharCode(cookedChar) + scanIdentifierParts();
            return token = getIdentifierToken();
          }
          error2(Diagnostics.Invalid_character);
          pos++;
          return token = 0 /* Unknown */;
        case 35 /* hash */:
          if (pos !== 0 && text[pos + 1] === "!") {
            error2(Diagnostics.can_only_be_used_at_the_start_of_a_file, pos, 2);
            pos++;
            return token = 0 /* Unknown */;
          }
          const charAfterHash = codePointUnchecked(pos + 1);
          if (charAfterHash === 92 /* backslash */) {
            pos++;
            const extendedCookedChar2 = peekExtendedUnicodeEscape();
            if (extendedCookedChar2 >= 0 && isIdentifierStart(extendedCookedChar2, languageVersion)) {
              tokenValue = "#" + scanExtendedUnicodeEscape(
                /*shouldEmitInvalidEscapeError*/
                true
              ) + scanIdentifierParts();
              return token = 81 /* PrivateIdentifier */;
            }
            const cookedChar2 = peekUnicodeEscape();
            if (cookedChar2 >= 0 && isIdentifierStart(cookedChar2, languageVersion)) {
              pos += 6;
              tokenFlags |= 1024 /* UnicodeEscape */;
              tokenValue = "#" + String.fromCharCode(cookedChar2) + scanIdentifierParts();
              return token = 81 /* PrivateIdentifier */;
            }
            pos--;
          }
          if (isIdentifierStart(charAfterHash, languageVersion)) {
            pos++;
            scanIdentifier(charAfterHash, languageVersion);
          } else {
            tokenValue = "#";
            error2(Diagnostics.Invalid_character, pos++, charSize(ch));
          }
          return token = 81 /* PrivateIdentifier */;
        case 65533 /* replacementCharacter */:
          error2(Diagnostics.File_appears_to_be_binary, 0, 0);
          pos = end;
          return token = 8 /* NonTextFileMarkerTrivia */;
        default:
          const identifierKind = scanIdentifier(ch, languageVersion);
          if (identifierKind) {
            return token = identifierKind;
          } else if (isWhiteSpaceSingleLine(ch)) {
            pos += charSize(ch);
            continue;
          } else if (isLineBreak(ch)) {
            tokenFlags |= 1 /* PrecedingLineBreak */;
            pos += charSize(ch);
            continue;
          }
          const size = charSize(ch);
          error2(Diagnostics.Invalid_character, pos, size);
          pos += size;
          return token = 0 /* Unknown */;
      }
    }
  }
  function shouldParseJSDoc() {
    switch (jsDocParsingMode) {
      case 0 /* ParseAll */:
        return true;
      case 1 /* ParseNone */:
        return false;
    }
    if (scriptKind !== 3 /* TS */ && scriptKind !== 4 /* TSX */) {
      return true;
    }
    if (jsDocParsingMode === 3 /* ParseForTypeInfo */) {
      return false;
    }
    return jsDocSeeOrLink.test(text.slice(fullStartPos, pos));
  }
  function reScanInvalidIdentifier() {
    Debug.assert(token === 0 /* Unknown */, "'reScanInvalidIdentifier' should only be called when the current token is 'SyntaxKind.Unknown'.");
    pos = tokenStart = fullStartPos;
    tokenFlags = 0;
    const ch = codePointUnchecked(pos);
    const identifierKind = scanIdentifier(ch, 99 /* ESNext */);
    if (identifierKind) {
      return token = identifierKind;
    }
    pos += charSize(ch);
    return token;
  }
  function scanIdentifier(startCharacter, languageVersion2) {
    let ch = startCharacter;
    if (isIdentifierStart(ch, languageVersion2)) {
      pos += charSize(ch);
      while (pos < end && isIdentifierPart(ch = codePointUnchecked(pos), languageVersion2)) pos += charSize(ch);
      tokenValue = text.substring(tokenStart, pos);
      if (ch === 92 /* backslash */) {
        tokenValue += scanIdentifierParts();
      }
      return getIdentifierToken();
    }
  }
  function reScanGreaterToken() {
    if (token === 32 /* GreaterThanToken */) {
      if (charCodeUnchecked(pos) === 62 /* greaterThan */) {
        if (charCodeUnchecked(pos + 1) === 62 /* greaterThan */) {
          if (charCodeUnchecked(pos + 2) === 61 /* equals */) {
            return pos += 3, token = 73 /* GreaterThanGreaterThanGreaterThanEqualsToken */;
          }
          return pos += 2, token = 50 /* GreaterThanGreaterThanGreaterThanToken */;
        }
        if (charCodeUnchecked(pos + 1) === 61 /* equals */) {
          return pos += 2, token = 72 /* GreaterThanGreaterThanEqualsToken */;
        }
        pos++;
        return token = 49 /* GreaterThanGreaterThanToken */;
      }
      if (charCodeUnchecked(pos) === 61 /* equals */) {
        pos++;
        return token = 34 /* GreaterThanEqualsToken */;
      }
    }
    return token;
  }
  function reScanAsteriskEqualsToken() {
    Debug.assert(token === 67 /* AsteriskEqualsToken */, "'reScanAsteriskEqualsToken' should only be called on a '*='");
    pos = tokenStart + 1;
    return token = 64 /* EqualsToken */;
  }
  function reScanSlashToken(reportErrors2) {
    if (token === 44 /* SlashToken */ || token === 69 /* SlashEqualsToken */) {
      const startOfRegExpBody = tokenStart + 1;
      pos = startOfRegExpBody;
      let inEscape = false;
      let namedCaptureGroups = false;
      let inCharacterClass = false;
      while (true) {
        const ch = charCodeChecked(pos);
        if (ch === -1 /* EOF */ || isLineBreak(ch)) {
          tokenFlags |= 4 /* Unterminated */;
          break;
        }
        if (inEscape) {
          inEscape = false;
        } else if (ch === 47 /* slash */ && !inCharacterClass) {
          break;
        } else if (ch === 91 /* openBracket */) {
          inCharacterClass = true;
        } else if (ch === 92 /* backslash */) {
          inEscape = true;
        } else if (ch === 93 /* closeBracket */) {
          inCharacterClass = false;
        } else if (!inCharacterClass && ch === 40 /* openParen */ && charCodeChecked(pos + 1) === 63 /* question */ && charCodeChecked(pos + 2) === 60 /* lessThan */ && charCodeChecked(pos + 3) !== 61 /* equals */ && charCodeChecked(pos + 3) !== 33 /* exclamation */) {
          namedCaptureGroups = true;
        }
        pos++;
      }
      const endOfRegExpBody = pos;
      if (tokenFlags & 4 /* Unterminated */) {
        pos = startOfRegExpBody;
        inEscape = false;
        let characterClassDepth = 0;
        let inDecimalQuantifier = false;
        let groupDepth = 0;
        while (pos < endOfRegExpBody) {
          const ch = charCodeUnchecked(pos);
          if (inEscape) {
            inEscape = false;
          } else if (ch === 92 /* backslash */) {
            inEscape = true;
          } else if (ch === 91 /* openBracket */) {
            characterClassDepth++;
          } else if (ch === 93 /* closeBracket */ && characterClassDepth) {
            characterClassDepth--;
          } else if (!characterClassDepth) {
            if (ch === 123 /* openBrace */) {
              inDecimalQuantifier = true;
            } else if (ch === 125 /* closeBrace */ && inDecimalQuantifier) {
              inDecimalQuantifier = false;
            } else if (!inDecimalQuantifier) {
              if (ch === 40 /* openParen */) {
                groupDepth++;
              } else if (ch === 41 /* closeParen */ && groupDepth) {
                groupDepth--;
              } else if (ch === 41 /* closeParen */ || ch === 93 /* closeBracket */ || ch === 125 /* closeBrace */) {
                break;
              }
            }
          }
          pos++;
        }
        while (isWhiteSpaceLike(charCodeChecked(pos - 1)) || charCodeChecked(pos - 1) === 59 /* semicolon */) pos--;
        error2(Diagnostics.Unterminated_regular_expression_literal, tokenStart, pos - tokenStart);
      } else {
        pos++;
        let regExpFlags = 0 /* None */;
        while (true) {
          const ch = codePointChecked(pos);
          if (ch === -1 /* EOF */ || !isIdentifierPart(ch, languageVersion)) {
            break;
          }
          const size = charSize(ch);
          if (reportErrors2) {
            const flag = characterCodeToRegularExpressionFlag(ch);
            if (flag === void 0) {
              error2(Diagnostics.Unknown_regular_expression_flag, pos, size);
            } else if (regExpFlags & flag) {
              error2(Diagnostics.Duplicate_regular_expression_flag, pos, size);
            } else if (((regExpFlags | flag) & 96 /* AnyUnicodeMode */) === 96 /* AnyUnicodeMode */) {
              error2(Diagnostics.The_Unicode_u_flag_and_the_Unicode_Sets_v_flag_cannot_be_set_simultaneously, pos, size);
            } else {
              regExpFlags |= flag;
              checkRegularExpressionFlagAvailability(flag, size);
            }
          }
          pos += size;
        }
        if (reportErrors2) {
          scanRange(startOfRegExpBody, endOfRegExpBody - startOfRegExpBody, () => {
            scanRegularExpressionWorker(
              regExpFlags,
              /*annexB*/
              true,
              namedCaptureGroups
            );
          });
        }
      }
      tokenValue = text.substring(tokenStart, pos);
      token = 14 /* RegularExpressionLiteral */;
    }
    return token;
  }
  function scanRegularExpressionWorker(regExpFlags, annexB, namedCaptureGroups) {
    var unicodeSetsMode = !!(regExpFlags & 64 /* UnicodeSets */);
    var anyUnicodeMode = !!(regExpFlags & 96 /* AnyUnicodeMode */);
    var anyUnicodeModeOrNonAnnexB = anyUnicodeMode || !annexB;
    var mayContainStrings = false;
    var numberOfCapturingGroups = 0;
    var groupSpecifiers;
    var groupNameReferences;
    var decimalEscapes;
    var namedCapturingGroupsScopeStack = [];
    var topNamedCapturingGroupsScope;
    function scanDisjunction(isInGroup) {
      while (true) {
        namedCapturingGroupsScopeStack.push(topNamedCapturingGroupsScope);
        topNamedCapturingGroupsScope = void 0;
        scanAlternative(isInGroup);
        topNamedCapturingGroupsScope = namedCapturingGroupsScopeStack.pop();
        if (charCodeChecked(pos) !== 124 /* bar */) {
          return;
        }
        pos++;
      }
    }
    function scanAlternative(isInGroup) {
      let isPreviousTermQuantifiable = false;
      while (true) {
        const start2 = pos;
        const ch = charCodeChecked(pos);
        switch (ch) {
          case -1 /* EOF */:
            return;
          case 94 /* caret */:
          case 36 /* $ */:
            pos++;
            isPreviousTermQuantifiable = false;
            break;
          case 92 /* backslash */:
            pos++;
            switch (charCodeChecked(pos)) {
              case 98 /* b */:
              case 66 /* B */:
                pos++;
                isPreviousTermQuantifiable = false;
                break;
              default:
                scanAtomEscape();
                isPreviousTermQuantifiable = true;
                break;
            }
            break;
          case 40 /* openParen */:
            pos++;
            if (charCodeChecked(pos) === 63 /* question */) {
              pos++;
              switch (charCodeChecked(pos)) {
                case 61 /* equals */:
                case 33 /* exclamation */:
                  pos++;
                  isPreviousTermQuantifiable = !anyUnicodeModeOrNonAnnexB;
                  break;
                case 60 /* lessThan */:
                  const groupNameStart = pos;
                  pos++;
                  switch (charCodeChecked(pos)) {
                    case 61 /* equals */:
                    case 33 /* exclamation */:
                      pos++;
                      isPreviousTermQuantifiable = false;
                      break;
                    default:
                      scanGroupName(
                        /*isReference*/
                        false
                      );
                      scanExpectedChar(62 /* greaterThan */);
                      if (languageVersion < 5 /* ES2018 */) {
                        error2(Diagnostics.Named_capturing_groups_are_only_available_when_targeting_ES2018_or_later, groupNameStart, pos - groupNameStart);
                      }
                      numberOfCapturingGroups++;
                      isPreviousTermQuantifiable = true;
                      break;
                  }
                  break;
                default:
                  const start3 = pos;
                  const setFlags = scanPatternModifiers(0 /* None */);
                  if (charCodeChecked(pos) === 45 /* minus */) {
                    pos++;
                    scanPatternModifiers(setFlags);
                    if (pos === start3 + 1) {
                      error2(Diagnostics.Subpattern_flags_must_be_present_when_there_is_a_minus_sign, start3, pos - start3);
                    }
                  }
                  scanExpectedChar(58 /* colon */);
                  isPreviousTermQuantifiable = true;
                  break;
              }
            } else {
              numberOfCapturingGroups++;
              isPreviousTermQuantifiable = true;
            }
            scanDisjunction(
              /*isInGroup*/
              true
            );
            scanExpectedChar(41 /* closeParen */);
            break;
          case 123 /* openBrace */:
            pos++;
            const digitsStart = pos;
            scanDigits();
            const min2 = tokenValue;
            if (!anyUnicodeModeOrNonAnnexB && !min2) {
              isPreviousTermQuantifiable = true;
              break;
            }
            if (charCodeChecked(pos) === 44 /* comma */) {
              pos++;
              scanDigits();
              const max = tokenValue;
              if (!min2) {
                if (max || charCodeChecked(pos) === 125 /* closeBrace */) {
                  error2(Diagnostics.Incomplete_quantifier_Digit_expected, digitsStart, 0);
                } else {
                  error2(Diagnostics.Unexpected_0_Did_you_mean_to_escape_it_with_backslash, start2, 1, String.fromCharCode(ch));
                  isPreviousTermQuantifiable = true;
                  break;
                }
              } else if (max && Number.parseInt(min2) > Number.parseInt(max) && (anyUnicodeModeOrNonAnnexB || charCodeChecked(pos) === 125 /* closeBrace */)) {
                error2(Diagnostics.Numbers_out_of_order_in_quantifier, digitsStart, pos - digitsStart);
              }
            } else if (!min2) {
              if (anyUnicodeModeOrNonAnnexB) {
                error2(Diagnostics.Unexpected_0_Did_you_mean_to_escape_it_with_backslash, start2, 1, String.fromCharCode(ch));
              }
              isPreviousTermQuantifiable = true;
              break;
            }
            if (charCodeChecked(pos) !== 125 /* closeBrace */) {
              if (anyUnicodeModeOrNonAnnexB) {
                error2(Diagnostics._0_expected, pos, 0, String.fromCharCode(125 /* closeBrace */));
                pos--;
              } else {
                isPreviousTermQuantifiable = true;
                break;
              }
            }
          // falls through
          case 42 /* asterisk */:
          case 43 /* plus */:
          case 63 /* question */:
            pos++;
            if (charCodeChecked(pos) === 63 /* question */) {
              pos++;
            }
            if (!isPreviousTermQuantifiable) {
              error2(Diagnostics.There_is_nothing_available_for_repetition, start2, pos - start2);
            }
            isPreviousTermQuantifiable = false;
            break;
          case 46 /* dot */:
            pos++;
            isPreviousTermQuantifiable = true;
            break;
          case 91 /* openBracket */:
            pos++;
            if (unicodeSetsMode) {
              scanClassSetExpression();
            } else {
              scanClassRanges();
            }
            scanExpectedChar(93 /* closeBracket */);
            isPreviousTermQuantifiable = true;
            break;
          case 41 /* closeParen */:
            if (isInGroup) {
              return;
            }
          // falls through
          case 93 /* closeBracket */:
          case 125 /* closeBrace */:
            if (anyUnicodeModeOrNonAnnexB || ch === 41 /* closeParen */) {
              error2(Diagnostics.Unexpected_0_Did_you_mean_to_escape_it_with_backslash, pos, 1, String.fromCharCode(ch));
            }
            pos++;
            isPreviousTermQuantifiable = true;
            break;
          case 47 /* slash */:
          case 124 /* bar */:
            return;
          default:
            scanSourceCharacter();
            isPreviousTermQuantifiable = true;
            break;
        }
      }
    }
    function scanPatternModifiers(currFlags) {
      while (true) {
        const ch = codePointChecked(pos);
        if (ch === -1 /* EOF */ || !isIdentifierPart(ch, languageVersion)) {
          break;
        }
        const size = charSize(ch);
        const flag = characterCodeToRegularExpressionFlag(ch);
        if (flag === void 0) {
          error2(Diagnostics.Unknown_regular_expression_flag, pos, size);
        } else if (currFlags & flag) {
          error2(Diagnostics.Duplicate_regular_expression_flag, pos, size);
        } else if (!(flag & 28 /* Modifiers */)) {
          error2(Diagnostics.This_regular_expression_flag_cannot_be_toggled_within_a_subpattern, pos, size);
        } else {
          currFlags |= flag;
          checkRegularExpressionFlagAvailability(flag, size);
        }
        pos += size;
      }
      return currFlags;
    }
    function scanAtomEscape() {
      Debug.assertEqual(charCodeUnchecked(pos - 1), 92 /* backslash */);
      switch (charCodeChecked(pos)) {
        case 107 /* k */:
          pos++;
          if (charCodeChecked(pos) === 60 /* lessThan */) {
            pos++;
            scanGroupName(
              /*isReference*/
              true
            );
            scanExpectedChar(62 /* greaterThan */);
          } else if (anyUnicodeModeOrNonAnnexB || namedCaptureGroups) {
            error2(Diagnostics.k_must_be_followed_by_a_capturing_group_name_enclosed_in_angle_brackets, pos - 2, 2);
          }
          break;
        case 113 /* q */:
          if (unicodeSetsMode) {
            pos++;
            error2(Diagnostics.q_is_only_available_inside_character_class, pos - 2, 2);
            break;
          }
        // falls through
        default:
          Debug.assert(scanCharacterClassEscape() || scanDecimalEscape() || scanCharacterEscape(
            /*atomEscape*/
            true
          ));
          break;
      }
    }
    function scanDecimalEscape() {
      Debug.assertEqual(charCodeUnchecked(pos - 1), 92 /* backslash */);
      const ch = charCodeChecked(pos);
      if (ch >= 49 /* _1 */ && ch <= 57 /* _9 */) {
        const start2 = pos;
        scanDigits();
        decimalEscapes = append(decimalEscapes, { pos: start2, end: pos, value: +tokenValue });
        return true;
      }
      return false;
    }
    function scanCharacterEscape(atomEscape) {
      Debug.assertEqual(charCodeUnchecked(pos - 1), 92 /* backslash */);
      let ch = charCodeChecked(pos);
      switch (ch) {
        case -1 /* EOF */:
          error2(Diagnostics.Undetermined_character_escape, pos - 1, 1);
          return "\\";
        case 99 /* c */:
          pos++;
          ch = charCodeChecked(pos);
          if (isASCIILetter(ch)) {
            pos++;
            return String.fromCharCode(ch & 31);
          }
          if (anyUnicodeModeOrNonAnnexB) {
            error2(Diagnostics.c_must_be_followed_by_an_ASCII_letter, pos - 2, 2);
          } else if (atomEscape) {
            pos--;
            return "\\";
          }
          return String.fromCharCode(ch);
        case 94 /* caret */:
        case 36 /* $ */:
        case 47 /* slash */:
        case 92 /* backslash */:
        case 46 /* dot */:
        case 42 /* asterisk */:
        case 43 /* plus */:
        case 63 /* question */:
        case 40 /* openParen */:
        case 41 /* closeParen */:
        case 91 /* openBracket */:
        case 93 /* closeBracket */:
        case 123 /* openBrace */:
        case 125 /* closeBrace */:
        case 124 /* bar */:
          pos++;
          return String.fromCharCode(ch);
        default:
          pos--;
          return scanEscapeSequence(
            4 /* RegularExpression */ | (annexB ? 8 /* AnnexB */ : 0) | (anyUnicodeMode ? 16 /* AnyUnicodeMode */ : 0) | (atomEscape ? 32 /* AtomEscape */ : 0)
          );
      }
    }
    function scanGroupName(isReference) {
      Debug.assertEqual(charCodeUnchecked(pos - 1), 60 /* lessThan */);
      tokenStart = pos;
      scanIdentifier(codePointChecked(pos), languageVersion);
      if (pos === tokenStart) {
        error2(Diagnostics.Expected_a_capturing_group_name);
      } else if (isReference) {
        groupNameReferences = append(groupNameReferences, { pos: tokenStart, end: pos, name: tokenValue });
      } else if ((topNamedCapturingGroupsScope == null ? void 0 : topNamedCapturingGroupsScope.has(tokenValue)) || namedCapturingGroupsScopeStack.some((group2) => group2 == null ? void 0 : group2.has(tokenValue))) {
        error2(Diagnostics.Named_capturing_groups_with_the_same_name_must_be_mutually_exclusive_to_each_other, tokenStart, pos - tokenStart);
      } else {
        topNamedCapturingGroupsScope ?? (topNamedCapturingGroupsScope = /* @__PURE__ */ new Set());
        topNamedCapturingGroupsScope.add(tokenValue);
        groupSpecifiers ?? (groupSpecifiers = /* @__PURE__ */ new Set());
        groupSpecifiers.add(tokenValue);
      }
    }
    function isClassContentExit(ch) {
      return ch === 93 /* closeBracket */ || ch === -1 /* EOF */ || pos >= end;
    }
    function scanClassRanges() {
      Debug.assertEqual(charCodeUnchecked(pos - 1), 91 /* openBracket */);
      if (charCodeChecked(pos) === 94 /* caret */) {
        pos++;
      }
      while (true) {
        const ch = charCodeChecked(pos);
        if (isClassContentExit(ch)) {
          return;
        }
        const minStart = pos;
        const minCharacter = scanClassAtom();
        if (charCodeChecked(pos) === 45 /* minus */) {
          pos++;
          const ch2 = charCodeChecked(pos);
          if (isClassContentExit(ch2)) {
            return;
          }
          if (!minCharacter && anyUnicodeModeOrNonAnnexB) {
            error2(Diagnostics.A_character_class_range_must_not_be_bounded_by_another_character_class, minStart, pos - 1 - minStart);
          }
          const maxStart = pos;
          const maxCharacter = scanClassAtom();
          if (!maxCharacter && anyUnicodeModeOrNonAnnexB) {
            error2(Diagnostics.A_character_class_range_must_not_be_bounded_by_another_character_class, maxStart, pos - maxStart);
            continue;
          }
          if (!minCharacter) {
            continue;
          }
          const minCharacterValue = codePointAt(minCharacter, 0);
          const maxCharacterValue = codePointAt(maxCharacter, 0);
          if (minCharacter.length === charSize(minCharacterValue) && maxCharacter.length === charSize(maxCharacterValue) && minCharacterValue > maxCharacterValue) {
            error2(Diagnostics.Range_out_of_order_in_character_class, minStart, pos - minStart);
          }
        }
      }
    }
    function scanClassSetExpression() {
      Debug.assertEqual(charCodeUnchecked(pos - 1), 91 /* openBracket */);
      let isCharacterComplement = false;
      if (charCodeChecked(pos) === 94 /* caret */) {
        pos++;
        isCharacterComplement = true;
      }
      let expressionMayContainStrings = false;
      let ch = charCodeChecked(pos);
      if (isClassContentExit(ch)) {
        return;
      }
      let start2 = pos;
      let operand;
      switch (text.slice(pos, pos + 2)) {
        // TODO: don't use slice
        case "--":
        case "&&":
          error2(Diagnostics.Expected_a_class_set_operand);
          mayContainStrings = false;
          break;
        default:
          operand = scanClassSetOperand();
          break;
      }
      switch (charCodeChecked(pos)) {
        case 45 /* minus */:
          if (charCodeChecked(pos + 1) === 45 /* minus */) {
            if (isCharacterComplement && mayContainStrings) {
              error2(Diagnostics.Anything_that_would_possibly_match_more_than_a_single_character_is_invalid_inside_a_negated_character_class, start2, pos - start2);
            }
            expressionMayContainStrings = mayContainStrings;
            scanClassSetSubExpression(3 /* ClassSubtraction */);
            mayContainStrings = !isCharacterComplement && expressionMayContainStrings;
            return;
          }
          break;
        case 38 /* ampersand */:
          if (charCodeChecked(pos + 1) === 38 /* ampersand */) {
            scanClassSetSubExpression(2 /* ClassIntersection */);
            if (isCharacterComplement && mayContainStrings) {
              error2(Diagnostics.Anything_that_would_possibly_match_more_than_a_single_character_is_invalid_inside_a_negated_character_class, start2, pos - start2);
            }
            expressionMayContainStrings = mayContainStrings;
            mayContainStrings = !isCharacterComplement && expressionMayContainStrings;
            return;
          } else {
            error2(Diagnostics.Unexpected_0_Did_you_mean_to_escape_it_with_backslash, pos, 1, String.fromCharCode(ch));
          }
          break;
        default:
          if (isCharacterComplement && mayContainStrings) {
            error2(Diagnostics.Anything_that_would_possibly_match_more_than_a_single_character_is_invalid_inside_a_negated_character_class, start2, pos - start2);
          }
          expressionMayContainStrings = mayContainStrings;
          break;
      }
      while (true) {
        ch = charCodeChecked(pos);
        if (ch === -1 /* EOF */) {
          break;
        }
        switch (ch) {
          case 45 /* minus */:
            pos++;
            ch = charCodeChecked(pos);
            if (isClassContentExit(ch)) {
              mayContainStrings = !isCharacterComplement && expressionMayContainStrings;
              return;
            }
            if (ch === 45 /* minus */) {
              pos++;
              error2(Diagnostics.Operators_must_not_be_mixed_within_a_character_class_Wrap_it_in_a_nested_class_instead, pos - 2, 2);
              start2 = pos - 2;
              operand = text.slice(start2, pos);
              continue;
            } else {
              if (!operand) {
                error2(Diagnostics.A_character_class_range_must_not_be_bounded_by_another_character_class, start2, pos - 1 - start2);
              }
              const secondStart = pos;
              const secondOperand = scanClassSetOperand();
              if (isCharacterComplement && mayContainStrings) {
                error2(Diagnostics.Anything_that_would_possibly_match_more_than_a_single_character_is_invalid_inside_a_negated_character_class, secondStart, pos - secondStart);
              }
              expressionMayContainStrings || (expressionMayContainStrings = mayContainStrings);
              if (!secondOperand) {
                error2(Diagnostics.A_character_class_range_must_not_be_bounded_by_another_character_class, secondStart, pos - secondStart);
                break;
              }
              if (!operand) {
                break;
              }
              const minCharacterValue = codePointAt(operand, 0);
              const maxCharacterValue = codePointAt(secondOperand, 0);
              if (operand.length === charSize(minCharacterValue) && secondOperand.length === charSize(maxCharacterValue) && minCharacterValue > maxCharacterValue) {
                error2(Diagnostics.Range_out_of_order_in_character_class, start2, pos - start2);
              }
            }
            break;
          case 38 /* ampersand */:
            start2 = pos;
            pos++;
            if (charCodeChecked(pos) === 38 /* ampersand */) {
              pos++;
              error2(Diagnostics.Operators_must_not_be_mixed_within_a_character_class_Wrap_it_in_a_nested_class_instead, pos - 2, 2);
              if (charCodeChecked(pos) === 38 /* ampersand */) {
                error2(Diagnostics.Unexpected_0_Did_you_mean_to_escape_it_with_backslash, pos, 1, String.fromCharCode(ch));
                pos++;
              }
            } else {
              error2(Diagnostics.Unexpected_0_Did_you_mean_to_escape_it_with_backslash, pos - 1, 1, String.fromCharCode(ch));
            }
            operand = text.slice(start2, pos);
            continue;
        }
        if (isClassContentExit(charCodeChecked(pos))) {
          break;
        }
        start2 = pos;
        switch (text.slice(pos, pos + 2)) {
          // TODO: don't use slice
          case "--":
          case "&&":
            error2(Diagnostics.Operators_must_not_be_mixed_within_a_character_class_Wrap_it_in_a_nested_class_instead, pos, 2);
            pos += 2;
            operand = text.slice(start2, pos);
            break;
          default:
            operand = scanClassSetOperand();
            break;
        }
      }
      mayContainStrings = !isCharacterComplement && expressionMayContainStrings;
    }
    function scanClassSetSubExpression(expressionType) {
      let expressionMayContainStrings = mayContainStrings;
      while (true) {
        let ch = charCodeChecked(pos);
        if (isClassContentExit(ch)) {
          break;
        }
        switch (ch) {
          case 45 /* minus */:
            pos++;
            if (charCodeChecked(pos) === 45 /* minus */) {
              pos++;
              if (expressionType !== 3 /* ClassSubtraction */) {
                error2(Diagnostics.Operators_must_not_be_mixed_within_a_character_class_Wrap_it_in_a_nested_class_instead, pos - 2, 2);
              }
            } else {
              error2(Diagnostics.Operators_must_not_be_mixed_within_a_character_class_Wrap_it_in_a_nested_class_instead, pos - 1, 1);
            }
            break;
          case 38 /* ampersand */:
            pos++;
            if (charCodeChecked(pos) === 38 /* ampersand */) {
              pos++;
              if (expressionType !== 2 /* ClassIntersection */) {
                error2(Diagnostics.Operators_must_not_be_mixed_within_a_character_class_Wrap_it_in_a_nested_class_instead, pos - 2, 2);
              }
              if (charCodeChecked(pos) === 38 /* ampersand */) {
                error2(Diagnostics.Unexpected_0_Did_you_mean_to_escape_it_with_backslash, pos, 1, String.fromCharCode(ch));
                pos++;
              }
            } else {
              error2(Diagnostics.Unexpected_0_Did_you_mean_to_escape_it_with_backslash, pos - 1, 1, String.fromCharCode(ch));
            }
            break;
          default:
            switch (expressionType) {
              case 3 /* ClassSubtraction */:
                error2(Diagnostics._0_expected, pos, 0, "--");
                break;
              case 2 /* ClassIntersection */:
                error2(Diagnostics._0_expected, pos, 0, "&&");
                break;
              default:
                break;
            }
            break;
        }
        ch = charCodeChecked(pos);
        if (isClassContentExit(ch)) {
          error2(Diagnostics.Expected_a_class_set_operand);
          break;
        }
        scanClassSetOperand();
        expressionMayContainStrings && (expressionMayContainStrings = mayContainStrings);
      }
      mayContainStrings = expressionMayContainStrings;
    }
    function scanClassSetOperand() {
      mayContainStrings = false;
      switch (charCodeChecked(pos)) {
        case -1 /* EOF */:
          return "";
        case 91 /* openBracket */:
          pos++;
          scanClassSetExpression();
          scanExpectedChar(93 /* closeBracket */);
          return "";
        case 92 /* backslash */:
          pos++;
          if (scanCharacterClassEscape()) {
            return "";
          } else if (charCodeChecked(pos) === 113 /* q */) {
            pos++;
            if (charCodeChecked(pos) === 123 /* openBrace */) {
              pos++;
              scanClassStringDisjunctionContents();
              scanExpectedChar(125 /* closeBrace */);
              return "";
            } else {
              error2(Diagnostics.q_must_be_followed_by_string_alternatives_enclosed_in_braces, pos - 2, 2);
              return "q";
            }
          }
          pos--;
        // falls through
        default:
          return scanClassSetCharacter();
      }
    }
    function scanClassStringDisjunctionContents() {
      Debug.assertEqual(charCodeUnchecked(pos - 1), 123 /* openBrace */);
      let characterCount = 0;
      while (true) {
        const ch = charCodeChecked(pos);
        switch (ch) {
          case -1 /* EOF */:
            return;
          case 125 /* closeBrace */:
            if (characterCount !== 1) {
              mayContainStrings = true;
            }
            return;
          case 124 /* bar */:
            if (characterCount !== 1) {
              mayContainStrings = true;
            }
            pos++;
            start = pos;
            characterCount = 0;
            break;
          default:
            scanClassSetCharacter();
            characterCount++;
            break;
        }
      }
    }
    function scanClassSetCharacter() {
      const ch = charCodeChecked(pos);
      if (ch === -1 /* EOF */) {
        return "";
      }
      if (ch === 92 /* backslash */) {
        pos++;
        const ch2 = charCodeChecked(pos);
        switch (ch2) {
          case 98 /* b */:
            pos++;
            return "\b";
          case 38 /* ampersand */:
          case 45 /* minus */:
          case 33 /* exclamation */:
          case 35 /* hash */:
          case 37 /* percent */:
          case 44 /* comma */:
          case 58 /* colon */:
          case 59 /* semicolon */:
          case 60 /* lessThan */:
          case 61 /* equals */:
          case 62 /* greaterThan */:
          case 64 /* at */:
          case 96 /* backtick */:
          case 126 /* tilde */:
            pos++;
            return String.fromCharCode(ch2);
          default:
            return scanCharacterEscape(
              /*atomEscape*/
              false
            );
        }
      } else if (ch === charCodeChecked(pos + 1)) {
        switch (ch) {
          case 38 /* ampersand */:
          case 33 /* exclamation */:
          case 35 /* hash */:
          case 37 /* percent */:
          case 42 /* asterisk */:
          case 43 /* plus */:
          case 44 /* comma */:
          case 46 /* dot */:
          case 58 /* colon */:
          case 59 /* semicolon */:
          case 60 /* lessThan */:
          case 61 /* equals */:
          case 62 /* greaterThan */:
          case 63 /* question */:
          case 64 /* at */:
          case 96 /* backtick */:
          case 126 /* tilde */:
            error2(Diagnostics.A_character_class_must_not_contain_a_reserved_double_punctuator_Did_you_mean_to_escape_it_with_backslash, pos, 2);
            pos += 2;
            return text.substring(pos - 2, pos);
        }
      }
      switch (ch) {
        case 47 /* slash */:
        case 40 /* openParen */:
        case 41 /* closeParen */:
        case 91 /* openBracket */:
        case 93 /* closeBracket */:
        case 123 /* openBrace */:
        case 125 /* closeBrace */:
        case 45 /* minus */:
        case 124 /* bar */:
          error2(Diagnostics.Unexpected_0_Did_you_mean_to_escape_it_with_backslash, pos, 1, String.fromCharCode(ch));
          pos++;
          return String.fromCharCode(ch);
      }
      return scanSourceCharacter();
    }
    function scanClassAtom() {
      if (charCodeChecked(pos) === 92 /* backslash */) {
        pos++;
        const ch = charCodeChecked(pos);
        switch (ch) {
          case 98 /* b */:
            pos++;
            return "\b";
          case 45 /* minus */:
            pos++;
            return String.fromCharCode(ch);
          default:
            if (scanCharacterClassEscape()) {
              return "";
            }
            return scanCharacterEscape(
              /*atomEscape*/
              false
            );
        }
      } else {
        return scanSourceCharacter();
      }
    }
    function scanCharacterClassEscape() {
      Debug.assertEqual(charCodeUnchecked(pos - 1), 92 /* backslash */);
      let isCharacterComplement = false;
      const start2 = pos - 1;
      const ch = charCodeChecked(pos);
      switch (ch) {
        case 100 /* d */:
        case 68 /* D */:
        case 115 /* s */:
        case 83 /* S */:
        case 119 /* w */:
        case 87 /* W */:
          pos++;
          return true;
        case 80 /* P */:
          isCharacterComplement = true;
        // falls through
        case 112 /* p */:
          pos++;
          if (charCodeChecked(pos) === 123 /* openBrace */) {
            pos++;
            const propertyNameOrValueStart = pos;
            const propertyNameOrValue = scanWordCharacters();
            if (charCodeChecked(pos) === 61 /* equals */) {
              const propertyName = nonBinaryUnicodeProperties.get(propertyNameOrValue);
              if (pos === propertyNameOrValueStart) {
                error2(Diagnostics.Expected_a_Unicode_property_name);
              } else if (propertyName === void 0) {
                error2(Diagnostics.Unknown_Unicode_property_name, propertyNameOrValueStart, pos - propertyNameOrValueStart);
                const suggestion = getSpellingSuggestion(propertyNameOrValue, nonBinaryUnicodeProperties.keys(), identity);
                if (suggestion) {
                  error2(Diagnostics.Did_you_mean_0, propertyNameOrValueStart, pos - propertyNameOrValueStart, suggestion);
                }
              }
              pos++;
              const propertyValueStart = pos;
              const propertyValue = scanWordCharacters();
              if (pos === propertyValueStart) {
                error2(Diagnostics.Expected_a_Unicode_property_value);
              } else if (propertyName !== void 0 && !valuesOfNonBinaryUnicodeProperties[propertyName].has(propertyValue)) {
                error2(Diagnostics.Unknown_Unicode_property_value, propertyValueStart, pos - propertyValueStart);
                const suggestion = getSpellingSuggestion(propertyValue, valuesOfNonBinaryUnicodeProperties[propertyName], identity);
                if (suggestion) {
                  error2(Diagnostics.Did_you_mean_0, propertyValueStart, pos - propertyValueStart, suggestion);
                }
              }
            } else {
              if (pos === propertyNameOrValueStart) {
                error2(Diagnostics.Expected_a_Unicode_property_name_or_value);
              } else if (binaryUnicodePropertiesOfStrings.has(propertyNameOrValue)) {
                if (!unicodeSetsMode) {
                  error2(Diagnostics.Any_Unicode_property_that_would_possibly_match_more_than_a_single_character_is_only_available_when_the_Unicode_Sets_v_flag_is_set, propertyNameOrValueStart, pos - propertyNameOrValueStart);
                } else if (isCharacterComplement) {
                  error2(Diagnostics.Anything_that_would_possibly_match_more_than_a_single_character_is_invalid_inside_a_negated_character_class, propertyNameOrValueStart, pos - propertyNameOrValueStart);
                } else {
                  mayContainStrings = true;
                }
              } else if (!valuesOfNonBinaryUnicodeProperties.General_Category.has(propertyNameOrValue) && !binaryUnicodeProperties.has(propertyNameOrValue)) {
                error2(Diagnostics.Unknown_Unicode_property_name_or_value, propertyNameOrValueStart, pos - propertyNameOrValueStart);
                const suggestion = getSpellingSuggestion(propertyNameOrValue, [...valuesOfNonBinaryUnicodeProperties.General_Category, ...binaryUnicodeProperties, ...binaryUnicodePropertiesOfStrings], identity);
                if (suggestion) {
                  error2(Diagnostics.Did_you_mean_0, propertyNameOrValueStart, pos - propertyNameOrValueStart, suggestion);
                }
              }
            }
            scanExpectedChar(125 /* closeBrace */);
            if (!anyUnicodeMode) {
              error2(Diagnostics.Unicode_property_value_expressions_are_only_available_when_the_Unicode_u_flag_or_the_Unicode_Sets_v_flag_is_set, start2, pos - start2);
            }
          } else if (anyUnicodeModeOrNonAnnexB) {
            error2(Diagnostics._0_must_be_followed_by_a_Unicode_property_value_expression_enclosed_in_braces, pos - 2, 2, String.fromCharCode(ch));
          } else {
            pos--;
            return false;
          }
          return true;
      }
      return false;
    }
    function scanWordCharacters() {
      let value = "";
      while (true) {
        const ch = charCodeChecked(pos);
        if (ch === -1 /* EOF */ || !isWordCharacter(ch)) {
          break;
        }
        value += String.fromCharCode(ch);
        pos++;
      }
      return value;
    }
    function scanSourceCharacter() {
      const size = anyUnicodeMode ? charSize(codePointChecked(pos)) : 1;
      pos += size;
      return size > 0 ? text.substring(pos - size, pos) : "";
    }
    function scanExpectedChar(ch) {
      if (charCodeChecked(pos) === ch) {
        pos++;
      } else {
        error2(Diagnostics._0_expected, pos, 0, String.fromCharCode(ch));
      }
    }
    scanDisjunction(
      /*isInGroup*/
      false
    );
    forEach(groupNameReferences, (reference) => {
      if (!(groupSpecifiers == null ? void 0 : groupSpecifiers.has(reference.name))) {
        error2(Diagnostics.There_is_no_capturing_group_named_0_in_this_regular_expression, reference.pos, reference.end - reference.pos, reference.name);
        if (groupSpecifiers) {
          const suggestion = getSpellingSuggestion(reference.name, groupSpecifiers, identity);
          if (suggestion) {
            error2(Diagnostics.Did_you_mean_0, reference.pos, reference.end - reference.pos, suggestion);
          }
        }
      }
    });
    forEach(decimalEscapes, (escape) => {
      if (escape.value > numberOfCapturingGroups) {
        if (numberOfCapturingGroups) {
          error2(Diagnostics.This_backreference_refers_to_a_group_that_does_not_exist_There_are_only_0_capturing_groups_in_this_regular_expression, escape.pos, escape.end - escape.pos, numberOfCapturingGroups);
        } else {
          error2(Diagnostics.This_backreference_refers_to_a_group_that_does_not_exist_There_are_no_capturing_groups_in_this_regular_expression, escape.pos, escape.end - escape.pos);
        }
      }
    });
  }
  function checkRegularExpressionFlagAvailability(flag, size) {
    const availableFrom = regExpFlagToFirstAvailableLanguageVersion.get(flag);
    if (availableFrom && languageVersion < availableFrom) {
      error2(Diagnostics.This_regular_expression_flag_is_only_available_when_targeting_0_or_later, pos, size, getNameOfScriptTarget(availableFrom));
    }
  }
  function appendIfCommentDirective(commentDirectives2, text2, commentDirectiveRegEx, lineStart) {
    const type = getDirectiveFromComment(text2.trimStart(), commentDirectiveRegEx);
    if (type === void 0) {
      return commentDirectives2;
    }
    return append(
      commentDirectives2,
      {
        range: { pos: lineStart, end: pos },
        type
      }
    );
  }
  function getDirectiveFromComment(text2, commentDirectiveRegEx) {
    const match = commentDirectiveRegEx.exec(text2);
    if (!match) {
      return void 0;
    }
    switch (match[1]) {
      case "ts-expect-error":
        return 0 /* ExpectError */;
      case "ts-ignore":
        return 1 /* Ignore */;
    }
    return void 0;
  }
  function reScanTemplateToken(isTaggedTemplate) {
    pos = tokenStart;
    return token = scanTemplateAndSetTokenValue(!isTaggedTemplate);
  }
  function reScanTemplateHeadOrNoSubstitutionTemplate() {
    pos = tokenStart;
    return token = scanTemplateAndSetTokenValue(
      /*shouldEmitInvalidEscapeError*/
      true
    );
  }
  function reScanJsxToken(allowMultilineJsxText = true) {
    pos = tokenStart = fullStartPos;
    return token = scanJsxToken(allowMultilineJsxText);
  }
  function reScanLessThanToken() {
    if (token === 48 /* LessThanLessThanToken */) {
      pos = tokenStart + 1;
      return token = 30 /* LessThanToken */;
    }
    return token;
  }
  function reScanHashToken() {
    if (token === 81 /* PrivateIdentifier */) {
      pos = tokenStart + 1;
      return token = 63 /* HashToken */;
    }
    return token;
  }
  function reScanQuestionToken() {
    Debug.assert(token === 61 /* QuestionQuestionToken */, "'reScanQuestionToken' should only be called on a '??'");
    pos = tokenStart + 1;
    return token = 58 /* QuestionToken */;
  }
  function scanJsxToken(allowMultilineJsxText = true) {
    fullStartPos = tokenStart = pos;
    if (pos >= end) {
      return token = 1 /* EndOfFileToken */;
    }
    let char = charCodeUnchecked(pos);
    if (char === 60 /* lessThan */) {
      if (charCodeUnchecked(pos + 1) === 47 /* slash */) {
        pos += 2;
        return token = 31 /* LessThanSlashToken */;
      }
      pos++;
      return token = 30 /* LessThanToken */;
    }
    if (char === 123 /* openBrace */) {
      pos++;
      return token = 19 /* OpenBraceToken */;
    }
    let firstNonWhitespace = 0;
    while (pos < end) {
      char = charCodeUnchecked(pos);
      if (char === 123 /* openBrace */) {
        break;
      }
      if (char === 60 /* lessThan */) {
        if (isConflictMarkerTrivia(text, pos)) {
          pos = scanConflictMarkerTrivia(text, pos, error2);
          return token = 7 /* ConflictMarkerTrivia */;
        }
        break;
      }
      if (char === 62 /* greaterThan */) {
        error2(Diagnostics.Unexpected_token_Did_you_mean_or_gt, pos, 1);
      }
      if (char === 125 /* closeBrace */) {
        error2(Diagnostics.Unexpected_token_Did_you_mean_or_rbrace, pos, 1);
      }
      if (isLineBreak(char) && firstNonWhitespace === 0) {
        firstNonWhitespace = -1;
      } else if (!allowMultilineJsxText && isLineBreak(char) && firstNonWhitespace > 0) {
        break;
      } else if (!isWhiteSpaceLike(char)) {
        firstNonWhitespace = pos;
      }
      pos++;
    }
    tokenValue = text.substring(fullStartPos, pos);
    return firstNonWhitespace === -1 ? 13 /* JsxTextAllWhiteSpaces */ : 12 /* JsxText */;
  }
  function scanJsxIdentifier() {
    if (tokenIsIdentifierOrKeyword(token)) {
      while (pos < end) {
        const ch = charCodeUnchecked(pos);
        if (ch === 45 /* minus */) {
          tokenValue += "-";
          pos++;
          continue;
        }
        const oldPos = pos;
        tokenValue += scanIdentifierParts();
        if (pos === oldPos) {
          break;
        }
      }
      return getIdentifierToken();
    }
    return token;
  }
  function scanJsxAttributeValue() {
    fullStartPos = pos;
    switch (charCodeUnchecked(pos)) {
      case 34 /* doubleQuote */:
      case 39 /* singleQuote */:
        tokenValue = scanString(
          /*jsxAttributeString*/
          true
        );
        return token = 11 /* StringLiteral */;
      default:
        return scan();
    }
  }
  function reScanJsxAttributeValue() {
    pos = tokenStart = fullStartPos;
    return scanJsxAttributeValue();
  }
  function scanJSDocCommentTextToken(inBackticks) {
    fullStartPos = tokenStart = pos;
    tokenFlags = 0 /* None */;
    if (pos >= end) {
      return token = 1 /* EndOfFileToken */;
    }
    for (let ch = charCodeUnchecked(pos); pos < end && (!isLineBreak(ch) && ch !== 96 /* backtick */); ch = codePointUnchecked(++pos)) {
      if (!inBackticks) {
        if (ch === 123 /* openBrace */) {
          break;
        } else if (ch === 64 /* at */ && pos - 1 >= 0 && isWhiteSpaceSingleLine(charCodeUnchecked(pos - 1)) && !(pos + 1 < end && isWhiteSpaceLike(charCodeUnchecked(pos + 1)))) {
          break;
        }
      }
    }
    if (pos === tokenStart) {
      return scanJsDocToken();
    }
    tokenValue = text.substring(tokenStart, pos);
    return token = 82 /* JSDocCommentTextToken */;
  }
  function scanJsDocToken() {
    fullStartPos = tokenStart = pos;
    tokenFlags = 0 /* None */;
    if (pos >= end) {
      return token = 1 /* EndOfFileToken */;
    }
    const ch = codePointUnchecked(pos);
    pos += charSize(ch);
    switch (ch) {
      case 9 /* tab */:
      case 11 /* verticalTab */:
      case 12 /* formFeed */:
      case 32 /* space */:
        while (pos < end && isWhiteSpaceSingleLine(charCodeUnchecked(pos))) {
          pos++;
        }
        return token = 5 /* WhitespaceTrivia */;
      case 64 /* at */:
        return token = 60 /* AtToken */;
      case 13 /* carriageReturn */:
        if (charCodeUnchecked(pos) === 10 /* lineFeed */) {
          pos++;
        }
      // falls through
      case 10 /* lineFeed */:
        tokenFlags |= 1 /* PrecedingLineBreak */;
        return token = 4 /* NewLineTrivia */;
      case 42 /* asterisk */:
        return token = 42 /* AsteriskToken */;
      case 123 /* openBrace */:
        return token = 19 /* OpenBraceToken */;
      case 125 /* closeBrace */:
        return token = 20 /* CloseBraceToken */;
      case 91 /* openBracket */:
        return token = 23 /* OpenBracketToken */;
      case 93 /* closeBracket */:
        return token = 24 /* CloseBracketToken */;
      case 40 /* openParen */:
        return token = 21 /* OpenParenToken */;
      case 41 /* closeParen */:
        return token = 22 /* CloseParenToken */;
      case 60 /* lessThan */:
        return token = 30 /* LessThanToken */;
      case 62 /* greaterThan */:
        return token = 32 /* GreaterThanToken */;
      case 61 /* equals */:
        return token = 64 /* EqualsToken */;
      case 44 /* comma */:
        return token = 28 /* CommaToken */;
      case 46 /* dot */:
        return token = 25 /* DotToken */;
      case 96 /* backtick */:
        return token = 62 /* BacktickToken */;
      case 35 /* hash */:
        return token = 63 /* HashToken */;
      case 92 /* backslash */:
        pos--;
        const extendedCookedChar = peekExtendedUnicodeEscape();
        if (extendedCookedChar >= 0 && isIdentifierStart(extendedCookedChar, languageVersion)) {
          tokenValue = scanExtendedUnicodeEscape(
            /*shouldEmitInvalidEscapeError*/
            true
          ) + scanIdentifierParts();
          return token = getIdentifierToken();
        }
        const cookedChar = peekUnicodeEscape();
        if (cookedChar >= 0 && isIdentifierStart(cookedChar, languageVersion)) {
          pos += 6;
          tokenFlags |= 1024 /* UnicodeEscape */;
          tokenValue = String.fromCharCode(cookedChar) + scanIdentifierParts();
          return token = getIdentifierToken();
        }
        pos++;
        return token = 0 /* Unknown */;
    }
    if (isIdentifierStart(ch, languageVersion)) {
      let char = ch;
      while (pos < end && isIdentifierPart(char = codePointUnchecked(pos), languageVersion) || char === 45 /* minus */) pos += charSize(char);
      tokenValue = text.substring(tokenStart, pos);
      if (char === 92 /* backslash */) {
        tokenValue += scanIdentifierParts();
      }
      return token = getIdentifierToken();
    } else {
      return token = 0 /* Unknown */;
    }
  }
  function speculationHelper(callback, isLookahead) {
    const savePos = pos;
    const saveStartPos = fullStartPos;
    const saveTokenPos = tokenStart;
    const saveToken = token;
    const saveTokenValue = tokenValue;
    const saveTokenFlags = tokenFlags;
    const result = callback();
    if (!result || isLookahead) {
      pos = savePos;
      fullStartPos = saveStartPos;
      tokenStart = saveTokenPos;
      token = saveToken;
      tokenValue = saveTokenValue;
      tokenFlags = saveTokenFlags;
    }
    return result;
  }
  function scanRange(start2, length3, callback) {
    const saveEnd = end;
    const savePos = pos;
    const saveStartPos = fullStartPos;
    const saveTokenPos = tokenStart;
    const saveToken = token;
    const saveTokenValue = tokenValue;
    const saveTokenFlags = tokenFlags;
    const saveErrorExpectations = commentDirectives;
    setText(text, start2, length3);
    const result = callback();
    end = saveEnd;
    pos = savePos;
    fullStartPos = saveStartPos;
    tokenStart = saveTokenPos;
    token = saveToken;
    tokenValue = saveTokenValue;
    tokenFlags = saveTokenFlags;
    commentDirectives = saveErrorExpectations;
    return result;
  }
  function lookAhead(callback) {
    return speculationHelper(
      callback,
      /*isLookahead*/
      true
    );
  }
  function tryScan(callback) {
    return speculationHelper(
      callback,
      /*isLookahead*/
      false
    );
  }
  function getText() {
    return text;
  }
  function clearCommentDirectives() {
    commentDirectives = void 0;
  }
  function setText(newText, start2, length3) {
    text = newText || "";
    end = length3 === void 0 ? text.length : start2 + length3;
    resetTokenState(start2 || 0);
  }
  function setOnError(errorCallback) {
    onError = errorCallback;
  }
  function setScriptTarget(scriptTarget) {
    languageVersion = scriptTarget;
  }
  function setLanguageVariant(variant) {
    languageVariant = variant;
  }
  function setScriptKind(kind) {
    scriptKind = kind;
  }
  function setJSDocParsingMode(kind) {
    jsDocParsingMode = kind;
  }
  function resetTokenState(position) {
    Debug.assert(position >= 0);
    pos = position;
    fullStartPos = position;
    tokenStart = position;
    token = 0 /* Unknown */;
    tokenValue = void 0;
    tokenFlags = 0 /* None */;
  }
  function setSkipJsDocLeadingAsterisks(skip) {
    skipJsDocLeadingAsterisks += skip ? 1 : -1;
  }
}
function codePointAt(s, i) {
  return s.codePointAt(i);
}
function charSize(ch) {
  if (ch >= 65536) {
    return 2;
  }
  if (ch === -1 /* EOF */) {
    return 0;
  }
  return 1;
}
function utf16EncodeAsStringFallback(codePoint) {
  Debug.assert(0 <= codePoint && codePoint <= 1114111);
  if (codePoint <= 65535) {
    return String.fromCharCode(codePoint);
  }
  const codeUnit1 = Math.floor((codePoint - 65536) / 1024) + 55296;
  const codeUnit2 = (codePoint - 65536) % 1024 + 56320;
  return String.fromCharCode(codeUnit1, codeUnit2);
}
var utf16EncodeAsStringWorker = String.fromCodePoint ? (codePoint) => String.fromCodePoint(codePoint) : utf16EncodeAsStringFallback;
function utf16EncodeAsString(codePoint) {
  return utf16EncodeAsStringWorker(codePoint);
}
var nonBinaryUnicodeProperties = new Map(Object.entries({
  General_Category: "General_Category",
  gc: "General_Category",
  Script: "Script",
  sc: "Script",
  Script_Extensions: "Script_Extensions",
  scx: "Script_Extensions"
}));
var binaryUnicodeProperties = /* @__PURE__ */ new Set(["ASCII", "ASCII_Hex_Digit", "AHex", "Alphabetic", "Alpha", "Any", "Assigned", "Bidi_Control", "Bidi_C", "Bidi_Mirrored", "Bidi_M", "Case_Ignorable", "CI", "Cased", "Changes_When_Casefolded", "CWCF", "Changes_When_Casemapped", "CWCM", "Changes_When_Lowercased", "CWL", "Changes_When_NFKC_Casefolded", "CWKCF", "Changes_When_Titlecased", "CWT", "Changes_When_Uppercased", "CWU", "Dash", "Default_Ignorable_Code_Point", "DI", "Deprecated", "Dep", "Diacritic", "Dia", "Emoji", "Emoji_Component", "EComp", "Emoji_Modifier", "EMod", "Emoji_Modifier_Base", "EBase", "Emoji_Presentation", "EPres", "Extended_Pictographic", "ExtPict", "Extender", "Ext", "Grapheme_Base", "Gr_Base", "Grapheme_Extend", "Gr_Ext", "Hex_Digit", "Hex", "IDS_Binary_Operator", "IDSB", "IDS_Trinary_Operator", "IDST", "ID_Continue", "IDC", "ID_Start", "IDS", "Ideographic", "Ideo", "Join_Control", "Join_C", "Logical_Order_Exception", "LOE", "Lowercase", "Lower", "Math", "Noncharacter_Code_Point", "NChar", "Pattern_Syntax", "Pat_Syn", "Pattern_White_Space", "Pat_WS", "Quotation_Mark", "QMark", "Radical", "Regional_Indicator", "RI", "Sentence_Terminal", "STerm", "Soft_Dotted", "SD", "Terminal_Punctuation", "Term", "Unified_Ideograph", "UIdeo", "Uppercase", "Upper", "Variation_Selector", "VS", "White_Space", "space", "XID_Continue", "XIDC", "XID_Start", "XIDS"]);
var binaryUnicodePropertiesOfStrings = /* @__PURE__ */ new Set(["Basic_Emoji", "Emoji_Keycap_Sequence", "RGI_Emoji_Modifier_Sequence", "RGI_Emoji_Flag_Sequence", "RGI_Emoji_Tag_Sequence", "RGI_Emoji_ZWJ_Sequence", "RGI_Emoji"]);
var valuesOfNonBinaryUnicodeProperties = {
  General_Category: /* @__PURE__ */ new Set(["C", "Other", "Cc", "Control", "cntrl", "Cf", "Format", "Cn", "Unassigned", "Co", "Private_Use", "Cs", "Surrogate", "L", "Letter", "LC", "Cased_Letter", "Ll", "Lowercase_Letter", "Lm", "Modifier_Letter", "Lo", "Other_Letter", "Lt", "Titlecase_Letter", "Lu", "Uppercase_Letter", "M", "Mark", "Combining_Mark", "Mc", "Spacing_Mark", "Me", "Enclosing_Mark", "Mn", "Nonspacing_Mark", "N", "Number", "Nd", "Decimal_Number", "digit", "Nl", "Letter_Number", "No", "Other_Number", "P", "Punctuation", "punct", "Pc", "Connector_Punctuation", "Pd", "Dash_Punctuation", "Pe", "Close_Punctuation", "Pf", "Final_Punctuation", "Pi", "Initial_Punctuation", "Po", "Other_Punctuation", "Ps", "Open_Punctuation", "S", "Symbol", "Sc", "Currency_Symbol", "Sk", "Modifier_Symbol", "Sm", "Math_Symbol", "So", "Other_Symbol", "Z", "Separator", "Zl", "Line_Separator", "Zp", "Paragraph_Separator", "Zs", "Space_Separator"]),
  Script: /* @__PURE__ */ new Set(["Adlm", "Adlam", "Aghb", "Caucasian_Albanian", "Ahom", "Arab", "Arabic", "Armi", "Imperial_Aramaic", "Armn", "Armenian", "Avst", "Avestan", "Bali", "Balinese", "Bamu", "Bamum", "Bass", "Bassa_Vah", "Batk", "Batak", "Beng", "Bengali", "Bhks", "Bhaiksuki", "Bopo", "Bopomofo", "Brah", "Brahmi", "Brai", "Braille", "Bugi", "Buginese", "Buhd", "Buhid", "Cakm", "Chakma", "Cans", "Canadian_Aboriginal", "Cari", "Carian", "Cham", "Cher", "Cherokee", "Chrs", "Chorasmian", "Copt", "Coptic", "Qaac", "Cpmn", "Cypro_Minoan", "Cprt", "Cypriot", "Cyrl", "Cyrillic", "Deva", "Devanagari", "Diak", "Dives_Akuru", "Dogr", "Dogra", "Dsrt", "Deseret", "Dupl", "Duployan", "Egyp", "Egyptian_Hieroglyphs", "Elba", "Elbasan", "Elym", "Elymaic", "Ethi", "Ethiopic", "Geor", "Georgian", "Glag", "Glagolitic", "Gong", "Gunjala_Gondi", "Gonm", "Masaram_Gondi", "Goth", "Gothic", "Gran", "Grantha", "Grek", "Greek", "Gujr", "Gujarati", "Guru", "Gurmukhi", "Hang", "Hangul", "Hani", "Han", "Hano", "Hanunoo", "Hatr", "Hatran", "Hebr", "Hebrew", "Hira", "Hiragana", "Hluw", "Anatolian_Hieroglyphs", "Hmng", "Pahawh_Hmong", "Hmnp", "Nyiakeng_Puachue_Hmong", "Hrkt", "Katakana_Or_Hiragana", "Hung", "Old_Hungarian", "Ital", "Old_Italic", "Java", "Javanese", "Kali", "Kayah_Li", "Kana", "Katakana", "Kawi", "Khar", "Kharoshthi", "Khmr", "Khmer", "Khoj", "Khojki", "Kits", "Khitan_Small_Script", "Knda", "Kannada", "Kthi", "Kaithi", "Lana", "Tai_Tham", "Laoo", "Lao", "Latn", "Latin", "Lepc", "Lepcha", "Limb", "Limbu", "Lina", "Linear_A", "Linb", "Linear_B", "Lisu", "Lyci", "Lycian", "Lydi", "Lydian", "Mahj", "Mahajani", "Maka", "Makasar", "Mand", "Mandaic", "Mani", "Manichaean", "Marc", "Marchen", "Medf", "Medefaidrin", "Mend", "Mende_Kikakui", "Merc", "Meroitic_Cursive", "Mero", "Meroitic_Hieroglyphs", "Mlym", "Malayalam", "Modi", "Mong", "Mongolian", "Mroo", "Mro", "Mtei", "Meetei_Mayek", "Mult", "Multani", "Mymr", "Myanmar", "Nagm", "Nag_Mundari", "Nand", "Nandinagari", "Narb", "Old_North_Arabian", "Nbat", "Nabataean", "Newa", "Nkoo", "Nko", "Nshu", "Nushu", "Ogam", "Ogham", "Olck", "Ol_Chiki", "Orkh", "Old_Turkic", "Orya", "Oriya", "Osge", "Osage", "Osma", "Osmanya", "Ougr", "Old_Uyghur", "Palm", "Palmyrene", "Pauc", "Pau_Cin_Hau", "Perm", "Old_Permic", "Phag", "Phags_Pa", "Phli", "Inscriptional_Pahlavi", "Phlp", "Psalter_Pahlavi", "Phnx", "Phoenician", "Plrd", "Miao", "Prti", "Inscriptional_Parthian", "Rjng", "Rejang", "Rohg", "Hanifi_Rohingya", "Runr", "Runic", "Samr", "Samaritan", "Sarb", "Old_South_Arabian", "Saur", "Saurashtra", "Sgnw", "SignWriting", "Shaw", "Shavian", "Shrd", "Sharada", "Sidd", "Siddham", "Sind", "Khudawadi", "Sinh", "Sinhala", "Sogd", "Sogdian", "Sogo", "Old_Sogdian", "Sora", "Sora_Sompeng", "Soyo", "Soyombo", "Sund", "Sundanese", "Sylo", "Syloti_Nagri", "Syrc", "Syriac", "Tagb", "Tagbanwa", "Takr", "Takri", "Tale", "Tai_Le", "Talu", "New_Tai_Lue", "Taml", "Tamil", "Tang", "Tangut", "Tavt", "Tai_Viet", "Telu", "Telugu", "Tfng", "Tifinagh", "Tglg", "Tagalog", "Thaa", "Thaana", "Thai", "Tibt", "Tibetan", "Tirh", "Tirhuta", "Tnsa", "Tangsa", "Toto", "Ugar", "Ugaritic", "Vaii", "Vai", "Vith", "Vithkuqi", "Wara", "Warang_Citi", "Wcho", "Wancho", "Xpeo", "Old_Persian", "Xsux", "Cuneiform", "Yezi", "Yezidi", "Yiii", "Yi", "Zanb", "Zanabazar_Square", "Zinh", "Inherited", "Qaai", "Zyyy", "Common", "Zzzz", "Unknown"]),
  Script_Extensions: void 0
};
valuesOfNonBinaryUnicodeProperties.Script_Extensions = valuesOfNonBinaryUnicodeProperties.Script;
function textSpanEnd(span) {
  return span.start + span.length;
}
function textSpanIsEmpty(span) {
  return span.length === 0;
}
function createTextSpan(start, length2) {
  if (start < 0) {
    throw new Error("start < 0");
  }
  if (length2 < 0) {
    throw new Error("length < 0");
  }
  return { start, length: length2 };
}
function createTextSpanFromBounds(start, end) {
  return createTextSpan(start, end - start);
}
function textChangeRangeNewSpan(range) {
  return createTextSpan(range.span.start, range.newLength);
}
function textChangeRangeIsUnchanged(range) {
  return textSpanIsEmpty(range.span) && range.newLength === 0;
}
function createTextChangeRange(span, newLength) {
  if (newLength < 0) {
    throw new Error("newLength < 0");
  }
  return { span, newLength };
}
function findAncestor(node, callback) {
  while (node) {
    const result = callback(node);
    if (result === "quit") {
      return void 0;
    } else if (result) {
      return node;
    }
    node = node.parent;
  }
  return void 0;
}
function isParseTreeNode(node) {
  return (node.flags & 16 /* Synthesized */) === 0;
}
function getParseTreeNode(node, nodeTest) {
  if (node === void 0 || isParseTreeNode(node)) {
    return node;
  }
  node = node.original;
  while (node) {
    if (isParseTreeNode(node)) {
      return !nodeTest || nodeTest(node) ? node : void 0;
    }
    node = node.original;
  }
}
function escapeLeadingUnderscores(identifier) {
  return identifier.length >= 2 && identifier.charCodeAt(0) === 95 /* _ */ && identifier.charCodeAt(1) === 95 /* _ */ ? "_" + identifier : identifier;
}
function unescapeLeadingUnderscores(identifier) {
  const id = identifier;
  return id.length >= 3 && id.charCodeAt(0) === 95 /* _ */ && id.charCodeAt(1) === 95 /* _ */ && id.charCodeAt(2) === 95 /* _ */ ? id.substr(1) : id;
}
function idText(identifierOrPrivateName) {
  return unescapeLeadingUnderscores(identifierOrPrivateName.escapedText);
}
function identifierToKeywordKind(node) {
  const token = stringToToken(node.escapedText);
  return token ? tryCast(token, isKeyword) : void 0;
}
function symbolName(symbol) {
  if (symbol.valueDeclaration && isPrivateIdentifierClassElementDeclaration(symbol.valueDeclaration)) {
    return idText(symbol.valueDeclaration.name);
  }
  return unescapeLeadingUnderscores(symbol.escapedName);
}
function nameForNamelessJSDocTypedef(declaration) {
  const hostNode = declaration.parent.parent;
  if (!hostNode) {
    return void 0;
  }
  if (isDeclaration(hostNode)) {
    return getDeclarationIdentifier(hostNode);
  }
  switch (hostNode.kind) {
    case 244 /* VariableStatement */:
      if (hostNode.declarationList && hostNode.declarationList.declarations[0]) {
        return getDeclarationIdentifier(hostNode.declarationList.declarations[0]);
      }
      break;
    case 245 /* ExpressionStatement */:
      let expr = hostNode.expression;
      if (expr.kind === 227 /* BinaryExpression */ && expr.operatorToken.kind === 64 /* EqualsToken */) {
        expr = expr.left;
      }
      switch (expr.kind) {
        case 212 /* PropertyAccessExpression */:
          return expr.name;
        case 213 /* ElementAccessExpression */:
          const arg = expr.argumentExpression;
          if (isIdentifier(arg)) {
            return arg;
          }
      }
      break;
    case 218 /* ParenthesizedExpression */: {
      return getDeclarationIdentifier(hostNode.expression);
    }
    case 257 /* LabeledStatement */: {
      if (isDeclaration(hostNode.statement) || isExpression(hostNode.statement)) {
        return getDeclarationIdentifier(hostNode.statement);
      }
      break;
    }
  }
}
function getDeclarationIdentifier(node) {
  const name = getNameOfDeclaration(node);
  return name && isIdentifier(name) ? name : void 0;
}
function getNameOfJSDocTypedef(declaration) {
  return declaration.name || nameForNamelessJSDocTypedef(declaration);
}
function isNamedDeclaration(node) {
  return !!node.name;
}
function getNonAssignedNameOfDeclaration(declaration) {
  switch (declaration.kind) {
    case 80 /* Identifier */:
      return declaration;
    case 349 /* JSDocPropertyTag */:
    case 342 /* JSDocParameterTag */: {
      const { name } = declaration;
      if (name.kind === 167 /* QualifiedName */) {
        return name.right;
      }
      break;
    }
    case 214 /* CallExpression */:
    case 227 /* BinaryExpression */: {
      const expr2 = declaration;
      switch (getAssignmentDeclarationKind(expr2)) {
        case 1 /* ExportsProperty */:
        case 4 /* ThisProperty */:
        case 5 /* Property */:
        case 3 /* PrototypeProperty */:
          return getElementOrPropertyAccessArgumentExpressionOrName(expr2.left);
        case 7 /* ObjectDefinePropertyValue */:
        case 8 /* ObjectDefinePropertyExports */:
        case 9 /* ObjectDefinePrototypeProperty */:
          return expr2.arguments[1];
        default:
          return void 0;
      }
    }
    case 347 /* JSDocTypedefTag */:
      return getNameOfJSDocTypedef(declaration);
    case 341 /* JSDocEnumTag */:
      return nameForNamelessJSDocTypedef(declaration);
    case 278 /* ExportAssignment */: {
      const { expression } = declaration;
      return isIdentifier(expression) ? expression : void 0;
    }
    case 213 /* ElementAccessExpression */:
      const expr = declaration;
      if (isBindableStaticElementAccessExpression(expr)) {
        return expr.argumentExpression;
      }
  }
  return declaration.name;
}
function getNameOfDeclaration(declaration) {
  if (declaration === void 0) return void 0;
  return getNonAssignedNameOfDeclaration(declaration) || (isFunctionExpression(declaration) || isArrowFunction(declaration) || isClassExpression(declaration) ? getAssignedName(declaration) : void 0);
}
function getAssignedName(node) {
  if (!node.parent) {
    return void 0;
  } else if (isPropertyAssignment(node.parent) || isBindingElement(node.parent)) {
    return node.parent.name;
  } else if (isBinaryExpression(node.parent) && node === node.parent.right) {
    if (isIdentifier(node.parent.left)) {
      return node.parent.left;
    } else if (isAccessExpression(node.parent.left)) {
      return getElementOrPropertyAccessArgumentExpressionOrName(node.parent.left);
    }
  } else if (isVariableDeclaration(node.parent) && isIdentifier(node.parent.name)) {
    return node.parent.name;
  }
}
function getDecorators(node) {
  if (hasDecorators(node)) {
    return filter(node.modifiers, isDecorator);
  }
}
function getModifiers(node) {
  if (hasSyntacticModifier(node, 98303 /* Modifier */)) {
    return filter(node.modifiers, isModifier);
  }
}
function getJSDocParameterTagsWorker(param, noCache) {
  if (param.name) {
    if (isIdentifier(param.name)) {
      const name = param.name.escapedText;
      return getJSDocTagsWorker(param.parent, noCache).filter((tag) => isJSDocParameterTag(tag) && isIdentifier(tag.name) && tag.name.escapedText === name);
    } else {
      const i = param.parent.parameters.indexOf(param);
      Debug.assert(i > -1, "Parameters should always be in their parents' parameter list");
      const paramTags = getJSDocTagsWorker(param.parent, noCache).filter(isJSDocParameterTag);
      if (i < paramTags.length) {
        return [paramTags[i]];
      }
    }
  }
  return emptyArray;
}
function getJSDocParameterTags(param) {
  return getJSDocParameterTagsWorker(
    param,
    /*noCache*/
    false
  );
}
function getJSDocParameterTagsNoCache(param) {
  return getJSDocParameterTagsWorker(
    param,
    /*noCache*/
    true
  );
}
function getJSDocTypeParameterTagsWorker(param, noCache) {
  const name = param.name.escapedText;
  return getJSDocTagsWorker(param.parent, noCache).filter((tag) => isJSDocTemplateTag(tag) && tag.typeParameters.some((tp) => tp.name.escapedText === name));
}
function getJSDocTypeParameterTags(param) {
  return getJSDocTypeParameterTagsWorker(
    param,
    /*noCache*/
    false
  );
}
function getJSDocTypeParameterTagsNoCache(param) {
  return getJSDocTypeParameterTagsWorker(
    param,
    /*noCache*/
    true
  );
}
function getJSDocPublicTagNoCache(node) {
  return getFirstJSDocTag(
    node,
    isJSDocPublicTag,
    /*noCache*/
    true
  );
}
function getJSDocPrivateTagNoCache(node) {
  return getFirstJSDocTag(
    node,
    isJSDocPrivateTag,
    /*noCache*/
    true
  );
}
function getJSDocProtectedTagNoCache(node) {
  return getFirstJSDocTag(
    node,
    isJSDocProtectedTag,
    /*noCache*/
    true
  );
}
function getJSDocReadonlyTagNoCache(node) {
  return getFirstJSDocTag(
    node,
    isJSDocReadonlyTag,
    /*noCache*/
    true
  );
}
function getJSDocOverrideTagNoCache(node) {
  return getFirstJSDocTag(
    node,
    isJSDocOverrideTag,
    /*noCache*/
    true
  );
}
function getJSDocDeprecatedTagNoCache(node) {
  return getFirstJSDocTag(
    node,
    isJSDocDeprecatedTag,
    /*noCache*/
    true
  );
}
function getJSDocTypeTag(node) {
  const tag = getFirstJSDocTag(node, isJSDocTypeTag);
  if (tag && tag.typeExpression && tag.typeExpression.type) {
    return tag;
  }
  return void 0;
}
function getJSDocTagsWorker(node, noCache) {
  var _a;
  if (!canHaveJSDoc(node)) return emptyArray;
  let tags = (_a = node.jsDoc) == null ? void 0 : _a.jsDocCache;
  if (tags === void 0 || noCache) {
    const comments = getJSDocCommentsAndTags(node, noCache);
    Debug.assert(comments.length < 2 || comments[0] !== comments[1]);
    tags = flatMap(comments, (j) => isJSDoc(j) ? j.tags : j);
    if (!noCache) {
      node.jsDoc ?? (node.jsDoc = []);
      node.jsDoc.jsDocCache = tags;
    }
  }
  return tags;
}
function getFirstJSDocTag(node, predicate, noCache) {
  return find(getJSDocTagsWorker(node, noCache), predicate);
}
function isMemberName(node) {
  return node.kind === 80 /* Identifier */ || node.kind === 81 /* PrivateIdentifier */;
}
function isPropertyAccessChain(node) {
  return isPropertyAccessExpression(node) && !!(node.flags & 64 /* OptionalChain */);
}
function isElementAccessChain(node) {
  return isElementAccessExpression(node) && !!(node.flags & 64 /* OptionalChain */);
}
function isCallChain(node) {
  return isCallExpression(node) && !!(node.flags & 64 /* OptionalChain */);
}
function isOptionalChain(node) {
  const kind = node.kind;
  return !!(node.flags & 64 /* OptionalChain */) && (kind === 212 /* PropertyAccessExpression */ || kind === 213 /* ElementAccessExpression */ || kind === 214 /* CallExpression */ || kind === 236 /* NonNullExpression */);
}
function skipPartiallyEmittedExpressions(node) {
  return skipOuterExpressions(node, 8 /* PartiallyEmittedExpressions */);
}
function isNonNullChain(node) {
  return isNonNullExpression(node) && !!(node.flags & 64 /* OptionalChain */);
}
function isNodeKind(kind) {
  return kind >= 167 /* FirstNode */;
}
function isTokenKind(kind) {
  return kind >= 0 /* FirstToken */ && kind <= 166 /* LastToken */;
}
function isToken(n) {
  return isTokenKind(n.kind);
}
function isNodeArray(array) {
  return hasProperty(array, "pos") && hasProperty(array, "end");
}
function isLiteralKind(kind) {
  return 9 /* FirstLiteralToken */ <= kind && kind <= 15 /* LastLiteralToken */;
}
function isTemplateLiteralKind(kind) {
  return 15 /* FirstTemplateToken */ <= kind && kind <= 18 /* LastTemplateToken */;
}
function isGeneratedIdentifier(node) {
  var _a;
  return isIdentifier(node) && ((_a = node.emitNode) == null ? void 0 : _a.autoGenerate) !== void 0;
}
function isGeneratedPrivateIdentifier(node) {
  var _a;
  return isPrivateIdentifier(node) && ((_a = node.emitNode) == null ? void 0 : _a.autoGenerate) !== void 0;
}
function isPrivateIdentifierClassElementDeclaration(node) {
  return (isPropertyDeclaration(node) || isMethodOrAccessor(node)) && isPrivateIdentifier(node.name);
}
function isModifierKind(token) {
  switch (token) {
    case 128 /* AbstractKeyword */:
    case 129 /* AccessorKeyword */:
    case 134 /* AsyncKeyword */:
    case 87 /* ConstKeyword */:
    case 138 /* DeclareKeyword */:
    case 90 /* DefaultKeyword */:
    case 95 /* ExportKeyword */:
    case 103 /* InKeyword */:
    case 125 /* PublicKeyword */:
    case 123 /* PrivateKeyword */:
    case 124 /* ProtectedKeyword */:
    case 148 /* ReadonlyKeyword */:
    case 126 /* StaticKeyword */:
    case 147 /* OutKeyword */:
    case 164 /* OverrideKeyword */:
      return true;
  }
  return false;
}
function isParameterPropertyModifier(kind) {
  return !!(modifierToFlag(kind) & 31 /* ParameterPropertyModifier */);
}
function isClassMemberModifier(idToken) {
  return isParameterPropertyModifier(idToken) || idToken === 126 /* StaticKeyword */ || idToken === 164 /* OverrideKeyword */ || idToken === 129 /* AccessorKeyword */;
}
function isModifier(node) {
  return isModifierKind(node.kind);
}
function isPropertyName(node) {
  const kind = node.kind;
  return kind === 80 /* Identifier */ || kind === 81 /* PrivateIdentifier */ || kind === 11 /* StringLiteral */ || kind === 9 /* NumericLiteral */ || kind === 168 /* ComputedPropertyName */;
}
function isFunctionLike(node) {
  return !!node && isFunctionLikeKind(node.kind);
}
function isFunctionLikeDeclarationKind(kind) {
  switch (kind) {
    case 263 /* FunctionDeclaration */:
    case 175 /* MethodDeclaration */:
    case 177 /* Constructor */:
    case 178 /* GetAccessor */:
    case 179 /* SetAccessor */:
    case 219 /* FunctionExpression */:
    case 220 /* ArrowFunction */:
      return true;
    default:
      return false;
  }
}
function isFunctionLikeKind(kind) {
  switch (kind) {
    case 174 /* MethodSignature */:
    case 180 /* CallSignature */:
    case 324 /* JSDocSignature */:
    case 181 /* ConstructSignature */:
    case 182 /* IndexSignature */:
    case 185 /* FunctionType */:
    case 318 /* JSDocFunctionType */:
    case 186 /* ConstructorType */:
      return true;
    default:
      return isFunctionLikeDeclarationKind(kind);
  }
}
function isClassLike(node) {
  return node && (node.kind === 264 /* ClassDeclaration */ || node.kind === 232 /* ClassExpression */);
}
function isMethodOrAccessor(node) {
  switch (node.kind) {
    case 175 /* MethodDeclaration */:
    case 178 /* GetAccessor */:
    case 179 /* SetAccessor */:
      return true;
    default:
      return false;
  }
}
function isObjectLiteralElementLike(node) {
  const kind = node.kind;
  return kind === 304 /* PropertyAssignment */ || kind === 305 /* ShorthandPropertyAssignment */ || kind === 306 /* SpreadAssignment */ || kind === 175 /* MethodDeclaration */ || kind === 178 /* GetAccessor */ || kind === 179 /* SetAccessor */;
}
function isTypeNode(node) {
  return isTypeNodeKind(node.kind);
}
function isFunctionOrConstructorTypeNode(node) {
  switch (node.kind) {
    case 185 /* FunctionType */:
    case 186 /* ConstructorType */:
      return true;
  }
  return false;
}
function isBindingPattern(node) {
  if (node) {
    const kind = node.kind;
    return kind === 208 /* ArrayBindingPattern */ || kind === 207 /* ObjectBindingPattern */;
  }
  return false;
}
function isAssignmentPattern(node) {
  const kind = node.kind;
  return kind === 210 /* ArrayLiteralExpression */ || kind === 211 /* ObjectLiteralExpression */;
}
function isDeclarationBindingElement(bindingElement) {
  switch (bindingElement.kind) {
    case 261 /* VariableDeclaration */:
    case 170 /* Parameter */:
    case 209 /* BindingElement */:
      return true;
  }
  return false;
}
function isLeftHandSideExpression(node) {
  return isLeftHandSideExpressionKind(skipPartiallyEmittedExpressions(node).kind);
}
function isLeftHandSideExpressionKind(kind) {
  switch (kind) {
    case 212 /* PropertyAccessExpression */:
    case 213 /* ElementAccessExpression */:
    case 215 /* NewExpression */:
    case 214 /* CallExpression */:
    case 285 /* JsxElement */:
    case 286 /* JsxSelfClosingElement */:
    case 289 /* JsxFragment */:
    case 216 /* TaggedTemplateExpression */:
    case 210 /* ArrayLiteralExpression */:
    case 218 /* ParenthesizedExpression */:
    case 211 /* ObjectLiteralExpression */:
    case 232 /* ClassExpression */:
    case 219 /* FunctionExpression */:
    case 80 /* Identifier */:
    case 81 /* PrivateIdentifier */:
    // technically this is only an Expression if it's in a `#field in expr` BinaryExpression
    case 14 /* RegularExpressionLiteral */:
    case 9 /* NumericLiteral */:
    case 10 /* BigIntLiteral */:
    case 11 /* StringLiteral */:
    case 15 /* NoSubstitutionTemplateLiteral */:
    case 229 /* TemplateExpression */:
    case 97 /* FalseKeyword */:
    case 106 /* NullKeyword */:
    case 110 /* ThisKeyword */:
    case 112 /* TrueKeyword */:
    case 108 /* SuperKeyword */:
    case 236 /* NonNullExpression */:
    case 234 /* ExpressionWithTypeArguments */:
    case 237 /* MetaProperty */:
    case 102 /* ImportKeyword */:
    // technically this is only an Expression if it's in a CallExpression
    case 283 /* MissingDeclaration */:
      return true;
    default:
      return false;
  }
}
function isUnaryExpression(node) {
  return isUnaryExpressionKind(skipPartiallyEmittedExpressions(node).kind);
}
function isUnaryExpressionKind(kind) {
  switch (kind) {
    case 225 /* PrefixUnaryExpression */:
    case 226 /* PostfixUnaryExpression */:
    case 221 /* DeleteExpression */:
    case 222 /* TypeOfExpression */:
    case 223 /* VoidExpression */:
    case 224 /* AwaitExpression */:
    case 217 /* TypeAssertionExpression */:
      return true;
    default:
      return isLeftHandSideExpressionKind(kind);
  }
}
function isExpression(node) {
  return isExpressionKind(skipPartiallyEmittedExpressions(node).kind);
}
function isExpressionKind(kind) {
  switch (kind) {
    case 228 /* ConditionalExpression */:
    case 230 /* YieldExpression */:
    case 220 /* ArrowFunction */:
    case 227 /* BinaryExpression */:
    case 231 /* SpreadElement */:
    case 235 /* AsExpression */:
    case 233 /* OmittedExpression */:
    case 357 /* CommaListExpression */:
    case 356 /* PartiallyEmittedExpression */:
    case 239 /* SatisfiesExpression */:
      return true;
    default:
      return isUnaryExpressionKind(kind);
  }
}
function isDeclarationKind(kind) {
  return kind === 220 /* ArrowFunction */ || kind === 209 /* BindingElement */ || kind === 264 /* ClassDeclaration */ || kind === 232 /* ClassExpression */ || kind === 176 /* ClassStaticBlockDeclaration */ || kind === 177 /* Constructor */ || kind === 267 /* EnumDeclaration */ || kind === 307 /* EnumMember */ || kind === 282 /* ExportSpecifier */ || kind === 263 /* FunctionDeclaration */ || kind === 219 /* FunctionExpression */ || kind === 178 /* GetAccessor */ || kind === 274 /* ImportClause */ || kind === 272 /* ImportEqualsDeclaration */ || kind === 277 /* ImportSpecifier */ || kind === 265 /* InterfaceDeclaration */ || kind === 292 /* JsxAttribute */ || kind === 175 /* MethodDeclaration */ || kind === 174 /* MethodSignature */ || kind === 268 /* ModuleDeclaration */ || kind === 271 /* NamespaceExportDeclaration */ || kind === 275 /* NamespaceImport */ || kind === 281 /* NamespaceExport */ || kind === 170 /* Parameter */ || kind === 304 /* PropertyAssignment */ || kind === 173 /* PropertyDeclaration */ || kind === 172 /* PropertySignature */ || kind === 179 /* SetAccessor */ || kind === 305 /* ShorthandPropertyAssignment */ || kind === 266 /* TypeAliasDeclaration */ || kind === 169 /* TypeParameter */ || kind === 261 /* VariableDeclaration */ || kind === 347 /* JSDocTypedefTag */ || kind === 339 /* JSDocCallbackTag */ || kind === 349 /* JSDocPropertyTag */ || kind === 203 /* NamedTupleMember */;
}
function isDeclarationStatementKind(kind) {
  return kind === 263 /* FunctionDeclaration */ || kind === 283 /* MissingDeclaration */ || kind === 264 /* ClassDeclaration */ || kind === 265 /* InterfaceDeclaration */ || kind === 266 /* TypeAliasDeclaration */ || kind === 267 /* EnumDeclaration */ || kind === 268 /* ModuleDeclaration */ || kind === 273 /* ImportDeclaration */ || kind === 272 /* ImportEqualsDeclaration */ || kind === 279 /* ExportDeclaration */ || kind === 278 /* ExportAssignment */ || kind === 271 /* NamespaceExportDeclaration */;
}
function isStatementKindButNotDeclarationKind(kind) {
  return kind === 253 /* BreakStatement */ || kind === 252 /* ContinueStatement */ || kind === 260 /* DebuggerStatement */ || kind === 247 /* DoStatement */ || kind === 245 /* ExpressionStatement */ || kind === 243 /* EmptyStatement */ || kind === 250 /* ForInStatement */ || kind === 251 /* ForOfStatement */ || kind === 249 /* ForStatement */ || kind === 246 /* IfStatement */ || kind === 257 /* LabeledStatement */ || kind === 254 /* ReturnStatement */ || kind === 256 /* SwitchStatement */ || kind === 258 /* ThrowStatement */ || kind === 259 /* TryStatement */ || kind === 244 /* VariableStatement */ || kind === 248 /* WhileStatement */ || kind === 255 /* WithStatement */ || kind === 354 /* NotEmittedStatement */;
}
function isDeclaration(node) {
  if (node.kind === 169 /* TypeParameter */) {
    return node.parent && node.parent.kind !== 346 /* JSDocTemplateTag */ || isInJSFile(node);
  }
  return isDeclarationKind(node.kind);
}
function isStatement(node) {
  const kind = node.kind;
  return isStatementKindButNotDeclarationKind(kind) || isDeclarationStatementKind(kind) || isBlockStatement(node);
}
function isBlockStatement(node) {
  if (node.kind !== 242 /* Block */) return false;
  if (node.parent !== void 0) {
    if (node.parent.kind === 259 /* TryStatement */ || node.parent.kind === 300 /* CatchClause */) {
      return false;
    }
  }
  return !isFunctionBlock(node);
}
function isStatementOrBlock(node) {
  const kind = node.kind;
  return isStatementKindButNotDeclarationKind(kind) || isDeclarationStatementKind(kind) || kind === 242 /* Block */;
}
function isJSDocNode(node) {
  return node.kind >= 310 /* FirstJSDocNode */ && node.kind <= 352 /* LastJSDocNode */;
}
function isJSDocCommentContainingNode(node) {
  return node.kind === 321 /* JSDoc */ || node.kind === 320 /* JSDocNamepathType */ || node.kind === 322 /* JSDocText */ || isJSDocLinkLike(node) || isJSDocTag(node) || isJSDocTypeLiteral(node) || isJSDocSignature(node);
}
function isJSDocTag(node) {
  return node.kind >= 328 /* FirstJSDocTagNode */ && node.kind <= 352 /* LastJSDocTagNode */;
}
function hasJSDocNodes(node) {
  if (!canHaveJSDoc(node)) return false;
  const { jsDoc } = node;
  return !!jsDoc && jsDoc.length > 0;
}
function hasInitializer(node) {
  return !!node.initializer;
}
function isStringLiteralLike(node) {
  return node.kind === 11 /* StringLiteral */ || node.kind === 15 /* NoSubstitutionTemplateLiteral */;
}
function isJSDocLinkLike(node) {
  return node.kind === 325 /* JSDocLink */ || node.kind === 326 /* JSDocLinkCode */ || node.kind === 327 /* JSDocLinkPlain */;
}
function forEachEntry(map2, callback) {
  const iterator = map2.entries();
  for (const [key, value] of iterator) {
    const result = callback(value, key);
    if (result) {
      return result;
    }
  }
  return void 0;
}
function getFullWidth(node) {
  return node.end - node.pos;
}
function containsParseError(node) {
  aggregateChildData(node);
  return (node.flags & 1048576 /* ThisNodeOrAnySubNodesHasError */) !== 0;
}
function aggregateChildData(node) {
  if (!(node.flags & 2097152 /* HasAggregatedChildData */)) {
    const thisNodeOrAnySubNodesHasError = (node.flags & 262144 /* ThisNodeHasError */) !== 0 || forEachChild(node, containsParseError);
    if (thisNodeOrAnySubNodesHasError) {
      node.flags |= 1048576 /* ThisNodeOrAnySubNodesHasError */;
    }
    node.flags |= 2097152 /* HasAggregatedChildData */;
  }
}
function getSourceFileOfNode(node) {
  while (node && node.kind !== 308 /* SourceFile */) {
    node = node.parent;
  }
  return node;
}
function getEndLinePosition(line, sourceFile) {
  Debug.assert(line >= 0);
  const lineStarts = getLineStarts(sourceFile);
  const lineIndex = line;
  const sourceText = sourceFile.text;
  if (lineIndex + 1 === lineStarts.length) {
    return sourceText.length - 1;
  } else {
    const start = lineStarts[lineIndex];
    let pos = lineStarts[lineIndex + 1] - 1;
    Debug.assert(isLineBreak(sourceText.charCodeAt(pos)));
    while (start <= pos && isLineBreak(sourceText.charCodeAt(pos))) {
      pos--;
    }
    return pos;
  }
}
function nodeIsMissing(node) {
  if (node === void 0) {
    return true;
  }
  return node.pos === node.end && node.pos >= 0 && node.kind !== 1 /* EndOfFileToken */;
}
function nodeIsPresent(node) {
  return !nodeIsMissing(node);
}
function getTokenPosOfNode(node, sourceFile, includeJsDoc) {
  if (nodeIsMissing(node)) {
    return node.pos;
  }
  if (isJSDocNode(node) || node.kind === 12 /* JsxText */) {
    return skipTrivia(
      (sourceFile ?? getSourceFileOfNode(node)).text,
      node.pos,
      /*stopAfterLineBreak*/
      false,
      /*stopAtComments*/
      true
    );
  }
  if (includeJsDoc && hasJSDocNodes(node)) {
    return getTokenPosOfNode(node.jsDoc[0], sourceFile);
  }
  if (node.kind === 353 /* SyntaxList */) {
    sourceFile ?? (sourceFile = getSourceFileOfNode(node));
    const first2 = firstOrUndefined(getNodeChildren(node, sourceFile));
    if (first2) {
      return getTokenPosOfNode(first2, sourceFile, includeJsDoc);
    }
  }
  return skipTrivia(
    (sourceFile ?? getSourceFileOfNode(node)).text,
    node.pos,
    /*stopAfterLineBreak*/
    false,
    /*stopAtComments*/
    false,
    isInJSDoc(node)
  );
}
function getSourceTextOfNodeFromSourceFile(sourceFile, node, includeTrivia = false) {
  return getTextOfNodeFromSourceText(sourceFile.text, node, includeTrivia);
}
function isJSDocTypeExpressionOrChild(node) {
  return !!findAncestor(node, isJSDocTypeExpression);
}
function getTextOfNodeFromSourceText(sourceText, node, includeTrivia = false) {
  if (nodeIsMissing(node)) {
    return "";
  }
  let text = sourceText.substring(includeTrivia ? node.pos : skipTrivia(sourceText, node.pos), node.end);
  if (isJSDocTypeExpressionOrChild(node)) {
    text = text.split(/\r\n|\n|\r/).map((line) => line.replace(/^\s*\*/, "").trimStart()).join("\n");
  }
  return text;
}
function getEmitFlags(node) {
  const emitNode = node.emitNode;
  return emitNode && emitNode.flags || 0;
}
function isComputedNonLiteralName(name) {
  return name.kind === 168 /* ComputedPropertyName */ && !isStringOrNumericLiteralLike(name.expression);
}
function tryGetTextOfPropertyName(name) {
  var _a;
  switch (name.kind) {
    case 80 /* Identifier */:
    case 81 /* PrivateIdentifier */:
      return ((_a = name.emitNode) == null ? void 0 : _a.autoGenerate) ? void 0 : name.escapedText;
    case 11 /* StringLiteral */:
    case 9 /* NumericLiteral */:
    case 10 /* BigIntLiteral */:
    case 15 /* NoSubstitutionTemplateLiteral */:
      return escapeLeadingUnderscores(name.text);
    case 168 /* ComputedPropertyName */:
      if (isStringOrNumericLiteralLike(name.expression)) return escapeLeadingUnderscores(name.expression.text);
      return void 0;
    case 296 /* JsxNamespacedName */:
      return getEscapedTextOfJsxNamespacedName(name);
    default:
      return Debug.assertNever(name);
  }
}
function getTextOfPropertyName(name) {
  return Debug.checkDefined(tryGetTextOfPropertyName(name));
}
function createDiagnosticForNodeInSourceFile(sourceFile, node, message, ...args) {
  const span = getErrorSpanForNode(sourceFile, node);
  return createFileDiagnostic(sourceFile, span.start, span.length, message, ...args);
}
function assertDiagnosticLocation(sourceText, start, length2) {
  Debug.assertGreaterThanOrEqual(start, 0);
  Debug.assertGreaterThanOrEqual(length2, 0);
  Debug.assertLessThanOrEqual(start, sourceText.length);
  Debug.assertLessThanOrEqual(start + length2, sourceText.length);
}
function getSpanOfTokenAtPosition(sourceFile, pos) {
  const scanner2 = createScanner(
    sourceFile.languageVersion,
    /*skipTrivia*/
    true,
    sourceFile.languageVariant,
    sourceFile.text,
    /*onError*/
    void 0,
    pos
  );
  scanner2.scan();
  const start = scanner2.getTokenStart();
  return createTextSpanFromBounds(start, scanner2.getTokenEnd());
}
function getErrorSpanForArrowFunction(sourceFile, node) {
  const pos = skipTrivia(sourceFile.text, node.pos);
  if (node.body && node.body.kind === 242 /* Block */) {
    const { line: startLine } = getLineAndCharacterOfPosition(sourceFile, node.body.pos);
    const { line: endLine } = getLineAndCharacterOfPosition(sourceFile, node.body.end);
    if (startLine < endLine) {
      return createTextSpan(pos, getEndLinePosition(startLine, sourceFile) - pos + 1);
    }
  }
  return createTextSpanFromBounds(pos, node.end);
}
function getErrorSpanForNode(sourceFile, node) {
  let errorNode = node;
  switch (node.kind) {
    case 308 /* SourceFile */: {
      const pos2 = skipTrivia(
        sourceFile.text,
        0,
        /*stopAfterLineBreak*/
        false
      );
      if (pos2 === sourceFile.text.length) {
        return createTextSpan(0, 0);
      }
      return getSpanOfTokenAtPosition(sourceFile, pos2);
    }
    // This list is a work in progress. Add missing node kinds to improve their error
    // spans.
    case 261 /* VariableDeclaration */:
    case 209 /* BindingElement */:
    case 264 /* ClassDeclaration */:
    case 232 /* ClassExpression */:
    case 265 /* InterfaceDeclaration */:
    case 268 /* ModuleDeclaration */:
    case 267 /* EnumDeclaration */:
    case 307 /* EnumMember */:
    case 263 /* FunctionDeclaration */:
    case 219 /* FunctionExpression */:
    case 175 /* MethodDeclaration */:
    case 178 /* GetAccessor */:
    case 179 /* SetAccessor */:
    case 266 /* TypeAliasDeclaration */:
    case 173 /* PropertyDeclaration */:
    case 172 /* PropertySignature */:
    case 275 /* NamespaceImport */:
      errorNode = node.name;
      break;
    case 220 /* ArrowFunction */:
      return getErrorSpanForArrowFunction(sourceFile, node);
    case 297 /* CaseClause */:
    case 298 /* DefaultClause */: {
      const start = skipTrivia(sourceFile.text, node.pos);
      const end = node.statements.length > 0 ? node.statements[0].pos : node.end;
      return createTextSpanFromBounds(start, end);
    }
    case 254 /* ReturnStatement */:
    case 230 /* YieldExpression */: {
      const pos2 = skipTrivia(sourceFile.text, node.pos);
      return getSpanOfTokenAtPosition(sourceFile, pos2);
    }
    case 239 /* SatisfiesExpression */: {
      const pos2 = skipTrivia(sourceFile.text, node.expression.end);
      return getSpanOfTokenAtPosition(sourceFile, pos2);
    }
    case 351 /* JSDocSatisfiesTag */: {
      const pos2 = skipTrivia(sourceFile.text, node.tagName.pos);
      return getSpanOfTokenAtPosition(sourceFile, pos2);
    }
    case 177 /* Constructor */: {
      const constructorDeclaration = node;
      const start = skipTrivia(sourceFile.text, constructorDeclaration.pos);
      const scanner2 = createScanner(
        sourceFile.languageVersion,
        /*skipTrivia*/
        true,
        sourceFile.languageVariant,
        sourceFile.text,
        /*onError*/
        void 0,
        start
      );
      let token = scanner2.scan();
      while (token !== 137 /* ConstructorKeyword */ && token !== 1 /* EndOfFileToken */) {
        token = scanner2.scan();
      }
      const end = scanner2.getTokenEnd();
      return createTextSpanFromBounds(start, end);
    }
  }
  if (errorNode === void 0) {
    return getSpanOfTokenAtPosition(sourceFile, node.pos);
  }
  Debug.assert(!isJSDoc(errorNode));
  const isMissing = nodeIsMissing(errorNode);
  const pos = isMissing || isJsxText(node) ? errorNode.pos : skipTrivia(sourceFile.text, errorNode.pos);
  if (isMissing) {
    Debug.assert(pos === errorNode.pos, "This failure could trigger https://github.com/Microsoft/TypeScript/issues/20809");
    Debug.assert(pos === errorNode.end, "This failure could trigger https://github.com/Microsoft/TypeScript/issues/20809");
  } else {
    Debug.assert(pos >= errorNode.pos, "This failure could trigger https://github.com/Microsoft/TypeScript/issues/20809");
    Debug.assert(pos <= errorNode.end, "This failure could trigger https://github.com/Microsoft/TypeScript/issues/20809");
  }
  return createTextSpanFromBounds(pos, errorNode.end);
}
function isPrologueDirective(node) {
  return node.kind === 245 /* ExpressionStatement */ && node.expression.kind === 11 /* StringLiteral */;
}
function isCustomPrologue(node) {
  return !!(getEmitFlags(node) & 2097152 /* CustomPrologue */);
}
function isHoistedFunction(node) {
  return isCustomPrologue(node) && isFunctionDeclaration(node);
}
function isHoistedVariable(node) {
  return isIdentifier(node.name) && !node.initializer;
}
function isHoistedVariableStatement(node) {
  return isCustomPrologue(node) && isVariableStatement(node) && every(node.declarationList.declarations, isHoistedVariable);
}
function getJSDocCommentRanges(node, text) {
  const commentRanges = node.kind === 170 /* Parameter */ || node.kind === 169 /* TypeParameter */ || node.kind === 219 /* FunctionExpression */ || node.kind === 220 /* ArrowFunction */ || node.kind === 218 /* ParenthesizedExpression */ || node.kind === 261 /* VariableDeclaration */ || node.kind === 282 /* ExportSpecifier */ ? concatenate(getTrailingCommentRanges(text, node.pos), getLeadingCommentRanges(text, node.pos)) : getLeadingCommentRanges(text, node.pos);
  return filter(commentRanges, (comment) => comment.end <= node.end && // Due to parse errors sometime empty parameter may get comments assigned to it that end up not in parameter range
  text.charCodeAt(comment.pos + 1) === 42 /* asterisk */ && text.charCodeAt(comment.pos + 2) === 42 /* asterisk */ && text.charCodeAt(comment.pos + 3) !== 47 /* slash */);
}
function isVariableLike(node) {
  if (node) {
    switch (node.kind) {
      case 209 /* BindingElement */:
      case 307 /* EnumMember */:
      case 170 /* Parameter */:
      case 304 /* PropertyAssignment */:
      case 173 /* PropertyDeclaration */:
      case 172 /* PropertySignature */:
      case 305 /* ShorthandPropertyAssignment */:
      case 261 /* VariableDeclaration */:
        return true;
    }
  }
  return false;
}
function isFunctionBlock(node) {
  return node && node.kind === 242 /* Block */ && isFunctionLike(node.parent);
}
function isSuperProperty(node) {
  const kind = node.kind;
  return (kind === 212 /* PropertyAccessExpression */ || kind === 213 /* ElementAccessExpression */) && node.expression.kind === 108 /* SuperKeyword */;
}
function isInJSFile(node) {
  return !!node && !!(node.flags & 524288 /* JavaScriptFile */);
}
function isInJSDoc(node) {
  return !!node && !!(node.flags & 16777216 /* JSDoc */);
}
function isStringDoubleQuoted(str, sourceFile) {
  return getSourceTextOfNodeFromSourceFile(sourceFile, str).charCodeAt(0) === 34 /* doubleQuote */;
}
function getRightMostAssignedExpression(node) {
  while (isAssignmentExpression(
    node,
    /*excludeCompoundAssignment*/
    true
  )) {
    node = node.right;
  }
  return node;
}
function isExportsIdentifier(node) {
  return isIdentifier(node) && node.escapedText === "exports";
}
function isModuleIdentifier(node) {
  return isIdentifier(node) && node.escapedText === "module";
}
function isModuleExportsAccessExpression(node) {
  return (isPropertyAccessExpression(node) || isLiteralLikeElementAccess(node)) && isModuleIdentifier(node.expression) && getElementOrPropertyAccessName(node) === "exports";
}
function getAssignmentDeclarationKind(expr) {
  const special = getAssignmentDeclarationKindWorker(expr);
  return special === 5 /* Property */ || isInJSFile(expr) ? special : 0 /* None */;
}
function isBindableObjectDefinePropertyCall(expr) {
  return length(expr.arguments) === 3 && isPropertyAccessExpression(expr.expression) && isIdentifier(expr.expression.expression) && idText(expr.expression.expression) === "Object" && idText(expr.expression.name) === "defineProperty" && isStringOrNumericLiteralLike(expr.arguments[1]) && isBindableStaticNameExpression(
    expr.arguments[0],
    /*excludeThisKeyword*/
    true
  );
}
function isLiteralLikeElementAccess(node) {
  return isElementAccessExpression(node) && isStringOrNumericLiteralLike(node.argumentExpression);
}
function isBindableStaticAccessExpression(node, excludeThisKeyword) {
  return isPropertyAccessExpression(node) && (!excludeThisKeyword && node.expression.kind === 110 /* ThisKeyword */ || isIdentifier(node.name) && isBindableStaticNameExpression(
    node.expression,
    /*excludeThisKeyword*/
    true
  )) || isBindableStaticElementAccessExpression(node, excludeThisKeyword);
}
function isBindableStaticElementAccessExpression(node, excludeThisKeyword) {
  return isLiteralLikeElementAccess(node) && (!excludeThisKeyword && node.expression.kind === 110 /* ThisKeyword */ || isEntityNameExpression(node.expression) || isBindableStaticAccessExpression(
    node.expression,
    /*excludeThisKeyword*/
    true
  ));
}
function isBindableStaticNameExpression(node, excludeThisKeyword) {
  return isEntityNameExpression(node) || isBindableStaticAccessExpression(node, excludeThisKeyword);
}
function getAssignmentDeclarationKindWorker(expr) {
  if (isCallExpression(expr)) {
    if (!isBindableObjectDefinePropertyCall(expr)) {
      return 0 /* None */;
    }
    const entityName = expr.arguments[0];
    if (isExportsIdentifier(entityName) || isModuleExportsAccessExpression(entityName)) {
      return 8 /* ObjectDefinePropertyExports */;
    }
    if (isBindableStaticAccessExpression(entityName) && getElementOrPropertyAccessName(entityName) === "prototype") {
      return 9 /* ObjectDefinePrototypeProperty */;
    }
    return 7 /* ObjectDefinePropertyValue */;
  }
  if (expr.operatorToken.kind !== 64 /* EqualsToken */ || !isAccessExpression(expr.left) || isVoidZero(getRightMostAssignedExpression(expr))) {
    return 0 /* None */;
  }
  if (isBindableStaticNameExpression(
    expr.left.expression,
    /*excludeThisKeyword*/
    true
  ) && getElementOrPropertyAccessName(expr.left) === "prototype" && isObjectLiteralExpression(getInitializerOfBinaryExpression(expr))) {
    return 6 /* Prototype */;
  }
  return getAssignmentDeclarationPropertyAccessKind(expr.left);
}
function isVoidZero(node) {
  return isVoidExpression(node) && isNumericLiteral(node.expression) && node.expression.text === "0";
}
function getElementOrPropertyAccessArgumentExpressionOrName(node) {
  if (isPropertyAccessExpression(node)) {
    return node.name;
  }
  const arg = skipParentheses(node.argumentExpression);
  if (isNumericLiteral(arg) || isStringLiteralLike(arg)) {
    return arg;
  }
  return node;
}
function getElementOrPropertyAccessName(node) {
  const name = getElementOrPropertyAccessArgumentExpressionOrName(node);
  if (name) {
    if (isIdentifier(name)) {
      return name.escapedText;
    }
    if (isStringLiteralLike(name) || isNumericLiteral(name)) {
      return escapeLeadingUnderscores(name.text);
    }
  }
  return void 0;
}
function getAssignmentDeclarationPropertyAccessKind(lhs) {
  if (lhs.expression.kind === 110 /* ThisKeyword */) {
    return 4 /* ThisProperty */;
  } else if (isModuleExportsAccessExpression(lhs)) {
    return 2 /* ModuleExports */;
  } else if (isBindableStaticNameExpression(
    lhs.expression,
    /*excludeThisKeyword*/
    true
  )) {
    if (isPrototypeAccess(lhs.expression)) {
      return 3 /* PrototypeProperty */;
    }
    let nextToLast = lhs;
    while (!isIdentifier(nextToLast.expression)) {
      nextToLast = nextToLast.expression;
    }
    const id = nextToLast.expression;
    if ((id.escapedText === "exports" || id.escapedText === "module" && getElementOrPropertyAccessName(nextToLast) === "exports") && // ExportsProperty does not support binding with computed names
    isBindableStaticAccessExpression(lhs)) {
      return 1 /* ExportsProperty */;
    }
    if (isBindableStaticNameExpression(
      lhs,
      /*excludeThisKeyword*/
      true
    ) || isElementAccessExpression(lhs) && isDynamicName(lhs)) {
      return 5 /* Property */;
    }
  }
  return 0 /* None */;
}
function getInitializerOfBinaryExpression(expr) {
  while (isBinaryExpression(expr.right)) {
    expr = expr.right;
  }
  return expr.right;
}
function getSourceOfDefaultedAssignment(node) {
  return isExpressionStatement(node) && isBinaryExpression(node.expression) && getAssignmentDeclarationKind(node.expression) !== 0 /* None */ && isBinaryExpression(node.expression.right) && (node.expression.right.operatorToken.kind === 57 /* BarBarToken */ || node.expression.right.operatorToken.kind === 61 /* QuestionQuestionToken */) ? node.expression.right.right : void 0;
}
function getSingleInitializerOfVariableStatementOrPropertyDeclaration(node) {
  switch (node.kind) {
    case 244 /* VariableStatement */:
      const v = getSingleVariableOfVariableStatement(node);
      return v && v.initializer;
    case 173 /* PropertyDeclaration */:
      return node.initializer;
    case 304 /* PropertyAssignment */:
      return node.initializer;
  }
}
function getSingleVariableOfVariableStatement(node) {
  return isVariableStatement(node) ? firstOrUndefined(node.declarationList.declarations) : void 0;
}
function getNestedModuleDeclaration(node) {
  return isModuleDeclaration(node) && node.body && node.body.kind === 268 /* ModuleDeclaration */ ? node.body : void 0;
}
function canHaveJSDoc(node) {
  switch (node.kind) {
    case 220 /* ArrowFunction */:
    case 227 /* BinaryExpression */:
    case 242 /* Block */:
    case 253 /* BreakStatement */:
    case 180 /* CallSignature */:
    case 297 /* CaseClause */:
    case 264 /* ClassDeclaration */:
    case 232 /* ClassExpression */:
    case 176 /* ClassStaticBlockDeclaration */:
    case 177 /* Constructor */:
    case 186 /* ConstructorType */:
    case 181 /* ConstructSignature */:
    case 252 /* ContinueStatement */:
    case 260 /* DebuggerStatement */:
    case 247 /* DoStatement */:
    case 213 /* ElementAccessExpression */:
    case 243 /* EmptyStatement */:
    case 1 /* EndOfFileToken */:
    case 267 /* EnumDeclaration */:
    case 307 /* EnumMember */:
    case 278 /* ExportAssignment */:
    case 279 /* ExportDeclaration */:
    case 282 /* ExportSpecifier */:
    case 245 /* ExpressionStatement */:
    case 250 /* ForInStatement */:
    case 251 /* ForOfStatement */:
    case 249 /* ForStatement */:
    case 263 /* FunctionDeclaration */:
    case 219 /* FunctionExpression */:
    case 185 /* FunctionType */:
    case 178 /* GetAccessor */:
    case 80 /* Identifier */:
    case 246 /* IfStatement */:
    case 273 /* ImportDeclaration */:
    case 272 /* ImportEqualsDeclaration */:
    case 182 /* IndexSignature */:
    case 265 /* InterfaceDeclaration */:
    case 318 /* JSDocFunctionType */:
    case 324 /* JSDocSignature */:
    case 257 /* LabeledStatement */:
    case 175 /* MethodDeclaration */:
    case 174 /* MethodSignature */:
    case 268 /* ModuleDeclaration */:
    case 203 /* NamedTupleMember */:
    case 271 /* NamespaceExportDeclaration */:
    case 211 /* ObjectLiteralExpression */:
    case 170 /* Parameter */:
    case 218 /* ParenthesizedExpression */:
    case 212 /* PropertyAccessExpression */:
    case 304 /* PropertyAssignment */:
    case 173 /* PropertyDeclaration */:
    case 172 /* PropertySignature */:
    case 254 /* ReturnStatement */:
    case 241 /* SemicolonClassElement */:
    case 179 /* SetAccessor */:
    case 305 /* ShorthandPropertyAssignment */:
    case 306 /* SpreadAssignment */:
    case 256 /* SwitchStatement */:
    case 258 /* ThrowStatement */:
    case 259 /* TryStatement */:
    case 266 /* TypeAliasDeclaration */:
    case 169 /* TypeParameter */:
    case 261 /* VariableDeclaration */:
    case 244 /* VariableStatement */:
    case 248 /* WhileStatement */:
    case 255 /* WithStatement */:
      return true;
    default:
      return false;
  }
}
function getJSDocCommentsAndTags(hostNode, noCache) {
  let result;
  if (isVariableLike(hostNode) && hasInitializer(hostNode) && hasJSDocNodes(hostNode.initializer)) {
    result = addRange(result, filterOwnedJSDocTags(hostNode, hostNode.initializer.jsDoc));
  }
  let node = hostNode;
  while (node && node.parent) {
    if (hasJSDocNodes(node)) {
      result = addRange(result, filterOwnedJSDocTags(hostNode, node.jsDoc));
    }
    if (node.kind === 170 /* Parameter */) {
      result = addRange(result, (noCache ? getJSDocParameterTagsNoCache : getJSDocParameterTags)(node));
      break;
    }
    if (node.kind === 169 /* TypeParameter */) {
      result = addRange(result, (noCache ? getJSDocTypeParameterTagsNoCache : getJSDocTypeParameterTags)(node));
      break;
    }
    node = getNextJSDocCommentLocation(node);
  }
  return result || emptyArray;
}
function filterOwnedJSDocTags(hostNode, comments) {
  const lastJsDoc = last(comments);
  return flatMap(comments, (jsDoc) => {
    if (jsDoc === lastJsDoc) {
      const ownedTags = filter(jsDoc.tags, (tag) => ownsJSDocTag(hostNode, tag));
      return jsDoc.tags === ownedTags ? [jsDoc] : ownedTags;
    } else {
      return filter(jsDoc.tags, isJSDocOverloadTag);
    }
  });
}
function ownsJSDocTag(hostNode, tag) {
  return !(isJSDocTypeTag(tag) || isJSDocSatisfiesTag(tag)) || !tag.parent || !isJSDoc(tag.parent) || !isParenthesizedExpression(tag.parent.parent) || tag.parent.parent === hostNode;
}
function getNextJSDocCommentLocation(node) {
  const parent2 = node.parent;
  if (parent2.kind === 304 /* PropertyAssignment */ || parent2.kind === 278 /* ExportAssignment */ || parent2.kind === 173 /* PropertyDeclaration */ || parent2.kind === 245 /* ExpressionStatement */ && node.kind === 212 /* PropertyAccessExpression */ || parent2.kind === 254 /* ReturnStatement */ || getNestedModuleDeclaration(parent2) || isAssignmentExpression(node)) {
    return parent2;
  } else if (parent2.parent && (getSingleVariableOfVariableStatement(parent2.parent) === node || isAssignmentExpression(parent2))) {
    return parent2.parent;
  } else if (parent2.parent && parent2.parent.parent && (getSingleVariableOfVariableStatement(parent2.parent.parent) || getSingleInitializerOfVariableStatementOrPropertyDeclaration(parent2.parent.parent) === node || getSourceOfDefaultedAssignment(parent2.parent.parent))) {
    return parent2.parent.parent;
  }
}
function skipParentheses(node, excludeJSDocTypeAssertions) {
  const flags = excludeJSDocTypeAssertions ? 1 /* Parentheses */ | -2147483648 /* ExcludeJSDocTypeAssertion */ : 1 /* Parentheses */;
  return skipOuterExpressions(node, flags);
}
function isKeyword(token) {
  return 83 /* FirstKeyword */ <= token && token <= 166 /* LastKeyword */;
}
function isPunctuation(token) {
  return 19 /* FirstPunctuation */ <= token && token <= 79 /* LastPunctuation */;
}
function isKeywordOrPunctuation(token) {
  return isKeyword(token) || isPunctuation(token);
}
function isStringOrNumericLiteralLike(node) {
  return isStringLiteralLike(node) || isNumericLiteral(node);
}
function isSignedNumericLiteral(node) {
  return isPrefixUnaryExpression(node) && (node.operator === 40 /* PlusToken */ || node.operator === 41 /* MinusToken */) && isNumericLiteral(node.operand);
}
function isDynamicName(name) {
  if (!(name.kind === 168 /* ComputedPropertyName */ || name.kind === 213 /* ElementAccessExpression */)) {
    return false;
  }
  const expr = isElementAccessExpression(name) ? skipParentheses(name.argumentExpression) : name.expression;
  return !isStringOrNumericLiteralLike(expr) && !isSignedNumericLiteral(expr);
}
function getTextOfIdentifierOrLiteral(node) {
  return isMemberName(node) ? idText(node) : isJsxNamespacedName(node) ? getTextOfJsxNamespacedName(node) : node.text;
}
function nodeIsSynthesized(range) {
  return positionIsSynthesized(range.pos) || positionIsSynthesized(range.end);
}
function getExpressionAssociativity(expression) {
  const operator = getOperator(expression);
  const hasArguments = expression.kind === 215 /* NewExpression */ && expression.arguments !== void 0;
  return getOperatorAssociativity(expression.kind, operator, hasArguments);
}
function getOperatorAssociativity(kind, operator, hasArguments) {
  switch (kind) {
    case 215 /* NewExpression */:
      return hasArguments ? 0 /* Left */ : 1 /* Right */;
    case 225 /* PrefixUnaryExpression */:
    case 222 /* TypeOfExpression */:
    case 223 /* VoidExpression */:
    case 221 /* DeleteExpression */:
    case 224 /* AwaitExpression */:
    case 228 /* ConditionalExpression */:
    case 230 /* YieldExpression */:
      return 1 /* Right */;
    case 227 /* BinaryExpression */:
      switch (operator) {
        case 43 /* AsteriskAsteriskToken */:
        case 64 /* EqualsToken */:
        case 65 /* PlusEqualsToken */:
        case 66 /* MinusEqualsToken */:
        case 68 /* AsteriskAsteriskEqualsToken */:
        case 67 /* AsteriskEqualsToken */:
        case 69 /* SlashEqualsToken */:
        case 70 /* PercentEqualsToken */:
        case 71 /* LessThanLessThanEqualsToken */:
        case 72 /* GreaterThanGreaterThanEqualsToken */:
        case 73 /* GreaterThanGreaterThanGreaterThanEqualsToken */:
        case 74 /* AmpersandEqualsToken */:
        case 79 /* CaretEqualsToken */:
        case 75 /* BarEqualsToken */:
        case 76 /* BarBarEqualsToken */:
        case 77 /* AmpersandAmpersandEqualsToken */:
        case 78 /* QuestionQuestionEqualsToken */:
          return 1 /* Right */;
      }
  }
  return 0 /* Left */;
}
function getExpressionPrecedence(expression) {
  const operator = getOperator(expression);
  const hasArguments = expression.kind === 215 /* NewExpression */ && expression.arguments !== void 0;
  return getOperatorPrecedence(expression.kind, operator, hasArguments);
}
function getOperator(expression) {
  if (expression.kind === 227 /* BinaryExpression */) {
    return expression.operatorToken.kind;
  } else if (expression.kind === 225 /* PrefixUnaryExpression */ || expression.kind === 226 /* PostfixUnaryExpression */) {
    return expression.operator;
  } else {
    return expression.kind;
  }
}
function getOperatorPrecedence(nodeKind, operatorKind, hasArguments) {
  switch (nodeKind) {
    case 357 /* CommaListExpression */:
      return 0 /* Comma */;
    case 231 /* SpreadElement */:
      return 1 /* Spread */;
    case 230 /* YieldExpression */:
      return 2 /* Yield */;
    case 228 /* ConditionalExpression */:
      return 4 /* Conditional */;
    case 227 /* BinaryExpression */:
      switch (operatorKind) {
        case 28 /* CommaToken */:
          return 0 /* Comma */;
        case 64 /* EqualsToken */:
        case 65 /* PlusEqualsToken */:
        case 66 /* MinusEqualsToken */:
        case 68 /* AsteriskAsteriskEqualsToken */:
        case 67 /* AsteriskEqualsToken */:
        case 69 /* SlashEqualsToken */:
        case 70 /* PercentEqualsToken */:
        case 71 /* LessThanLessThanEqualsToken */:
        case 72 /* GreaterThanGreaterThanEqualsToken */:
        case 73 /* GreaterThanGreaterThanGreaterThanEqualsToken */:
        case 74 /* AmpersandEqualsToken */:
        case 79 /* CaretEqualsToken */:
        case 75 /* BarEqualsToken */:
        case 76 /* BarBarEqualsToken */:
        case 77 /* AmpersandAmpersandEqualsToken */:
        case 78 /* QuestionQuestionEqualsToken */:
          return 3 /* Assignment */;
        default:
          return getBinaryOperatorPrecedence(operatorKind);
      }
    // TODO: Should prefix `++` and `--` be moved to the `Update` precedence?
    case 217 /* TypeAssertionExpression */:
    case 236 /* NonNullExpression */:
    case 225 /* PrefixUnaryExpression */:
    case 222 /* TypeOfExpression */:
    case 223 /* VoidExpression */:
    case 221 /* DeleteExpression */:
    case 224 /* AwaitExpression */:
      return 16 /* Unary */;
    case 226 /* PostfixUnaryExpression */:
      return 17 /* Update */;
    case 214 /* CallExpression */:
      return 18 /* LeftHandSide */;
    case 215 /* NewExpression */:
      return hasArguments ? 19 /* Member */ : 18 /* LeftHandSide */;
    case 216 /* TaggedTemplateExpression */:
    case 212 /* PropertyAccessExpression */:
    case 213 /* ElementAccessExpression */:
    case 237 /* MetaProperty */:
      return 19 /* Member */;
    case 235 /* AsExpression */:
    case 239 /* SatisfiesExpression */:
      return 11 /* Relational */;
    case 110 /* ThisKeyword */:
    case 108 /* SuperKeyword */:
    case 80 /* Identifier */:
    case 81 /* PrivateIdentifier */:
    case 106 /* NullKeyword */:
    case 112 /* TrueKeyword */:
    case 97 /* FalseKeyword */:
    case 9 /* NumericLiteral */:
    case 10 /* BigIntLiteral */:
    case 11 /* StringLiteral */:
    case 210 /* ArrayLiteralExpression */:
    case 211 /* ObjectLiteralExpression */:
    case 219 /* FunctionExpression */:
    case 220 /* ArrowFunction */:
    case 232 /* ClassExpression */:
    case 14 /* RegularExpressionLiteral */:
    case 15 /* NoSubstitutionTemplateLiteral */:
    case 229 /* TemplateExpression */:
    case 218 /* ParenthesizedExpression */:
    case 233 /* OmittedExpression */:
    case 285 /* JsxElement */:
    case 286 /* JsxSelfClosingElement */:
    case 289 /* JsxFragment */:
      return 20 /* Primary */;
    default:
      return -1 /* Invalid */;
  }
}
function getBinaryOperatorPrecedence(kind) {
  switch (kind) {
    case 61 /* QuestionQuestionToken */:
      return 5 /* Coalesce */;
    case 57 /* BarBarToken */:
      return 5 /* LogicalOR */;
    case 56 /* AmpersandAmpersandToken */:
      return 6 /* LogicalAND */;
    case 52 /* BarToken */:
      return 7 /* BitwiseOR */;
    case 53 /* CaretToken */:
      return 8 /* BitwiseXOR */;
    case 51 /* AmpersandToken */:
      return 9 /* BitwiseAND */;
    case 35 /* EqualsEqualsToken */:
    case 36 /* ExclamationEqualsToken */:
    case 37 /* EqualsEqualsEqualsToken */:
    case 38 /* ExclamationEqualsEqualsToken */:
      return 10 /* Equality */;
    case 30 /* LessThanToken */:
    case 32 /* GreaterThanToken */:
    case 33 /* LessThanEqualsToken */:
    case 34 /* GreaterThanEqualsToken */:
    case 104 /* InstanceOfKeyword */:
    case 103 /* InKeyword */:
    case 130 /* AsKeyword */:
    case 152 /* SatisfiesKeyword */:
      return 11 /* Relational */;
    case 48 /* LessThanLessThanToken */:
    case 49 /* GreaterThanGreaterThanToken */:
    case 50 /* GreaterThanGreaterThanGreaterThanToken */:
      return 12 /* Shift */;
    case 40 /* PlusToken */:
    case 41 /* MinusToken */:
      return 13 /* Additive */;
    case 42 /* AsteriskToken */:
    case 44 /* SlashToken */:
    case 45 /* PercentToken */:
      return 14 /* Multiplicative */;
    case 43 /* AsteriskAsteriskToken */:
      return 15 /* Exponentiation */;
  }
  return -1;
}
function containsInvalidEscapeFlag(node) {
  return !!((node.templateFlags || 0) & 2048 /* ContainsInvalidEscape */);
}
function hasInvalidEscape(template) {
  return template && !!(isNoSubstitutionTemplateLiteral(template) ? containsInvalidEscapeFlag(template) : containsInvalidEscapeFlag(template.head) || some(template.templateSpans, (span) => containsInvalidEscapeFlag(span.literal)));
}
function isThisIdentifier(node) {
  return !!node && node.kind === 80 /* Identifier */ && identifierIsThisKeyword(node);
}
function identifierIsThisKeyword(id) {
  return id.escapedText === "this";
}
function hasSyntacticModifier(node, flags) {
  return !!getSelectedSyntacticModifierFlags(node, flags);
}
function hasDecorators(node) {
  return hasSyntacticModifier(node, 32768 /* Decorator */);
}
function getSelectedSyntacticModifierFlags(node, flags) {
  return getSyntacticModifierFlags(node) & flags;
}
function getModifierFlagsWorker(node, includeJSDoc, alwaysIncludeJSDoc) {
  if (node.kind >= 0 /* FirstToken */ && node.kind <= 166 /* LastToken */) {
    return 0 /* None */;
  }
  if (!(node.modifierFlagsCache & 536870912 /* HasComputedFlags */)) {
    node.modifierFlagsCache = getSyntacticModifierFlagsNoCache(node) | 536870912 /* HasComputedFlags */;
  }
  if (alwaysIncludeJSDoc || includeJSDoc && isInJSFile(node)) {
    if (!(node.modifierFlagsCache & 268435456 /* HasComputedJSDocModifiers */) && node.parent) {
      node.modifierFlagsCache |= getRawJSDocModifierFlagsNoCache(node) | 268435456 /* HasComputedJSDocModifiers */;
    }
    return selectEffectiveModifierFlags(node.modifierFlagsCache);
  }
  return selectSyntacticModifierFlags(node.modifierFlagsCache);
}
function getSyntacticModifierFlags(node) {
  return getModifierFlagsWorker(
    node,
    /*includeJSDoc*/
    false
  );
}
function getRawJSDocModifierFlagsNoCache(node) {
  let flags = 0 /* None */;
  if (!!node.parent && !isParameter(node)) {
    if (isInJSFile(node)) {
      if (getJSDocPublicTagNoCache(node)) flags |= 8388608 /* JSDocPublic */;
      if (getJSDocPrivateTagNoCache(node)) flags |= 16777216 /* JSDocPrivate */;
      if (getJSDocProtectedTagNoCache(node)) flags |= 33554432 /* JSDocProtected */;
      if (getJSDocReadonlyTagNoCache(node)) flags |= 67108864 /* JSDocReadonly */;
      if (getJSDocOverrideTagNoCache(node)) flags |= 134217728 /* JSDocOverride */;
    }
    if (getJSDocDeprecatedTagNoCache(node)) flags |= 65536 /* Deprecated */;
  }
  return flags;
}
function selectSyntacticModifierFlags(flags) {
  return flags & 65535 /* SyntacticModifiers */;
}
function selectEffectiveModifierFlags(flags) {
  return flags & 131071 /* NonCacheOnlyModifiers */ | (flags & 260046848 /* JSDocCacheOnlyModifiers */) >>> 23;
}
function getJSDocModifierFlagsNoCache(node) {
  return selectEffectiveModifierFlags(getRawJSDocModifierFlagsNoCache(node));
}
function getEffectiveModifierFlagsNoCache(node) {
  return getSyntacticModifierFlagsNoCache(node) | getJSDocModifierFlagsNoCache(node);
}
function getSyntacticModifierFlagsNoCache(node) {
  let flags = canHaveModifiers(node) ? modifiersToFlags(node.modifiers) : 0 /* None */;
  if (node.flags & 8 /* NestedNamespace */ || node.kind === 80 /* Identifier */ && node.flags & 4096 /* IdentifierIsInJSDocNamespace */) {
    flags |= 32 /* Export */;
  }
  return flags;
}
function modifiersToFlags(modifiers) {
  let flags = 0 /* None */;
  if (modifiers) {
    for (const modifier of modifiers) {
      flags |= modifierToFlag(modifier.kind);
    }
  }
  return flags;
}
function modifierToFlag(token) {
  switch (token) {
    case 126 /* StaticKeyword */:
      return 256 /* Static */;
    case 125 /* PublicKeyword */:
      return 1 /* Public */;
    case 124 /* ProtectedKeyword */:
      return 4 /* Protected */;
    case 123 /* PrivateKeyword */:
      return 2 /* Private */;
    case 128 /* AbstractKeyword */:
      return 64 /* Abstract */;
    case 129 /* AccessorKeyword */:
      return 512 /* Accessor */;
    case 95 /* ExportKeyword */:
      return 32 /* Export */;
    case 138 /* DeclareKeyword */:
      return 128 /* Ambient */;
    case 87 /* ConstKeyword */:
      return 4096 /* Const */;
    case 90 /* DefaultKeyword */:
      return 2048 /* Default */;
    case 134 /* AsyncKeyword */:
      return 1024 /* Async */;
    case 148 /* ReadonlyKeyword */:
      return 8 /* Readonly */;
    case 164 /* OverrideKeyword */:
      return 16 /* Override */;
    case 103 /* InKeyword */:
      return 8192 /* In */;
    case 147 /* OutKeyword */:
      return 16384 /* Out */;
    case 171 /* Decorator */:
      return 32768 /* Decorator */;
  }
  return 0 /* None */;
}
function isLogicalOrCoalescingAssignmentOperator(token) {
  return token === 76 /* BarBarEqualsToken */ || token === 77 /* AmpersandAmpersandEqualsToken */ || token === 78 /* QuestionQuestionEqualsToken */;
}
function isAssignmentOperator(token) {
  return token >= 64 /* FirstAssignment */ && token <= 79 /* LastAssignment */;
}
function isAssignmentExpression(node, excludeCompoundAssignment) {
  return isBinaryExpression(node) && (excludeCompoundAssignment ? node.operatorToken.kind === 64 /* EqualsToken */ : isAssignmentOperator(node.operatorToken.kind)) && isLeftHandSideExpression(node.left);
}
function isEntityNameExpression(node) {
  return node.kind === 80 /* Identifier */ || isPropertyAccessEntityNameExpression(node);
}
function isPropertyAccessEntityNameExpression(node) {
  return isPropertyAccessExpression(node) && isIdentifier(node.name) && isEntityNameExpression(node.expression);
}
function isPrototypeAccess(node) {
  return isBindableStaticAccessExpression(node) && getElementOrPropertyAccessName(node) === "prototype";
}
function getLastChild(node) {
  let lastChild;
  forEachChild(node, (child) => {
    if (nodeIsPresent(child)) lastChild = child;
  }, (children) => {
    for (let i = children.length - 1; i >= 0; i--) {
      if (nodeIsPresent(children[i])) {
        lastChild = children[i];
        break;
      }
    }
  });
  return lastChild;
}
function isTypeNodeKind(kind) {
  return kind >= 183 /* FirstTypeNode */ && kind <= 206 /* LastTypeNode */ || kind === 133 /* AnyKeyword */ || kind === 159 /* UnknownKeyword */ || kind === 150 /* NumberKeyword */ || kind === 163 /* BigIntKeyword */ || kind === 151 /* ObjectKeyword */ || kind === 136 /* BooleanKeyword */ || kind === 154 /* StringKeyword */ || kind === 155 /* SymbolKeyword */ || kind === 116 /* VoidKeyword */ || kind === 157 /* UndefinedKeyword */ || kind === 146 /* NeverKeyword */ || kind === 141 /* IntrinsicKeyword */ || kind === 234 /* ExpressionWithTypeArguments */ || kind === 313 /* JSDocAllType */ || kind === 314 /* JSDocUnknownType */ || kind === 315 /* JSDocNullableType */ || kind === 316 /* JSDocNonNullableType */ || kind === 317 /* JSDocOptionalType */ || kind === 318 /* JSDocFunctionType */ || kind === 319 /* JSDocVariadicType */;
}
function isAccessExpression(node) {
  return node.kind === 212 /* PropertyAccessExpression */ || node.kind === 213 /* ElementAccessExpression */;
}
function getLeftmostExpression(node, stopAtCallExpressions) {
  while (true) {
    switch (node.kind) {
      case 226 /* PostfixUnaryExpression */:
        node = node.operand;
        continue;
      case 227 /* BinaryExpression */:
        node = node.left;
        continue;
      case 228 /* ConditionalExpression */:
        node = node.condition;
        continue;
      case 216 /* TaggedTemplateExpression */:
        node = node.tag;
        continue;
      case 214 /* CallExpression */:
        if (stopAtCallExpressions) {
          return node;
        }
      // falls through
      case 235 /* AsExpression */:
      case 213 /* ElementAccessExpression */:
      case 212 /* PropertyAccessExpression */:
      case 236 /* NonNullExpression */:
      case 356 /* PartiallyEmittedExpression */:
      case 239 /* SatisfiesExpression */:
        node = node.expression;
        continue;
    }
    return node;
  }
}
function Symbol4(flags, name) {
  this.flags = flags;
  this.escapedName = name;
  this.declarations = void 0;
  this.valueDeclaration = void 0;
  this.id = 0;
  this.mergeId = 0;
  this.parent = void 0;
  this.members = void 0;
  this.exports = void 0;
  this.exportSymbol = void 0;
  this.constEnumOnlyModule = void 0;
  this.isReferenced = void 0;
  this.lastAssignmentPos = void 0;
  this.links = void 0;
}
function Type3(checker, flags) {
  this.flags = flags;
  if (Debug.isDebugging || tracing) {
    this.checker = checker;
  }
}
function Signature2(checker, flags) {
  this.flags = flags;
  if (Debug.isDebugging) {
    this.checker = checker;
  }
}
function Node4(kind, pos, end) {
  this.pos = pos;
  this.end = end;
  this.kind = kind;
  this.id = 0;
  this.flags = 0 /* None */;
  this.modifierFlagsCache = 0 /* None */;
  this.transformFlags = 0 /* None */;
  this.parent = void 0;
  this.original = void 0;
  this.emitNode = void 0;
}
function Token(kind, pos, end) {
  this.pos = pos;
  this.end = end;
  this.kind = kind;
  this.id = 0;
  this.flags = 0 /* None */;
  this.transformFlags = 0 /* None */;
  this.parent = void 0;
  this.emitNode = void 0;
}
function Identifier2(kind, pos, end) {
  this.pos = pos;
  this.end = end;
  this.kind = kind;
  this.id = 0;
  this.flags = 0 /* None */;
  this.transformFlags = 0 /* None */;
  this.parent = void 0;
  this.original = void 0;
  this.emitNode = void 0;
}
function SourceMapSource(fileName, text, skipTrivia2) {
  this.fileName = fileName;
  this.text = text;
  this.skipTrivia = skipTrivia2 || ((pos) => pos);
}
var objectAllocator = {
  getNodeConstructor: () => Node4,
  getTokenConstructor: () => Token,
  getIdentifierConstructor: () => Identifier2,
  getPrivateIdentifierConstructor: () => Node4,
  getSourceFileConstructor: () => Node4,
  getSymbolConstructor: () => Symbol4,
  getTypeConstructor: () => Type3,
  getSignatureConstructor: () => Signature2,
  getSourceMapSourceConstructor: () => SourceMapSource
};
var objectAllocatorPatchers = [];
function setObjectAllocator(alloc) {
  Object.assign(objectAllocator, alloc);
  forEach(objectAllocatorPatchers, (fn) => fn(objectAllocator));
}
function formatStringFromArgs(text, args) {
  return text.replace(/\{(\d+)\}/g, (_match, index) => "" + Debug.checkDefined(args[+index]));
}
var localizedDiagnosticMessages;
function getLocaleSpecificMessage(message) {
  return localizedDiagnosticMessages && localizedDiagnosticMessages[message.key] || message.message;
}
function createDetachedDiagnostic(fileName, sourceText, start, length2, message, ...args) {
  if (start + length2 > sourceText.length) {
    length2 = sourceText.length - start;
  }
  assertDiagnosticLocation(sourceText, start, length2);
  let text = getLocaleSpecificMessage(message);
  if (some(args)) {
    text = formatStringFromArgs(text, args);
  }
  return {
    file: void 0,
    start,
    length: length2,
    messageText: text,
    category: message.category,
    code: message.code,
    reportsUnnecessary: message.reportsUnnecessary,
    fileName
  };
}
function isDiagnosticWithDetachedLocation(diagnostic) {
  return diagnostic.file === void 0 && diagnostic.start !== void 0 && diagnostic.length !== void 0 && typeof diagnostic.fileName === "string";
}
function attachFileToDiagnostic(diagnostic, file) {
  const fileName = file.fileName || "";
  const length2 = file.text.length;
  Debug.assertEqual(diagnostic.fileName, fileName);
  Debug.assertLessThanOrEqual(diagnostic.start, length2);
  Debug.assertLessThanOrEqual(diagnostic.start + diagnostic.length, length2);
  const diagnosticWithLocation = {
    file,
    start: diagnostic.start,
    length: diagnostic.length,
    messageText: diagnostic.messageText,
    category: diagnostic.category,
    code: diagnostic.code,
    reportsUnnecessary: diagnostic.reportsUnnecessary
  };
  if (diagnostic.relatedInformation) {
    diagnosticWithLocation.relatedInformation = [];
    for (const related of diagnostic.relatedInformation) {
      if (isDiagnosticWithDetachedLocation(related) && related.fileName === fileName) {
        Debug.assertLessThanOrEqual(related.start, length2);
        Debug.assertLessThanOrEqual(related.start + related.length, length2);
        diagnosticWithLocation.relatedInformation.push(attachFileToDiagnostic(related, file));
      } else {
        diagnosticWithLocation.relatedInformation.push(related);
      }
    }
  }
  return diagnosticWithLocation;
}
function attachFileToDiagnostics(diagnostics, file) {
  const diagnosticsWithLocation = [];
  for (const diagnostic of diagnostics) {
    diagnosticsWithLocation.push(attachFileToDiagnostic(diagnostic, file));
  }
  return diagnosticsWithLocation;
}
function createFileDiagnostic(file, start, length2, message, ...args) {
  assertDiagnosticLocation(file.text, start, length2);
  let text = getLocaleSpecificMessage(message);
  if (some(args)) {
    text = formatStringFromArgs(text, args);
  }
  return {
    file,
    start,
    length: length2,
    messageText: text,
    category: message.category,
    code: message.code,
    reportsUnnecessary: message.reportsUnnecessary,
    reportsDeprecated: message.reportsDeprecated
  };
}
function getLanguageVariant(scriptKind) {
  return scriptKind === 4 /* TSX */ || scriptKind === 2 /* JSX */ || scriptKind === 1 /* JS */ || scriptKind === 6 /* JSON */ ? 1 /* JSX */ : 0 /* Standard */;
}
function getNameOfScriptTarget(scriptTarget) {
  return forEachEntry(targetOptionDeclaration.type, (value, key) => value === scriptTarget ? key : void 0);
}
function ensureScriptKind(fileName, scriptKind) {
  return scriptKind || getScriptKindFromFileName(fileName) || 3 /* TS */;
}
function getScriptKindFromFileName(fileName) {
  const ext = fileName.substr(fileName.lastIndexOf("."));
  switch (ext.toLowerCase()) {
    case ".js" /* Js */:
    case ".cjs" /* Cjs */:
    case ".mjs" /* Mjs */:
      return 1 /* JS */;
    case ".jsx" /* Jsx */:
      return 2 /* JSX */;
    case ".ts" /* Ts */:
    case ".cts" /* Cts */:
    case ".mts" /* Mts */:
      return 3 /* TS */;
    case ".tsx" /* Tsx */:
      return 4 /* TSX */;
    case ".json" /* Json */:
      return 6 /* JSON */;
    default:
      return 0 /* Unknown */;
  }
}
var supportedDeclarationExtensions = [".d.ts" /* Dts */, ".d.cts" /* Dcts */, ".d.mts" /* Dmts */];
function positionIsSynthesized(pos) {
  return !(pos >= 0);
}
function addRelatedInfo(diagnostic, ...relatedInformation) {
  if (!relatedInformation.length) {
    return diagnostic;
  }
  if (!diagnostic.relatedInformation) {
    diagnostic.relatedInformation = [];
  }
  Debug.assert(diagnostic.relatedInformation !== emptyArray, "Diagnostic had empty array singleton for related info, but is still being constructed!");
  diagnostic.relatedInformation.push(...relatedInformation);
  return diagnostic;
}
function parsePseudoBigInt(stringValue) {
  let log2Base;
  switch (stringValue.charCodeAt(1)) {
    // "x" in "0x123"
    case 98 /* b */:
    case 66 /* B */:
      log2Base = 1;
      break;
    case 111 /* o */:
    case 79 /* O */:
      log2Base = 3;
      break;
    case 120 /* x */:
    case 88 /* X */:
      log2Base = 4;
      break;
    default:
      const nIndex = stringValue.length - 1;
      let nonZeroStart = 0;
      while (stringValue.charCodeAt(nonZeroStart) === 48 /* _0 */) {
        nonZeroStart++;
      }
      return stringValue.slice(nonZeroStart, nIndex) || "0";
  }
  const startIndex = 2, endIndex = stringValue.length - 1;
  const bitsNeeded = (endIndex - startIndex) * log2Base;
  const segments = new Uint16Array((bitsNeeded >>> 4) + (bitsNeeded & 15 ? 1 : 0));
  for (let i = endIndex - 1, bitOffset = 0; i >= startIndex; i--, bitOffset += log2Base) {
    const segment = bitOffset >>> 4;
    const digitChar = stringValue.charCodeAt(i);
    const digit = digitChar <= 57 /* _9 */ ? digitChar - 48 /* _0 */ : 10 + digitChar - (digitChar <= 70 /* F */ ? 65 /* A */ : 97 /* a */);
    const shiftedDigit = digit << (bitOffset & 15);
    segments[segment] |= shiftedDigit;
    const residual = shiftedDigit >>> 16;
    if (residual) segments[segment + 1] |= residual;
  }
  let base10Value = "";
  let firstNonzeroSegment = segments.length - 1;
  let segmentsRemaining = true;
  while (segmentsRemaining) {
    let mod10 = 0;
    segmentsRemaining = false;
    for (let segment = firstNonzeroSegment; segment >= 0; segment--) {
      const newSegment = mod10 << 16 | segments[segment];
      const segmentValue = newSegment / 10 | 0;
      segments[segment] = segmentValue;
      mod10 = newSegment - segmentValue * 10;
      if (segmentValue && !segmentsRemaining) {
        firstNonzeroSegment = segment;
        segmentsRemaining = true;
      }
    }
    base10Value = mod10 + base10Value;
  }
  return base10Value;
}
function pseudoBigIntToString({ negative, base10Value }) {
  return (negative && base10Value !== "0" ? "-" : "") + base10Value;
}
function setTextRangePos(range, pos) {
  range.pos = pos;
  return range;
}
function setTextRangeEnd(range, end) {
  range.end = end;
  return range;
}
function setTextRangePosEnd(range, pos, end) {
  return setTextRangeEnd(setTextRangePos(range, pos), end);
}
function setTextRangePosWidth(range, pos, width) {
  return setTextRangePosEnd(range, pos, pos + width);
}
function setParent(child, parent2) {
  if (child && parent2) {
    child.parent = parent2;
  }
  return child;
}
function setParentRecursive(rootNode, incremental) {
  if (!rootNode) return rootNode;
  forEachChildRecursively(rootNode, isJSDocNode(rootNode) ? bindParentToChildIgnoringJSDoc : bindParentToChild);
  return rootNode;
  function bindParentToChildIgnoringJSDoc(child, parent2) {
    if (incremental && child.parent === parent2) {
      return "skip";
    }
    setParent(child, parent2);
  }
  function bindJSDoc(child) {
    if (hasJSDocNodes(child)) {
      for (const doc of child.jsDoc) {
        bindParentToChildIgnoringJSDoc(doc, child);
        forEachChildRecursively(doc, bindParentToChildIgnoringJSDoc);
      }
    }
  }
  function bindParentToChild(child, parent2) {
    return bindParentToChildIgnoringJSDoc(child, parent2) || bindJSDoc(child);
  }
}
function hasTabstop(node) {
  var _a;
  return ((_a = getSnippetElement(node)) == null ? void 0 : _a.kind) === 0 /* TabStop */;
}
function getEscapedTextOfJsxNamespacedName(node) {
  return `${node.namespace.escapedText}:${idText(node.name)}`;
}
function getTextOfJsxNamespacedName(node) {
  return `${idText(node.namespace)}:${idText(node.name)}`;
}
function createParenthesizerRules(factory2) {
  let binaryLeftOperandParenthesizerCache;
  let binaryRightOperandParenthesizerCache;
  return {
    getParenthesizeLeftSideOfBinaryForOperator,
    getParenthesizeRightSideOfBinaryForOperator,
    parenthesizeLeftSideOfBinary,
    parenthesizeRightSideOfBinary,
    parenthesizeExpressionOfComputedPropertyName,
    parenthesizeConditionOfConditionalExpression,
    parenthesizeBranchOfConditionalExpression,
    parenthesizeExpressionOfExportDefault,
    parenthesizeExpressionOfNew,
    parenthesizeLeftSideOfAccess,
    parenthesizeOperandOfPostfixUnary,
    parenthesizeOperandOfPrefixUnary,
    parenthesizeExpressionsOfCommaDelimitedList,
    parenthesizeExpressionForDisallowedComma,
    parenthesizeExpressionOfExpressionStatement,
    parenthesizeConciseBodyOfArrowFunction,
    parenthesizeCheckTypeOfConditionalType,
    parenthesizeExtendsTypeOfConditionalType,
    parenthesizeConstituentTypesOfUnionType,
    parenthesizeConstituentTypeOfUnionType,
    parenthesizeConstituentTypesOfIntersectionType,
    parenthesizeConstituentTypeOfIntersectionType,
    parenthesizeOperandOfTypeOperator,
    parenthesizeOperandOfReadonlyTypeOperator,
    parenthesizeNonArrayTypeOfPostfixType,
    parenthesizeElementTypesOfTupleType,
    parenthesizeElementTypeOfTupleType,
    parenthesizeTypeOfOptionalType,
    parenthesizeTypeArguments,
    parenthesizeLeadingTypeArgument
  };
  function getParenthesizeLeftSideOfBinaryForOperator(operatorKind) {
    binaryLeftOperandParenthesizerCache || (binaryLeftOperandParenthesizerCache = /* @__PURE__ */ new Map());
    let parenthesizerRule = binaryLeftOperandParenthesizerCache.get(operatorKind);
    if (!parenthesizerRule) {
      parenthesizerRule = (node) => parenthesizeLeftSideOfBinary(operatorKind, node);
      binaryLeftOperandParenthesizerCache.set(operatorKind, parenthesizerRule);
    }
    return parenthesizerRule;
  }
  function getParenthesizeRightSideOfBinaryForOperator(operatorKind) {
    binaryRightOperandParenthesizerCache || (binaryRightOperandParenthesizerCache = /* @__PURE__ */ new Map());
    let parenthesizerRule = binaryRightOperandParenthesizerCache.get(operatorKind);
    if (!parenthesizerRule) {
      parenthesizerRule = (node) => parenthesizeRightSideOfBinary(
        operatorKind,
        /*leftSide*/
        void 0,
        node
      );
      binaryRightOperandParenthesizerCache.set(operatorKind, parenthesizerRule);
    }
    return parenthesizerRule;
  }
  function mixingBinaryOperatorsRequiresParentheses(a, b) {
    if (a === 61 /* QuestionQuestionToken */) {
      return b === 56 /* AmpersandAmpersandToken */ || b === 57 /* BarBarToken */;
    }
    if (b === 61 /* QuestionQuestionToken */) {
      return a === 56 /* AmpersandAmpersandToken */ || a === 57 /* BarBarToken */;
    }
    return false;
  }
  function binaryOperandNeedsParentheses(binaryOperator, operand, isLeftSideOfBinary, leftOperand) {
    const emittedOperand = skipPartiallyEmittedExpressions(operand);
    if (isBinaryExpression(emittedOperand) && mixingBinaryOperatorsRequiresParentheses(binaryOperator, emittedOperand.operatorToken.kind)) {
      return true;
    }
    const binaryOperatorPrecedence = getOperatorPrecedence(227 /* BinaryExpression */, binaryOperator);
    const binaryOperatorAssociativity = getOperatorAssociativity(227 /* BinaryExpression */, binaryOperator);
    if (!isLeftSideOfBinary && operand.kind === 220 /* ArrowFunction */ && binaryOperatorPrecedence > 3 /* Assignment */) {
      return true;
    }
    const operandPrecedence = getExpressionPrecedence(emittedOperand);
    switch (compareValues(operandPrecedence, binaryOperatorPrecedence)) {
      case -1 /* LessThan */:
        if (!isLeftSideOfBinary && binaryOperatorAssociativity === 1 /* Right */ && operand.kind === 230 /* YieldExpression */) {
          return false;
        }
        return true;
      case 1 /* GreaterThan */:
        return false;
      case 0 /* EqualTo */:
        if (isLeftSideOfBinary) {
          return binaryOperatorAssociativity === 1 /* Right */;
        } else {
          if (isBinaryExpression(emittedOperand) && emittedOperand.operatorToken.kind === binaryOperator) {
            if (operatorHasAssociativeProperty(binaryOperator)) {
              return false;
            }
            if (binaryOperator === 40 /* PlusToken */) {
              const leftKind = leftOperand ? getLiteralKindOfBinaryPlusOperand(leftOperand) : 0 /* Unknown */;
              if (isLiteralKind(leftKind) && leftKind === getLiteralKindOfBinaryPlusOperand(emittedOperand)) {
                return false;
              }
            }
          }
          const operandAssociativity = getExpressionAssociativity(emittedOperand);
          return operandAssociativity === 0 /* Left */;
        }
    }
  }
  function operatorHasAssociativeProperty(binaryOperator) {
    return binaryOperator === 42 /* AsteriskToken */ || binaryOperator === 52 /* BarToken */ || binaryOperator === 51 /* AmpersandToken */ || binaryOperator === 53 /* CaretToken */ || binaryOperator === 28 /* CommaToken */;
  }
  function getLiteralKindOfBinaryPlusOperand(node) {
    node = skipPartiallyEmittedExpressions(node);
    if (isLiteralKind(node.kind)) {
      return node.kind;
    }
    if (node.kind === 227 /* BinaryExpression */ && node.operatorToken.kind === 40 /* PlusToken */) {
      if (node.cachedLiteralKind !== void 0) {
        return node.cachedLiteralKind;
      }
      const leftKind = getLiteralKindOfBinaryPlusOperand(node.left);
      const literalKind = isLiteralKind(leftKind) && leftKind === getLiteralKindOfBinaryPlusOperand(node.right) ? leftKind : 0 /* Unknown */;
      node.cachedLiteralKind = literalKind;
      return literalKind;
    }
    return 0 /* Unknown */;
  }
  function parenthesizeBinaryOperand(binaryOperator, operand, isLeftSideOfBinary, leftOperand) {
    const skipped = skipPartiallyEmittedExpressions(operand);
    if (skipped.kind === 218 /* ParenthesizedExpression */) {
      return operand;
    }
    return binaryOperandNeedsParentheses(binaryOperator, operand, isLeftSideOfBinary, leftOperand) ? factory2.createParenthesizedExpression(operand) : operand;
  }
  function parenthesizeLeftSideOfBinary(binaryOperator, leftSide) {
    return parenthesizeBinaryOperand(
      binaryOperator,
      leftSide,
      /*isLeftSideOfBinary*/
      true
    );
  }
  function parenthesizeRightSideOfBinary(binaryOperator, leftSide, rightSide) {
    return parenthesizeBinaryOperand(
      binaryOperator,
      rightSide,
      /*isLeftSideOfBinary*/
      false,
      leftSide
    );
  }
  function parenthesizeExpressionOfComputedPropertyName(expression) {
    return isCommaSequence(expression) ? factory2.createParenthesizedExpression(expression) : expression;
  }
  function parenthesizeConditionOfConditionalExpression(condition) {
    const conditionalPrecedence = getOperatorPrecedence(228 /* ConditionalExpression */, 58 /* QuestionToken */);
    const emittedCondition = skipPartiallyEmittedExpressions(condition);
    const conditionPrecedence = getExpressionPrecedence(emittedCondition);
    if (compareValues(conditionPrecedence, conditionalPrecedence) !== 1 /* GreaterThan */) {
      return factory2.createParenthesizedExpression(condition);
    }
    return condition;
  }
  function parenthesizeBranchOfConditionalExpression(branch) {
    const emittedExpression = skipPartiallyEmittedExpressions(branch);
    return isCommaSequence(emittedExpression) ? factory2.createParenthesizedExpression(branch) : branch;
  }
  function parenthesizeExpressionOfExportDefault(expression) {
    const check = skipPartiallyEmittedExpressions(expression);
    let needsParens = isCommaSequence(check);
    if (!needsParens) {
      switch (getLeftmostExpression(
        check,
        /*stopAtCallExpressions*/
        false
      ).kind) {
        case 232 /* ClassExpression */:
        case 219 /* FunctionExpression */:
          needsParens = true;
      }
    }
    return needsParens ? factory2.createParenthesizedExpression(expression) : expression;
  }
  function parenthesizeExpressionOfNew(expression) {
    const leftmostExpr = getLeftmostExpression(
      expression,
      /*stopAtCallExpressions*/
      true
    );
    switch (leftmostExpr.kind) {
      case 214 /* CallExpression */:
        return factory2.createParenthesizedExpression(expression);
      case 215 /* NewExpression */:
        return !leftmostExpr.arguments ? factory2.createParenthesizedExpression(expression) : expression;
    }
    return parenthesizeLeftSideOfAccess(expression);
  }
  function parenthesizeLeftSideOfAccess(expression, optionalChain) {
    const emittedExpression = skipPartiallyEmittedExpressions(expression);
    if (isLeftHandSideExpression(emittedExpression) && (emittedExpression.kind !== 215 /* NewExpression */ || emittedExpression.arguments) && (optionalChain || !isOptionalChain(emittedExpression))) {
      return expression;
    }
    return setTextRange(factory2.createParenthesizedExpression(expression), expression);
  }
  function parenthesizeOperandOfPostfixUnary(operand) {
    return isLeftHandSideExpression(operand) ? operand : setTextRange(factory2.createParenthesizedExpression(operand), operand);
  }
  function parenthesizeOperandOfPrefixUnary(operand) {
    return isUnaryExpression(operand) ? operand : setTextRange(factory2.createParenthesizedExpression(operand), operand);
  }
  function parenthesizeExpressionsOfCommaDelimitedList(elements) {
    const result = sameMap(elements, parenthesizeExpressionForDisallowedComma);
    return setTextRange(factory2.createNodeArray(result, elements.hasTrailingComma), elements);
  }
  function parenthesizeExpressionForDisallowedComma(expression) {
    const emittedExpression = skipPartiallyEmittedExpressions(expression);
    const expressionPrecedence = getExpressionPrecedence(emittedExpression);
    const commaPrecedence = getOperatorPrecedence(227 /* BinaryExpression */, 28 /* CommaToken */);
    return expressionPrecedence > commaPrecedence ? expression : setTextRange(factory2.createParenthesizedExpression(expression), expression);
  }
  function parenthesizeExpressionOfExpressionStatement(expression) {
    const emittedExpression = skipPartiallyEmittedExpressions(expression);
    if (isCallExpression(emittedExpression)) {
      const callee = emittedExpression.expression;
      const kind = skipPartiallyEmittedExpressions(callee).kind;
      if (kind === 219 /* FunctionExpression */ || kind === 220 /* ArrowFunction */) {
        const updated = factory2.updateCallExpression(
          emittedExpression,
          setTextRange(factory2.createParenthesizedExpression(callee), callee),
          emittedExpression.typeArguments,
          emittedExpression.arguments
        );
        return factory2.restoreOuterExpressions(expression, updated, 8 /* PartiallyEmittedExpressions */);
      }
    }
    const leftmostExpressionKind = getLeftmostExpression(
      emittedExpression,
      /*stopAtCallExpressions*/
      false
    ).kind;
    if (leftmostExpressionKind === 211 /* ObjectLiteralExpression */ || leftmostExpressionKind === 219 /* FunctionExpression */) {
      return setTextRange(factory2.createParenthesizedExpression(expression), expression);
    }
    return expression;
  }
  function parenthesizeConciseBodyOfArrowFunction(body) {
    if (!isBlock(body) && (isCommaSequence(body) || getLeftmostExpression(
      body,
      /*stopAtCallExpressions*/
      false
    ).kind === 211 /* ObjectLiteralExpression */)) {
      return setTextRange(factory2.createParenthesizedExpression(body), body);
    }
    return body;
  }
  function parenthesizeCheckTypeOfConditionalType(checkType) {
    switch (checkType.kind) {
      case 185 /* FunctionType */:
      case 186 /* ConstructorType */:
      case 195 /* ConditionalType */:
        return factory2.createParenthesizedType(checkType);
    }
    return checkType;
  }
  function parenthesizeExtendsTypeOfConditionalType(extendsType) {
    switch (extendsType.kind) {
      case 195 /* ConditionalType */:
        return factory2.createParenthesizedType(extendsType);
    }
    return extendsType;
  }
  function parenthesizeConstituentTypeOfUnionType(type) {
    switch (type.kind) {
      case 193 /* UnionType */:
      // Not strictly necessary, but a union containing a union should have been flattened
      case 194 /* IntersectionType */:
        return factory2.createParenthesizedType(type);
    }
    return parenthesizeCheckTypeOfConditionalType(type);
  }
  function parenthesizeConstituentTypesOfUnionType(members) {
    return factory2.createNodeArray(sameMap(members, parenthesizeConstituentTypeOfUnionType));
  }
  function parenthesizeConstituentTypeOfIntersectionType(type) {
    switch (type.kind) {
      case 193 /* UnionType */:
      case 194 /* IntersectionType */:
        return factory2.createParenthesizedType(type);
    }
    return parenthesizeConstituentTypeOfUnionType(type);
  }
  function parenthesizeConstituentTypesOfIntersectionType(members) {
    return factory2.createNodeArray(sameMap(members, parenthesizeConstituentTypeOfIntersectionType));
  }
  function parenthesizeOperandOfTypeOperator(type) {
    switch (type.kind) {
      case 194 /* IntersectionType */:
        return factory2.createParenthesizedType(type);
    }
    return parenthesizeConstituentTypeOfIntersectionType(type);
  }
  function parenthesizeOperandOfReadonlyTypeOperator(type) {
    switch (type.kind) {
      case 199 /* TypeOperator */:
        return factory2.createParenthesizedType(type);
    }
    return parenthesizeOperandOfTypeOperator(type);
  }
  function parenthesizeNonArrayTypeOfPostfixType(type) {
    switch (type.kind) {
      case 196 /* InferType */:
      case 199 /* TypeOperator */:
      case 187 /* TypeQuery */:
        return factory2.createParenthesizedType(type);
    }
    return parenthesizeOperandOfTypeOperator(type);
  }
  function parenthesizeElementTypesOfTupleType(types) {
    return factory2.createNodeArray(sameMap(types, parenthesizeElementTypeOfTupleType));
  }
  function parenthesizeElementTypeOfTupleType(type) {
    if (hasJSDocPostfixQuestion(type)) return factory2.createParenthesizedType(type);
    return type;
  }
  function hasJSDocPostfixQuestion(type) {
    if (isJSDocNullableType(type)) return type.postfix;
    if (isNamedTupleMember(type)) return hasJSDocPostfixQuestion(type.type);
    if (isFunctionTypeNode(type) || isConstructorTypeNode(type) || isTypeOperatorNode(type)) return hasJSDocPostfixQuestion(type.type);
    if (isConditionalTypeNode(type)) return hasJSDocPostfixQuestion(type.falseType);
    if (isUnionTypeNode(type)) return hasJSDocPostfixQuestion(last(type.types));
    if (isIntersectionTypeNode(type)) return hasJSDocPostfixQuestion(last(type.types));
    if (isInferTypeNode(type)) return !!type.typeParameter.constraint && hasJSDocPostfixQuestion(type.typeParameter.constraint);
    return false;
  }
  function parenthesizeTypeOfOptionalType(type) {
    if (hasJSDocPostfixQuestion(type)) return factory2.createParenthesizedType(type);
    return parenthesizeNonArrayTypeOfPostfixType(type);
  }
  function parenthesizeLeadingTypeArgument(node) {
    return isFunctionOrConstructorTypeNode(node) && node.typeParameters ? factory2.createParenthesizedType(node) : node;
  }
  function parenthesizeOrdinalTypeArgument(node, i) {
    return i === 0 ? parenthesizeLeadingTypeArgument(node) : node;
  }
  function parenthesizeTypeArguments(typeArguments) {
    if (some(typeArguments)) {
      return factory2.createNodeArray(sameMap(typeArguments, parenthesizeOrdinalTypeArgument));
    }
  }
}
var nullParenthesizerRules = {
  getParenthesizeLeftSideOfBinaryForOperator: (_) => identity,
  getParenthesizeRightSideOfBinaryForOperator: (_) => identity,
  parenthesizeLeftSideOfBinary: (_binaryOperator, leftSide) => leftSide,
  parenthesizeRightSideOfBinary: (_binaryOperator, _leftSide, rightSide) => rightSide,
  parenthesizeExpressionOfComputedPropertyName: identity,
  parenthesizeConditionOfConditionalExpression: identity,
  parenthesizeBranchOfConditionalExpression: identity,
  parenthesizeExpressionOfExportDefault: identity,
  parenthesizeExpressionOfNew: (expression) => cast(expression, isLeftHandSideExpression),
  parenthesizeLeftSideOfAccess: (expression) => cast(expression, isLeftHandSideExpression),
  parenthesizeOperandOfPostfixUnary: (operand) => cast(operand, isLeftHandSideExpression),
  parenthesizeOperandOfPrefixUnary: (operand) => cast(operand, isUnaryExpression),
  parenthesizeExpressionsOfCommaDelimitedList: (nodes) => cast(nodes, isNodeArray),
  parenthesizeExpressionForDisallowedComma: identity,
  parenthesizeExpressionOfExpressionStatement: identity,
  parenthesizeConciseBodyOfArrowFunction: identity,
  parenthesizeCheckTypeOfConditionalType: identity,
  parenthesizeExtendsTypeOfConditionalType: identity,
  parenthesizeConstituentTypesOfUnionType: (nodes) => cast(nodes, isNodeArray),
  parenthesizeConstituentTypeOfUnionType: identity,
  parenthesizeConstituentTypesOfIntersectionType: (nodes) => cast(nodes, isNodeArray),
  parenthesizeConstituentTypeOfIntersectionType: identity,
  parenthesizeOperandOfTypeOperator: identity,
  parenthesizeOperandOfReadonlyTypeOperator: identity,
  parenthesizeNonArrayTypeOfPostfixType: identity,
  parenthesizeElementTypesOfTupleType: (nodes) => cast(nodes, isNodeArray),
  parenthesizeElementTypeOfTupleType: identity,
  parenthesizeTypeOfOptionalType: identity,
  parenthesizeTypeArguments: (nodes) => nodes && cast(nodes, isNodeArray),
  parenthesizeLeadingTypeArgument: identity
};
function createNodeConverters(factory2) {
  return {
    convertToFunctionBlock,
    convertToFunctionExpression,
    convertToClassExpression,
    convertToArrayAssignmentElement,
    convertToObjectAssignmentElement,
    convertToAssignmentPattern,
    convertToObjectAssignmentPattern,
    convertToArrayAssignmentPattern,
    convertToAssignmentElementTarget
  };
  function convertToFunctionBlock(node, multiLine) {
    if (isBlock(node)) return node;
    const returnStatement = factory2.createReturnStatement(node);
    setTextRange(returnStatement, node);
    const body = factory2.createBlock([returnStatement], multiLine);
    setTextRange(body, node);
    return body;
  }
  function convertToFunctionExpression(node) {
    var _a;
    if (!node.body) return Debug.fail(`Cannot convert a FunctionDeclaration without a body`);
    const updated = factory2.createFunctionExpression(
      (_a = getModifiers(node)) == null ? void 0 : _a.filter((modifier) => !isExportModifier(modifier) && !isDefaultModifier(modifier)),
      node.asteriskToken,
      node.name,
      node.typeParameters,
      node.parameters,
      node.type,
      node.body
    );
    setOriginalNode(updated, node);
    setTextRange(updated, node);
    if (getStartsOnNewLine(node)) {
      setStartsOnNewLine(
        updated,
        /*newLine*/
        true
      );
    }
    return updated;
  }
  function convertToClassExpression(node) {
    var _a;
    const updated = factory2.createClassExpression(
      (_a = node.modifiers) == null ? void 0 : _a.filter((modifier) => !isExportModifier(modifier) && !isDefaultModifier(modifier)),
      node.name,
      node.typeParameters,
      node.heritageClauses,
      node.members
    );
    setOriginalNode(updated, node);
    setTextRange(updated, node);
    if (getStartsOnNewLine(node)) {
      setStartsOnNewLine(
        updated,
        /*newLine*/
        true
      );
    }
    return updated;
  }
  function convertToArrayAssignmentElement(element) {
    if (isBindingElement(element)) {
      if (element.dotDotDotToken) {
        Debug.assertNode(element.name, isIdentifier);
        return setOriginalNode(setTextRange(factory2.createSpreadElement(element.name), element), element);
      }
      const expression = convertToAssignmentElementTarget(element.name);
      return element.initializer ? setOriginalNode(
        setTextRange(
          factory2.createAssignment(expression, element.initializer),
          element
        ),
        element
      ) : expression;
    }
    return cast(element, isExpression);
  }
  function convertToObjectAssignmentElement(element) {
    if (isBindingElement(element)) {
      if (element.dotDotDotToken) {
        Debug.assertNode(element.name, isIdentifier);
        return setOriginalNode(setTextRange(factory2.createSpreadAssignment(element.name), element), element);
      }
      if (element.propertyName) {
        const expression = convertToAssignmentElementTarget(element.name);
        return setOriginalNode(setTextRange(factory2.createPropertyAssignment(element.propertyName, element.initializer ? factory2.createAssignment(expression, element.initializer) : expression), element), element);
      }
      Debug.assertNode(element.name, isIdentifier);
      return setOriginalNode(setTextRange(factory2.createShorthandPropertyAssignment(element.name, element.initializer), element), element);
    }
    return cast(element, isObjectLiteralElementLike);
  }
  function convertToAssignmentPattern(node) {
    switch (node.kind) {
      case 208 /* ArrayBindingPattern */:
      case 210 /* ArrayLiteralExpression */:
        return convertToArrayAssignmentPattern(node);
      case 207 /* ObjectBindingPattern */:
      case 211 /* ObjectLiteralExpression */:
        return convertToObjectAssignmentPattern(node);
    }
  }
  function convertToObjectAssignmentPattern(node) {
    if (isObjectBindingPattern(node)) {
      return setOriginalNode(
        setTextRange(
          factory2.createObjectLiteralExpression(map(node.elements, convertToObjectAssignmentElement)),
          node
        ),
        node
      );
    }
    return cast(node, isObjectLiteralExpression);
  }
  function convertToArrayAssignmentPattern(node) {
    if (isArrayBindingPattern(node)) {
      return setOriginalNode(
        setTextRange(
          factory2.createArrayLiteralExpression(map(node.elements, convertToArrayAssignmentElement)),
          node
        ),
        node
      );
    }
    return cast(node, isArrayLiteralExpression);
  }
  function convertToAssignmentElementTarget(node) {
    if (isBindingPattern(node)) {
      return convertToAssignmentPattern(node);
    }
    return cast(node, isExpression);
  }
}
var nullNodeConverters = {
  convertToFunctionBlock: notImplemented,
  convertToFunctionExpression: notImplemented,
  convertToClassExpression: notImplemented,
  convertToArrayAssignmentElement: notImplemented,
  convertToObjectAssignmentElement: notImplemented,
  convertToAssignmentPattern: notImplemented,
  convertToObjectAssignmentPattern: notImplemented,
  convertToArrayAssignmentPattern: notImplemented,
  convertToAssignmentElementTarget: notImplemented
};
var nextAutoGenerateId = 0;
var nodeFactoryPatchers = [];
function createNodeFactory(flags, baseFactory2) {
  const setOriginal = flags & 8 /* NoOriginalNode */ ? identity : setOriginalNode;
  const parenthesizerRules = memoize(() => flags & 1 /* NoParenthesizerRules */ ? nullParenthesizerRules : createParenthesizerRules(factory2));
  const converters = memoize(() => flags & 2 /* NoNodeConverters */ ? nullNodeConverters : createNodeConverters(factory2));
  const getBinaryCreateFunction = memoizeOne((operator) => (left, right) => createBinaryExpression(left, operator, right));
  const getPrefixUnaryCreateFunction = memoizeOne((operator) => (operand) => createPrefixUnaryExpression(operator, operand));
  const getPostfixUnaryCreateFunction = memoizeOne((operator) => (operand) => createPostfixUnaryExpression(operand, operator));
  const getJSDocPrimaryTypeCreateFunction = memoizeOne((kind) => () => createJSDocPrimaryTypeWorker(kind));
  const getJSDocUnaryTypeCreateFunction = memoizeOne((kind) => (type) => createJSDocUnaryTypeWorker(kind, type));
  const getJSDocUnaryTypeUpdateFunction = memoizeOne((kind) => (node, type) => updateJSDocUnaryTypeWorker(kind, node, type));
  const getJSDocPrePostfixUnaryTypeCreateFunction = memoizeOne((kind) => (type, postfix) => createJSDocPrePostfixUnaryTypeWorker(kind, type, postfix));
  const getJSDocPrePostfixUnaryTypeUpdateFunction = memoizeOne((kind) => (node, type) => updateJSDocPrePostfixUnaryTypeWorker(kind, node, type));
  const getJSDocSimpleTagCreateFunction = memoizeOne((kind) => (tagName, comment) => createJSDocSimpleTagWorker(kind, tagName, comment));
  const getJSDocSimpleTagUpdateFunction = memoizeOne((kind) => (node, tagName, comment) => updateJSDocSimpleTagWorker(kind, node, tagName, comment));
  const getJSDocTypeLikeTagCreateFunction = memoizeOne((kind) => (tagName, typeExpression, comment) => createJSDocTypeLikeTagWorker(kind, tagName, typeExpression, comment));
  const getJSDocTypeLikeTagUpdateFunction = memoizeOne((kind) => (node, tagName, typeExpression, comment) => updateJSDocTypeLikeTagWorker(kind, node, tagName, typeExpression, comment));
  const factory2 = {
    get parenthesizer() {
      return parenthesizerRules();
    },
    get converters() {
      return converters();
    },
    baseFactory: baseFactory2,
    flags,
    createNodeArray,
    createNumericLiteral,
    createBigIntLiteral,
    createStringLiteral,
    createStringLiteralFromNode,
    createRegularExpressionLiteral,
    createLiteralLikeNode,
    createIdentifier,
    createTempVariable,
    createLoopVariable,
    createUniqueName,
    getGeneratedNameForNode,
    createPrivateIdentifier,
    createUniquePrivateName,
    getGeneratedPrivateNameForNode,
    createToken,
    createSuper,
    createThis,
    createNull,
    createTrue,
    createFalse,
    createModifier,
    createModifiersFromModifierFlags,
    createQualifiedName,
    updateQualifiedName,
    createComputedPropertyName,
    updateComputedPropertyName,
    createTypeParameterDeclaration,
    updateTypeParameterDeclaration,
    createParameterDeclaration,
    updateParameterDeclaration,
    createDecorator,
    updateDecorator,
    createPropertySignature,
    updatePropertySignature,
    createPropertyDeclaration,
    updatePropertyDeclaration: updatePropertyDeclaration2,
    createMethodSignature,
    updateMethodSignature,
    createMethodDeclaration,
    updateMethodDeclaration,
    createConstructorDeclaration,
    updateConstructorDeclaration,
    createGetAccessorDeclaration,
    updateGetAccessorDeclaration,
    createSetAccessorDeclaration,
    updateSetAccessorDeclaration,
    createCallSignature,
    updateCallSignature,
    createConstructSignature,
    updateConstructSignature,
    createIndexSignature,
    updateIndexSignature,
    createClassStaticBlockDeclaration,
    updateClassStaticBlockDeclaration,
    createTemplateLiteralTypeSpan,
    updateTemplateLiteralTypeSpan,
    createKeywordTypeNode,
    createTypePredicateNode,
    updateTypePredicateNode,
    createTypeReferenceNode,
    updateTypeReferenceNode,
    createFunctionTypeNode,
    updateFunctionTypeNode,
    createConstructorTypeNode,
    updateConstructorTypeNode,
    createTypeQueryNode,
    updateTypeQueryNode,
    createTypeLiteralNode,
    updateTypeLiteralNode,
    createArrayTypeNode,
    updateArrayTypeNode,
    createTupleTypeNode,
    updateTupleTypeNode,
    createNamedTupleMember,
    updateNamedTupleMember,
    createOptionalTypeNode,
    updateOptionalTypeNode,
    createRestTypeNode,
    updateRestTypeNode,
    createUnionTypeNode,
    updateUnionTypeNode,
    createIntersectionTypeNode,
    updateIntersectionTypeNode,
    createConditionalTypeNode,
    updateConditionalTypeNode,
    createInferTypeNode,
    updateInferTypeNode,
    createImportTypeNode,
    updateImportTypeNode,
    createParenthesizedType,
    updateParenthesizedType,
    createThisTypeNode,
    createTypeOperatorNode,
    updateTypeOperatorNode,
    createIndexedAccessTypeNode,
    updateIndexedAccessTypeNode,
    createMappedTypeNode,
    updateMappedTypeNode,
    createLiteralTypeNode,
    updateLiteralTypeNode,
    createTemplateLiteralType,
    updateTemplateLiteralType,
    createObjectBindingPattern,
    updateObjectBindingPattern,
    createArrayBindingPattern,
    updateArrayBindingPattern,
    createBindingElement,
    updateBindingElement,
    createArrayLiteralExpression,
    updateArrayLiteralExpression,
    createObjectLiteralExpression,
    updateObjectLiteralExpression,
    createPropertyAccessExpression: flags & 4 /* NoIndentationOnFreshPropertyAccess */ ? (expression, name) => setEmitFlags(createPropertyAccessExpression(expression, name), 262144 /* NoIndentation */) : createPropertyAccessExpression,
    updatePropertyAccessExpression,
    createPropertyAccessChain: flags & 4 /* NoIndentationOnFreshPropertyAccess */ ? (expression, questionDotToken, name) => setEmitFlags(createPropertyAccessChain(expression, questionDotToken, name), 262144 /* NoIndentation */) : createPropertyAccessChain,
    updatePropertyAccessChain,
    createElementAccessExpression,
    updateElementAccessExpression,
    createElementAccessChain,
    updateElementAccessChain,
    createCallExpression,
    updateCallExpression,
    createCallChain,
    updateCallChain,
    createNewExpression,
    updateNewExpression,
    createTaggedTemplateExpression,
    updateTaggedTemplateExpression,
    createTypeAssertion,
    updateTypeAssertion,
    createParenthesizedExpression,
    updateParenthesizedExpression,
    createFunctionExpression,
    updateFunctionExpression,
    createArrowFunction,
    updateArrowFunction,
    createDeleteExpression,
    updateDeleteExpression,
    createTypeOfExpression,
    updateTypeOfExpression,
    createVoidExpression,
    updateVoidExpression,
    createAwaitExpression,
    updateAwaitExpression,
    createPrefixUnaryExpression,
    updatePrefixUnaryExpression,
    createPostfixUnaryExpression,
    updatePostfixUnaryExpression,
    createBinaryExpression,
    updateBinaryExpression,
    createConditionalExpression,
    updateConditionalExpression,
    createTemplateExpression,
    updateTemplateExpression,
    createTemplateHead,
    createTemplateMiddle,
    createTemplateTail,
    createNoSubstitutionTemplateLiteral,
    createTemplateLiteralLikeNode,
    createYieldExpression,
    updateYieldExpression,
    createSpreadElement,
    updateSpreadElement,
    createClassExpression,
    updateClassExpression,
    createOmittedExpression,
    createExpressionWithTypeArguments,
    updateExpressionWithTypeArguments,
    createAsExpression,
    updateAsExpression,
    createNonNullExpression,
    updateNonNullExpression,
    createSatisfiesExpression,
    updateSatisfiesExpression,
    createNonNullChain,
    updateNonNullChain,
    createMetaProperty,
    updateMetaProperty,
    createTemplateSpan,
    updateTemplateSpan,
    createSemicolonClassElement,
    createBlock,
    updateBlock,
    createVariableStatement,
    updateVariableStatement,
    createEmptyStatement,
    createExpressionStatement,
    updateExpressionStatement,
    createIfStatement,
    updateIfStatement,
    createDoStatement,
    updateDoStatement,
    createWhileStatement,
    updateWhileStatement,
    createForStatement,
    updateForStatement,
    createForInStatement,
    updateForInStatement,
    createForOfStatement,
    updateForOfStatement,
    createContinueStatement,
    updateContinueStatement,
    createBreakStatement,
    updateBreakStatement,
    createReturnStatement,
    updateReturnStatement,
    createWithStatement,
    updateWithStatement,
    createSwitchStatement,
    updateSwitchStatement,
    createLabeledStatement,
    updateLabeledStatement,
    createThrowStatement,
    updateThrowStatement,
    createTryStatement,
    updateTryStatement,
    createDebuggerStatement,
    createVariableDeclaration,
    updateVariableDeclaration,
    createVariableDeclarationList,
    updateVariableDeclarationList,
    createFunctionDeclaration,
    updateFunctionDeclaration,
    createClassDeclaration,
    updateClassDeclaration,
    createInterfaceDeclaration,
    updateInterfaceDeclaration,
    createTypeAliasDeclaration,
    updateTypeAliasDeclaration,
    createEnumDeclaration,
    updateEnumDeclaration,
    createModuleDeclaration,
    updateModuleDeclaration,
    createModuleBlock,
    updateModuleBlock,
    createCaseBlock,
    updateCaseBlock,
    createNamespaceExportDeclaration,
    updateNamespaceExportDeclaration,
    createImportEqualsDeclaration,
    updateImportEqualsDeclaration,
    createImportDeclaration,
    updateImportDeclaration,
    createImportClause: createImportClause2,
    updateImportClause,
    createAssertClause,
    updateAssertClause,
    createAssertEntry,
    updateAssertEntry,
    createImportTypeAssertionContainer,
    updateImportTypeAssertionContainer,
    createImportAttributes,
    updateImportAttributes,
    createImportAttribute,
    updateImportAttribute,
    createNamespaceImport,
    updateNamespaceImport,
    createNamespaceExport,
    updateNamespaceExport,
    createNamedImports,
    updateNamedImports,
    createImportSpecifier,
    updateImportSpecifier,
    createExportAssignment: createExportAssignment2,
    updateExportAssignment,
    createExportDeclaration,
    updateExportDeclaration,
    createNamedExports,
    updateNamedExports,
    createExportSpecifier,
    updateExportSpecifier,
    createMissingDeclaration,
    createExternalModuleReference,
    updateExternalModuleReference,
    // lazily load factory members for JSDoc types with similar structure
    get createJSDocAllType() {
      return getJSDocPrimaryTypeCreateFunction(313 /* JSDocAllType */);
    },
    get createJSDocUnknownType() {
      return getJSDocPrimaryTypeCreateFunction(314 /* JSDocUnknownType */);
    },
    get createJSDocNonNullableType() {
      return getJSDocPrePostfixUnaryTypeCreateFunction(316 /* JSDocNonNullableType */);
    },
    get updateJSDocNonNullableType() {
      return getJSDocPrePostfixUnaryTypeUpdateFunction(316 /* JSDocNonNullableType */);
    },
    get createJSDocNullableType() {
      return getJSDocPrePostfixUnaryTypeCreateFunction(315 /* JSDocNullableType */);
    },
    get updateJSDocNullableType() {
      return getJSDocPrePostfixUnaryTypeUpdateFunction(315 /* JSDocNullableType */);
    },
    get createJSDocOptionalType() {
      return getJSDocUnaryTypeCreateFunction(317 /* JSDocOptionalType */);
    },
    get updateJSDocOptionalType() {
      return getJSDocUnaryTypeUpdateFunction(317 /* JSDocOptionalType */);
    },
    get createJSDocVariadicType() {
      return getJSDocUnaryTypeCreateFunction(319 /* JSDocVariadicType */);
    },
    get updateJSDocVariadicType() {
      return getJSDocUnaryTypeUpdateFunction(319 /* JSDocVariadicType */);
    },
    get createJSDocNamepathType() {
      return getJSDocUnaryTypeCreateFunction(320 /* JSDocNamepathType */);
    },
    get updateJSDocNamepathType() {
      return getJSDocUnaryTypeUpdateFunction(320 /* JSDocNamepathType */);
    },
    createJSDocFunctionType,
    updateJSDocFunctionType,
    createJSDocTypeLiteral,
    updateJSDocTypeLiteral,
    createJSDocTypeExpression,
    updateJSDocTypeExpression,
    createJSDocSignature,
    updateJSDocSignature,
    createJSDocTemplateTag,
    updateJSDocTemplateTag,
    createJSDocTypedefTag,
    updateJSDocTypedefTag,
    createJSDocParameterTag,
    updateJSDocParameterTag,
    createJSDocPropertyTag,
    updateJSDocPropertyTag,
    createJSDocCallbackTag,
    updateJSDocCallbackTag,
    createJSDocOverloadTag,
    updateJSDocOverloadTag,
    createJSDocAugmentsTag,
    updateJSDocAugmentsTag,
    createJSDocImplementsTag,
    updateJSDocImplementsTag,
    createJSDocSeeTag,
    updateJSDocSeeTag,
    createJSDocImportTag,
    updateJSDocImportTag,
    createJSDocNameReference,
    updateJSDocNameReference,
    createJSDocMemberName,
    updateJSDocMemberName,
    createJSDocLink,
    updateJSDocLink,
    createJSDocLinkCode,
    updateJSDocLinkCode,
    createJSDocLinkPlain,
    updateJSDocLinkPlain,
    // lazily load factory members for JSDoc tags with similar structure
    get createJSDocTypeTag() {
      return getJSDocTypeLikeTagCreateFunction(345 /* JSDocTypeTag */);
    },
    get updateJSDocTypeTag() {
      return getJSDocTypeLikeTagUpdateFunction(345 /* JSDocTypeTag */);
    },
    get createJSDocReturnTag() {
      return getJSDocTypeLikeTagCreateFunction(343 /* JSDocReturnTag */);
    },
    get updateJSDocReturnTag() {
      return getJSDocTypeLikeTagUpdateFunction(343 /* JSDocReturnTag */);
    },
    get createJSDocThisTag() {
      return getJSDocTypeLikeTagCreateFunction(344 /* JSDocThisTag */);
    },
    get updateJSDocThisTag() {
      return getJSDocTypeLikeTagUpdateFunction(344 /* JSDocThisTag */);
    },
    get createJSDocAuthorTag() {
      return getJSDocSimpleTagCreateFunction(331 /* JSDocAuthorTag */);
    },
    get updateJSDocAuthorTag() {
      return getJSDocSimpleTagUpdateFunction(331 /* JSDocAuthorTag */);
    },
    get createJSDocClassTag() {
      return getJSDocSimpleTagCreateFunction(333 /* JSDocClassTag */);
    },
    get updateJSDocClassTag() {
      return getJSDocSimpleTagUpdateFunction(333 /* JSDocClassTag */);
    },
    get createJSDocPublicTag() {
      return getJSDocSimpleTagCreateFunction(334 /* JSDocPublicTag */);
    },
    get updateJSDocPublicTag() {
      return getJSDocSimpleTagUpdateFunction(334 /* JSDocPublicTag */);
    },
    get createJSDocPrivateTag() {
      return getJSDocSimpleTagCreateFunction(335 /* JSDocPrivateTag */);
    },
    get updateJSDocPrivateTag() {
      return getJSDocSimpleTagUpdateFunction(335 /* JSDocPrivateTag */);
    },
    get createJSDocProtectedTag() {
      return getJSDocSimpleTagCreateFunction(336 /* JSDocProtectedTag */);
    },
    get updateJSDocProtectedTag() {
      return getJSDocSimpleTagUpdateFunction(336 /* JSDocProtectedTag */);
    },
    get createJSDocReadonlyTag() {
      return getJSDocSimpleTagCreateFunction(337 /* JSDocReadonlyTag */);
    },
    get updateJSDocReadonlyTag() {
      return getJSDocSimpleTagUpdateFunction(337 /* JSDocReadonlyTag */);
    },
    get createJSDocOverrideTag() {
      return getJSDocSimpleTagCreateFunction(338 /* JSDocOverrideTag */);
    },
    get updateJSDocOverrideTag() {
      return getJSDocSimpleTagUpdateFunction(338 /* JSDocOverrideTag */);
    },
    get createJSDocDeprecatedTag() {
      return getJSDocSimpleTagCreateFunction(332 /* JSDocDeprecatedTag */);
    },
    get updateJSDocDeprecatedTag() {
      return getJSDocSimpleTagUpdateFunction(332 /* JSDocDeprecatedTag */);
    },
    get createJSDocThrowsTag() {
      return getJSDocTypeLikeTagCreateFunction(350 /* JSDocThrowsTag */);
    },
    get updateJSDocThrowsTag() {
      return getJSDocTypeLikeTagUpdateFunction(350 /* JSDocThrowsTag */);
    },
    get createJSDocSatisfiesTag() {
      return getJSDocTypeLikeTagCreateFunction(351 /* JSDocSatisfiesTag */);
    },
    get updateJSDocSatisfiesTag() {
      return getJSDocTypeLikeTagUpdateFunction(351 /* JSDocSatisfiesTag */);
    },
    createJSDocEnumTag,
    updateJSDocEnumTag,
    createJSDocUnknownTag,
    updateJSDocUnknownTag,
    createJSDocText,
    updateJSDocText,
    createJSDocComment,
    updateJSDocComment,
    createJsxElement,
    updateJsxElement,
    createJsxSelfClosingElement,
    updateJsxSelfClosingElement,
    createJsxOpeningElement,
    updateJsxOpeningElement,
    createJsxClosingElement,
    updateJsxClosingElement,
    createJsxFragment,
    createJsxText,
    updateJsxText,
    createJsxOpeningFragment,
    createJsxJsxClosingFragment,
    updateJsxFragment,
    createJsxAttribute,
    updateJsxAttribute,
    createJsxAttributes,
    updateJsxAttributes,
    createJsxSpreadAttribute,
    updateJsxSpreadAttribute,
    createJsxExpression,
    updateJsxExpression,
    createJsxNamespacedName,
    updateJsxNamespacedName,
    createCaseClause,
    updateCaseClause,
    createDefaultClause,
    updateDefaultClause,
    createHeritageClause,
    updateHeritageClause,
    createCatchClause,
    updateCatchClause,
    createPropertyAssignment,
    updatePropertyAssignment,
    createShorthandPropertyAssignment,
    updateShorthandPropertyAssignment,
    createSpreadAssignment,
    updateSpreadAssignment,
    createEnumMember,
    updateEnumMember,
    createSourceFile: createSourceFile2,
    updateSourceFile: updateSourceFile2,
    createRedirectedSourceFile,
    createBundle,
    updateBundle,
    createSyntheticExpression,
    createSyntaxList: createSyntaxList3,
    createNotEmittedStatement,
    createNotEmittedTypeElement,
    createPartiallyEmittedExpression,
    updatePartiallyEmittedExpression,
    createCommaListExpression,
    updateCommaListExpression,
    createSyntheticReferenceExpression,
    updateSyntheticReferenceExpression,
    cloneNode,
    // Lazily load factory methods for common operator factories and utilities
    get createComma() {
      return getBinaryCreateFunction(28 /* CommaToken */);
    },
    get createAssignment() {
      return getBinaryCreateFunction(64 /* EqualsToken */);
    },
    get createLogicalOr() {
      return getBinaryCreateFunction(57 /* BarBarToken */);
    },
    get createLogicalAnd() {
      return getBinaryCreateFunction(56 /* AmpersandAmpersandToken */);
    },
    get createBitwiseOr() {
      return getBinaryCreateFunction(52 /* BarToken */);
    },
    get createBitwiseXor() {
      return getBinaryCreateFunction(53 /* CaretToken */);
    },
    get createBitwiseAnd() {
      return getBinaryCreateFunction(51 /* AmpersandToken */);
    },
    get createStrictEquality() {
      return getBinaryCreateFunction(37 /* EqualsEqualsEqualsToken */);
    },
    get createStrictInequality() {
      return getBinaryCreateFunction(38 /* ExclamationEqualsEqualsToken */);
    },
    get createEquality() {
      return getBinaryCreateFunction(35 /* EqualsEqualsToken */);
    },
    get createInequality() {
      return getBinaryCreateFunction(36 /* ExclamationEqualsToken */);
    },
    get createLessThan() {
      return getBinaryCreateFunction(30 /* LessThanToken */);
    },
    get createLessThanEquals() {
      return getBinaryCreateFunction(33 /* LessThanEqualsToken */);
    },
    get createGreaterThan() {
      return getBinaryCreateFunction(32 /* GreaterThanToken */);
    },
    get createGreaterThanEquals() {
      return getBinaryCreateFunction(34 /* GreaterThanEqualsToken */);
    },
    get createLeftShift() {
      return getBinaryCreateFunction(48 /* LessThanLessThanToken */);
    },
    get createRightShift() {
      return getBinaryCreateFunction(49 /* GreaterThanGreaterThanToken */);
    },
    get createUnsignedRightShift() {
      return getBinaryCreateFunction(50 /* GreaterThanGreaterThanGreaterThanToken */);
    },
    get createAdd() {
      return getBinaryCreateFunction(40 /* PlusToken */);
    },
    get createSubtract() {
      return getBinaryCreateFunction(41 /* MinusToken */);
    },
    get createMultiply() {
      return getBinaryCreateFunction(42 /* AsteriskToken */);
    },
    get createDivide() {
      return getBinaryCreateFunction(44 /* SlashToken */);
    },
    get createModulo() {
      return getBinaryCreateFunction(45 /* PercentToken */);
    },
    get createExponent() {
      return getBinaryCreateFunction(43 /* AsteriskAsteriskToken */);
    },
    get createPrefixPlus() {
      return getPrefixUnaryCreateFunction(40 /* PlusToken */);
    },
    get createPrefixMinus() {
      return getPrefixUnaryCreateFunction(41 /* MinusToken */);
    },
    get createPrefixIncrement() {
      return getPrefixUnaryCreateFunction(46 /* PlusPlusToken */);
    },
    get createPrefixDecrement() {
      return getPrefixUnaryCreateFunction(47 /* MinusMinusToken */);
    },
    get createBitwiseNot() {
      return getPrefixUnaryCreateFunction(55 /* TildeToken */);
    },
    get createLogicalNot() {
      return getPrefixUnaryCreateFunction(54 /* ExclamationToken */);
    },
    get createPostfixIncrement() {
      return getPostfixUnaryCreateFunction(46 /* PlusPlusToken */);
    },
    get createPostfixDecrement() {
      return getPostfixUnaryCreateFunction(47 /* MinusMinusToken */);
    },
    // Compound nodes
    createImmediatelyInvokedFunctionExpression,
    createImmediatelyInvokedArrowFunction,
    createVoidZero,
    createExportDefault,
    createExternalModuleExport,
    createTypeCheck,
    createIsNotTypeCheck,
    createMethodCall,
    createGlobalMethodCall,
    createFunctionBindCall,
    createFunctionCallCall,
    createFunctionApplyCall,
    createArraySliceCall,
    createArrayConcatCall,
    createObjectDefinePropertyCall,
    createObjectGetOwnPropertyDescriptorCall,
    createReflectGetCall,
    createReflectSetCall,
    createPropertyDescriptor,
    createCallBinding,
    createAssignmentTargetWrapper,
    // Utilities
    inlineExpressions,
    getInternalName,
    getLocalName,
    getExportName,
    getDeclarationName,
    getNamespaceMemberName,
    getExternalModuleOrNamespaceExportName,
    restoreOuterExpressions,
    restoreEnclosingLabel,
    createUseStrictPrologue,
    copyPrologue,
    copyStandardPrologue,
    copyCustomPrologue,
    ensureUseStrict,
    liftToBlock,
    mergeLexicalEnvironment,
    replaceModifiers,
    replaceDecoratorsAndModifiers,
    replacePropertyName
  };
  forEach(nodeFactoryPatchers, (fn) => fn(factory2));
  return factory2;
  function createNodeArray(elements, hasTrailingComma) {
    if (elements === void 0 || elements === emptyArray) {
      elements = [];
    } else if (isNodeArray(elements)) {
      if (hasTrailingComma === void 0 || elements.hasTrailingComma === hasTrailingComma) {
        if (elements.transformFlags === void 0) {
          aggregateChildrenFlags(elements);
        }
        Debug.attachNodeArrayDebugInfo(elements);
        return elements;
      }
      const array2 = elements.slice();
      array2.pos = elements.pos;
      array2.end = elements.end;
      array2.hasTrailingComma = hasTrailingComma;
      array2.transformFlags = elements.transformFlags;
      Debug.attachNodeArrayDebugInfo(array2);
      return array2;
    }
    const length2 = elements.length;
    const array = length2 >= 1 && length2 <= 4 ? elements.slice() : elements;
    array.pos = -1;
    array.end = -1;
    array.hasTrailingComma = !!hasTrailingComma;
    array.transformFlags = 0 /* None */;
    aggregateChildrenFlags(array);
    Debug.attachNodeArrayDebugInfo(array);
    return array;
  }
  function createBaseNode(kind) {
    return baseFactory2.createBaseNode(kind);
  }
  function createBaseDeclaration(kind) {
    const node = createBaseNode(kind);
    node.symbol = void 0;
    node.localSymbol = void 0;
    return node;
  }
  function finishUpdateBaseSignatureDeclaration(updated, original) {
    if (updated !== original) {
      updated.typeArguments = original.typeArguments;
    }
    return update(updated, original);
  }
  function createNumericLiteral(value, numericLiteralFlags = 0 /* None */) {
    const text = typeof value === "number" ? value + "" : value;
    Debug.assert(text.charCodeAt(0) !== 45 /* minus */, "Negative numbers should be created in combination with createPrefixUnaryExpression");
    const node = createBaseDeclaration(9 /* NumericLiteral */);
    node.text = text;
    node.numericLiteralFlags = numericLiteralFlags;
    if (numericLiteralFlags & 384 /* BinaryOrOctalSpecifier */) node.transformFlags |= 1024 /* ContainsES2015 */;
    return node;
  }
  function createBigIntLiteral(value) {
    const node = createBaseToken(10 /* BigIntLiteral */);
    node.text = typeof value === "string" ? value : pseudoBigIntToString(value) + "n";
    node.transformFlags |= 32 /* ContainsES2020 */;
    return node;
  }
  function createBaseStringLiteral(text, isSingleQuote) {
    const node = createBaseDeclaration(11 /* StringLiteral */);
    node.text = text;
    node.singleQuote = isSingleQuote;
    return node;
  }
  function createStringLiteral(text, isSingleQuote, hasExtendedUnicodeEscape) {
    const node = createBaseStringLiteral(text, isSingleQuote);
    node.hasExtendedUnicodeEscape = hasExtendedUnicodeEscape;
    if (hasExtendedUnicodeEscape) node.transformFlags |= 1024 /* ContainsES2015 */;
    return node;
  }
  function createStringLiteralFromNode(sourceNode) {
    const node = createBaseStringLiteral(
      getTextOfIdentifierOrLiteral(sourceNode),
      /*isSingleQuote*/
      void 0
    );
    node.textSourceNode = sourceNode;
    return node;
  }
  function createRegularExpressionLiteral(text) {
    const node = createBaseToken(14 /* RegularExpressionLiteral */);
    node.text = text;
    return node;
  }
  function createLiteralLikeNode(kind, text) {
    switch (kind) {
      case 9 /* NumericLiteral */:
        return createNumericLiteral(
          text,
          /*numericLiteralFlags*/
          0
        );
      case 10 /* BigIntLiteral */:
        return createBigIntLiteral(text);
      case 11 /* StringLiteral */:
        return createStringLiteral(
          text,
          /*isSingleQuote*/
          void 0
        );
      case 12 /* JsxText */:
        return createJsxText(
          text,
          /*containsOnlyTriviaWhiteSpaces*/
          false
        );
      case 13 /* JsxTextAllWhiteSpaces */:
        return createJsxText(
          text,
          /*containsOnlyTriviaWhiteSpaces*/
          true
        );
      case 14 /* RegularExpressionLiteral */:
        return createRegularExpressionLiteral(text);
      case 15 /* NoSubstitutionTemplateLiteral */:
        return createTemplateLiteralLikeNode(
          kind,
          text,
          /*rawText*/
          void 0,
          /*templateFlags*/
          0
        );
    }
  }
  function createBaseIdentifier(escapedText) {
    const node = baseFactory2.createBaseIdentifierNode(80 /* Identifier */);
    node.escapedText = escapedText;
    node.jsDoc = void 0;
    node.flowNode = void 0;
    node.symbol = void 0;
    return node;
  }
  function createBaseGeneratedIdentifier(text, autoGenerateFlags, prefix, suffix) {
    const node = createBaseIdentifier(escapeLeadingUnderscores(text));
    setIdentifierAutoGenerate(node, {
      flags: autoGenerateFlags,
      id: nextAutoGenerateId,
      prefix,
      suffix
    });
    nextAutoGenerateId++;
    return node;
  }
  function createIdentifier(text, originalKeywordKind, hasExtendedUnicodeEscape) {
    if (originalKeywordKind === void 0 && text) {
      originalKeywordKind = stringToToken(text);
    }
    if (originalKeywordKind === 80 /* Identifier */) {
      originalKeywordKind = void 0;
    }
    const node = createBaseIdentifier(escapeLeadingUnderscores(text));
    if (hasExtendedUnicodeEscape) node.flags |= 256 /* IdentifierHasExtendedUnicodeEscape */;
    if (node.escapedText === "await") {
      node.transformFlags |= 67108864 /* ContainsPossibleTopLevelAwait */;
    }
    if (node.flags & 256 /* IdentifierHasExtendedUnicodeEscape */) {
      node.transformFlags |= 1024 /* ContainsES2015 */;
    }
    return node;
  }
  function createTempVariable(recordTempVariable, reservedInNestedScopes, prefix, suffix) {
    let flags2 = 1 /* Auto */;
    if (reservedInNestedScopes) flags2 |= 8 /* ReservedInNestedScopes */;
    const name = createBaseGeneratedIdentifier("", flags2, prefix, suffix);
    if (recordTempVariable) {
      recordTempVariable(name);
    }
    return name;
  }
  function createLoopVariable(reservedInNestedScopes) {
    let flags2 = 2 /* Loop */;
    if (reservedInNestedScopes) flags2 |= 8 /* ReservedInNestedScopes */;
    return createBaseGeneratedIdentifier(
      "",
      flags2,
      /*prefix*/
      void 0,
      /*suffix*/
      void 0
    );
  }
  function createUniqueName(text, flags2 = 0 /* None */, prefix, suffix) {
    Debug.assert(!(flags2 & 7 /* KindMask */), "Argument out of range: flags");
    Debug.assert((flags2 & (16 /* Optimistic */ | 32 /* FileLevel */)) !== 32 /* FileLevel */, "GeneratedIdentifierFlags.FileLevel cannot be set without also setting GeneratedIdentifierFlags.Optimistic");
    return createBaseGeneratedIdentifier(text, 3 /* Unique */ | flags2, prefix, suffix);
  }
  function getGeneratedNameForNode(node, flags2 = 0, prefix, suffix) {
    Debug.assert(!(flags2 & 7 /* KindMask */), "Argument out of range: flags");
    const text = !node ? "" : isMemberName(node) ? formatGeneratedName(
      /*privateName*/
      false,
      prefix,
      node,
      suffix,
      idText
    ) : `generated@${getNodeId(node)}`;
    if (prefix || suffix) flags2 |= 16 /* Optimistic */;
    const name = createBaseGeneratedIdentifier(text, 4 /* Node */ | flags2, prefix, suffix);
    name.original = node;
    return name;
  }
  function createBasePrivateIdentifier(escapedText) {
    const node = baseFactory2.createBasePrivateIdentifierNode(81 /* PrivateIdentifier */);
    node.escapedText = escapedText;
    node.transformFlags |= 16777216 /* ContainsClassFields */;
    return node;
  }
  function createPrivateIdentifier(text) {
    if (!startsWith(text, "#")) Debug.fail("First character of private identifier must be #: " + text);
    return createBasePrivateIdentifier(escapeLeadingUnderscores(text));
  }
  function createBaseGeneratedPrivateIdentifier(text, autoGenerateFlags, prefix, suffix) {
    const node = createBasePrivateIdentifier(escapeLeadingUnderscores(text));
    setIdentifierAutoGenerate(node, {
      flags: autoGenerateFlags,
      id: nextAutoGenerateId,
      prefix,
      suffix
    });
    nextAutoGenerateId++;
    return node;
  }
  function createUniquePrivateName(text, prefix, suffix) {
    if (text && !startsWith(text, "#")) Debug.fail("First character of private identifier must be #: " + text);
    const autoGenerateFlags = 8 /* ReservedInNestedScopes */ | (text ? 3 /* Unique */ : 1 /* Auto */);
    return createBaseGeneratedPrivateIdentifier(text ?? "", autoGenerateFlags, prefix, suffix);
  }
  function getGeneratedPrivateNameForNode(node, prefix, suffix) {
    const text = isMemberName(node) ? formatGeneratedName(
      /*privateName*/
      true,
      prefix,
      node,
      suffix,
      idText
    ) : `#generated@${getNodeId(node)}`;
    const flags2 = prefix || suffix ? 16 /* Optimistic */ : 0 /* None */;
    const name = createBaseGeneratedPrivateIdentifier(text, 4 /* Node */ | flags2, prefix, suffix);
    name.original = node;
    return name;
  }
  function createBaseToken(kind) {
    return baseFactory2.createBaseTokenNode(kind);
  }
  function createToken(token) {
    Debug.assert(token >= 0 /* FirstToken */ && token <= 166 /* LastToken */, "Invalid token");
    Debug.assert(token <= 15 /* FirstTemplateToken */ || token >= 18 /* LastTemplateToken */, "Invalid token. Use 'createTemplateLiteralLikeNode' to create template literals.");
    Debug.assert(token <= 9 /* FirstLiteralToken */ || token >= 15 /* LastLiteralToken */, "Invalid token. Use 'createLiteralLikeNode' to create literals.");
    Debug.assert(token !== 80 /* Identifier */, "Invalid token. Use 'createIdentifier' to create identifiers");
    const node = createBaseToken(token);
    let transformFlags = 0 /* None */;
    switch (token) {
      case 134 /* AsyncKeyword */:
        transformFlags = 256 /* ContainsES2017 */ | 128 /* ContainsES2018 */;
        break;
      case 160 /* UsingKeyword */:
        transformFlags = 4 /* ContainsESNext */;
        break;
      case 125 /* PublicKeyword */:
      case 123 /* PrivateKeyword */:
      case 124 /* ProtectedKeyword */:
      case 148 /* ReadonlyKeyword */:
      case 128 /* AbstractKeyword */:
      case 138 /* DeclareKeyword */:
      case 87 /* ConstKeyword */:
      case 133 /* AnyKeyword */:
      case 150 /* NumberKeyword */:
      case 163 /* BigIntKeyword */:
      case 146 /* NeverKeyword */:
      case 151 /* ObjectKeyword */:
      case 103 /* InKeyword */:
      case 147 /* OutKeyword */:
      case 164 /* OverrideKeyword */:
      case 154 /* StringKeyword */:
      case 136 /* BooleanKeyword */:
      case 155 /* SymbolKeyword */:
      case 116 /* VoidKeyword */:
      case 159 /* UnknownKeyword */:
      case 157 /* UndefinedKeyword */:
        transformFlags = 1 /* ContainsTypeScript */;
        break;
      case 108 /* SuperKeyword */:
        transformFlags = 1024 /* ContainsES2015 */ | 134217728 /* ContainsLexicalSuper */;
        node.flowNode = void 0;
        break;
      case 126 /* StaticKeyword */:
        transformFlags = 1024 /* ContainsES2015 */;
        break;
      case 129 /* AccessorKeyword */:
        transformFlags = 16777216 /* ContainsClassFields */;
        break;
      case 110 /* ThisKeyword */:
        transformFlags = 16384 /* ContainsLexicalThis */;
        node.flowNode = void 0;
        break;
    }
    if (transformFlags) {
      node.transformFlags |= transformFlags;
    }
    return node;
  }
  function createSuper() {
    return createToken(108 /* SuperKeyword */);
  }
  function createThis() {
    return createToken(110 /* ThisKeyword */);
  }
  function createNull() {
    return createToken(106 /* NullKeyword */);
  }
  function createTrue() {
    return createToken(112 /* TrueKeyword */);
  }
  function createFalse() {
    return createToken(97 /* FalseKeyword */);
  }
  function createModifier(kind) {
    return createToken(kind);
  }
  function createModifiersFromModifierFlags(flags2) {
    const result = [];
    if (flags2 & 32 /* Export */) result.push(createModifier(95 /* ExportKeyword */));
    if (flags2 & 128 /* Ambient */) result.push(createModifier(138 /* DeclareKeyword */));
    if (flags2 & 2048 /* Default */) result.push(createModifier(90 /* DefaultKeyword */));
    if (flags2 & 4096 /* Const */) result.push(createModifier(87 /* ConstKeyword */));
    if (flags2 & 1 /* Public */) result.push(createModifier(125 /* PublicKeyword */));
    if (flags2 & 2 /* Private */) result.push(createModifier(123 /* PrivateKeyword */));
    if (flags2 & 4 /* Protected */) result.push(createModifier(124 /* ProtectedKeyword */));
    if (flags2 & 64 /* Abstract */) result.push(createModifier(128 /* AbstractKeyword */));
    if (flags2 & 256 /* Static */) result.push(createModifier(126 /* StaticKeyword */));
    if (flags2 & 16 /* Override */) result.push(createModifier(164 /* OverrideKeyword */));
    if (flags2 & 8 /* Readonly */) result.push(createModifier(148 /* ReadonlyKeyword */));
    if (flags2 & 512 /* Accessor */) result.push(createModifier(129 /* AccessorKeyword */));
    if (flags2 & 1024 /* Async */) result.push(createModifier(134 /* AsyncKeyword */));
    if (flags2 & 8192 /* In */) result.push(createModifier(103 /* InKeyword */));
    if (flags2 & 16384 /* Out */) result.push(createModifier(147 /* OutKeyword */));
    return result.length ? result : void 0;
  }
  function createQualifiedName(left, right) {
    const node = createBaseNode(167 /* QualifiedName */);
    node.left = left;
    node.right = asName(right);
    node.transformFlags |= propagateChildFlags(node.left) | propagateIdentifierNameFlags(node.right);
    node.flowNode = void 0;
    return node;
  }
  function updateQualifiedName(node, left, right) {
    return node.left !== left || node.right !== right ? update(createQualifiedName(left, right), node) : node;
  }
  function createComputedPropertyName(expression) {
    const node = createBaseNode(168 /* ComputedPropertyName */);
    node.expression = parenthesizerRules().parenthesizeExpressionOfComputedPropertyName(expression);
    node.transformFlags |= propagateChildFlags(node.expression) | 1024 /* ContainsES2015 */ | 131072 /* ContainsComputedPropertyName */;
    return node;
  }
  function updateComputedPropertyName(node, expression) {
    return node.expression !== expression ? update(createComputedPropertyName(expression), node) : node;
  }
  function createTypeParameterDeclaration(modifiers, name, constraint, defaultType) {
    const node = createBaseDeclaration(169 /* TypeParameter */);
    node.modifiers = asNodeArray(modifiers);
    node.name = asName(name);
    node.constraint = constraint;
    node.default = defaultType;
    node.transformFlags = 1 /* ContainsTypeScript */;
    node.expression = void 0;
    node.jsDoc = void 0;
    return node;
  }
  function updateTypeParameterDeclaration(node, modifiers, name, constraint, defaultType) {
    return node.modifiers !== modifiers || node.name !== name || node.constraint !== constraint || node.default !== defaultType ? update(createTypeParameterDeclaration(modifiers, name, constraint, defaultType), node) : node;
  }
  function createParameterDeclaration(modifiers, dotDotDotToken, name, questionToken, type, initializer) {
    const node = createBaseDeclaration(170 /* Parameter */);
    node.modifiers = asNodeArray(modifiers);
    node.dotDotDotToken = dotDotDotToken;
    node.name = asName(name);
    node.questionToken = questionToken;
    node.type = type;
    node.initializer = asInitializer(initializer);
    if (isThisIdentifier(node.name)) {
      node.transformFlags = 1 /* ContainsTypeScript */;
    } else {
      node.transformFlags = propagateChildrenFlags(node.modifiers) | propagateChildFlags(node.dotDotDotToken) | propagateNameFlags(node.name) | propagateChildFlags(node.questionToken) | propagateChildFlags(node.initializer) | (node.questionToken ?? node.type ? 1 /* ContainsTypeScript */ : 0 /* None */) | (node.dotDotDotToken ?? node.initializer ? 1024 /* ContainsES2015 */ : 0 /* None */) | (modifiersToFlags(node.modifiers) & 31 /* ParameterPropertyModifier */ ? 8192 /* ContainsTypeScriptClassSyntax */ : 0 /* None */);
    }
    node.jsDoc = void 0;
    return node;
  }
  function updateParameterDeclaration(node, modifiers, dotDotDotToken, name, questionToken, type, initializer) {
    return node.modifiers !== modifiers || node.dotDotDotToken !== dotDotDotToken || node.name !== name || node.questionToken !== questionToken || node.type !== type || node.initializer !== initializer ? update(createParameterDeclaration(modifiers, dotDotDotToken, name, questionToken, type, initializer), node) : node;
  }
  function createDecorator(expression) {
    const node = createBaseNode(171 /* Decorator */);
    node.expression = parenthesizerRules().parenthesizeLeftSideOfAccess(
      expression,
      /*optionalChain*/
      false
    );
    node.transformFlags |= propagateChildFlags(node.expression) | 1 /* ContainsTypeScript */ | 8192 /* ContainsTypeScriptClassSyntax */ | 33554432 /* ContainsDecorators */;
    return node;
  }
  function updateDecorator(node, expression) {
    return node.expression !== expression ? update(createDecorator(expression), node) : node;
  }
  function createPropertySignature(modifiers, name, questionToken, type) {
    const node = createBaseDeclaration(172 /* PropertySignature */);
    node.modifiers = asNodeArray(modifiers);
    node.name = asName(name);
    node.type = type;
    node.questionToken = questionToken;
    node.transformFlags = 1 /* ContainsTypeScript */;
    node.initializer = void 0;
    node.jsDoc = void 0;
    return node;
  }
  function updatePropertySignature(node, modifiers, name, questionToken, type) {
    return node.modifiers !== modifiers || node.name !== name || node.questionToken !== questionToken || node.type !== type ? finishUpdatePropertySignature(createPropertySignature(modifiers, name, questionToken, type), node) : node;
  }
  function finishUpdatePropertySignature(updated, original) {
    if (updated !== original) {
      updated.initializer = original.initializer;
    }
    return update(updated, original);
  }
  function createPropertyDeclaration(modifiers, name, questionOrExclamationToken, type, initializer) {
    const node = createBaseDeclaration(173 /* PropertyDeclaration */);
    node.modifiers = asNodeArray(modifiers);
    node.name = asName(name);
    node.questionToken = questionOrExclamationToken && isQuestionToken(questionOrExclamationToken) ? questionOrExclamationToken : void 0;
    node.exclamationToken = questionOrExclamationToken && isExclamationToken(questionOrExclamationToken) ? questionOrExclamationToken : void 0;
    node.type = type;
    node.initializer = asInitializer(initializer);
    const isAmbient = node.flags & 33554432 /* Ambient */ || modifiersToFlags(node.modifiers) & 128 /* Ambient */;
    node.transformFlags = propagateChildrenFlags(node.modifiers) | propagateNameFlags(node.name) | propagateChildFlags(node.initializer) | (isAmbient || node.questionToken || node.exclamationToken || node.type ? 1 /* ContainsTypeScript */ : 0 /* None */) | (isComputedPropertyName(node.name) || modifiersToFlags(node.modifiers) & 256 /* Static */ && node.initializer ? 8192 /* ContainsTypeScriptClassSyntax */ : 0 /* None */) | 16777216 /* ContainsClassFields */;
    node.jsDoc = void 0;
    return node;
  }
  function updatePropertyDeclaration2(node, modifiers, name, questionOrExclamationToken, type, initializer) {
    return node.modifiers !== modifiers || node.name !== name || node.questionToken !== (questionOrExclamationToken !== void 0 && isQuestionToken(questionOrExclamationToken) ? questionOrExclamationToken : void 0) || node.exclamationToken !== (questionOrExclamationToken !== void 0 && isExclamationToken(questionOrExclamationToken) ? questionOrExclamationToken : void 0) || node.type !== type || node.initializer !== initializer ? update(createPropertyDeclaration(modifiers, name, questionOrExclamationToken, type, initializer), node) : node;
  }
  function createMethodSignature(modifiers, name, questionToken, typeParameters, parameters, type) {
    const node = createBaseDeclaration(174 /* MethodSignature */);
    node.modifiers = asNodeArray(modifiers);
    node.name = asName(name);
    node.questionToken = questionToken;
    node.typeParameters = asNodeArray(typeParameters);
    node.parameters = asNodeArray(parameters);
    node.type = type;
    node.transformFlags = 1 /* ContainsTypeScript */;
    node.jsDoc = void 0;
    node.locals = void 0;
    node.nextContainer = void 0;
    node.typeArguments = void 0;
    return node;
  }
  function updateMethodSignature(node, modifiers, name, questionToken, typeParameters, parameters, type) {
    return node.modifiers !== modifiers || node.name !== name || node.questionToken !== questionToken || node.typeParameters !== typeParameters || node.parameters !== parameters || node.type !== type ? finishUpdateBaseSignatureDeclaration(createMethodSignature(modifiers, name, questionToken, typeParameters, parameters, type), node) : node;
  }
  function createMethodDeclaration(modifiers, asteriskToken, name, questionToken, typeParameters, parameters, type, body) {
    const node = createBaseDeclaration(175 /* MethodDeclaration */);
    node.modifiers = asNodeArray(modifiers);
    node.asteriskToken = asteriskToken;
    node.name = asName(name);
    node.questionToken = questionToken;
    node.exclamationToken = void 0;
    node.typeParameters = asNodeArray(typeParameters);
    node.parameters = createNodeArray(parameters);
    node.type = type;
    node.body = body;
    if (!node.body) {
      node.transformFlags = 1 /* ContainsTypeScript */;
    } else {
      const isAsync = modifiersToFlags(node.modifiers) & 1024 /* Async */;
      const isGenerator = !!node.asteriskToken;
      const isAsyncGenerator = isAsync && isGenerator;
      node.transformFlags = propagateChildrenFlags(node.modifiers) | propagateChildFlags(node.asteriskToken) | propagateNameFlags(node.name) | propagateChildFlags(node.questionToken) | propagateChildrenFlags(node.typeParameters) | propagateChildrenFlags(node.parameters) | propagateChildFlags(node.type) | propagateChildFlags(node.body) & ~67108864 /* ContainsPossibleTopLevelAwait */ | (isAsyncGenerator ? 128 /* ContainsES2018 */ : isAsync ? 256 /* ContainsES2017 */ : isGenerator ? 2048 /* ContainsGenerator */ : 0 /* None */) | (node.questionToken || node.typeParameters || node.type ? 1 /* ContainsTypeScript */ : 0 /* None */) | 1024 /* ContainsES2015 */;
    }
    node.typeArguments = void 0;
    node.jsDoc = void 0;
    node.locals = void 0;
    node.nextContainer = void 0;
    node.flowNode = void 0;
    node.endFlowNode = void 0;
    node.returnFlowNode = void 0;
    return node;
  }
  function updateMethodDeclaration(node, modifiers, asteriskToken, name, questionToken, typeParameters, parameters, type, body) {
    return node.modifiers !== modifiers || node.asteriskToken !== asteriskToken || node.name !== name || node.questionToken !== questionToken || node.typeParameters !== typeParameters || node.parameters !== parameters || node.type !== type || node.body !== body ? finishUpdateMethodDeclaration(createMethodDeclaration(modifiers, asteriskToken, name, questionToken, typeParameters, parameters, type, body), node) : node;
  }
  function finishUpdateMethodDeclaration(updated, original) {
    if (updated !== original) {
      updated.exclamationToken = original.exclamationToken;
    }
    return update(updated, original);
  }
  function createClassStaticBlockDeclaration(body) {
    const node = createBaseDeclaration(176 /* ClassStaticBlockDeclaration */);
    node.body = body;
    node.transformFlags = propagateChildFlags(body) | 16777216 /* ContainsClassFields */;
    node.modifiers = void 0;
    node.jsDoc = void 0;
    node.locals = void 0;
    node.nextContainer = void 0;
    node.endFlowNode = void 0;
    node.returnFlowNode = void 0;
    return node;
  }
  function updateClassStaticBlockDeclaration(node, body) {
    return node.body !== body ? finishUpdateClassStaticBlockDeclaration(createClassStaticBlockDeclaration(body), node) : node;
  }
  function finishUpdateClassStaticBlockDeclaration(updated, original) {
    if (updated !== original) {
      updated.modifiers = original.modifiers;
    }
    return update(updated, original);
  }
  function createConstructorDeclaration(modifiers, parameters, body) {
    const node = createBaseDeclaration(177 /* Constructor */);
    node.modifiers = asNodeArray(modifiers);
    node.parameters = createNodeArray(parameters);
    node.body = body;
    if (!node.body) {
      node.transformFlags = 1 /* ContainsTypeScript */;
    } else {
      node.transformFlags = propagateChildrenFlags(node.modifiers) | propagateChildrenFlags(node.parameters) | propagateChildFlags(node.body) & ~67108864 /* ContainsPossibleTopLevelAwait */ | 1024 /* ContainsES2015 */;
    }
    node.typeParameters = void 0;
    node.type = void 0;
    node.typeArguments = void 0;
    node.jsDoc = void 0;
    node.locals = void 0;
    node.nextContainer = void 0;
    node.endFlowNode = void 0;
    node.returnFlowNode = void 0;
    return node;
  }
  function updateConstructorDeclaration(node, modifiers, parameters, body) {
    return node.modifiers !== modifiers || node.parameters !== parameters || node.body !== body ? finishUpdateConstructorDeclaration(createConstructorDeclaration(modifiers, parameters, body), node) : node;
  }
  function finishUpdateConstructorDeclaration(updated, original) {
    if (updated !== original) {
      updated.typeParameters = original.typeParameters;
      updated.type = original.type;
    }
    return finishUpdateBaseSignatureDeclaration(updated, original);
  }
  function createGetAccessorDeclaration(modifiers, name, parameters, type, body) {
    const node = createBaseDeclaration(178 /* GetAccessor */);
    node.modifiers = asNodeArray(modifiers);
    node.name = asName(name);
    node.parameters = createNodeArray(parameters);
    node.type = type;
    node.body = body;
    if (!node.body) {
      node.transformFlags = 1 /* ContainsTypeScript */;
    } else {
      node.transformFlags = propagateChildrenFlags(node.modifiers) | propagateNameFlags(node.name) | propagateChildrenFlags(node.parameters) | propagateChildFlags(node.type) | propagateChildFlags(node.body) & ~67108864 /* ContainsPossibleTopLevelAwait */ | (node.type ? 1 /* ContainsTypeScript */ : 0 /* None */);
    }
    node.typeArguments = void 0;
    node.typeParameters = void 0;
    node.jsDoc = void 0;
    node.locals = void 0;
    node.nextContainer = void 0;
    node.flowNode = void 0;
    node.endFlowNode = void 0;
    node.returnFlowNode = void 0;
    return node;
  }
  function updateGetAccessorDeclaration(node, modifiers, name, parameters, type, body) {
    return node.modifiers !== modifiers || node.name !== name || node.parameters !== parameters || node.type !== type || node.body !== body ? finishUpdateGetAccessorDeclaration(createGetAccessorDeclaration(modifiers, name, parameters, type, body), node) : node;
  }
  function finishUpdateGetAccessorDeclaration(updated, original) {
    if (updated !== original) {
      updated.typeParameters = original.typeParameters;
    }
    return finishUpdateBaseSignatureDeclaration(updated, original);
  }
  function createSetAccessorDeclaration(modifiers, name, parameters, body) {
    const node = createBaseDeclaration(179 /* SetAccessor */);
    node.modifiers = asNodeArray(modifiers);
    node.name = asName(name);
    node.parameters = createNodeArray(parameters);
    node.body = body;
    if (!node.body) {
      node.transformFlags = 1 /* ContainsTypeScript */;
    } else {
      node.transformFlags = propagateChildrenFlags(node.modifiers) | propagateNameFlags(node.name) | propagateChildrenFlags(node.parameters) | propagateChildFlags(node.body) & ~67108864 /* ContainsPossibleTopLevelAwait */ | (node.type ? 1 /* ContainsTypeScript */ : 0 /* None */);
    }
    node.typeArguments = void 0;
    node.typeParameters = void 0;
    node.type = void 0;
    node.jsDoc = void 0;
    node.locals = void 0;
    node.nextContainer = void 0;
    node.flowNode = void 0;
    node.endFlowNode = void 0;
    node.returnFlowNode = void 0;
    return node;
  }
  function updateSetAccessorDeclaration(node, modifiers, name, parameters, body) {
    return node.modifiers !== modifiers || node.name !== name || node.parameters !== parameters || node.body !== body ? finishUpdateSetAccessorDeclaration(createSetAccessorDeclaration(modifiers, name, parameters, body), node) : node;
  }
  function finishUpdateSetAccessorDeclaration(updated, original) {
    if (updated !== original) {
      updated.typeParameters = original.typeParameters;
      updated.type = original.type;
    }
    return finishUpdateBaseSignatureDeclaration(updated, original);
  }
  function createCallSignature(typeParameters, parameters, type) {
    const node = createBaseDeclaration(180 /* CallSignature */);
    node.typeParameters = asNodeArray(typeParameters);
    node.parameters = asNodeArray(parameters);
    node.type = type;
    node.transformFlags = 1 /* ContainsTypeScript */;
    node.jsDoc = void 0;
    node.locals = void 0;
    node.nextContainer = void 0;
    node.typeArguments = void 0;
    return node;
  }
  function updateCallSignature(node, typeParameters, parameters, type) {
    return node.typeParameters !== typeParameters || node.parameters !== parameters || node.type !== type ? finishUpdateBaseSignatureDeclaration(createCallSignature(typeParameters, parameters, type), node) : node;
  }
  function createConstructSignature(typeParameters, parameters, type) {
    const node = createBaseDeclaration(181 /* ConstructSignature */);
    node.typeParameters = asNodeArray(typeParameters);
    node.parameters = asNodeArray(parameters);
    node.type = type;
    node.transformFlags = 1 /* ContainsTypeScript */;
    node.jsDoc = void 0;
    node.locals = void 0;
    node.nextContainer = void 0;
    node.typeArguments = void 0;
    return node;
  }
  function updateConstructSignature(node, typeParameters, parameters, type) {
    return node.typeParameters !== typeParameters || node.parameters !== parameters || node.type !== type ? finishUpdateBaseSignatureDeclaration(createConstructSignature(typeParameters, parameters, type), node) : node;
  }
  function createIndexSignature(modifiers, parameters, type) {
    const node = createBaseDeclaration(182 /* IndexSignature */);
    node.modifiers = asNodeArray(modifiers);
    node.parameters = asNodeArray(parameters);
    node.type = type;
    node.transformFlags = 1 /* ContainsTypeScript */;
    node.jsDoc = void 0;
    node.locals = void 0;
    node.nextContainer = void 0;
    node.typeArguments = void 0;
    return node;
  }
  function updateIndexSignature(node, modifiers, parameters, type) {
    return node.parameters !== parameters || node.type !== type || node.modifiers !== modifiers ? finishUpdateBaseSignatureDeclaration(createIndexSignature(modifiers, parameters, type), node) : node;
  }
  function createTemplateLiteralTypeSpan(type, literal) {
    const node = createBaseNode(205 /* TemplateLiteralTypeSpan */);
    node.type = type;
    node.literal = literal;
    node.transformFlags = 1 /* ContainsTypeScript */;
    return node;
  }
  function updateTemplateLiteralTypeSpan(node, type, literal) {
    return node.type !== type || node.literal !== literal ? update(createTemplateLiteralTypeSpan(type, literal), node) : node;
  }
  function createKeywordTypeNode(kind) {
    return createToken(kind);
  }
  function createTypePredicateNode(assertsModifier, parameterName, type) {
    const node = createBaseNode(183 /* TypePredicate */);
    node.assertsModifier = assertsModifier;
    node.parameterName = asName(parameterName);
    node.type = type;
    node.transformFlags = 1 /* ContainsTypeScript */;
    return node;
  }
  function updateTypePredicateNode(node, assertsModifier, parameterName, type) {
    return node.assertsModifier !== assertsModifier || node.parameterName !== parameterName || node.type !== type ? update(createTypePredicateNode(assertsModifier, parameterName, type), node) : node;
  }
  function createTypeReferenceNode(typeName, typeArguments) {
    const node = createBaseNode(184 /* TypeReference */);
    node.typeName = asName(typeName);
    node.typeArguments = typeArguments && parenthesizerRules().parenthesizeTypeArguments(createNodeArray(typeArguments));
    node.transformFlags = 1 /* ContainsTypeScript */;
    return node;
  }
  function updateTypeReferenceNode(node, typeName, typeArguments) {
    return node.typeName !== typeName || node.typeArguments !== typeArguments ? update(createTypeReferenceNode(typeName, typeArguments), node) : node;
  }
  function createFunctionTypeNode(typeParameters, parameters, type) {
    const node = createBaseDeclaration(185 /* FunctionType */);
    node.typeParameters = asNodeArray(typeParameters);
    node.parameters = asNodeArray(parameters);
    node.type = type;
    node.transformFlags = 1 /* ContainsTypeScript */;
    node.modifiers = void 0;
    node.jsDoc = void 0;
    node.locals = void 0;
    node.nextContainer = void 0;
    node.typeArguments = void 0;
    return node;
  }
  function updateFunctionTypeNode(node, typeParameters, parameters, type) {
    return node.typeParameters !== typeParameters || node.parameters !== parameters || node.type !== type ? finishUpdateFunctionTypeNode(createFunctionTypeNode(typeParameters, parameters, type), node) : node;
  }
  function finishUpdateFunctionTypeNode(updated, original) {
    if (updated !== original) {
      updated.modifiers = original.modifiers;
    }
    return finishUpdateBaseSignatureDeclaration(updated, original);
  }
  function createConstructorTypeNode(...args) {
    return args.length === 4 ? createConstructorTypeNode1(...args) : args.length === 3 ? createConstructorTypeNode2(...args) : Debug.fail("Incorrect number of arguments specified.");
  }
  function createConstructorTypeNode1(modifiers, typeParameters, parameters, type) {
    const node = createBaseDeclaration(186 /* ConstructorType */);
    node.modifiers = asNodeArray(modifiers);
    node.typeParameters = asNodeArray(typeParameters);
    node.parameters = asNodeArray(parameters);
    node.type = type;
    node.transformFlags = 1 /* ContainsTypeScript */;
    node.jsDoc = void 0;
    node.locals = void 0;
    node.nextContainer = void 0;
    node.typeArguments = void 0;
    return node;
  }
  function createConstructorTypeNode2(typeParameters, parameters, type) {
    return createConstructorTypeNode1(
      /*modifiers*/
      void 0,
      typeParameters,
      parameters,
      type
    );
  }
  function updateConstructorTypeNode(...args) {
    return args.length === 5 ? updateConstructorTypeNode1(...args) : args.length === 4 ? updateConstructorTypeNode2(...args) : Debug.fail("Incorrect number of arguments specified.");
  }
  function updateConstructorTypeNode1(node, modifiers, typeParameters, parameters, type) {
    return node.modifiers !== modifiers || node.typeParameters !== typeParameters || node.parameters !== parameters || node.type !== type ? finishUpdateBaseSignatureDeclaration(createConstructorTypeNode(modifiers, typeParameters, parameters, type), node) : node;
  }
  function updateConstructorTypeNode2(node, typeParameters, parameters, type) {
    return updateConstructorTypeNode1(node, node.modifiers, typeParameters, parameters, type);
  }
  function createTypeQueryNode(exprName, typeArguments) {
    const node = createBaseNode(187 /* TypeQuery */);
    node.exprName = exprName;
    node.typeArguments = typeArguments && parenthesizerRules().parenthesizeTypeArguments(typeArguments);
    node.transformFlags = 1 /* ContainsTypeScript */;
    return node;
  }
  function updateTypeQueryNode(node, exprName, typeArguments) {
    return node.exprName !== exprName || node.typeArguments !== typeArguments ? update(createTypeQueryNode(exprName, typeArguments), node) : node;
  }
  function createTypeLiteralNode(members) {
    const node = createBaseDeclaration(188 /* TypeLiteral */);
    node.members = createNodeArray(members);
    node.transformFlags = 1 /* ContainsTypeScript */;
    return node;
  }
  function updateTypeLiteralNode(node, members) {
    return node.members !== members ? update(createTypeLiteralNode(members), node) : node;
  }
  function createArrayTypeNode(elementType) {
    const node = createBaseNode(189 /* ArrayType */);
    node.elementType = parenthesizerRules().parenthesizeNonArrayTypeOfPostfixType(elementType);
    node.transformFlags = 1 /* ContainsTypeScript */;
    return node;
  }
  function updateArrayTypeNode(node, elementType) {
    return node.elementType !== elementType ? update(createArrayTypeNode(elementType), node) : node;
  }
  function createTupleTypeNode(elements) {
    const node = createBaseNode(190 /* TupleType */);
    node.elements = createNodeArray(parenthesizerRules().parenthesizeElementTypesOfTupleType(elements));
    node.transformFlags = 1 /* ContainsTypeScript */;
    return node;
  }
  function updateTupleTypeNode(node, elements) {
    return node.elements !== elements ? update(createTupleTypeNode(elements), node) : node;
  }
  function createNamedTupleMember(dotDotDotToken, name, questionToken, type) {
    const node = createBaseDeclaration(203 /* NamedTupleMember */);
    node.dotDotDotToken = dotDotDotToken;
    node.name = name;
    node.questionToken = questionToken;
    node.type = type;
    node.transformFlags = 1 /* ContainsTypeScript */;
    node.jsDoc = void 0;
    return node;
  }
  function updateNamedTupleMember(node, dotDotDotToken, name, questionToken, type) {
    return node.dotDotDotToken !== dotDotDotToken || node.name !== name || node.questionToken !== questionToken || node.type !== type ? update(createNamedTupleMember(dotDotDotToken, name, questionToken, type), node) : node;
  }
  function createOptionalTypeNode(type) {
    const node = createBaseNode(191 /* OptionalType */);
    node.type = parenthesizerRules().parenthesizeTypeOfOptionalType(type);
    node.transformFlags = 1 /* ContainsTypeScript */;
    return node;
  }
  function updateOptionalTypeNode(node, type) {
    return node.type !== type ? update(createOptionalTypeNode(type), node) : node;
  }
  function createRestTypeNode(type) {
    const node = createBaseNode(192 /* RestType */);
    node.type = type;
    node.transformFlags = 1 /* ContainsTypeScript */;
    return node;
  }
  function updateRestTypeNode(node, type) {
    return node.type !== type ? update(createRestTypeNode(type), node) : node;
  }
  function createUnionOrIntersectionTypeNode(kind, types, parenthesize) {
    const node = createBaseNode(kind);
    node.types = factory2.createNodeArray(parenthesize(types));
    node.transformFlags = 1 /* ContainsTypeScript */;
    return node;
  }
  function updateUnionOrIntersectionTypeNode(node, types, parenthesize) {
    return node.types !== types ? update(createUnionOrIntersectionTypeNode(node.kind, types, parenthesize), node) : node;
  }
  function createUnionTypeNode(types) {
    return createUnionOrIntersectionTypeNode(193 /* UnionType */, types, parenthesizerRules().parenthesizeConstituentTypesOfUnionType);
  }
  function updateUnionTypeNode(node, types) {
    return updateUnionOrIntersectionTypeNode(node, types, parenthesizerRules().parenthesizeConstituentTypesOfUnionType);
  }
  function createIntersectionTypeNode(types) {
    return createUnionOrIntersectionTypeNode(194 /* IntersectionType */, types, parenthesizerRules().parenthesizeConstituentTypesOfIntersectionType);
  }
  function updateIntersectionTypeNode(node, types) {
    return updateUnionOrIntersectionTypeNode(node, types, parenthesizerRules().parenthesizeConstituentTypesOfIntersectionType);
  }
  function createConditionalTypeNode(checkType, extendsType, trueType, falseType) {
    const node = createBaseNode(195 /* ConditionalType */);
    node.checkType = parenthesizerRules().parenthesizeCheckTypeOfConditionalType(checkType);
    node.extendsType = parenthesizerRules().parenthesizeExtendsTypeOfConditionalType(extendsType);
    node.trueType = trueType;
    node.falseType = falseType;
    node.transformFlags = 1 /* ContainsTypeScript */;
    node.locals = void 0;
    node.nextContainer = void 0;
    return node;
  }
  function updateConditionalTypeNode(node, checkType, extendsType, trueType, falseType) {
    return node.checkType !== checkType || node.extendsType !== extendsType || node.trueType !== trueType || node.falseType !== falseType ? update(createConditionalTypeNode(checkType, extendsType, trueType, falseType), node) : node;
  }
  function createInferTypeNode(typeParameter) {
    const node = createBaseNode(196 /* InferType */);
    node.typeParameter = typeParameter;
    node.transformFlags = 1 /* ContainsTypeScript */;
    return node;
  }
  function updateInferTypeNode(node, typeParameter) {
    return node.typeParameter !== typeParameter ? update(createInferTypeNode(typeParameter), node) : node;
  }
  function createTemplateLiteralType(head, templateSpans) {
    const node = createBaseNode(204 /* TemplateLiteralType */);
    node.head = head;
    node.templateSpans = createNodeArray(templateSpans);
    node.transformFlags = 1 /* ContainsTypeScript */;
    return node;
  }
  function updateTemplateLiteralType(node, head, templateSpans) {
    return node.head !== head || node.templateSpans !== templateSpans ? update(createTemplateLiteralType(head, templateSpans), node) : node;
  }
  function createImportTypeNode(argument, attributes, qualifier, typeArguments, isTypeOf = false) {
    const node = createBaseNode(206 /* ImportType */);
    node.argument = argument;
    node.attributes = attributes;
    if (node.assertions && node.assertions.assertClause && node.attributes) {
      node.assertions.assertClause = node.attributes;
    }
    node.qualifier = qualifier;
    node.typeArguments = typeArguments && parenthesizerRules().parenthesizeTypeArguments(typeArguments);
    node.isTypeOf = isTypeOf;
    node.transformFlags = 1 /* ContainsTypeScript */;
    return node;
  }
  function updateImportTypeNode(node, argument, attributes, qualifier, typeArguments, isTypeOf = node.isTypeOf) {
    return node.argument !== argument || node.attributes !== attributes || node.qualifier !== qualifier || node.typeArguments !== typeArguments || node.isTypeOf !== isTypeOf ? update(createImportTypeNode(argument, attributes, qualifier, typeArguments, isTypeOf), node) : node;
  }
  function createParenthesizedType(type) {
    const node = createBaseNode(197 /* ParenthesizedType */);
    node.type = type;
    node.transformFlags = 1 /* ContainsTypeScript */;
    return node;
  }
  function updateParenthesizedType(node, type) {
    return node.type !== type ? update(createParenthesizedType(type), node) : node;
  }
  function createThisTypeNode() {
    const node = createBaseNode(198 /* ThisType */);
    node.transformFlags = 1 /* ContainsTypeScript */;
    return node;
  }
  function createTypeOperatorNode(operator, type) {
    const node = createBaseNode(199 /* TypeOperator */);
    node.operator = operator;
    node.type = operator === 148 /* ReadonlyKeyword */ ? parenthesizerRules().parenthesizeOperandOfReadonlyTypeOperator(type) : parenthesizerRules().parenthesizeOperandOfTypeOperator(type);
    node.transformFlags = 1 /* ContainsTypeScript */;
    return node;
  }
  function updateTypeOperatorNode(node, type) {
    return node.type !== type ? update(createTypeOperatorNode(node.operator, type), node) : node;
  }
  function createIndexedAccessTypeNode(objectType, indexType) {
    const node = createBaseNode(200 /* IndexedAccessType */);
    node.objectType = parenthesizerRules().parenthesizeNonArrayTypeOfPostfixType(objectType);
    node.indexType = indexType;
    node.transformFlags = 1 /* ContainsTypeScript */;
    return node;
  }
  function updateIndexedAccessTypeNode(node, objectType, indexType) {
    return node.objectType !== objectType || node.indexType !== indexType ? update(createIndexedAccessTypeNode(objectType, indexType), node) : node;
  }
  function createMappedTypeNode(readonlyToken, typeParameter, nameType, questionToken, type, members) {
    const node = createBaseDeclaration(201 /* MappedType */);
    node.readonlyToken = readonlyToken;
    node.typeParameter = typeParameter;
    node.nameType = nameType;
    node.questionToken = questionToken;
    node.type = type;
    node.members = members && createNodeArray(members);
    node.transformFlags = 1 /* ContainsTypeScript */;
    node.locals = void 0;
    node.nextContainer = void 0;
    return node;
  }
  function updateMappedTypeNode(node, readonlyToken, typeParameter, nameType, questionToken, type, members) {
    return node.readonlyToken !== readonlyToken || node.typeParameter !== typeParameter || node.nameType !== nameType || node.questionToken !== questionToken || node.type !== type || node.members !== members ? update(createMappedTypeNode(readonlyToken, typeParameter, nameType, questionToken, type, members), node) : node;
  }
  function createLiteralTypeNode(literal) {
    const node = createBaseNode(202 /* LiteralType */);
    node.literal = literal;
    node.transformFlags = 1 /* ContainsTypeScript */;
    return node;
  }
  function updateLiteralTypeNode(node, literal) {
    return node.literal !== literal ? update(createLiteralTypeNode(literal), node) : node;
  }
  function createObjectBindingPattern(elements) {
    const node = createBaseNode(207 /* ObjectBindingPattern */);
    node.elements = createNodeArray(elements);
    node.transformFlags |= propagateChildrenFlags(node.elements) | 1024 /* ContainsES2015 */ | 524288 /* ContainsBindingPattern */;
    if (node.transformFlags & 32768 /* ContainsRestOrSpread */) {
      node.transformFlags |= 128 /* ContainsES2018 */ | 65536 /* ContainsObjectRestOrSpread */;
    }
    return node;
  }
  function updateObjectBindingPattern(node, elements) {
    return node.elements !== elements ? update(createObjectBindingPattern(elements), node) : node;
  }
  function createArrayBindingPattern(elements) {
    const node = createBaseNode(208 /* ArrayBindingPattern */);
    node.elements = createNodeArray(elements);
    node.transformFlags |= propagateChildrenFlags(node.elements) | 1024 /* ContainsES2015 */ | 524288 /* ContainsBindingPattern */;
    return node;
  }
  function updateArrayBindingPattern(node, elements) {
    return node.elements !== elements ? update(createArrayBindingPattern(elements), node) : node;
  }
  function createBindingElement(dotDotDotToken, propertyName, name, initializer) {
    const node = createBaseDeclaration(209 /* BindingElement */);
    node.dotDotDotToken = dotDotDotToken;
    node.propertyName = asName(propertyName);
    node.name = asName(name);
    node.initializer = asInitializer(initializer);
    node.transformFlags |= propagateChildFlags(node.dotDotDotToken) | propagateNameFlags(node.propertyName) | propagateNameFlags(node.name) | propagateChildFlags(node.initializer) | (node.dotDotDotToken ? 32768 /* ContainsRestOrSpread */ : 0 /* None */) | 1024 /* ContainsES2015 */;
    node.flowNode = void 0;
    return node;
  }
  function updateBindingElement(node, dotDotDotToken, propertyName, name, initializer) {
    return node.propertyName !== propertyName || node.dotDotDotToken !== dotDotDotToken || node.name !== name || node.initializer !== initializer ? update(createBindingElement(dotDotDotToken, propertyName, name, initializer), node) : node;
  }
  function createArrayLiteralExpression(elements, multiLine) {
    const node = createBaseNode(210 /* ArrayLiteralExpression */);
    const lastElement = elements && lastOrUndefined(elements);
    const elementsArray = createNodeArray(elements, lastElement && isOmittedExpression(lastElement) ? true : void 0);
    node.elements = parenthesizerRules().parenthesizeExpressionsOfCommaDelimitedList(elementsArray);
    node.multiLine = multiLine;
    node.transformFlags |= propagateChildrenFlags(node.elements);
    return node;
  }
  function updateArrayLiteralExpression(node, elements) {
    return node.elements !== elements ? update(createArrayLiteralExpression(elements, node.multiLine), node) : node;
  }
  function createObjectLiteralExpression(properties, multiLine) {
    const node = createBaseDeclaration(211 /* ObjectLiteralExpression */);
    node.properties = createNodeArray(properties);
    node.multiLine = multiLine;
    node.transformFlags |= propagateChildrenFlags(node.properties);
    node.jsDoc = void 0;
    return node;
  }
  function updateObjectLiteralExpression(node, properties) {
    return node.properties !== properties ? update(createObjectLiteralExpression(properties, node.multiLine), node) : node;
  }
  function createBasePropertyAccessExpression(expression, questionDotToken, name) {
    const node = createBaseDeclaration(212 /* PropertyAccessExpression */);
    node.expression = expression;
    node.questionDotToken = questionDotToken;
    node.name = name;
    node.transformFlags = propagateChildFlags(node.expression) | propagateChildFlags(node.questionDotToken) | (isIdentifier(node.name) ? propagateIdentifierNameFlags(node.name) : propagateChildFlags(node.name) | 536870912 /* ContainsPrivateIdentifierInExpression */);
    node.jsDoc = void 0;
    node.flowNode = void 0;
    return node;
  }
  function createPropertyAccessExpression(expression, name) {
    const node = createBasePropertyAccessExpression(
      parenthesizerRules().parenthesizeLeftSideOfAccess(
        expression,
        /*optionalChain*/
        false
      ),
      /*questionDotToken*/
      void 0,
      asName(name)
    );
    if (isSuperKeyword(expression)) {
      node.transformFlags |= 256 /* ContainsES2017 */ | 128 /* ContainsES2018 */;
    }
    return node;
  }
  function updatePropertyAccessExpression(node, expression, name) {
    if (isPropertyAccessChain(node)) {
      return updatePropertyAccessChain(node, expression, node.questionDotToken, cast(name, isIdentifier));
    }
    return node.expression !== expression || node.name !== name ? update(createPropertyAccessExpression(expression, name), node) : node;
  }
  function createPropertyAccessChain(expression, questionDotToken, name) {
    const node = createBasePropertyAccessExpression(
      parenthesizerRules().parenthesizeLeftSideOfAccess(
        expression,
        /*optionalChain*/
        true
      ),
      questionDotToken,
      asName(name)
    );
    node.flags |= 64 /* OptionalChain */;
    node.transformFlags |= 32 /* ContainsES2020 */;
    return node;
  }
  function updatePropertyAccessChain(node, expression, questionDotToken, name) {
    Debug.assert(!!(node.flags & 64 /* OptionalChain */), "Cannot update a PropertyAccessExpression using updatePropertyAccessChain. Use updatePropertyAccess instead.");
    return node.expression !== expression || node.questionDotToken !== questionDotToken || node.name !== name ? update(createPropertyAccessChain(expression, questionDotToken, name), node) : node;
  }
  function createBaseElementAccessExpression(expression, questionDotToken, argumentExpression) {
    const node = createBaseDeclaration(213 /* ElementAccessExpression */);
    node.expression = expression;
    node.questionDotToken = questionDotToken;
    node.argumentExpression = argumentExpression;
    node.transformFlags |= propagateChildFlags(node.expression) | propagateChildFlags(node.questionDotToken) | propagateChildFlags(node.argumentExpression);
    node.jsDoc = void 0;
    node.flowNode = void 0;
    return node;
  }
  function createElementAccessExpression(expression, index) {
    const node = createBaseElementAccessExpression(
      parenthesizerRules().parenthesizeLeftSideOfAccess(
        expression,
        /*optionalChain*/
        false
      ),
      /*questionDotToken*/
      void 0,
      asExpression(index)
    );
    if (isSuperKeyword(expression)) {
      node.transformFlags |= 256 /* ContainsES2017 */ | 128 /* ContainsES2018 */;
    }
    return node;
  }
  function updateElementAccessExpression(node, expression, argumentExpression) {
    if (isElementAccessChain(node)) {
      return updateElementAccessChain(node, expression, node.questionDotToken, argumentExpression);
    }
    return node.expression !== expression || node.argumentExpression !== argumentExpression ? update(createElementAccessExpression(expression, argumentExpression), node) : node;
  }
  function createElementAccessChain(expression, questionDotToken, index) {
    const node = createBaseElementAccessExpression(
      parenthesizerRules().parenthesizeLeftSideOfAccess(
        expression,
        /*optionalChain*/
        true
      ),
      questionDotToken,
      asExpression(index)
    );
    node.flags |= 64 /* OptionalChain */;
    node.transformFlags |= 32 /* ContainsES2020 */;
    return node;
  }
  function updateElementAccessChain(node, expression, questionDotToken, argumentExpression) {
    Debug.assert(!!(node.flags & 64 /* OptionalChain */), "Cannot update a ElementAccessExpression using updateElementAccessChain. Use updateElementAccess instead.");
    return node.expression !== expression || node.questionDotToken !== questionDotToken || node.argumentExpression !== argumentExpression ? update(createElementAccessChain(expression, questionDotToken, argumentExpression), node) : node;
  }
  function createBaseCallExpression(expression, questionDotToken, typeArguments, argumentsArray) {
    const node = createBaseDeclaration(214 /* CallExpression */);
    node.expression = expression;
    node.questionDotToken = questionDotToken;
    node.typeArguments = typeArguments;
    node.arguments = argumentsArray;
    node.transformFlags |= propagateChildFlags(node.expression) | propagateChildFlags(node.questionDotToken) | propagateChildrenFlags(node.typeArguments) | propagateChildrenFlags(node.arguments);
    if (node.typeArguments) {
      node.transformFlags |= 1 /* ContainsTypeScript */;
    }
    if (isSuperProperty(node.expression)) {
      node.transformFlags |= 16384 /* ContainsLexicalThis */;
    }
    return node;
  }
  function createCallExpression(expression, typeArguments, argumentsArray) {
    const node = createBaseCallExpression(
      parenthesizerRules().parenthesizeLeftSideOfAccess(
        expression,
        /*optionalChain*/
        false
      ),
      /*questionDotToken*/
      void 0,
      asNodeArray(typeArguments),
      parenthesizerRules().parenthesizeExpressionsOfCommaDelimitedList(createNodeArray(argumentsArray))
    );
    if (isImportKeyword(node.expression)) {
      node.transformFlags |= 8388608 /* ContainsDynamicImport */;
    }
    return node;
  }
  function updateCallExpression(node, expression, typeArguments, argumentsArray) {
    if (isCallChain(node)) {
      return updateCallChain(node, expression, node.questionDotToken, typeArguments, argumentsArray);
    }
    return node.expression !== expression || node.typeArguments !== typeArguments || node.arguments !== argumentsArray ? update(createCallExpression(expression, typeArguments, argumentsArray), node) : node;
  }
  function createCallChain(expression, questionDotToken, typeArguments, argumentsArray) {
    const node = createBaseCallExpression(
      parenthesizerRules().parenthesizeLeftSideOfAccess(
        expression,
        /*optionalChain*/
        true
      ),
      questionDotToken,
      asNodeArray(typeArguments),
      parenthesizerRules().parenthesizeExpressionsOfCommaDelimitedList(createNodeArray(argumentsArray))
    );
    node.flags |= 64 /* OptionalChain */;
    node.transformFlags |= 32 /* ContainsES2020 */;
    return node;
  }
  function updateCallChain(node, expression, questionDotToken, typeArguments, argumentsArray) {
    Debug.assert(!!(node.flags & 64 /* OptionalChain */), "Cannot update a CallExpression using updateCallChain. Use updateCall instead.");
    return node.expression !== expression || node.questionDotToken !== questionDotToken || node.typeArguments !== typeArguments || node.arguments !== argumentsArray ? update(createCallChain(expression, questionDotToken, typeArguments, argumentsArray), node) : node;
  }
  function createNewExpression(expression, typeArguments, argumentsArray) {
    const node = createBaseDeclaration(215 /* NewExpression */);
    node.expression = parenthesizerRules().parenthesizeExpressionOfNew(expression);
    node.typeArguments = asNodeArray(typeArguments);
    node.arguments = argumentsArray ? parenthesizerRules().parenthesizeExpressionsOfCommaDelimitedList(argumentsArray) : void 0;
    node.transformFlags |= propagateChildFlags(node.expression) | propagateChildrenFlags(node.typeArguments) | propagateChildrenFlags(node.arguments) | 32 /* ContainsES2020 */;
    if (node.typeArguments) {
      node.transformFlags |= 1 /* ContainsTypeScript */;
    }
    return node;
  }
  function updateNewExpression(node, expression, typeArguments, argumentsArray) {
    return node.expression !== expression || node.typeArguments !== typeArguments || node.arguments !== argumentsArray ? update(createNewExpression(expression, typeArguments, argumentsArray), node) : node;
  }
  function createTaggedTemplateExpression(tag, typeArguments, template) {
    const node = createBaseNode(216 /* TaggedTemplateExpression */);
    node.tag = parenthesizerRules().parenthesizeLeftSideOfAccess(
      tag,
      /*optionalChain*/
      false
    );
    node.typeArguments = asNodeArray(typeArguments);
    node.template = template;
    node.transformFlags |= propagateChildFlags(node.tag) | propagateChildrenFlags(node.typeArguments) | propagateChildFlags(node.template) | 1024 /* ContainsES2015 */;
    if (node.typeArguments) {
      node.transformFlags |= 1 /* ContainsTypeScript */;
    }
    if (hasInvalidEscape(node.template)) {
      node.transformFlags |= 128 /* ContainsES2018 */;
    }
    return node;
  }
  function updateTaggedTemplateExpression(node, tag, typeArguments, template) {
    return node.tag !== tag || node.typeArguments !== typeArguments || node.template !== template ? update(createTaggedTemplateExpression(tag, typeArguments, template), node) : node;
  }
  function createTypeAssertion(type, expression) {
    const node = createBaseNode(217 /* TypeAssertionExpression */);
    node.expression = parenthesizerRules().parenthesizeOperandOfPrefixUnary(expression);
    node.type = type;
    node.transformFlags |= propagateChildFlags(node.expression) | propagateChildFlags(node.type) | 1 /* ContainsTypeScript */;
    return node;
  }
  function updateTypeAssertion(node, type, expression) {
    return node.type !== type || node.expression !== expression ? update(createTypeAssertion(type, expression), node) : node;
  }
  function createParenthesizedExpression(expression) {
    const node = createBaseNode(218 /* ParenthesizedExpression */);
    node.expression = expression;
    node.transformFlags = propagateChildFlags(node.expression);
    node.jsDoc = void 0;
    return node;
  }
  function updateParenthesizedExpression(node, expression) {
    return node.expression !== expression ? update(createParenthesizedExpression(expression), node) : node;
  }
  function createFunctionExpression(modifiers, asteriskToken, name, typeParameters, parameters, type, body) {
    const node = createBaseDeclaration(219 /* FunctionExpression */);
    node.modifiers = asNodeArray(modifiers);
    node.asteriskToken = asteriskToken;
    node.name = asName(name);
    node.typeParameters = asNodeArray(typeParameters);
    node.parameters = createNodeArray(parameters);
    node.type = type;
    node.body = body;
    const isAsync = modifiersToFlags(node.modifiers) & 1024 /* Async */;
    const isGenerator = !!node.asteriskToken;
    const isAsyncGenerator = isAsync && isGenerator;
    node.transformFlags = propagateChildrenFlags(node.modifiers) | propagateChildFlags(node.asteriskToken) | propagateNameFlags(node.name) | propagateChildrenFlags(node.typeParameters) | propagateChildrenFlags(node.parameters) | propagateChildFlags(node.type) | propagateChildFlags(node.body) & ~67108864 /* ContainsPossibleTopLevelAwait */ | (isAsyncGenerator ? 128 /* ContainsES2018 */ : isAsync ? 256 /* ContainsES2017 */ : isGenerator ? 2048 /* ContainsGenerator */ : 0 /* None */) | (node.typeParameters || node.type ? 1 /* ContainsTypeScript */ : 0 /* None */) | 4194304 /* ContainsHoistedDeclarationOrCompletion */;
    node.typeArguments = void 0;
    node.jsDoc = void 0;
    node.locals = void 0;
    node.nextContainer = void 0;
    node.flowNode = void 0;
    node.endFlowNode = void 0;
    node.returnFlowNode = void 0;
    return node;
  }
  function updateFunctionExpression(node, modifiers, asteriskToken, name, typeParameters, parameters, type, body) {
    return node.name !== name || node.modifiers !== modifiers || node.asteriskToken !== asteriskToken || node.typeParameters !== typeParameters || node.parameters !== parameters || node.type !== type || node.body !== body ? finishUpdateBaseSignatureDeclaration(createFunctionExpression(modifiers, asteriskToken, name, typeParameters, parameters, type, body), node) : node;
  }
  function createArrowFunction(modifiers, typeParameters, parameters, type, equalsGreaterThanToken, body) {
    const node = createBaseDeclaration(220 /* ArrowFunction */);
    node.modifiers = asNodeArray(modifiers);
    node.typeParameters = asNodeArray(typeParameters);
    node.parameters = createNodeArray(parameters);
    node.type = type;
    node.equalsGreaterThanToken = equalsGreaterThanToken ?? createToken(39 /* EqualsGreaterThanToken */);
    node.body = parenthesizerRules().parenthesizeConciseBodyOfArrowFunction(body);
    const isAsync = modifiersToFlags(node.modifiers) & 1024 /* Async */;
    node.transformFlags = propagateChildrenFlags(node.modifiers) | propagateChildrenFlags(node.typeParameters) | propagateChildrenFlags(node.parameters) | propagateChildFlags(node.type) | propagateChildFlags(node.equalsGreaterThanToken) | propagateChildFlags(node.body) & ~67108864 /* ContainsPossibleTopLevelAwait */ | (node.typeParameters || node.type ? 1 /* ContainsTypeScript */ : 0 /* None */) | (isAsync ? 256 /* ContainsES2017 */ | 16384 /* ContainsLexicalThis */ : 0 /* None */) | 1024 /* ContainsES2015 */;
    node.typeArguments = void 0;
    node.jsDoc = void 0;
    node.locals = void 0;
    node.nextContainer = void 0;
    node.flowNode = void 0;
    node.endFlowNode = void 0;
    node.returnFlowNode = void 0;
    return node;
  }
  function updateArrowFunction(node, modifiers, typeParameters, parameters, type, equalsGreaterThanToken, body) {
    return node.modifiers !== modifiers || node.typeParameters !== typeParameters || node.parameters !== parameters || node.type !== type || node.equalsGreaterThanToken !== equalsGreaterThanToken || node.body !== body ? finishUpdateBaseSignatureDeclaration(createArrowFunction(modifiers, typeParameters, parameters, type, equalsGreaterThanToken, body), node) : node;
  }
  function createDeleteExpression(expression) {
    const node = createBaseNode(221 /* DeleteExpression */);
    node.expression = parenthesizerRules().parenthesizeOperandOfPrefixUnary(expression);
    node.transformFlags |= propagateChildFlags(node.expression);
    return node;
  }
  function updateDeleteExpression(node, expression) {
    return node.expression !== expression ? update(createDeleteExpression(expression), node) : node;
  }
  function createTypeOfExpression(expression) {
    const node = createBaseNode(222 /* TypeOfExpression */);
    node.expression = parenthesizerRules().parenthesizeOperandOfPrefixUnary(expression);
    node.transformFlags |= propagateChildFlags(node.expression);
    return node;
  }
  function updateTypeOfExpression(node, expression) {
    return node.expression !== expression ? update(createTypeOfExpression(expression), node) : node;
  }
  function createVoidExpression(expression) {
    const node = createBaseNode(223 /* VoidExpression */);
    node.expression = parenthesizerRules().parenthesizeOperandOfPrefixUnary(expression);
    node.transformFlags |= propagateChildFlags(node.expression);
    return node;
  }
  function updateVoidExpression(node, expression) {
    return node.expression !== expression ? update(createVoidExpression(expression), node) : node;
  }
  function createAwaitExpression(expression) {
    const node = createBaseNode(224 /* AwaitExpression */);
    node.expression = parenthesizerRules().parenthesizeOperandOfPrefixUnary(expression);
    node.transformFlags |= propagateChildFlags(node.expression) | 256 /* ContainsES2017 */ | 128 /* ContainsES2018 */ | 2097152 /* ContainsAwait */;
    return node;
  }
  function updateAwaitExpression(node, expression) {
    return node.expression !== expression ? update(createAwaitExpression(expression), node) : node;
  }
  function createPrefixUnaryExpression(operator, operand) {
    const node = createBaseNode(225 /* PrefixUnaryExpression */);
    node.operator = operator;
    node.operand = parenthesizerRules().parenthesizeOperandOfPrefixUnary(operand);
    node.transformFlags |= propagateChildFlags(node.operand);
    if ((operator === 46 /* PlusPlusToken */ || operator === 47 /* MinusMinusToken */) && isIdentifier(node.operand) && !isGeneratedIdentifier(node.operand) && !isLocalName(node.operand)) {
      node.transformFlags |= 268435456 /* ContainsUpdateExpressionForIdentifier */;
    }
    return node;
  }
  function updatePrefixUnaryExpression(node, operand) {
    return node.operand !== operand ? update(createPrefixUnaryExpression(node.operator, operand), node) : node;
  }
  function createPostfixUnaryExpression(operand, operator) {
    const node = createBaseNode(226 /* PostfixUnaryExpression */);
    node.operator = operator;
    node.operand = parenthesizerRules().parenthesizeOperandOfPostfixUnary(operand);
    node.transformFlags |= propagateChildFlags(node.operand);
    if (isIdentifier(node.operand) && !isGeneratedIdentifier(node.operand) && !isLocalName(node.operand)) {
      node.transformFlags |= 268435456 /* ContainsUpdateExpressionForIdentifier */;
    }
    return node;
  }
  function updatePostfixUnaryExpression(node, operand) {
    return node.operand !== operand ? update(createPostfixUnaryExpression(operand, node.operator), node) : node;
  }
  function createBinaryExpression(left, operator, right) {
    const node = createBaseDeclaration(227 /* BinaryExpression */);
    const operatorToken = asToken(operator);
    const operatorKind = operatorToken.kind;
    node.left = parenthesizerRules().parenthesizeLeftSideOfBinary(operatorKind, left);
    node.operatorToken = operatorToken;
    node.right = parenthesizerRules().parenthesizeRightSideOfBinary(operatorKind, node.left, right);
    node.transformFlags |= propagateChildFlags(node.left) | propagateChildFlags(node.operatorToken) | propagateChildFlags(node.right);
    if (operatorKind === 61 /* QuestionQuestionToken */) {
      node.transformFlags |= 32 /* ContainsES2020 */;
    } else if (operatorKind === 64 /* EqualsToken */) {
      if (isObjectLiteralExpression(node.left)) {
        node.transformFlags |= 1024 /* ContainsES2015 */ | 128 /* ContainsES2018 */ | 4096 /* ContainsDestructuringAssignment */ | propagateAssignmentPatternFlags(node.left);
      } else if (isArrayLiteralExpression(node.left)) {
        node.transformFlags |= 1024 /* ContainsES2015 */ | 4096 /* ContainsDestructuringAssignment */ | propagateAssignmentPatternFlags(node.left);
      }
    } else if (operatorKind === 43 /* AsteriskAsteriskToken */ || operatorKind === 68 /* AsteriskAsteriskEqualsToken */) {
      node.transformFlags |= 512 /* ContainsES2016 */;
    } else if (isLogicalOrCoalescingAssignmentOperator(operatorKind)) {
      node.transformFlags |= 16 /* ContainsES2021 */;
    }
    if (operatorKind === 103 /* InKeyword */ && isPrivateIdentifier(node.left)) {
      node.transformFlags |= 536870912 /* ContainsPrivateIdentifierInExpression */;
    }
    node.jsDoc = void 0;
    return node;
  }
  function propagateAssignmentPatternFlags(node) {
    return containsObjectRestOrSpread(node) ? 65536 /* ContainsObjectRestOrSpread */ : 0 /* None */;
  }
  function updateBinaryExpression(node, left, operator, right) {
    return node.left !== left || node.operatorToken !== operator || node.right !== right ? update(createBinaryExpression(left, operator, right), node) : node;
  }
  function createConditionalExpression(condition, questionToken, whenTrue, colonToken, whenFalse) {
    const node = createBaseNode(228 /* ConditionalExpression */);
    node.condition = parenthesizerRules().parenthesizeConditionOfConditionalExpression(condition);
    node.questionToken = questionToken ?? createToken(58 /* QuestionToken */);
    node.whenTrue = parenthesizerRules().parenthesizeBranchOfConditionalExpression(whenTrue);
    node.colonToken = colonToken ?? createToken(59 /* ColonToken */);
    node.whenFalse = parenthesizerRules().parenthesizeBranchOfConditionalExpression(whenFalse);
    node.transformFlags |= propagateChildFlags(node.condition) | propagateChildFlags(node.questionToken) | propagateChildFlags(node.whenTrue) | propagateChildFlags(node.colonToken) | propagateChildFlags(node.whenFalse);
    node.flowNodeWhenFalse = void 0;
    node.flowNodeWhenTrue = void 0;
    return node;
  }
  function updateConditionalExpression(node, condition, questionToken, whenTrue, colonToken, whenFalse) {
    return node.condition !== condition || node.questionToken !== questionToken || node.whenTrue !== whenTrue || node.colonToken !== colonToken || node.whenFalse !== whenFalse ? update(createConditionalExpression(condition, questionToken, whenTrue, colonToken, whenFalse), node) : node;
  }
  function createTemplateExpression(head, templateSpans) {
    const node = createBaseNode(229 /* TemplateExpression */);
    node.head = head;
    node.templateSpans = createNodeArray(templateSpans);
    node.transformFlags |= propagateChildFlags(node.head) | propagateChildrenFlags(node.templateSpans) | 1024 /* ContainsES2015 */;
    return node;
  }
  function updateTemplateExpression(node, head, templateSpans) {
    return node.head !== head || node.templateSpans !== templateSpans ? update(createTemplateExpression(head, templateSpans), node) : node;
  }
  function checkTemplateLiteralLikeNode(kind, text, rawText, templateFlags = 0 /* None */) {
    Debug.assert(!(templateFlags & ~7176 /* TemplateLiteralLikeFlags */), "Unsupported template flags.");
    let cooked = void 0;
    if (rawText !== void 0 && rawText !== text) {
      cooked = getCookedText(kind, rawText);
      if (typeof cooked === "object") {
        return Debug.fail("Invalid raw text");
      }
    }
    if (text === void 0) {
      if (cooked === void 0) {
        return Debug.fail("Arguments 'text' and 'rawText' may not both be undefined.");
      }
      text = cooked;
    } else if (cooked !== void 0) {
      Debug.assert(text === cooked, "Expected argument 'text' to be the normalized (i.e. 'cooked') version of argument 'rawText'.");
    }
    return text;
  }
  function getTransformFlagsOfTemplateLiteralLike(templateFlags) {
    let transformFlags = 1024 /* ContainsES2015 */;
    if (templateFlags) {
      transformFlags |= 128 /* ContainsES2018 */;
    }
    return transformFlags;
  }
  function createTemplateLiteralLikeToken(kind, text, rawText, templateFlags) {
    const node = createBaseToken(kind);
    node.text = text;
    node.rawText = rawText;
    node.templateFlags = templateFlags & 7176 /* TemplateLiteralLikeFlags */;
    node.transformFlags = getTransformFlagsOfTemplateLiteralLike(node.templateFlags);
    return node;
  }
  function createTemplateLiteralLikeDeclaration(kind, text, rawText, templateFlags) {
    const node = createBaseDeclaration(kind);
    node.text = text;
    node.rawText = rawText;
    node.templateFlags = templateFlags & 7176 /* TemplateLiteralLikeFlags */;
    node.transformFlags = getTransformFlagsOfTemplateLiteralLike(node.templateFlags);
    return node;
  }
  function createTemplateLiteralLikeNode(kind, text, rawText, templateFlags) {
    if (kind === 15 /* NoSubstitutionTemplateLiteral */) {
      return createTemplateLiteralLikeDeclaration(kind, text, rawText, templateFlags);
    }
    return createTemplateLiteralLikeToken(kind, text, rawText, templateFlags);
  }
  function createTemplateHead(text, rawText, templateFlags) {
    text = checkTemplateLiteralLikeNode(16 /* TemplateHead */, text, rawText, templateFlags);
    return createTemplateLiteralLikeNode(16 /* TemplateHead */, text, rawText, templateFlags);
  }
  function createTemplateMiddle(text, rawText, templateFlags) {
    text = checkTemplateLiteralLikeNode(16 /* TemplateHead */, text, rawText, templateFlags);
    return createTemplateLiteralLikeNode(17 /* TemplateMiddle */, text, rawText, templateFlags);
  }
  function createTemplateTail(text, rawText, templateFlags) {
    text = checkTemplateLiteralLikeNode(16 /* TemplateHead */, text, rawText, templateFlags);
    return createTemplateLiteralLikeNode(18 /* TemplateTail */, text, rawText, templateFlags);
  }
  function createNoSubstitutionTemplateLiteral(text, rawText, templateFlags) {
    text = checkTemplateLiteralLikeNode(16 /* TemplateHead */, text, rawText, templateFlags);
    return createTemplateLiteralLikeDeclaration(15 /* NoSubstitutionTemplateLiteral */, text, rawText, templateFlags);
  }
  function createYieldExpression(asteriskToken, expression) {
    Debug.assert(!asteriskToken || !!expression, "A `YieldExpression` with an asteriskToken must have an expression.");
    const node = createBaseNode(230 /* YieldExpression */);
    node.expression = expression && parenthesizerRules().parenthesizeExpressionForDisallowedComma(expression);
    node.asteriskToken = asteriskToken;
    node.transformFlags |= propagateChildFlags(node.expression) | propagateChildFlags(node.asteriskToken) | 1024 /* ContainsES2015 */ | 128 /* ContainsES2018 */ | 1048576 /* ContainsYield */;
    return node;
  }
  function updateYieldExpression(node, asteriskToken, expression) {
    return node.expression !== expression || node.asteriskToken !== asteriskToken ? update(createYieldExpression(asteriskToken, expression), node) : node;
  }
  function createSpreadElement(expression) {
    const node = createBaseNode(231 /* SpreadElement */);
    node.expression = parenthesizerRules().parenthesizeExpressionForDisallowedComma(expression);
    node.transformFlags |= propagateChildFlags(node.expression) | 1024 /* ContainsES2015 */ | 32768 /* ContainsRestOrSpread */;
    return node;
  }
  function updateSpreadElement(node, expression) {
    return node.expression !== expression ? update(createSpreadElement(expression), node) : node;
  }
  function createClassExpression(modifiers, name, typeParameters, heritageClauses, members) {
    const node = createBaseDeclaration(232 /* ClassExpression */);
    node.modifiers = asNodeArray(modifiers);
    node.name = asName(name);
    node.typeParameters = asNodeArray(typeParameters);
    node.heritageClauses = asNodeArray(heritageClauses);
    node.members = createNodeArray(members);
    node.transformFlags |= propagateChildrenFlags(node.modifiers) | propagateNameFlags(node.name) | propagateChildrenFlags(node.typeParameters) | propagateChildrenFlags(node.heritageClauses) | propagateChildrenFlags(node.members) | (node.typeParameters ? 1 /* ContainsTypeScript */ : 0 /* None */) | 1024 /* ContainsES2015 */;
    node.jsDoc = void 0;
    return node;
  }
  function updateClassExpression(node, modifiers, name, typeParameters, heritageClauses, members) {
    return node.modifiers !== modifiers || node.name !== name || node.typeParameters !== typeParameters || node.heritageClauses !== heritageClauses || node.members !== members ? update(createClassExpression(modifiers, name, typeParameters, heritageClauses, members), node) : node;
  }
  function createOmittedExpression() {
    return createBaseNode(233 /* OmittedExpression */);
  }
  function createExpressionWithTypeArguments(expression, typeArguments) {
    const node = createBaseNode(234 /* ExpressionWithTypeArguments */);
    node.expression = parenthesizerRules().parenthesizeLeftSideOfAccess(
      expression,
      /*optionalChain*/
      false
    );
    node.typeArguments = typeArguments && parenthesizerRules().parenthesizeTypeArguments(typeArguments);
    node.transformFlags |= propagateChildFlags(node.expression) | propagateChildrenFlags(node.typeArguments) | 1024 /* ContainsES2015 */;
    return node;
  }
  function updateExpressionWithTypeArguments(node, expression, typeArguments) {
    return node.expression !== expression || node.typeArguments !== typeArguments ? update(createExpressionWithTypeArguments(expression, typeArguments), node) : node;
  }
  function createAsExpression(expression, type) {
    const node = createBaseNode(235 /* AsExpression */);
    node.expression = expression;
    node.type = type;
    node.transformFlags |= propagateChildFlags(node.expression) | propagateChildFlags(node.type) | 1 /* ContainsTypeScript */;
    return node;
  }
  function updateAsExpression(node, expression, type) {
    return node.expression !== expression || node.type !== type ? update(createAsExpression(expression, type), node) : node;
  }
  function createNonNullExpression(expression) {
    const node = createBaseNode(236 /* NonNullExpression */);
    node.expression = parenthesizerRules().parenthesizeLeftSideOfAccess(
      expression,
      /*optionalChain*/
      false
    );
    node.transformFlags |= propagateChildFlags(node.expression) | 1 /* ContainsTypeScript */;
    return node;
  }
  function updateNonNullExpression(node, expression) {
    if (isNonNullChain(node)) {
      return updateNonNullChain(node, expression);
    }
    return node.expression !== expression ? update(createNonNullExpression(expression), node) : node;
  }
  function createSatisfiesExpression(expression, type) {
    const node = createBaseNode(239 /* SatisfiesExpression */);
    node.expression = expression;
    node.type = type;
    node.transformFlags |= propagateChildFlags(node.expression) | propagateChildFlags(node.type) | 1 /* ContainsTypeScript */;
    return node;
  }
  function updateSatisfiesExpression(node, expression, type) {
    return node.expression !== expression || node.type !== type ? update(createSatisfiesExpression(expression, type), node) : node;
  }
  function createNonNullChain(expression) {
    const node = createBaseNode(236 /* NonNullExpression */);
    node.flags |= 64 /* OptionalChain */;
    node.expression = parenthesizerRules().parenthesizeLeftSideOfAccess(
      expression,
      /*optionalChain*/
      true
    );
    node.transformFlags |= propagateChildFlags(node.expression) | 1 /* ContainsTypeScript */;
    return node;
  }
  function updateNonNullChain(node, expression) {
    Debug.assert(!!(node.flags & 64 /* OptionalChain */), "Cannot update a NonNullExpression using updateNonNullChain. Use updateNonNullExpression instead.");
    return node.expression !== expression ? update(createNonNullChain(expression), node) : node;
  }
  function createMetaProperty(keywordToken, name) {
    const node = createBaseNode(237 /* MetaProperty */);
    node.keywordToken = keywordToken;
    node.name = name;
    node.transformFlags |= propagateChildFlags(node.name);
    switch (keywordToken) {
      case 105 /* NewKeyword */:
        node.transformFlags |= 1024 /* ContainsES2015 */;
        break;
      case 102 /* ImportKeyword */:
        node.transformFlags |= 32 /* ContainsES2020 */;
        break;
      default:
        return Debug.assertNever(keywordToken);
    }
    node.flowNode = void 0;
    return node;
  }
  function updateMetaProperty(node, name) {
    return node.name !== name ? update(createMetaProperty(node.keywordToken, name), node) : node;
  }
  function createTemplateSpan(expression, literal) {
    const node = createBaseNode(240 /* TemplateSpan */);
    node.expression = expression;
    node.literal = literal;
    node.transformFlags |= propagateChildFlags(node.expression) | propagateChildFlags(node.literal) | 1024 /* ContainsES2015 */;
    return node;
  }
  function updateTemplateSpan(node, expression, literal) {
    return node.expression !== expression || node.literal !== literal ? update(createTemplateSpan(expression, literal), node) : node;
  }
  function createSemicolonClassElement() {
    const node = createBaseNode(241 /* SemicolonClassElement */);
    node.transformFlags |= 1024 /* ContainsES2015 */;
    return node;
  }
  function createBlock(statements, multiLine) {
    const node = createBaseNode(242 /* Block */);
    node.statements = createNodeArray(statements);
    node.multiLine = multiLine;
    node.transformFlags |= propagateChildrenFlags(node.statements);
    node.jsDoc = void 0;
    node.locals = void 0;
    node.nextContainer = void 0;
    return node;
  }
  function updateBlock(node, statements) {
    return node.statements !== statements ? update(createBlock(statements, node.multiLine), node) : node;
  }
  function createVariableStatement(modifiers, declarationList) {
    const node = createBaseNode(244 /* VariableStatement */);
    node.modifiers = asNodeArray(modifiers);
    node.declarationList = isArray(declarationList) ? createVariableDeclarationList(declarationList) : declarationList;
    node.transformFlags |= propagateChildrenFlags(node.modifiers) | propagateChildFlags(node.declarationList);
    if (modifiersToFlags(node.modifiers) & 128 /* Ambient */) {
      node.transformFlags = 1 /* ContainsTypeScript */;
    }
    node.jsDoc = void 0;
    node.flowNode = void 0;
    return node;
  }
  function updateVariableStatement(node, modifiers, declarationList) {
    return node.modifiers !== modifiers || node.declarationList !== declarationList ? update(createVariableStatement(modifiers, declarationList), node) : node;
  }
  function createEmptyStatement() {
    const node = createBaseNode(243 /* EmptyStatement */);
    node.jsDoc = void 0;
    return node;
  }
  function createExpressionStatement(expression) {
    const node = createBaseNode(245 /* ExpressionStatement */);
    node.expression = parenthesizerRules().parenthesizeExpressionOfExpressionStatement(expression);
    node.transformFlags |= propagateChildFlags(node.expression);
    node.jsDoc = void 0;
    node.flowNode = void 0;
    return node;
  }
  function updateExpressionStatement(node, expression) {
    return node.expression !== expression ? update(createExpressionStatement(expression), node) : node;
  }
  function createIfStatement(expression, thenStatement, elseStatement) {
    const node = createBaseNode(246 /* IfStatement */);
    node.expression = expression;
    node.thenStatement = asEmbeddedStatement(thenStatement);
    node.elseStatement = asEmbeddedStatement(elseStatement);
    node.transformFlags |= propagateChildFlags(node.expression) | propagateChildFlags(node.thenStatement) | propagateChildFlags(node.elseStatement);
    node.jsDoc = void 0;
    node.flowNode = void 0;
    return node;
  }
  function updateIfStatement(node, expression, thenStatement, elseStatement) {
    return node.expression !== expression || node.thenStatement !== thenStatement || node.elseStatement !== elseStatement ? update(createIfStatement(expression, thenStatement, elseStatement), node) : node;
  }
  function createDoStatement(statement, expression) {
    const node = createBaseNode(247 /* DoStatement */);
    node.statement = asEmbeddedStatement(statement);
    node.expression = expression;
    node.transformFlags |= propagateChildFlags(node.statement) | propagateChildFlags(node.expression);
    node.jsDoc = void 0;
    node.flowNode = void 0;
    return node;
  }
  function updateDoStatement(node, statement, expression) {
    return node.statement !== statement || node.expression !== expression ? update(createDoStatement(statement, expression), node) : node;
  }
  function createWhileStatement(expression, statement) {
    const node = createBaseNode(248 /* WhileStatement */);
    node.expression = expression;
    node.statement = asEmbeddedStatement(statement);
    node.transformFlags |= propagateChildFlags(node.expression) | propagateChildFlags(node.statement);
    node.jsDoc = void 0;
    node.flowNode = void 0;
    return node;
  }
  function updateWhileStatement(node, expression, statement) {
    return node.expression !== expression || node.statement !== statement ? update(createWhileStatement(expression, statement), node) : node;
  }
  function createForStatement(initializer, condition, incrementor, statement) {
    const node = createBaseNode(249 /* ForStatement */);
    node.initializer = initializer;
    node.condition = condition;
    node.incrementor = incrementor;
    node.statement = asEmbeddedStatement(statement);
    node.transformFlags |= propagateChildFlags(node.initializer) | propagateChildFlags(node.condition) | propagateChildFlags(node.incrementor) | propagateChildFlags(node.statement);
    node.jsDoc = void 0;
    node.locals = void 0;
    node.nextContainer = void 0;
    node.flowNode = void 0;
    return node;
  }
  function updateForStatement(node, initializer, condition, incrementor, statement) {
    return node.initializer !== initializer || node.condition !== condition || node.incrementor !== incrementor || node.statement !== statement ? update(createForStatement(initializer, condition, incrementor, statement), node) : node;
  }
  function createForInStatement(initializer, expression, statement) {
    const node = createBaseNode(250 /* ForInStatement */);
    node.initializer = initializer;
    node.expression = expression;
    node.statement = asEmbeddedStatement(statement);
    node.transformFlags |= propagateChildFlags(node.initializer) | propagateChildFlags(node.expression) | propagateChildFlags(node.statement);
    node.jsDoc = void 0;
    node.locals = void 0;
    node.nextContainer = void 0;
    node.flowNode = void 0;
    return node;
  }
  function updateForInStatement(node, initializer, expression, statement) {
    return node.initializer !== initializer || node.expression !== expression || node.statement !== statement ? update(createForInStatement(initializer, expression, statement), node) : node;
  }
  function createForOfStatement(awaitModifier, initializer, expression, statement) {
    const node = createBaseNode(251 /* ForOfStatement */);
    node.awaitModifier = awaitModifier;
    node.initializer = initializer;
    node.expression = parenthesizerRules().parenthesizeExpressionForDisallowedComma(expression);
    node.statement = asEmbeddedStatement(statement);
    node.transformFlags |= propagateChildFlags(node.awaitModifier) | propagateChildFlags(node.initializer) | propagateChildFlags(node.expression) | propagateChildFlags(node.statement) | 1024 /* ContainsES2015 */;
    if (awaitModifier) node.transformFlags |= 128 /* ContainsES2018 */;
    node.jsDoc = void 0;
    node.locals = void 0;
    node.nextContainer = void 0;
    node.flowNode = void 0;
    return node;
  }
  function updateForOfStatement(node, awaitModifier, initializer, expression, statement) {
    return node.awaitModifier !== awaitModifier || node.initializer !== initializer || node.expression !== expression || node.statement !== statement ? update(createForOfStatement(awaitModifier, initializer, expression, statement), node) : node;
  }
  function createContinueStatement(label) {
    const node = createBaseNode(252 /* ContinueStatement */);
    node.label = asName(label);
    node.transformFlags |= propagateChildFlags(node.label) | 4194304 /* ContainsHoistedDeclarationOrCompletion */;
    node.jsDoc = void 0;
    node.flowNode = void 0;
    return node;
  }
  function updateContinueStatement(node, label) {
    return node.label !== label ? update(createContinueStatement(label), node) : node;
  }
  function createBreakStatement(label) {
    const node = createBaseNode(253 /* BreakStatement */);
    node.label = asName(label);
    node.transformFlags |= propagateChildFlags(node.label) | 4194304 /* ContainsHoistedDeclarationOrCompletion */;
    node.jsDoc = void 0;
    node.flowNode = void 0;
    return node;
  }
  function updateBreakStatement(node, label) {
    return node.label !== label ? update(createBreakStatement(label), node) : node;
  }
  function createReturnStatement(expression) {
    const node = createBaseNode(254 /* ReturnStatement */);
    node.expression = expression;
    node.transformFlags |= propagateChildFlags(node.expression) | 128 /* ContainsES2018 */ | 4194304 /* ContainsHoistedDeclarationOrCompletion */;
    node.jsDoc = void 0;
    node.flowNode = void 0;
    return node;
  }
  function updateReturnStatement(node, expression) {
    return node.expression !== expression ? update(createReturnStatement(expression), node) : node;
  }
  function createWithStatement(expression, statement) {
    const node = createBaseNode(255 /* WithStatement */);
    node.expression = expression;
    node.statement = asEmbeddedStatement(statement);
    node.transformFlags |= propagateChildFlags(node.expression) | propagateChildFlags(node.statement);
    node.jsDoc = void 0;
    node.flowNode = void 0;
    return node;
  }
  function updateWithStatement(node, expression, statement) {
    return node.expression !== expression || node.statement !== statement ? update(createWithStatement(expression, statement), node) : node;
  }
  function createSwitchStatement(expression, caseBlock) {
    const node = createBaseNode(256 /* SwitchStatement */);
    node.expression = parenthesizerRules().parenthesizeExpressionForDisallowedComma(expression);
    node.caseBlock = caseBlock;
    node.transformFlags |= propagateChildFlags(node.expression) | propagateChildFlags(node.caseBlock);
    node.jsDoc = void 0;
    node.flowNode = void 0;
    node.possiblyExhaustive = false;
    return node;
  }
  function updateSwitchStatement(node, expression, caseBlock) {
    return node.expression !== expression || node.caseBlock !== caseBlock ? update(createSwitchStatement(expression, caseBlock), node) : node;
  }
  function createLabeledStatement(label, statement) {
    const node = createBaseNode(257 /* LabeledStatement */);
    node.label = asName(label);
    node.statement = asEmbeddedStatement(statement);
    node.transformFlags |= propagateChildFlags(node.label) | propagateChildFlags(node.statement);
    node.jsDoc = void 0;
    node.flowNode = void 0;
    return node;
  }
  function updateLabeledStatement(node, label, statement) {
    return node.label !== label || node.statement !== statement ? update(createLabeledStatement(label, statement), node) : node;
  }
  function createThrowStatement(expression) {
    const node = createBaseNode(258 /* ThrowStatement */);
    node.expression = expression;
    node.transformFlags |= propagateChildFlags(node.expression);
    node.jsDoc = void 0;
    node.flowNode = void 0;
    return node;
  }
  function updateThrowStatement(node, expression) {
    return node.expression !== expression ? update(createThrowStatement(expression), node) : node;
  }
  function createTryStatement(tryBlock, catchClause, finallyBlock) {
    const node = createBaseNode(259 /* TryStatement */);
    node.tryBlock = tryBlock;
    node.catchClause = catchClause;
    node.finallyBlock = finallyBlock;
    node.transformFlags |= propagateChildFlags(node.tryBlock) | propagateChildFlags(node.catchClause) | propagateChildFlags(node.finallyBlock);
    node.jsDoc = void 0;
    node.flowNode = void 0;
    return node;
  }
  function updateTryStatement(node, tryBlock, catchClause, finallyBlock) {
    return node.tryBlock !== tryBlock || node.catchClause !== catchClause || node.finallyBlock !== finallyBlock ? update(createTryStatement(tryBlock, catchClause, finallyBlock), node) : node;
  }
  function createDebuggerStatement() {
    const node = createBaseNode(260 /* DebuggerStatement */);
    node.jsDoc = void 0;
    node.flowNode = void 0;
    return node;
  }
  function createVariableDeclaration(name, exclamationToken, type, initializer) {
    const node = createBaseDeclaration(261 /* VariableDeclaration */);
    node.name = asName(name);
    node.exclamationToken = exclamationToken;
    node.type = type;
    node.initializer = asInitializer(initializer);
    node.transformFlags |= propagateNameFlags(node.name) | propagateChildFlags(node.initializer) | (node.exclamationToken ?? node.type ? 1 /* ContainsTypeScript */ : 0 /* None */);
    node.jsDoc = void 0;
    return node;
  }
  function updateVariableDeclaration(node, name, exclamationToken, type, initializer) {
    return node.name !== name || node.type !== type || node.exclamationToken !== exclamationToken || node.initializer !== initializer ? update(createVariableDeclaration(name, exclamationToken, type, initializer), node) : node;
  }
  function createVariableDeclarationList(declarations, flags2 = 0 /* None */) {
    const node = createBaseNode(262 /* VariableDeclarationList */);
    node.flags |= flags2 & 7 /* BlockScoped */;
    node.declarations = createNodeArray(declarations);
    node.transformFlags |= propagateChildrenFlags(node.declarations) | 4194304 /* ContainsHoistedDeclarationOrCompletion */;
    if (flags2 & 7 /* BlockScoped */) {
      node.transformFlags |= 1024 /* ContainsES2015 */ | 262144 /* ContainsBlockScopedBinding */;
    }
    if (flags2 & 4 /* Using */) {
      node.transformFlags |= 4 /* ContainsESNext */;
    }
    return node;
  }
  function updateVariableDeclarationList(node, declarations) {
    return node.declarations !== declarations ? update(createVariableDeclarationList(declarations, node.flags), node) : node;
  }
  function createFunctionDeclaration(modifiers, asteriskToken, name, typeParameters, parameters, type, body) {
    const node = createBaseDeclaration(263 /* FunctionDeclaration */);
    node.modifiers = asNodeArray(modifiers);
    node.asteriskToken = asteriskToken;
    node.name = asName(name);
    node.typeParameters = asNodeArray(typeParameters);
    node.parameters = createNodeArray(parameters);
    node.type = type;
    node.body = body;
    if (!node.body || modifiersToFlags(node.modifiers) & 128 /* Ambient */) {
      node.transformFlags = 1 /* ContainsTypeScript */;
    } else {
      const isAsync = modifiersToFlags(node.modifiers) & 1024 /* Async */;
      const isGenerator = !!node.asteriskToken;
      const isAsyncGenerator = isAsync && isGenerator;
      node.transformFlags = propagateChildrenFlags(node.modifiers) | propagateChildFlags(node.asteriskToken) | propagateNameFlags(node.name) | propagateChildrenFlags(node.typeParameters) | propagateChildrenFlags(node.parameters) | propagateChildFlags(node.type) | propagateChildFlags(node.body) & ~67108864 /* ContainsPossibleTopLevelAwait */ | (isAsyncGenerator ? 128 /* ContainsES2018 */ : isAsync ? 256 /* ContainsES2017 */ : isGenerator ? 2048 /* ContainsGenerator */ : 0 /* None */) | (node.typeParameters || node.type ? 1 /* ContainsTypeScript */ : 0 /* None */) | 4194304 /* ContainsHoistedDeclarationOrCompletion */;
    }
    node.typeArguments = void 0;
    node.jsDoc = void 0;
    node.locals = void 0;
    node.nextContainer = void 0;
    node.endFlowNode = void 0;
    node.returnFlowNode = void 0;
    return node;
  }
  function updateFunctionDeclaration(node, modifiers, asteriskToken, name, typeParameters, parameters, type, body) {
    return node.modifiers !== modifiers || node.asteriskToken !== asteriskToken || node.name !== name || node.typeParameters !== typeParameters || node.parameters !== parameters || node.type !== type || node.body !== body ? finishUpdateFunctionDeclaration(createFunctionDeclaration(modifiers, asteriskToken, name, typeParameters, parameters, type, body), node) : node;
  }
  function finishUpdateFunctionDeclaration(updated, original) {
    if (updated !== original) {
      if (updated.modifiers === original.modifiers) {
        updated.modifiers = original.modifiers;
      }
    }
    return finishUpdateBaseSignatureDeclaration(updated, original);
  }
  function createClassDeclaration(modifiers, name, typeParameters, heritageClauses, members) {
    const node = createBaseDeclaration(264 /* ClassDeclaration */);
    node.modifiers = asNodeArray(modifiers);
    node.name = asName(name);
    node.typeParameters = asNodeArray(typeParameters);
    node.heritageClauses = asNodeArray(heritageClauses);
    node.members = createNodeArray(members);
    if (modifiersToFlags(node.modifiers) & 128 /* Ambient */) {
      node.transformFlags = 1 /* ContainsTypeScript */;
    } else {
      node.transformFlags |= propagateChildrenFlags(node.modifiers) | propagateNameFlags(node.name) | propagateChildrenFlags(node.typeParameters) | propagateChildrenFlags(node.heritageClauses) | propagateChildrenFlags(node.members) | (node.typeParameters ? 1 /* ContainsTypeScript */ : 0 /* None */) | 1024 /* ContainsES2015 */;
      if (node.transformFlags & 8192 /* ContainsTypeScriptClassSyntax */) {
        node.transformFlags |= 1 /* ContainsTypeScript */;
      }
    }
    node.jsDoc = void 0;
    return node;
  }
  function updateClassDeclaration(node, modifiers, name, typeParameters, heritageClauses, members) {
    return node.modifiers !== modifiers || node.name !== name || node.typeParameters !== typeParameters || node.heritageClauses !== heritageClauses || node.members !== members ? update(createClassDeclaration(modifiers, name, typeParameters, heritageClauses, members), node) : node;
  }
  function createInterfaceDeclaration(modifiers, name, typeParameters, heritageClauses, members) {
    const node = createBaseDeclaration(265 /* InterfaceDeclaration */);
    node.modifiers = asNodeArray(modifiers);
    node.name = asName(name);
    node.typeParameters = asNodeArray(typeParameters);
    node.heritageClauses = asNodeArray(heritageClauses);
    node.members = createNodeArray(members);
    node.transformFlags = 1 /* ContainsTypeScript */;
    node.jsDoc = void 0;
    return node;
  }
  function updateInterfaceDeclaration(node, modifiers, name, typeParameters, heritageClauses, members) {
    return node.modifiers !== modifiers || node.name !== name || node.typeParameters !== typeParameters || node.heritageClauses !== heritageClauses || node.members !== members ? update(createInterfaceDeclaration(modifiers, name, typeParameters, heritageClauses, members), node) : node;
  }
  function createTypeAliasDeclaration(modifiers, name, typeParameters, type) {
    const node = createBaseDeclaration(266 /* TypeAliasDeclaration */);
    node.modifiers = asNodeArray(modifiers);
    node.name = asName(name);
    node.typeParameters = asNodeArray(typeParameters);
    node.type = type;
    node.transformFlags = 1 /* ContainsTypeScript */;
    node.jsDoc = void 0;
    node.locals = void 0;
    node.nextContainer = void 0;
    return node;
  }
  function updateTypeAliasDeclaration(node, modifiers, name, typeParameters, type) {
    return node.modifiers !== modifiers || node.name !== name || node.typeParameters !== typeParameters || node.type !== type ? update(createTypeAliasDeclaration(modifiers, name, typeParameters, type), node) : node;
  }
  function createEnumDeclaration(modifiers, name, members) {
    const node = createBaseDeclaration(267 /* EnumDeclaration */);
    node.modifiers = asNodeArray(modifiers);
    node.name = asName(name);
    node.members = createNodeArray(members);
    node.transformFlags |= propagateChildrenFlags(node.modifiers) | propagateChildFlags(node.name) | propagateChildrenFlags(node.members) | 1 /* ContainsTypeScript */;
    node.transformFlags &= ~67108864 /* ContainsPossibleTopLevelAwait */;
    node.jsDoc = void 0;
    return node;
  }
  function updateEnumDeclaration(node, modifiers, name, members) {
    return node.modifiers !== modifiers || node.name !== name || node.members !== members ? update(createEnumDeclaration(modifiers, name, members), node) : node;
  }
  function createModuleDeclaration(modifiers, name, body, flags2 = 0 /* None */) {
    const node = createBaseDeclaration(268 /* ModuleDeclaration */);
    node.modifiers = asNodeArray(modifiers);
    node.flags |= flags2 & (32 /* Namespace */ | 8 /* NestedNamespace */ | 2048 /* GlobalAugmentation */);
    node.name = name;
    node.body = body;
    if (modifiersToFlags(node.modifiers) & 128 /* Ambient */) {
      node.transformFlags = 1 /* ContainsTypeScript */;
    } else {
      node.transformFlags |= propagateChildrenFlags(node.modifiers) | propagateChildFlags(node.name) | propagateChildFlags(node.body) | 1 /* ContainsTypeScript */;
    }
    node.transformFlags &= ~67108864 /* ContainsPossibleTopLevelAwait */;
    node.jsDoc = void 0;
    node.locals = void 0;
    node.nextContainer = void 0;
    return node;
  }
  function updateModuleDeclaration(node, modifiers, name, body) {
    return node.modifiers !== modifiers || node.name !== name || node.body !== body ? update(createModuleDeclaration(modifiers, name, body, node.flags), node) : node;
  }
  function createModuleBlock(statements) {
    const node = createBaseNode(269 /* ModuleBlock */);
    node.statements = createNodeArray(statements);
    node.transformFlags |= propagateChildrenFlags(node.statements);
    node.jsDoc = void 0;
    return node;
  }
  function updateModuleBlock(node, statements) {
    return node.statements !== statements ? update(createModuleBlock(statements), node) : node;
  }
  function createCaseBlock(clauses) {
    const node = createBaseNode(270 /* CaseBlock */);
    node.clauses = createNodeArray(clauses);
    node.transformFlags |= propagateChildrenFlags(node.clauses);
    node.locals = void 0;
    node.nextContainer = void 0;
    return node;
  }
  function updateCaseBlock(node, clauses) {
    return node.clauses !== clauses ? update(createCaseBlock(clauses), node) : node;
  }
  function createNamespaceExportDeclaration(name) {
    const node = createBaseDeclaration(271 /* NamespaceExportDeclaration */);
    node.name = asName(name);
    node.transformFlags |= propagateIdentifierNameFlags(node.name) | 1 /* ContainsTypeScript */;
    node.modifiers = void 0;
    node.jsDoc = void 0;
    return node;
  }
  function updateNamespaceExportDeclaration(node, name) {
    return node.name !== name ? finishUpdateNamespaceExportDeclaration(createNamespaceExportDeclaration(name), node) : node;
  }
  function finishUpdateNamespaceExportDeclaration(updated, original) {
    if (updated !== original) {
      updated.modifiers = original.modifiers;
    }
    return update(updated, original);
  }
  function createImportEqualsDeclaration(modifiers, isTypeOnly, name, moduleReference) {
    const node = createBaseDeclaration(272 /* ImportEqualsDeclaration */);
    node.modifiers = asNodeArray(modifiers);
    node.name = asName(name);
    node.isTypeOnly = isTypeOnly;
    node.moduleReference = moduleReference;
    node.transformFlags |= propagateChildrenFlags(node.modifiers) | propagateIdentifierNameFlags(node.name) | propagateChildFlags(node.moduleReference);
    if (!isExternalModuleReference(node.moduleReference)) {
      node.transformFlags |= 1 /* ContainsTypeScript */;
    }
    node.transformFlags &= ~67108864 /* ContainsPossibleTopLevelAwait */;
    node.jsDoc = void 0;
    return node;
  }
  function updateImportEqualsDeclaration(node, modifiers, isTypeOnly, name, moduleReference) {
    return node.modifiers !== modifiers || node.isTypeOnly !== isTypeOnly || node.name !== name || node.moduleReference !== moduleReference ? update(createImportEqualsDeclaration(modifiers, isTypeOnly, name, moduleReference), node) : node;
  }
  function createImportDeclaration(modifiers, importClause, moduleSpecifier, attributes) {
    const node = createBaseNode(273 /* ImportDeclaration */);
    node.modifiers = asNodeArray(modifiers);
    node.importClause = importClause;
    node.moduleSpecifier = moduleSpecifier;
    node.attributes = node.assertClause = attributes;
    node.transformFlags |= propagateChildFlags(node.importClause) | propagateChildFlags(node.moduleSpecifier);
    node.transformFlags &= ~67108864 /* ContainsPossibleTopLevelAwait */;
    node.jsDoc = void 0;
    return node;
  }
  function updateImportDeclaration(node, modifiers, importClause, moduleSpecifier, attributes) {
    return node.modifiers !== modifiers || node.importClause !== importClause || node.moduleSpecifier !== moduleSpecifier || node.attributes !== attributes ? update(createImportDeclaration(modifiers, importClause, moduleSpecifier, attributes), node) : node;
  }
  function createImportClause2(phaseModifier, name, namedBindings) {
    const node = createBaseDeclaration(274 /* ImportClause */);
    if (typeof phaseModifier === "boolean") {
      phaseModifier = phaseModifier ? 156 /* TypeKeyword */ : void 0;
    }
    node.isTypeOnly = phaseModifier === 156 /* TypeKeyword */;
    node.phaseModifier = phaseModifier;
    node.name = name;
    node.namedBindings = namedBindings;
    node.transformFlags |= propagateChildFlags(node.name) | propagateChildFlags(node.namedBindings);
    if (phaseModifier === 156 /* TypeKeyword */) {
      node.transformFlags |= 1 /* ContainsTypeScript */;
    }
    node.transformFlags &= ~67108864 /* ContainsPossibleTopLevelAwait */;
    return node;
  }
  function updateImportClause(node, phaseModifier, name, namedBindings) {
    if (typeof phaseModifier === "boolean") {
      phaseModifier = phaseModifier ? 156 /* TypeKeyword */ : void 0;
    }
    return node.phaseModifier !== phaseModifier || node.name !== name || node.namedBindings !== namedBindings ? update(createImportClause2(phaseModifier, name, namedBindings), node) : node;
  }
  function createAssertClause(elements, multiLine) {
    const node = createBaseNode(301 /* AssertClause */);
    node.elements = createNodeArray(elements);
    node.multiLine = multiLine;
    node.token = 132 /* AssertKeyword */;
    node.transformFlags |= 4 /* ContainsESNext */;
    return node;
  }
  function updateAssertClause(node, elements, multiLine) {
    return node.elements !== elements || node.multiLine !== multiLine ? update(createAssertClause(elements, multiLine), node) : node;
  }
  function createAssertEntry(name, value) {
    const node = createBaseNode(302 /* AssertEntry */);
    node.name = name;
    node.value = value;
    node.transformFlags |= 4 /* ContainsESNext */;
    return node;
  }
  function updateAssertEntry(node, name, value) {
    return node.name !== name || node.value !== value ? update(createAssertEntry(name, value), node) : node;
  }
  function createImportTypeAssertionContainer(clause, multiLine) {
    const node = createBaseNode(303 /* ImportTypeAssertionContainer */);
    node.assertClause = clause;
    node.multiLine = multiLine;
    return node;
  }
  function updateImportTypeAssertionContainer(node, clause, multiLine) {
    return node.assertClause !== clause || node.multiLine !== multiLine ? update(createImportTypeAssertionContainer(clause, multiLine), node) : node;
  }
  function createImportAttributes(elements, multiLine, token) {
    const node = createBaseNode(301 /* ImportAttributes */);
    node.token = token ?? 118 /* WithKeyword */;
    node.elements = createNodeArray(elements);
    node.multiLine = multiLine;
    node.transformFlags |= 4 /* ContainsESNext */;
    return node;
  }
  function updateImportAttributes(node, elements, multiLine) {
    return node.elements !== elements || node.multiLine !== multiLine ? update(createImportAttributes(elements, multiLine, node.token), node) : node;
  }
  function createImportAttribute(name, value) {
    const node = createBaseNode(302 /* ImportAttribute */);
    node.name = name;
    node.value = value;
    node.transformFlags |= 4 /* ContainsESNext */;
    return node;
  }
  function updateImportAttribute(node, name, value) {
    return node.name !== name || node.value !== value ? update(createImportAttribute(name, value), node) : node;
  }
  function createNamespaceImport(name) {
    const node = createBaseDeclaration(275 /* NamespaceImport */);
    node.name = name;
    node.transformFlags |= propagateChildFlags(node.name);
    node.transformFlags &= ~67108864 /* ContainsPossibleTopLevelAwait */;
    return node;
  }
  function updateNamespaceImport(node, name) {
    return node.name !== name ? update(createNamespaceImport(name), node) : node;
  }
  function createNamespaceExport(name) {
    const node = createBaseDeclaration(281 /* NamespaceExport */);
    node.name = name;
    node.transformFlags |= propagateChildFlags(node.name) | 32 /* ContainsES2020 */;
    node.transformFlags &= ~67108864 /* ContainsPossibleTopLevelAwait */;
    return node;
  }
  function updateNamespaceExport(node, name) {
    return node.name !== name ? update(createNamespaceExport(name), node) : node;
  }
  function createNamedImports(elements) {
    const node = createBaseNode(276 /* NamedImports */);
    node.elements = createNodeArray(elements);
    node.transformFlags |= propagateChildrenFlags(node.elements);
    node.transformFlags &= ~67108864 /* ContainsPossibleTopLevelAwait */;
    return node;
  }
  function updateNamedImports(node, elements) {
    return node.elements !== elements ? update(createNamedImports(elements), node) : node;
  }
  function createImportSpecifier(isTypeOnly, propertyName, name) {
    const node = createBaseDeclaration(277 /* ImportSpecifier */);
    node.isTypeOnly = isTypeOnly;
    node.propertyName = propertyName;
    node.name = name;
    node.transformFlags |= propagateChildFlags(node.propertyName) | propagateChildFlags(node.name);
    node.transformFlags &= ~67108864 /* ContainsPossibleTopLevelAwait */;
    return node;
  }
  function updateImportSpecifier(node, isTypeOnly, propertyName, name) {
    return node.isTypeOnly !== isTypeOnly || node.propertyName !== propertyName || node.name !== name ? update(createImportSpecifier(isTypeOnly, propertyName, name), node) : node;
  }
  function createExportAssignment2(modifiers, isExportEquals, expression) {
    const node = createBaseDeclaration(278 /* ExportAssignment */);
    node.modifiers = asNodeArray(modifiers);
    node.isExportEquals = isExportEquals;
    node.expression = isExportEquals ? parenthesizerRules().parenthesizeRightSideOfBinary(
      64 /* EqualsToken */,
      /*leftSide*/
      void 0,
      expression
    ) : parenthesizerRules().parenthesizeExpressionOfExportDefault(expression);
    node.transformFlags |= propagateChildrenFlags(node.modifiers) | propagateChildFlags(node.expression);
    node.transformFlags &= ~67108864 /* ContainsPossibleTopLevelAwait */;
    node.jsDoc = void 0;
    return node;
  }
  function updateExportAssignment(node, modifiers, expression) {
    return node.modifiers !== modifiers || node.expression !== expression ? update(createExportAssignment2(modifiers, node.isExportEquals, expression), node) : node;
  }
  function createExportDeclaration(modifiers, isTypeOnly, exportClause, moduleSpecifier, attributes) {
    const node = createBaseDeclaration(279 /* ExportDeclaration */);
    node.modifiers = asNodeArray(modifiers);
    node.isTypeOnly = isTypeOnly;
    node.exportClause = exportClause;
    node.moduleSpecifier = moduleSpecifier;
    node.attributes = node.assertClause = attributes;
    node.transformFlags |= propagateChildrenFlags(node.modifiers) | propagateChildFlags(node.exportClause) | propagateChildFlags(node.moduleSpecifier);
    node.transformFlags &= ~67108864 /* ContainsPossibleTopLevelAwait */;
    node.jsDoc = void 0;
    return node;
  }
  function updateExportDeclaration(node, modifiers, isTypeOnly, exportClause, moduleSpecifier, attributes) {
    return node.modifiers !== modifiers || node.isTypeOnly !== isTypeOnly || node.exportClause !== exportClause || node.moduleSpecifier !== moduleSpecifier || node.attributes !== attributes ? finishUpdateExportDeclaration(createExportDeclaration(modifiers, isTypeOnly, exportClause, moduleSpecifier, attributes), node) : node;
  }
  function finishUpdateExportDeclaration(updated, original) {
    if (updated !== original) {
      if (updated.modifiers === original.modifiers) {
        updated.modifiers = original.modifiers;
      }
    }
    return update(updated, original);
  }
  function createNamedExports(elements) {
    const node = createBaseNode(280 /* NamedExports */);
    node.elements = createNodeArray(elements);
    node.transformFlags |= propagateChildrenFlags(node.elements);
    node.transformFlags &= ~67108864 /* ContainsPossibleTopLevelAwait */;
    return node;
  }
  function updateNamedExports(node, elements) {
    return node.elements !== elements ? update(createNamedExports(elements), node) : node;
  }
  function createExportSpecifier(isTypeOnly, propertyName, name) {
    const node = createBaseNode(282 /* ExportSpecifier */);
    node.isTypeOnly = isTypeOnly;
    node.propertyName = asName(propertyName);
    node.name = asName(name);
    node.transformFlags |= propagateChildFlags(node.propertyName) | propagateChildFlags(node.name);
    node.transformFlags &= ~67108864 /* ContainsPossibleTopLevelAwait */;
    node.jsDoc = void 0;
    return node;
  }
  function updateExportSpecifier(node, isTypeOnly, propertyName, name) {
    return node.isTypeOnly !== isTypeOnly || node.propertyName !== propertyName || node.name !== name ? update(createExportSpecifier(isTypeOnly, propertyName, name), node) : node;
  }
  function createMissingDeclaration() {
    const node = createBaseDeclaration(283 /* MissingDeclaration */);
    node.jsDoc = void 0;
    return node;
  }
  function createExternalModuleReference(expression) {
    const node = createBaseNode(284 /* ExternalModuleReference */);
    node.expression = expression;
    node.transformFlags |= propagateChildFlags(node.expression);
    node.transformFlags &= ~67108864 /* ContainsPossibleTopLevelAwait */;
    return node;
  }
  function updateExternalModuleReference(node, expression) {
    return node.expression !== expression ? update(createExternalModuleReference(expression), node) : node;
  }
  function createJSDocPrimaryTypeWorker(kind) {
    return createBaseNode(kind);
  }
  function createJSDocPrePostfixUnaryTypeWorker(kind, type, postfix = false) {
    const node = createJSDocUnaryTypeWorker(
      kind,
      postfix ? type && parenthesizerRules().parenthesizeNonArrayTypeOfPostfixType(type) : type
    );
    node.postfix = postfix;
    return node;
  }
  function createJSDocUnaryTypeWorker(kind, type) {
    const node = createBaseNode(kind);
    node.type = type;
    return node;
  }
  function updateJSDocPrePostfixUnaryTypeWorker(kind, node, type) {
    return node.type !== type ? update(createJSDocPrePostfixUnaryTypeWorker(kind, type, node.postfix), node) : node;
  }
  function updateJSDocUnaryTypeWorker(kind, node, type) {
    return node.type !== type ? update(createJSDocUnaryTypeWorker(kind, type), node) : node;
  }
  function createJSDocFunctionType(parameters, type) {
    const node = createBaseDeclaration(318 /* JSDocFunctionType */);
    node.parameters = asNodeArray(parameters);
    node.type = type;
    node.transformFlags = propagateChildrenFlags(node.parameters) | (node.type ? 1 /* ContainsTypeScript */ : 0 /* None */);
    node.jsDoc = void 0;
    node.locals = void 0;
    node.nextContainer = void 0;
    node.typeArguments = void 0;
    return node;
  }
  function updateJSDocFunctionType(node, parameters, type) {
    return node.parameters !== parameters || node.type !== type ? update(createJSDocFunctionType(parameters, type), node) : node;
  }
  function createJSDocTypeLiteral(propertyTags, isArrayType = false) {
    const node = createBaseDeclaration(323 /* JSDocTypeLiteral */);
    node.jsDocPropertyTags = asNodeArray(propertyTags);
    node.isArrayType = isArrayType;
    return node;
  }
  function updateJSDocTypeLiteral(node, propertyTags, isArrayType) {
    return node.jsDocPropertyTags !== propertyTags || node.isArrayType !== isArrayType ? update(createJSDocTypeLiteral(propertyTags, isArrayType), node) : node;
  }
  function createJSDocTypeExpression(type) {
    const node = createBaseNode(310 /* JSDocTypeExpression */);
    node.type = type;
    return node;
  }
  function updateJSDocTypeExpression(node, type) {
    return node.type !== type ? update(createJSDocTypeExpression(type), node) : node;
  }
  function createJSDocSignature(typeParameters, parameters, type) {
    const node = createBaseDeclaration(324 /* JSDocSignature */);
    node.typeParameters = asNodeArray(typeParameters);
    node.parameters = createNodeArray(parameters);
    node.type = type;
    node.jsDoc = void 0;
    node.locals = void 0;
    node.nextContainer = void 0;
    return node;
  }
  function updateJSDocSignature(node, typeParameters, parameters, type) {
    return node.typeParameters !== typeParameters || node.parameters !== parameters || node.type !== type ? update(createJSDocSignature(typeParameters, parameters, type), node) : node;
  }
  function getDefaultTagName(node) {
    const defaultTagName = getDefaultTagNameForKind(node.kind);
    return node.tagName.escapedText === escapeLeadingUnderscores(defaultTagName) ? node.tagName : createIdentifier(defaultTagName);
  }
  function createBaseJSDocTag(kind, tagName, comment) {
    const node = createBaseNode(kind);
    node.tagName = tagName;
    node.comment = comment;
    return node;
  }
  function createBaseJSDocTagDeclaration(kind, tagName, comment) {
    const node = createBaseDeclaration(kind);
    node.tagName = tagName;
    node.comment = comment;
    return node;
  }
  function createJSDocTemplateTag(tagName, constraint, typeParameters, comment) {
    const node = createBaseJSDocTag(346 /* JSDocTemplateTag */, tagName ?? createIdentifier("template"), comment);
    node.constraint = constraint;
    node.typeParameters = createNodeArray(typeParameters);
    return node;
  }
  function updateJSDocTemplateTag(node, tagName = getDefaultTagName(node), constraint, typeParameters, comment) {
    return node.tagName !== tagName || node.constraint !== constraint || node.typeParameters !== typeParameters || node.comment !== comment ? update(createJSDocTemplateTag(tagName, constraint, typeParameters, comment), node) : node;
  }
  function createJSDocTypedefTag(tagName, typeExpression, fullName, comment) {
    const node = createBaseJSDocTagDeclaration(347 /* JSDocTypedefTag */, tagName ?? createIdentifier("typedef"), comment);
    node.typeExpression = typeExpression;
    node.fullName = fullName;
    node.name = getJSDocTypeAliasName(fullName);
    node.locals = void 0;
    node.nextContainer = void 0;
    return node;
  }
  function updateJSDocTypedefTag(node, tagName = getDefaultTagName(node), typeExpression, fullName, comment) {
    return node.tagName !== tagName || node.typeExpression !== typeExpression || node.fullName !== fullName || node.comment !== comment ? update(createJSDocTypedefTag(tagName, typeExpression, fullName, comment), node) : node;
  }
  function createJSDocParameterTag(tagName, name, isBracketed, typeExpression, isNameFirst, comment) {
    const node = createBaseJSDocTagDeclaration(342 /* JSDocParameterTag */, tagName ?? createIdentifier("param"), comment);
    node.typeExpression = typeExpression;
    node.name = name;
    node.isNameFirst = !!isNameFirst;
    node.isBracketed = isBracketed;
    return node;
  }
  function updateJSDocParameterTag(node, tagName = getDefaultTagName(node), name, isBracketed, typeExpression, isNameFirst, comment) {
    return node.tagName !== tagName || node.name !== name || node.isBracketed !== isBracketed || node.typeExpression !== typeExpression || node.isNameFirst !== isNameFirst || node.comment !== comment ? update(createJSDocParameterTag(tagName, name, isBracketed, typeExpression, isNameFirst, comment), node) : node;
  }
  function createJSDocPropertyTag(tagName, name, isBracketed, typeExpression, isNameFirst, comment) {
    const node = createBaseJSDocTagDeclaration(349 /* JSDocPropertyTag */, tagName ?? createIdentifier("prop"), comment);
    node.typeExpression = typeExpression;
    node.name = name;
    node.isNameFirst = !!isNameFirst;
    node.isBracketed = isBracketed;
    return node;
  }
  function updateJSDocPropertyTag(node, tagName = getDefaultTagName(node), name, isBracketed, typeExpression, isNameFirst, comment) {
    return node.tagName !== tagName || node.name !== name || node.isBracketed !== isBracketed || node.typeExpression !== typeExpression || node.isNameFirst !== isNameFirst || node.comment !== comment ? update(createJSDocPropertyTag(tagName, name, isBracketed, typeExpression, isNameFirst, comment), node) : node;
  }
  function createJSDocCallbackTag(tagName, typeExpression, fullName, comment) {
    const node = createBaseJSDocTagDeclaration(339 /* JSDocCallbackTag */, tagName ?? createIdentifier("callback"), comment);
    node.typeExpression = typeExpression;
    node.fullName = fullName;
    node.name = getJSDocTypeAliasName(fullName);
    node.locals = void 0;
    node.nextContainer = void 0;
    return node;
  }
  function updateJSDocCallbackTag(node, tagName = getDefaultTagName(node), typeExpression, fullName, comment) {
    return node.tagName !== tagName || node.typeExpression !== typeExpression || node.fullName !== fullName || node.comment !== comment ? update(createJSDocCallbackTag(tagName, typeExpression, fullName, comment), node) : node;
  }
  function createJSDocOverloadTag(tagName, typeExpression, comment) {
    const node = createBaseJSDocTag(340 /* JSDocOverloadTag */, tagName ?? createIdentifier("overload"), comment);
    node.typeExpression = typeExpression;
    return node;
  }
  function updateJSDocOverloadTag(node, tagName = getDefaultTagName(node), typeExpression, comment) {
    return node.tagName !== tagName || node.typeExpression !== typeExpression || node.comment !== comment ? update(createJSDocOverloadTag(tagName, typeExpression, comment), node) : node;
  }
  function createJSDocAugmentsTag(tagName, className, comment) {
    const node = createBaseJSDocTag(329 /* JSDocAugmentsTag */, tagName ?? createIdentifier("augments"), comment);
    node.class = className;
    return node;
  }
  function updateJSDocAugmentsTag(node, tagName = getDefaultTagName(node), className, comment) {
    return node.tagName !== tagName || node.class !== className || node.comment !== comment ? update(createJSDocAugmentsTag(tagName, className, comment), node) : node;
  }
  function createJSDocImplementsTag(tagName, className, comment) {
    const node = createBaseJSDocTag(330 /* JSDocImplementsTag */, tagName ?? createIdentifier("implements"), comment);
    node.class = className;
    return node;
  }
  function createJSDocSeeTag(tagName, name, comment) {
    const node = createBaseJSDocTag(348 /* JSDocSeeTag */, tagName ?? createIdentifier("see"), comment);
    node.name = name;
    return node;
  }
  function updateJSDocSeeTag(node, tagName, name, comment) {
    return node.tagName !== tagName || node.name !== name || node.comment !== comment ? update(createJSDocSeeTag(tagName, name, comment), node) : node;
  }
  function createJSDocNameReference(name) {
    const node = createBaseNode(311 /* JSDocNameReference */);
    node.name = name;
    return node;
  }
  function updateJSDocNameReference(node, name) {
    return node.name !== name ? update(createJSDocNameReference(name), node) : node;
  }
  function createJSDocMemberName(left, right) {
    const node = createBaseNode(312 /* JSDocMemberName */);
    node.left = left;
    node.right = right;
    node.transformFlags |= propagateChildFlags(node.left) | propagateChildFlags(node.right);
    return node;
  }
  function updateJSDocMemberName(node, left, right) {
    return node.left !== left || node.right !== right ? update(createJSDocMemberName(left, right), node) : node;
  }
  function createJSDocLink(name, text) {
    const node = createBaseNode(325 /* JSDocLink */);
    node.name = name;
    node.text = text;
    return node;
  }
  function updateJSDocLink(node, name, text) {
    return node.name !== name ? update(createJSDocLink(name, text), node) : node;
  }
  function createJSDocLinkCode(name, text) {
    const node = createBaseNode(326 /* JSDocLinkCode */);
    node.name = name;
    node.text = text;
    return node;
  }
  function updateJSDocLinkCode(node, name, text) {
    return node.name !== name ? update(createJSDocLinkCode(name, text), node) : node;
  }
  function createJSDocLinkPlain(name, text) {
    const node = createBaseNode(327 /* JSDocLinkPlain */);
    node.name = name;
    node.text = text;
    return node;
  }
  function updateJSDocLinkPlain(node, name, text) {
    return node.name !== name ? update(createJSDocLinkPlain(name, text), node) : node;
  }
  function updateJSDocImplementsTag(node, tagName = getDefaultTagName(node), className, comment) {
    return node.tagName !== tagName || node.class !== className || node.comment !== comment ? update(createJSDocImplementsTag(tagName, className, comment), node) : node;
  }
  function createJSDocSimpleTagWorker(kind, tagName, comment) {
    const node = createBaseJSDocTag(kind, tagName ?? createIdentifier(getDefaultTagNameForKind(kind)), comment);
    return node;
  }
  function updateJSDocSimpleTagWorker(kind, node, tagName = getDefaultTagName(node), comment) {
    return node.tagName !== tagName || node.comment !== comment ? update(createJSDocSimpleTagWorker(kind, tagName, comment), node) : node;
  }
  function createJSDocTypeLikeTagWorker(kind, tagName, typeExpression, comment) {
    const node = createBaseJSDocTag(kind, tagName ?? createIdentifier(getDefaultTagNameForKind(kind)), comment);
    node.typeExpression = typeExpression;
    return node;
  }
  function updateJSDocTypeLikeTagWorker(kind, node, tagName = getDefaultTagName(node), typeExpression, comment) {
    return node.tagName !== tagName || node.typeExpression !== typeExpression || node.comment !== comment ? update(createJSDocTypeLikeTagWorker(kind, tagName, typeExpression, comment), node) : node;
  }
  function createJSDocUnknownTag(tagName, comment) {
    const node = createBaseJSDocTag(328 /* JSDocTag */, tagName, comment);
    return node;
  }
  function updateJSDocUnknownTag(node, tagName, comment) {
    return node.tagName !== tagName || node.comment !== comment ? update(createJSDocUnknownTag(tagName, comment), node) : node;
  }
  function createJSDocEnumTag(tagName, typeExpression, comment) {
    const node = createBaseJSDocTagDeclaration(341 /* JSDocEnumTag */, tagName ?? createIdentifier(getDefaultTagNameForKind(341 /* JSDocEnumTag */)), comment);
    node.typeExpression = typeExpression;
    node.locals = void 0;
    node.nextContainer = void 0;
    return node;
  }
  function updateJSDocEnumTag(node, tagName = getDefaultTagName(node), typeExpression, comment) {
    return node.tagName !== tagName || node.typeExpression !== typeExpression || node.comment !== comment ? update(createJSDocEnumTag(tagName, typeExpression, comment), node) : node;
  }
  function createJSDocImportTag(tagName, importClause, moduleSpecifier, attributes, comment) {
    const node = createBaseJSDocTag(352 /* JSDocImportTag */, tagName ?? createIdentifier("import"), comment);
    node.importClause = importClause;
    node.moduleSpecifier = moduleSpecifier;
    node.attributes = attributes;
    node.comment = comment;
    return node;
  }
  function updateJSDocImportTag(node, tagName, importClause, moduleSpecifier, attributes, comment) {
    return node.tagName !== tagName || node.comment !== comment || node.importClause !== importClause || node.moduleSpecifier !== moduleSpecifier || node.attributes !== attributes ? update(createJSDocImportTag(tagName, importClause, moduleSpecifier, attributes, comment), node) : node;
  }
  function createJSDocText(text) {
    const node = createBaseNode(322 /* JSDocText */);
    node.text = text;
    return node;
  }
  function updateJSDocText(node, text) {
    return node.text !== text ? update(createJSDocText(text), node) : node;
  }
  function createJSDocComment(comment, tags) {
    const node = createBaseNode(321 /* JSDoc */);
    node.comment = comment;
    node.tags = asNodeArray(tags);
    return node;
  }
  function updateJSDocComment(node, comment, tags) {
    return node.comment !== comment || node.tags !== tags ? update(createJSDocComment(comment, tags), node) : node;
  }
  function createJsxElement(openingElement, children, closingElement) {
    const node = createBaseNode(285 /* JsxElement */);
    node.openingElement = openingElement;
    node.children = createNodeArray(children);
    node.closingElement = closingElement;
    node.transformFlags |= propagateChildFlags(node.openingElement) | propagateChildrenFlags(node.children) | propagateChildFlags(node.closingElement) | 2 /* ContainsJsx */;
    return node;
  }
  function updateJsxElement(node, openingElement, children, closingElement) {
    return node.openingElement !== openingElement || node.children !== children || node.closingElement !== closingElement ? update(createJsxElement(openingElement, children, closingElement), node) : node;
  }
  function createJsxSelfClosingElement(tagName, typeArguments, attributes) {
    const node = createBaseNode(286 /* JsxSelfClosingElement */);
    node.tagName = tagName;
    node.typeArguments = asNodeArray(typeArguments);
    node.attributes = attributes;
    node.transformFlags |= propagateChildFlags(node.tagName) | propagateChildrenFlags(node.typeArguments) | propagateChildFlags(node.attributes) | 2 /* ContainsJsx */;
    if (node.typeArguments) {
      node.transformFlags |= 1 /* ContainsTypeScript */;
    }
    return node;
  }
  function updateJsxSelfClosingElement(node, tagName, typeArguments, attributes) {
    return node.tagName !== tagName || node.typeArguments !== typeArguments || node.attributes !== attributes ? update(createJsxSelfClosingElement(tagName, typeArguments, attributes), node) : node;
  }
  function createJsxOpeningElement(tagName, typeArguments, attributes) {
    const node = createBaseNode(287 /* JsxOpeningElement */);
    node.tagName = tagName;
    node.typeArguments = asNodeArray(typeArguments);
    node.attributes = attributes;
    node.transformFlags |= propagateChildFlags(node.tagName) | propagateChildrenFlags(node.typeArguments) | propagateChildFlags(node.attributes) | 2 /* ContainsJsx */;
    if (typeArguments) {
      node.transformFlags |= 1 /* ContainsTypeScript */;
    }
    return node;
  }
  function updateJsxOpeningElement(node, tagName, typeArguments, attributes) {
    return node.tagName !== tagName || node.typeArguments !== typeArguments || node.attributes !== attributes ? update(createJsxOpeningElement(tagName, typeArguments, attributes), node) : node;
  }
  function createJsxClosingElement(tagName) {
    const node = createBaseNode(288 /* JsxClosingElement */);
    node.tagName = tagName;
    node.transformFlags |= propagateChildFlags(node.tagName) | 2 /* ContainsJsx */;
    return node;
  }
  function updateJsxClosingElement(node, tagName) {
    return node.tagName !== tagName ? update(createJsxClosingElement(tagName), node) : node;
  }
  function createJsxFragment(openingFragment, children, closingFragment) {
    const node = createBaseNode(289 /* JsxFragment */);
    node.openingFragment = openingFragment;
    node.children = createNodeArray(children);
    node.closingFragment = closingFragment;
    node.transformFlags |= propagateChildFlags(node.openingFragment) | propagateChildrenFlags(node.children) | propagateChildFlags(node.closingFragment) | 2 /* ContainsJsx */;
    return node;
  }
  function updateJsxFragment(node, openingFragment, children, closingFragment) {
    return node.openingFragment !== openingFragment || node.children !== children || node.closingFragment !== closingFragment ? update(createJsxFragment(openingFragment, children, closingFragment), node) : node;
  }
  function createJsxText(text, containsOnlyTriviaWhiteSpaces) {
    const node = createBaseNode(12 /* JsxText */);
    node.text = text;
    node.containsOnlyTriviaWhiteSpaces = !!containsOnlyTriviaWhiteSpaces;
    node.transformFlags |= 2 /* ContainsJsx */;
    return node;
  }
  function updateJsxText(node, text, containsOnlyTriviaWhiteSpaces) {
    return node.text !== text || node.containsOnlyTriviaWhiteSpaces !== containsOnlyTriviaWhiteSpaces ? update(createJsxText(text, containsOnlyTriviaWhiteSpaces), node) : node;
  }
  function createJsxOpeningFragment() {
    const node = createBaseNode(290 /* JsxOpeningFragment */);
    node.transformFlags |= 2 /* ContainsJsx */;
    return node;
  }
  function createJsxJsxClosingFragment() {
    const node = createBaseNode(291 /* JsxClosingFragment */);
    node.transformFlags |= 2 /* ContainsJsx */;
    return node;
  }
  function createJsxAttribute(name, initializer) {
    const node = createBaseDeclaration(292 /* JsxAttribute */);
    node.name = name;
    node.initializer = initializer;
    node.transformFlags |= propagateChildFlags(node.name) | propagateChildFlags(node.initializer) | 2 /* ContainsJsx */;
    return node;
  }
  function updateJsxAttribute(node, name, initializer) {
    return node.name !== name || node.initializer !== initializer ? update(createJsxAttribute(name, initializer), node) : node;
  }
  function createJsxAttributes(properties) {
    const node = createBaseDeclaration(293 /* JsxAttributes */);
    node.properties = createNodeArray(properties);
    node.transformFlags |= propagateChildrenFlags(node.properties) | 2 /* ContainsJsx */;
    return node;
  }
  function updateJsxAttributes(node, properties) {
    return node.properties !== properties ? update(createJsxAttributes(properties), node) : node;
  }
  function createJsxSpreadAttribute(expression) {
    const node = createBaseNode(294 /* JsxSpreadAttribute */);
    node.expression = expression;
    node.transformFlags |= propagateChildFlags(node.expression) | 2 /* ContainsJsx */;
    return node;
  }
  function updateJsxSpreadAttribute(node, expression) {
    return node.expression !== expression ? update(createJsxSpreadAttribute(expression), node) : node;
  }
  function createJsxExpression(dotDotDotToken, expression) {
    const node = createBaseNode(295 /* JsxExpression */);
    node.dotDotDotToken = dotDotDotToken;
    node.expression = expression;
    node.transformFlags |= propagateChildFlags(node.dotDotDotToken) | propagateChildFlags(node.expression) | 2 /* ContainsJsx */;
    return node;
  }
  function updateJsxExpression(node, expression) {
    return node.expression !== expression ? update(createJsxExpression(node.dotDotDotToken, expression), node) : node;
  }
  function createJsxNamespacedName(namespace, name) {
    const node = createBaseNode(296 /* JsxNamespacedName */);
    node.namespace = namespace;
    node.name = name;
    node.transformFlags |= propagateChildFlags(node.namespace) | propagateChildFlags(node.name) | 2 /* ContainsJsx */;
    return node;
  }
  function updateJsxNamespacedName(node, namespace, name) {
    return node.namespace !== namespace || node.name !== name ? update(createJsxNamespacedName(namespace, name), node) : node;
  }
  function createCaseClause(expression, statements) {
    const node = createBaseNode(297 /* CaseClause */);
    node.expression = parenthesizerRules().parenthesizeExpressionForDisallowedComma(expression);
    node.statements = createNodeArray(statements);
    node.transformFlags |= propagateChildFlags(node.expression) | propagateChildrenFlags(node.statements);
    node.jsDoc = void 0;
    return node;
  }
  function updateCaseClause(node, expression, statements) {
    return node.expression !== expression || node.statements !== statements ? update(createCaseClause(expression, statements), node) : node;
  }
  function createDefaultClause(statements) {
    const node = createBaseNode(298 /* DefaultClause */);
    node.statements = createNodeArray(statements);
    node.transformFlags = propagateChildrenFlags(node.statements);
    return node;
  }
  function updateDefaultClause(node, statements) {
    return node.statements !== statements ? update(createDefaultClause(statements), node) : node;
  }
  function createHeritageClause(token, types) {
    const node = createBaseNode(299 /* HeritageClause */);
    node.token = token;
    node.types = createNodeArray(types);
    node.transformFlags |= propagateChildrenFlags(node.types);
    switch (token) {
      case 96 /* ExtendsKeyword */:
        node.transformFlags |= 1024 /* ContainsES2015 */;
        break;
      case 119 /* ImplementsKeyword */:
        node.transformFlags |= 1 /* ContainsTypeScript */;
        break;
      default:
        return Debug.assertNever(token);
    }
    return node;
  }
  function updateHeritageClause(node, types) {
    return node.types !== types ? update(createHeritageClause(node.token, types), node) : node;
  }
  function createCatchClause(variableDeclaration, block) {
    const node = createBaseNode(300 /* CatchClause */);
    node.variableDeclaration = asVariableDeclaration(variableDeclaration);
    node.block = block;
    node.transformFlags |= propagateChildFlags(node.variableDeclaration) | propagateChildFlags(node.block) | (!variableDeclaration ? 64 /* ContainsES2019 */ : 0 /* None */);
    node.locals = void 0;
    node.nextContainer = void 0;
    return node;
  }
  function updateCatchClause(node, variableDeclaration, block) {
    return node.variableDeclaration !== variableDeclaration || node.block !== block ? update(createCatchClause(variableDeclaration, block), node) : node;
  }
  function createPropertyAssignment(name, initializer) {
    const node = createBaseDeclaration(304 /* PropertyAssignment */);
    node.name = asName(name);
    node.initializer = parenthesizerRules().parenthesizeExpressionForDisallowedComma(initializer);
    node.transformFlags |= propagateNameFlags(node.name) | propagateChildFlags(node.initializer);
    node.modifiers = void 0;
    node.questionToken = void 0;
    node.exclamationToken = void 0;
    node.jsDoc = void 0;
    return node;
  }
  function updatePropertyAssignment(node, name, initializer) {
    return node.name !== name || node.initializer !== initializer ? finishUpdatePropertyAssignment(createPropertyAssignment(name, initializer), node) : node;
  }
  function finishUpdatePropertyAssignment(updated, original) {
    if (updated !== original) {
      updated.modifiers = original.modifiers;
      updated.questionToken = original.questionToken;
      updated.exclamationToken = original.exclamationToken;
    }
    return update(updated, original);
  }
  function createShorthandPropertyAssignment(name, objectAssignmentInitializer) {
    const node = createBaseDeclaration(305 /* ShorthandPropertyAssignment */);
    node.name = asName(name);
    node.objectAssignmentInitializer = objectAssignmentInitializer && parenthesizerRules().parenthesizeExpressionForDisallowedComma(objectAssignmentInitializer);
    node.transformFlags |= propagateIdentifierNameFlags(node.name) | propagateChildFlags(node.objectAssignmentInitializer) | 1024 /* ContainsES2015 */;
    node.equalsToken = void 0;
    node.modifiers = void 0;
    node.questionToken = void 0;
    node.exclamationToken = void 0;
    node.jsDoc = void 0;
    return node;
  }
  function updateShorthandPropertyAssignment(node, name, objectAssignmentInitializer) {
    return node.name !== name || node.objectAssignmentInitializer !== objectAssignmentInitializer ? finishUpdateShorthandPropertyAssignment(createShorthandPropertyAssignment(name, objectAssignmentInitializer), node) : node;
  }
  function finishUpdateShorthandPropertyAssignment(updated, original) {
    if (updated !== original) {
      updated.modifiers = original.modifiers;
      updated.questionToken = original.questionToken;
      updated.exclamationToken = original.exclamationToken;
      updated.equalsToken = original.equalsToken;
    }
    return update(updated, original);
  }
  function createSpreadAssignment(expression) {
    const node = createBaseDeclaration(306 /* SpreadAssignment */);
    node.expression = parenthesizerRules().parenthesizeExpressionForDisallowedComma(expression);
    node.transformFlags |= propagateChildFlags(node.expression) | 128 /* ContainsES2018 */ | 65536 /* ContainsObjectRestOrSpread */;
    node.jsDoc = void 0;
    return node;
  }
  function updateSpreadAssignment(node, expression) {
    return node.expression !== expression ? update(createSpreadAssignment(expression), node) : node;
  }
  function createEnumMember(name, initializer) {
    const node = createBaseDeclaration(307 /* EnumMember */);
    node.name = asName(name);
    node.initializer = initializer && parenthesizerRules().parenthesizeExpressionForDisallowedComma(initializer);
    node.transformFlags |= propagateChildFlags(node.name) | propagateChildFlags(node.initializer) | 1 /* ContainsTypeScript */;
    node.jsDoc = void 0;
    return node;
  }
  function updateEnumMember(node, name, initializer) {
    return node.name !== name || node.initializer !== initializer ? update(createEnumMember(name, initializer), node) : node;
  }
  function createSourceFile2(statements, endOfFileToken, flags2) {
    const node = baseFactory2.createBaseSourceFileNode(308 /* SourceFile */);
    node.statements = createNodeArray(statements);
    node.endOfFileToken = endOfFileToken;
    node.flags |= flags2;
    node.text = "";
    node.fileName = "";
    node.path = "";
    node.resolvedPath = "";
    node.originalFileName = "";
    node.languageVersion = 12 /* LatestStandard */;
    node.languageVariant = 0;
    node.scriptKind = 0;
    node.isDeclarationFile = false;
    node.hasNoDefaultLib = false;
    node.transformFlags |= propagateChildrenFlags(node.statements) | propagateChildFlags(node.endOfFileToken);
    node.locals = void 0;
    node.nextContainer = void 0;
    node.endFlowNode = void 0;
    node.nodeCount = 0;
    node.identifierCount = 0;
    node.symbolCount = 0;
    node.parseDiagnostics = void 0;
    node.bindDiagnostics = void 0;
    node.bindSuggestionDiagnostics = void 0;
    node.lineMap = void 0;
    node.externalModuleIndicator = void 0;
    node.setExternalModuleIndicator = void 0;
    node.pragmas = void 0;
    node.checkJsDirective = void 0;
    node.referencedFiles = void 0;
    node.typeReferenceDirectives = void 0;
    node.libReferenceDirectives = void 0;
    node.amdDependencies = void 0;
    node.commentDirectives = void 0;
    node.identifiers = void 0;
    node.packageJsonLocations = void 0;
    node.packageJsonScope = void 0;
    node.imports = void 0;
    node.moduleAugmentations = void 0;
    node.ambientModuleNames = void 0;
    node.classifiableNames = void 0;
    node.impliedNodeFormat = void 0;
    return node;
  }
  function createRedirectedSourceFile(redirectInfo) {
    const node = Object.create(redirectInfo.redirectTarget);
    Object.defineProperties(node, {
      id: {
        get() {
          return this.redirectInfo.redirectTarget.id;
        },
        set(value) {
          this.redirectInfo.redirectTarget.id = value;
        }
      },
      symbol: {
        get() {
          return this.redirectInfo.redirectTarget.symbol;
        },
        set(value) {
          this.redirectInfo.redirectTarget.symbol = value;
        }
      }
    });
    node.redirectInfo = redirectInfo;
    return node;
  }
  function cloneRedirectedSourceFile(source) {
    const node = createRedirectedSourceFile(source.redirectInfo);
    node.flags |= source.flags & ~16 /* Synthesized */;
    node.fileName = source.fileName;
    node.path = source.path;
    node.resolvedPath = source.resolvedPath;
    node.originalFileName = source.originalFileName;
    node.packageJsonLocations = source.packageJsonLocations;
    node.packageJsonScope = source.packageJsonScope;
    node.emitNode = void 0;
    return node;
  }
  function cloneSourceFileWorker(source) {
    const node = baseFactory2.createBaseSourceFileNode(308 /* SourceFile */);
    node.flags |= source.flags & ~16 /* Synthesized */;
    for (const p in source) {
      if (hasProperty(node, p) || !hasProperty(source, p)) {
        continue;
      }
      if (p === "emitNode") {
        node.emitNode = void 0;
        continue;
      }
      node[p] = source[p];
    }
    return node;
  }
  function cloneSourceFile(source) {
    const node = source.redirectInfo ? cloneRedirectedSourceFile(source) : cloneSourceFileWorker(source);
    setOriginal(node, source);
    return node;
  }
  function cloneSourceFileWithChanges(source, statements, isDeclarationFile, referencedFiles, typeReferences, hasNoDefaultLib, libReferences) {
    const node = cloneSourceFile(source);
    node.statements = createNodeArray(statements);
    node.isDeclarationFile = isDeclarationFile;
    node.referencedFiles = referencedFiles;
    node.typeReferenceDirectives = typeReferences;
    node.hasNoDefaultLib = hasNoDefaultLib;
    node.libReferenceDirectives = libReferences;
    node.transformFlags = propagateChildrenFlags(node.statements) | propagateChildFlags(node.endOfFileToken);
    return node;
  }
  function updateSourceFile2(node, statements, isDeclarationFile = node.isDeclarationFile, referencedFiles = node.referencedFiles, typeReferenceDirectives = node.typeReferenceDirectives, _hasNoDefaultLib = false, libReferenceDirectives = node.libReferenceDirectives) {
    return node.statements !== statements || node.isDeclarationFile !== isDeclarationFile || node.referencedFiles !== referencedFiles || node.typeReferenceDirectives !== typeReferenceDirectives || node.libReferenceDirectives !== libReferenceDirectives ? update(cloneSourceFileWithChanges(
      node,
      statements,
      isDeclarationFile,
      referencedFiles,
      typeReferenceDirectives,
      /*hasNoDefaultLib*/
      false,
      libReferenceDirectives
    ), node) : node;
  }
  function createBundle(sourceFiles) {
    const node = createBaseNode(309 /* Bundle */);
    node.sourceFiles = sourceFiles;
    node.syntheticFileReferences = void 0;
    node.syntheticTypeReferences = void 0;
    node.syntheticLibReferences = void 0;
    return node;
  }
  function updateBundle(node, sourceFiles) {
    return node.sourceFiles !== sourceFiles ? update(createBundle(sourceFiles), node) : node;
  }
  function createSyntheticExpression(type, isSpread = false, tupleNameSource) {
    const node = createBaseNode(238 /* SyntheticExpression */);
    node.type = type;
    node.isSpread = isSpread;
    node.tupleNameSource = tupleNameSource;
    return node;
  }
  function createSyntaxList3(children) {
    const node = createBaseNode(353 /* SyntaxList */);
    node._children = children;
    return node;
  }
  function createNotEmittedStatement(original) {
    const node = createBaseNode(354 /* NotEmittedStatement */);
    node.original = original;
    setTextRange(node, original);
    return node;
  }
  function createPartiallyEmittedExpression(expression, original) {
    const node = createBaseNode(356 /* PartiallyEmittedExpression */);
    node.expression = expression;
    node.original = original;
    node.transformFlags |= propagateChildFlags(node.expression) | 1 /* ContainsTypeScript */;
    setTextRange(node, original);
    return node;
  }
  function updatePartiallyEmittedExpression(node, expression) {
    return node.expression !== expression ? update(createPartiallyEmittedExpression(expression, node.original), node) : node;
  }
  function createNotEmittedTypeElement() {
    return createBaseNode(355 /* NotEmittedTypeElement */);
  }
  function flattenCommaElements(node) {
    if (nodeIsSynthesized(node) && !isParseTreeNode(node) && !node.original && !node.emitNode && !node.id) {
      if (isCommaListExpression(node)) {
        return node.elements;
      }
      if (isBinaryExpression(node) && isCommaToken(node.operatorToken)) {
        return [node.left, node.right];
      }
    }
    return node;
  }
  function createCommaListExpression(elements) {
    const node = createBaseNode(357 /* CommaListExpression */);
    node.elements = createNodeArray(sameFlatMap(elements, flattenCommaElements));
    node.transformFlags |= propagateChildrenFlags(node.elements);
    return node;
  }
  function updateCommaListExpression(node, elements) {
    return node.elements !== elements ? update(createCommaListExpression(elements), node) : node;
  }
  function createSyntheticReferenceExpression(expression, thisArg) {
    const node = createBaseNode(358 /* SyntheticReferenceExpression */);
    node.expression = expression;
    node.thisArg = thisArg;
    node.transformFlags |= propagateChildFlags(node.expression) | propagateChildFlags(node.thisArg);
    return node;
  }
  function updateSyntheticReferenceExpression(node, expression, thisArg) {
    return node.expression !== expression || node.thisArg !== thisArg ? update(createSyntheticReferenceExpression(expression, thisArg), node) : node;
  }
  function cloneGeneratedIdentifier(node) {
    const clone2 = createBaseIdentifier(node.escapedText);
    clone2.flags |= node.flags & ~16 /* Synthesized */;
    clone2.transformFlags = node.transformFlags;
    setOriginal(clone2, node);
    setIdentifierAutoGenerate(clone2, { ...node.emitNode.autoGenerate });
    return clone2;
  }
  function cloneIdentifier(node) {
    const clone2 = createBaseIdentifier(node.escapedText);
    clone2.flags |= node.flags & ~16 /* Synthesized */;
    clone2.jsDoc = node.jsDoc;
    clone2.flowNode = node.flowNode;
    clone2.symbol = node.symbol;
    clone2.transformFlags = node.transformFlags;
    setOriginal(clone2, node);
    const typeArguments = getIdentifierTypeArguments(node);
    if (typeArguments) setIdentifierTypeArguments(clone2, typeArguments);
    return clone2;
  }
  function cloneGeneratedPrivateIdentifier(node) {
    const clone2 = createBasePrivateIdentifier(node.escapedText);
    clone2.flags |= node.flags & ~16 /* Synthesized */;
    clone2.transformFlags = node.transformFlags;
    setOriginal(clone2, node);
    setIdentifierAutoGenerate(clone2, { ...node.emitNode.autoGenerate });
    return clone2;
  }
  function clonePrivateIdentifier(node) {
    const clone2 = createBasePrivateIdentifier(node.escapedText);
    clone2.flags |= node.flags & ~16 /* Synthesized */;
    clone2.transformFlags = node.transformFlags;
    setOriginal(clone2, node);
    return clone2;
  }
  function cloneNode(node) {
    if (node === void 0) {
      return node;
    }
    if (isSourceFile(node)) {
      return cloneSourceFile(node);
    }
    if (isGeneratedIdentifier(node)) {
      return cloneGeneratedIdentifier(node);
    }
    if (isIdentifier(node)) {
      return cloneIdentifier(node);
    }
    if (isGeneratedPrivateIdentifier(node)) {
      return cloneGeneratedPrivateIdentifier(node);
    }
    if (isPrivateIdentifier(node)) {
      return clonePrivateIdentifier(node);
    }
    const clone2 = !isNodeKind(node.kind) ? baseFactory2.createBaseTokenNode(node.kind) : baseFactory2.createBaseNode(node.kind);
    clone2.flags |= node.flags & ~16 /* Synthesized */;
    clone2.transformFlags = node.transformFlags;
    setOriginal(clone2, node);
    for (const key in node) {
      if (hasProperty(clone2, key) || !hasProperty(node, key)) {
        continue;
      }
      clone2[key] = node[key];
    }
    return clone2;
  }
  function createImmediatelyInvokedFunctionExpression(statements, param, paramValue) {
    return createCallExpression(
      createFunctionExpression(
        /*modifiers*/
        void 0,
        /*asteriskToken*/
        void 0,
        /*name*/
        void 0,
        /*typeParameters*/
        void 0,
        /*parameters*/
        param ? [param] : [],
        /*type*/
        void 0,
        createBlock(
          statements,
          /*multiLine*/
          true
        )
      ),
      /*typeArguments*/
      void 0,
      /*argumentsArray*/
      paramValue ? [paramValue] : []
    );
  }
  function createImmediatelyInvokedArrowFunction(statements, param, paramValue) {
    return createCallExpression(
      createArrowFunction(
        /*modifiers*/
        void 0,
        /*typeParameters*/
        void 0,
        /*parameters*/
        param ? [param] : [],
        /*type*/
        void 0,
        /*equalsGreaterThanToken*/
        void 0,
        createBlock(
          statements,
          /*multiLine*/
          true
        )
      ),
      /*typeArguments*/
      void 0,
      /*argumentsArray*/
      paramValue ? [paramValue] : []
    );
  }
  function createVoidZero() {
    return createVoidExpression(createNumericLiteral("0"));
  }
  function createExportDefault(expression) {
    return createExportAssignment2(
      /*modifiers*/
      void 0,
      /*isExportEquals*/
      false,
      expression
    );
  }
  function createExternalModuleExport(exportName) {
    return createExportDeclaration(
      /*modifiers*/
      void 0,
      /*isTypeOnly*/
      false,
      createNamedExports([
        createExportSpecifier(
          /*isTypeOnly*/
          false,
          /*propertyName*/
          void 0,
          exportName
        )
      ])
    );
  }
  function createTypeCheck(value, tag) {
    return tag === "null" ? factory2.createStrictEquality(value, createNull()) : tag === "undefined" ? factory2.createStrictEquality(value, createVoidZero()) : factory2.createStrictEquality(createTypeOfExpression(value), createStringLiteral(tag));
  }
  function createIsNotTypeCheck(value, tag) {
    return tag === "null" ? factory2.createStrictInequality(value, createNull()) : tag === "undefined" ? factory2.createStrictInequality(value, createVoidZero()) : factory2.createStrictInequality(createTypeOfExpression(value), createStringLiteral(tag));
  }
  function createMethodCall(object, methodName, argumentsList) {
    if (isCallChain(object)) {
      return createCallChain(
        createPropertyAccessChain(
          object,
          /*questionDotToken*/
          void 0,
          methodName
        ),
        /*questionDotToken*/
        void 0,
        /*typeArguments*/
        void 0,
        argumentsList
      );
    }
    return createCallExpression(
      createPropertyAccessExpression(object, methodName),
      /*typeArguments*/
      void 0,
      argumentsList
    );
  }
  function createFunctionBindCall(target, thisArg, argumentsList) {
    return createMethodCall(target, "bind", [thisArg, ...argumentsList]);
  }
  function createFunctionCallCall(target, thisArg, argumentsList) {
    return createMethodCall(target, "call", [thisArg, ...argumentsList]);
  }
  function createFunctionApplyCall(target, thisArg, argumentsExpression) {
    return createMethodCall(target, "apply", [thisArg, argumentsExpression]);
  }
  function createGlobalMethodCall(globalObjectName, methodName, argumentsList) {
    return createMethodCall(createIdentifier(globalObjectName), methodName, argumentsList);
  }
  function createArraySliceCall(array, start) {
    return createMethodCall(array, "slice", start === void 0 ? [] : [asExpression(start)]);
  }
  function createArrayConcatCall(array, argumentsList) {
    return createMethodCall(array, "concat", argumentsList);
  }
  function createObjectDefinePropertyCall(target, propertyName, attributes) {
    return createGlobalMethodCall("Object", "defineProperty", [target, asExpression(propertyName), attributes]);
  }
  function createObjectGetOwnPropertyDescriptorCall(target, propertyName) {
    return createGlobalMethodCall("Object", "getOwnPropertyDescriptor", [target, asExpression(propertyName)]);
  }
  function createReflectGetCall(target, propertyKey, receiver) {
    return createGlobalMethodCall("Reflect", "get", receiver ? [target, propertyKey, receiver] : [target, propertyKey]);
  }
  function createReflectSetCall(target, propertyKey, value, receiver) {
    return createGlobalMethodCall("Reflect", "set", receiver ? [target, propertyKey, value, receiver] : [target, propertyKey, value]);
  }
  function tryAddPropertyAssignment(properties, propertyName, expression) {
    if (expression) {
      properties.push(createPropertyAssignment(propertyName, expression));
      return true;
    }
    return false;
  }
  function createPropertyDescriptor(attributes, singleLine) {
    const properties = [];
    tryAddPropertyAssignment(properties, "enumerable", asExpression(attributes.enumerable));
    tryAddPropertyAssignment(properties, "configurable", asExpression(attributes.configurable));
    let isData = tryAddPropertyAssignment(properties, "writable", asExpression(attributes.writable));
    isData = tryAddPropertyAssignment(properties, "value", attributes.value) || isData;
    let isAccessor2 = tryAddPropertyAssignment(properties, "get", attributes.get);
    isAccessor2 = tryAddPropertyAssignment(properties, "set", attributes.set) || isAccessor2;
    Debug.assert(!(isData && isAccessor2), "A PropertyDescriptor may not be both an accessor descriptor and a data descriptor.");
    return createObjectLiteralExpression(properties, !singleLine);
  }
  function updateOuterExpression(outerExpression, expression) {
    switch (outerExpression.kind) {
      case 218 /* ParenthesizedExpression */:
        return updateParenthesizedExpression(outerExpression, expression);
      case 217 /* TypeAssertionExpression */:
        return updateTypeAssertion(outerExpression, outerExpression.type, expression);
      case 235 /* AsExpression */:
        return updateAsExpression(outerExpression, expression, outerExpression.type);
      case 239 /* SatisfiesExpression */:
        return updateSatisfiesExpression(outerExpression, expression, outerExpression.type);
      case 236 /* NonNullExpression */:
        return updateNonNullExpression(outerExpression, expression);
      case 234 /* ExpressionWithTypeArguments */:
        return updateExpressionWithTypeArguments(outerExpression, expression, outerExpression.typeArguments);
      case 356 /* PartiallyEmittedExpression */:
        return updatePartiallyEmittedExpression(outerExpression, expression);
    }
  }
  function isIgnorableParen(node) {
    return isParenthesizedExpression(node) && nodeIsSynthesized(node) && nodeIsSynthesized(getSourceMapRange(node)) && nodeIsSynthesized(getCommentRange(node)) && !some(getSyntheticLeadingComments(node)) && !some(getSyntheticTrailingComments(node));
  }
  function restoreOuterExpressions(outerExpression, innerExpression, kinds = 63 /* All */) {
    if (outerExpression && isOuterExpression(outerExpression, kinds) && !isIgnorableParen(outerExpression)) {
      return updateOuterExpression(
        outerExpression,
        restoreOuterExpressions(outerExpression.expression, innerExpression)
      );
    }
    return innerExpression;
  }
  function restoreEnclosingLabel(node, outermostLabeledStatement, afterRestoreLabelCallback) {
    if (!outermostLabeledStatement) {
      return node;
    }
    const updated = updateLabeledStatement(
      outermostLabeledStatement,
      outermostLabeledStatement.label,
      isLabeledStatement(outermostLabeledStatement.statement) ? restoreEnclosingLabel(node, outermostLabeledStatement.statement) : node
    );
    if (afterRestoreLabelCallback) {
      afterRestoreLabelCallback(outermostLabeledStatement);
    }
    return updated;
  }
  function shouldBeCapturedInTempVariable(node, cacheIdentifiers) {
    const target = skipParentheses(node);
    switch (target.kind) {
      case 80 /* Identifier */:
        return cacheIdentifiers;
      case 110 /* ThisKeyword */:
      case 9 /* NumericLiteral */:
      case 10 /* BigIntLiteral */:
      case 11 /* StringLiteral */:
        return false;
      case 210 /* ArrayLiteralExpression */:
        const elements = target.elements;
        if (elements.length === 0) {
          return false;
        }
        return true;
      case 211 /* ObjectLiteralExpression */:
        return target.properties.length > 0;
      default:
        return true;
    }
  }
  function createCallBinding(expression, recordTempVariable, languageVersion, cacheIdentifiers = false) {
    const callee = skipOuterExpressions(expression, 63 /* All */);
    let thisArg;
    let target;
    if (isSuperProperty(callee)) {
      thisArg = createThis();
      target = callee;
    } else if (isSuperKeyword(callee)) {
      thisArg = createThis();
      target = languageVersion !== void 0 && languageVersion < 2 /* ES2015 */ ? setTextRange(createIdentifier("_super"), callee) : callee;
    } else if (getEmitFlags(callee) & 8192 /* HelperName */) {
      thisArg = createVoidZero();
      target = parenthesizerRules().parenthesizeLeftSideOfAccess(
        callee,
        /*optionalChain*/
        false
      );
    } else if (isPropertyAccessExpression(callee)) {
      if (shouldBeCapturedInTempVariable(callee.expression, cacheIdentifiers)) {
        thisArg = createTempVariable(recordTempVariable);
        target = createPropertyAccessExpression(
          setTextRange(
            factory2.createAssignment(
              thisArg,
              callee.expression
            ),
            callee.expression
          ),
          callee.name
        );
        setTextRange(target, callee);
      } else {
        thisArg = callee.expression;
        target = callee;
      }
    } else if (isElementAccessExpression(callee)) {
      if (shouldBeCapturedInTempVariable(callee.expression, cacheIdentifiers)) {
        thisArg = createTempVariable(recordTempVariable);
        target = createElementAccessExpression(
          setTextRange(
            factory2.createAssignment(
              thisArg,
              callee.expression
            ),
            callee.expression
          ),
          callee.argumentExpression
        );
        setTextRange(target, callee);
      } else {
        thisArg = callee.expression;
        target = callee;
      }
    } else {
      thisArg = createVoidZero();
      target = parenthesizerRules().parenthesizeLeftSideOfAccess(
        expression,
        /*optionalChain*/
        false
      );
    }
    return { target, thisArg };
  }
  function createAssignmentTargetWrapper(paramName, expression) {
    return createPropertyAccessExpression(
      // Explicit parens required because of v8 regression (https://bugs.chromium.org/p/v8/issues/detail?id=9560)
      createParenthesizedExpression(
        createObjectLiteralExpression([
          createSetAccessorDeclaration(
            /*modifiers*/
            void 0,
            "value",
            [createParameterDeclaration(
              /*modifiers*/
              void 0,
              /*dotDotDotToken*/
              void 0,
              paramName,
              /*questionToken*/
              void 0,
              /*type*/
              void 0,
              /*initializer*/
              void 0
            )],
            createBlock([
              createExpressionStatement(expression)
            ])
          )
        ])
      ),
      "value"
    );
  }
  function inlineExpressions(expressions) {
    return expressions.length > 10 ? createCommaListExpression(expressions) : reduceLeft(expressions, factory2.createComma);
  }
  function getName(node, allowComments, allowSourceMaps, emitFlags = 0, ignoreAssignedName) {
    const nodeName = ignoreAssignedName ? node && getNonAssignedNameOfDeclaration(node) : getNameOfDeclaration(node);
    if (nodeName && isIdentifier(nodeName) && !isGeneratedIdentifier(nodeName)) {
      const name = setParent(setTextRange(cloneNode(nodeName), nodeName), nodeName.parent);
      emitFlags |= getEmitFlags(nodeName);
      if (!allowSourceMaps) emitFlags |= 96 /* NoSourceMap */;
      if (!allowComments) emitFlags |= 3072 /* NoComments */;
      if (emitFlags) setEmitFlags(name, emitFlags);
      return name;
    }
    return getGeneratedNameForNode(node);
  }
  function getInternalName(node, allowComments, allowSourceMaps) {
    return getName(node, allowComments, allowSourceMaps, 32768 /* LocalName */ | 65536 /* InternalName */);
  }
  function getLocalName(node, allowComments, allowSourceMaps, ignoreAssignedName) {
    return getName(node, allowComments, allowSourceMaps, 32768 /* LocalName */, ignoreAssignedName);
  }
  function getExportName(node, allowComments, allowSourceMaps) {
    return getName(node, allowComments, allowSourceMaps, 16384 /* ExportName */);
  }
  function getDeclarationName(node, allowComments, allowSourceMaps) {
    return getName(node, allowComments, allowSourceMaps);
  }
  function getNamespaceMemberName(ns, name, allowComments, allowSourceMaps) {
    const qualifiedName = createPropertyAccessExpression(ns, nodeIsSynthesized(name) ? name : cloneNode(name));
    setTextRange(qualifiedName, name);
    let emitFlags = 0;
    if (!allowSourceMaps) emitFlags |= 96 /* NoSourceMap */;
    if (!allowComments) emitFlags |= 3072 /* NoComments */;
    if (emitFlags) setEmitFlags(qualifiedName, emitFlags);
    return qualifiedName;
  }
  function getExternalModuleOrNamespaceExportName(ns, node, allowComments, allowSourceMaps) {
    if (ns && hasSyntacticModifier(node, 32 /* Export */)) {
      return getNamespaceMemberName(ns, getName(node), allowComments, allowSourceMaps);
    }
    return getExportName(node, allowComments, allowSourceMaps);
  }
  function copyPrologue(source, target, ensureUseStrict2, visitor) {
    const offset = copyStandardPrologue(source, target, 0, ensureUseStrict2);
    return copyCustomPrologue(source, target, offset, visitor);
  }
  function isUseStrictPrologue2(node) {
    return isStringLiteral(node.expression) && node.expression.text === "use strict";
  }
  function createUseStrictPrologue() {
    return startOnNewLine(createExpressionStatement(createStringLiteral("use strict")));
  }
  function copyStandardPrologue(source, target, statementOffset = 0, ensureUseStrict2) {
    Debug.assert(target.length === 0, "Prologue directives should be at the first statement in the target statements array");
    let foundUseStrict = false;
    const numStatements = source.length;
    while (statementOffset < numStatements) {
      const statement = source[statementOffset];
      if (isPrologueDirective(statement)) {
        if (isUseStrictPrologue2(statement)) {
          foundUseStrict = true;
        }
        target.push(statement);
      } else {
        break;
      }
      statementOffset++;
    }
    if (ensureUseStrict2 && !foundUseStrict) {
      target.push(createUseStrictPrologue());
    }
    return statementOffset;
  }
  function copyCustomPrologue(source, target, statementOffset, visitor, filter2 = returnTrue) {
    const numStatements = source.length;
    while (statementOffset !== void 0 && statementOffset < numStatements) {
      const statement = source[statementOffset];
      if (getEmitFlags(statement) & 2097152 /* CustomPrologue */ && filter2(statement)) {
        append(target, visitor ? visitNode(statement, visitor, isStatement) : statement);
      } else {
        break;
      }
      statementOffset++;
    }
    return statementOffset;
  }
  function ensureUseStrict(statements) {
    const foundUseStrict = findUseStrictPrologue(statements);
    if (!foundUseStrict) {
      return setTextRange(createNodeArray([createUseStrictPrologue(), ...statements]), statements);
    }
    return statements;
  }
  function liftToBlock(nodes) {
    Debug.assert(every(nodes, isStatementOrBlock), "Cannot lift nodes to a Block.");
    return singleOrUndefined(nodes) || createBlock(nodes);
  }
  function findSpanEnd(array, test, start) {
    let i = start;
    while (i < array.length && test(array[i])) {
      i++;
    }
    return i;
  }
  function mergeLexicalEnvironment(statements, declarations) {
    if (!some(declarations)) {
      return statements;
    }
    const leftStandardPrologueEnd = findSpanEnd(statements, isPrologueDirective, 0);
    const leftHoistedFunctionsEnd = findSpanEnd(statements, isHoistedFunction, leftStandardPrologueEnd);
    const leftHoistedVariablesEnd = findSpanEnd(statements, isHoistedVariableStatement, leftHoistedFunctionsEnd);
    const rightStandardPrologueEnd = findSpanEnd(declarations, isPrologueDirective, 0);
    const rightHoistedFunctionsEnd = findSpanEnd(declarations, isHoistedFunction, rightStandardPrologueEnd);
    const rightHoistedVariablesEnd = findSpanEnd(declarations, isHoistedVariableStatement, rightHoistedFunctionsEnd);
    const rightCustomPrologueEnd = findSpanEnd(declarations, isCustomPrologue, rightHoistedVariablesEnd);
    Debug.assert(rightCustomPrologueEnd === declarations.length, "Expected declarations to be valid standard or custom prologues");
    const left = isNodeArray(statements) ? statements.slice() : statements;
    if (rightCustomPrologueEnd > rightHoistedVariablesEnd) {
      left.splice(leftHoistedVariablesEnd, 0, ...declarations.slice(rightHoistedVariablesEnd, rightCustomPrologueEnd));
    }
    if (rightHoistedVariablesEnd > rightHoistedFunctionsEnd) {
      left.splice(leftHoistedFunctionsEnd, 0, ...declarations.slice(rightHoistedFunctionsEnd, rightHoistedVariablesEnd));
    }
    if (rightHoistedFunctionsEnd > rightStandardPrologueEnd) {
      left.splice(leftStandardPrologueEnd, 0, ...declarations.slice(rightStandardPrologueEnd, rightHoistedFunctionsEnd));
    }
    if (rightStandardPrologueEnd > 0) {
      if (leftStandardPrologueEnd === 0) {
        left.splice(0, 0, ...declarations.slice(0, rightStandardPrologueEnd));
      } else {
        const leftPrologues = /* @__PURE__ */ new Map();
        for (let i = 0; i < leftStandardPrologueEnd; i++) {
          const leftPrologue = statements[i];
          leftPrologues.set(leftPrologue.expression.text, true);
        }
        for (let i = rightStandardPrologueEnd - 1; i >= 0; i--) {
          const rightPrologue = declarations[i];
          if (!leftPrologues.has(rightPrologue.expression.text)) {
            left.unshift(rightPrologue);
          }
        }
      }
    }
    if (isNodeArray(statements)) {
      return setTextRange(createNodeArray(left, statements.hasTrailingComma), statements);
    }
    return statements;
  }
  function replaceModifiers(node, modifiers) {
    let modifierArray;
    if (typeof modifiers === "number") {
      modifierArray = createModifiersFromModifierFlags(modifiers);
    } else {
      modifierArray = modifiers;
    }
    return isTypeParameterDeclaration(node) ? updateTypeParameterDeclaration(node, modifierArray, node.name, node.constraint, node.default) : isParameter(node) ? updateParameterDeclaration(node, modifierArray, node.dotDotDotToken, node.name, node.questionToken, node.type, node.initializer) : isConstructorTypeNode(node) ? updateConstructorTypeNode1(node, modifierArray, node.typeParameters, node.parameters, node.type) : isPropertySignature(node) ? updatePropertySignature(node, modifierArray, node.name, node.questionToken, node.type) : isPropertyDeclaration(node) ? updatePropertyDeclaration2(node, modifierArray, node.name, node.questionToken ?? node.exclamationToken, node.type, node.initializer) : isMethodSignature(node) ? updateMethodSignature(node, modifierArray, node.name, node.questionToken, node.typeParameters, node.parameters, node.type) : isMethodDeclaration(node) ? updateMethodDeclaration(node, modifierArray, node.asteriskToken, node.name, node.questionToken, node.typeParameters, node.parameters, node.type, node.body) : isConstructorDeclaration(node) ? updateConstructorDeclaration(node, modifierArray, node.parameters, node.body) : isGetAccessorDeclaration(node) ? updateGetAccessorDeclaration(node, modifierArray, node.name, node.parameters, node.type, node.body) : isSetAccessorDeclaration(node) ? updateSetAccessorDeclaration(node, modifierArray, node.name, node.parameters, node.body) : isIndexSignatureDeclaration(node) ? updateIndexSignature(node, modifierArray, node.parameters, node.type) : isFunctionExpression(node) ? updateFunctionExpression(node, modifierArray, node.asteriskToken, node.name, node.typeParameters, node.parameters, node.type, node.body) : isArrowFunction(node) ? updateArrowFunction(node, modifierArray, node.typeParameters, node.parameters, node.type, node.equalsGreaterThanToken, node.body) : isClassExpression(node) ? updateClassExpression(node, modifierArray, node.name, node.typeParameters, node.heritageClauses, node.members) : isVariableStatement(node) ? updateVariableStatement(node, modifierArray, node.declarationList) : isFunctionDeclaration(node) ? updateFunctionDeclaration(node, modifierArray, node.asteriskToken, node.name, node.typeParameters, node.parameters, node.type, node.body) : isClassDeclaration(node) ? updateClassDeclaration(node, modifierArray, node.name, node.typeParameters, node.heritageClauses, node.members) : isInterfaceDeclaration(node) ? updateInterfaceDeclaration(node, modifierArray, node.name, node.typeParameters, node.heritageClauses, node.members) : isTypeAliasDeclaration(node) ? updateTypeAliasDeclaration(node, modifierArray, node.name, node.typeParameters, node.type) : isEnumDeclaration(node) ? updateEnumDeclaration(node, modifierArray, node.name, node.members) : isModuleDeclaration(node) ? updateModuleDeclaration(node, modifierArray, node.name, node.body) : isImportEqualsDeclaration(node) ? updateImportEqualsDeclaration(node, modifierArray, node.isTypeOnly, node.name, node.moduleReference) : isImportDeclaration(node) ? updateImportDeclaration(node, modifierArray, node.importClause, node.moduleSpecifier, node.attributes) : isExportAssignment(node) ? updateExportAssignment(node, modifierArray, node.expression) : isExportDeclaration(node) ? updateExportDeclaration(node, modifierArray, node.isTypeOnly, node.exportClause, node.moduleSpecifier, node.attributes) : Debug.assertNever(node);
  }
  function replaceDecoratorsAndModifiers(node, modifierArray) {
    return isParameter(node) ? updateParameterDeclaration(node, modifierArray, node.dotDotDotToken, node.name, node.questionToken, node.type, node.initializer) : isPropertyDeclaration(node) ? updatePropertyDeclaration2(node, modifierArray, node.name, node.questionToken ?? node.exclamationToken, node.type, node.initializer) : isMethodDeclaration(node) ? updateMethodDeclaration(node, modifierArray, node.asteriskToken, node.name, node.questionToken, node.typeParameters, node.parameters, node.type, node.body) : isGetAccessorDeclaration(node) ? updateGetAccessorDeclaration(node, modifierArray, node.name, node.parameters, node.type, node.body) : isSetAccessorDeclaration(node) ? updateSetAccessorDeclaration(node, modifierArray, node.name, node.parameters, node.body) : isClassExpression(node) ? updateClassExpression(node, modifierArray, node.name, node.typeParameters, node.heritageClauses, node.members) : isClassDeclaration(node) ? updateClassDeclaration(node, modifierArray, node.name, node.typeParameters, node.heritageClauses, node.members) : Debug.assertNever(node);
  }
  function replacePropertyName(node, name) {
    switch (node.kind) {
      case 178 /* GetAccessor */:
        return updateGetAccessorDeclaration(node, node.modifiers, name, node.parameters, node.type, node.body);
      case 179 /* SetAccessor */:
        return updateSetAccessorDeclaration(node, node.modifiers, name, node.parameters, node.body);
      case 175 /* MethodDeclaration */:
        return updateMethodDeclaration(node, node.modifiers, node.asteriskToken, name, node.questionToken, node.typeParameters, node.parameters, node.type, node.body);
      case 174 /* MethodSignature */:
        return updateMethodSignature(node, node.modifiers, name, node.questionToken, node.typeParameters, node.parameters, node.type);
      case 173 /* PropertyDeclaration */:
        return updatePropertyDeclaration2(node, node.modifiers, name, node.questionToken ?? node.exclamationToken, node.type, node.initializer);
      case 172 /* PropertySignature */:
        return updatePropertySignature(node, node.modifiers, name, node.questionToken, node.type);
      case 304 /* PropertyAssignment */:
        return updatePropertyAssignment(node, name, node.initializer);
    }
  }
  function asNodeArray(array) {
    return array ? createNodeArray(array) : void 0;
  }
  function asName(name) {
    return typeof name === "string" ? createIdentifier(name) : name;
  }
  function asExpression(value) {
    return typeof value === "string" ? createStringLiteral(value) : typeof value === "number" ? createNumericLiteral(value) : typeof value === "boolean" ? value ? createTrue() : createFalse() : value;
  }
  function asInitializer(node) {
    return node && parenthesizerRules().parenthesizeExpressionForDisallowedComma(node);
  }
  function asToken(value) {
    return typeof value === "number" ? createToken(value) : value;
  }
  function asEmbeddedStatement(statement) {
    return statement && isNotEmittedStatement(statement) ? setTextRange(setOriginal(createEmptyStatement(), statement), statement) : statement;
  }
  function asVariableDeclaration(variableDeclaration) {
    if (typeof variableDeclaration === "string" || variableDeclaration && !isVariableDeclaration(variableDeclaration)) {
      return createVariableDeclaration(
        variableDeclaration,
        /*exclamationToken*/
        void 0,
        /*type*/
        void 0,
        /*initializer*/
        void 0
      );
    }
    return variableDeclaration;
  }
  function update(updated, original) {
    if (updated !== original) {
      setOriginal(updated, original);
      setTextRange(updated, original);
    }
    return updated;
  }
}
function getDefaultTagNameForKind(kind) {
  switch (kind) {
    case 345 /* JSDocTypeTag */:
      return "type";
    case 343 /* JSDocReturnTag */:
      return "returns";
    case 344 /* JSDocThisTag */:
      return "this";
    case 341 /* JSDocEnumTag */:
      return "enum";
    case 331 /* JSDocAuthorTag */:
      return "author";
    case 333 /* JSDocClassTag */:
      return "class";
    case 334 /* JSDocPublicTag */:
      return "public";
    case 335 /* JSDocPrivateTag */:
      return "private";
    case 336 /* JSDocProtectedTag */:
      return "protected";
    case 337 /* JSDocReadonlyTag */:
      return "readonly";
    case 338 /* JSDocOverrideTag */:
      return "override";
    case 346 /* JSDocTemplateTag */:
      return "template";
    case 347 /* JSDocTypedefTag */:
      return "typedef";
    case 342 /* JSDocParameterTag */:
      return "param";
    case 349 /* JSDocPropertyTag */:
      return "prop";
    case 339 /* JSDocCallbackTag */:
      return "callback";
    case 340 /* JSDocOverloadTag */:
      return "overload";
    case 329 /* JSDocAugmentsTag */:
      return "augments";
    case 330 /* JSDocImplementsTag */:
      return "implements";
    case 352 /* JSDocImportTag */:
      return "import";
    default:
      return Debug.fail(`Unsupported kind: ${Debug.formatSyntaxKind(kind)}`);
  }
}
var rawTextScanner;
var invalidValueSentinel = {};
function getCookedText(kind, rawText) {
  if (!rawTextScanner) {
    rawTextScanner = createScanner(
      99 /* Latest */,
      /*skipTrivia*/
      false,
      0 /* Standard */
    );
  }
  switch (kind) {
    case 15 /* NoSubstitutionTemplateLiteral */:
      rawTextScanner.setText("`" + rawText + "`");
      break;
    case 16 /* TemplateHead */:
      rawTextScanner.setText("`" + rawText + "${");
      break;
    case 17 /* TemplateMiddle */:
      rawTextScanner.setText("}" + rawText + "${");
      break;
    case 18 /* TemplateTail */:
      rawTextScanner.setText("}" + rawText + "`");
      break;
  }
  let token = rawTextScanner.scan();
  if (token === 20 /* CloseBraceToken */) {
    token = rawTextScanner.reScanTemplateToken(
      /*isTaggedTemplate*/
      false
    );
  }
  if (rawTextScanner.isUnterminated()) {
    rawTextScanner.setText(void 0);
    return invalidValueSentinel;
  }
  let tokenValue;
  switch (token) {
    case 15 /* NoSubstitutionTemplateLiteral */:
    case 16 /* TemplateHead */:
    case 17 /* TemplateMiddle */:
    case 18 /* TemplateTail */:
      tokenValue = rawTextScanner.getTokenValue();
      break;
  }
  if (tokenValue === void 0 || rawTextScanner.scan() !== 1 /* EndOfFileToken */) {
    rawTextScanner.setText(void 0);
    return invalidValueSentinel;
  }
  rawTextScanner.setText(void 0);
  return tokenValue;
}
function propagateNameFlags(node) {
  return node && isIdentifier(node) ? propagateIdentifierNameFlags(node) : propagateChildFlags(node);
}
function propagateIdentifierNameFlags(node) {
  return propagateChildFlags(node) & ~67108864 /* ContainsPossibleTopLevelAwait */;
}
function propagatePropertyNameFlagsOfChild(node, transformFlags) {
  return transformFlags | node.transformFlags & 134234112 /* PropertyNamePropagatingFlags */;
}
function propagateChildFlags(child) {
  if (!child) return 0 /* None */;
  const childFlags = child.transformFlags & ~getTransformFlagsSubtreeExclusions(child.kind);
  return isNamedDeclaration(child) && isPropertyName(child.name) ? propagatePropertyNameFlagsOfChild(child.name, childFlags) : childFlags;
}
function propagateChildrenFlags(children) {
  return children ? children.transformFlags : 0 /* None */;
}
function aggregateChildrenFlags(children) {
  let subtreeFlags = 0 /* None */;
  for (const child of children) {
    subtreeFlags |= propagateChildFlags(child);
  }
  children.transformFlags = subtreeFlags;
}
function getTransformFlagsSubtreeExclusions(kind) {
  if (kind >= 183 /* FirstTypeNode */ && kind <= 206 /* LastTypeNode */) {
    return -2 /* TypeExcludes */;
  }
  switch (kind) {
    case 214 /* CallExpression */:
    case 215 /* NewExpression */:
    case 210 /* ArrayLiteralExpression */:
      return -2147450880 /* ArrayLiteralOrCallOrNewExcludes */;
    case 268 /* ModuleDeclaration */:
      return -1941676032 /* ModuleExcludes */;
    case 170 /* Parameter */:
      return -2147483648 /* ParameterExcludes */;
    case 220 /* ArrowFunction */:
      return -2072174592 /* ArrowFunctionExcludes */;
    case 219 /* FunctionExpression */:
    case 263 /* FunctionDeclaration */:
      return -1937940480 /* FunctionExcludes */;
    case 262 /* VariableDeclarationList */:
      return -2146893824 /* VariableDeclarationListExcludes */;
    case 264 /* ClassDeclaration */:
    case 232 /* ClassExpression */:
      return -2147344384 /* ClassExcludes */;
    case 177 /* Constructor */:
      return -1937948672 /* ConstructorExcludes */;
    case 173 /* PropertyDeclaration */:
      return -2013249536 /* PropertyExcludes */;
    case 175 /* MethodDeclaration */:
    case 178 /* GetAccessor */:
    case 179 /* SetAccessor */:
      return -2005057536 /* MethodOrAccessorExcludes */;
    case 133 /* AnyKeyword */:
    case 150 /* NumberKeyword */:
    case 163 /* BigIntKeyword */:
    case 146 /* NeverKeyword */:
    case 154 /* StringKeyword */:
    case 151 /* ObjectKeyword */:
    case 136 /* BooleanKeyword */:
    case 155 /* SymbolKeyword */:
    case 116 /* VoidKeyword */:
    case 169 /* TypeParameter */:
    case 172 /* PropertySignature */:
    case 174 /* MethodSignature */:
    case 180 /* CallSignature */:
    case 181 /* ConstructSignature */:
    case 182 /* IndexSignature */:
    case 265 /* InterfaceDeclaration */:
    case 266 /* TypeAliasDeclaration */:
      return -2 /* TypeExcludes */;
    case 211 /* ObjectLiteralExpression */:
      return -2147278848 /* ObjectLiteralExcludes */;
    case 300 /* CatchClause */:
      return -2147418112 /* CatchClauseExcludes */;
    case 207 /* ObjectBindingPattern */:
    case 208 /* ArrayBindingPattern */:
      return -2147450880 /* BindingPatternExcludes */;
    case 217 /* TypeAssertionExpression */:
    case 239 /* SatisfiesExpression */:
    case 235 /* AsExpression */:
    case 356 /* PartiallyEmittedExpression */:
    case 218 /* ParenthesizedExpression */:
    case 108 /* SuperKeyword */:
      return -2147483648 /* OuterExpressionExcludes */;
    case 212 /* PropertyAccessExpression */:
    case 213 /* ElementAccessExpression */:
      return -2147483648 /* PropertyAccessExcludes */;
    default:
      return -2147483648 /* NodeExcludes */;
  }
}
function setOriginalNode(node, original) {
  if (node.original !== original) {
    node.original = original;
    if (original) {
      const emitNode = original.emitNode;
      if (emitNode) node.emitNode = mergeEmitNode(emitNode, node.emitNode);
    }
  }
  return node;
}
function mergeEmitNode(sourceEmitNode, destEmitNode) {
  const {
    flags,
    internalFlags,
    leadingComments,
    trailingComments,
    commentRange,
    sourceMapRange,
    tokenSourceMapRanges,
    constantValue,
    helpers,
    startsOnNewLine,
    snippetElement,
    classThis,
    assignedName
  } = sourceEmitNode;
  if (!destEmitNode) destEmitNode = {};
  if (flags) {
    destEmitNode.flags = flags;
  }
  if (internalFlags) {
    destEmitNode.internalFlags = internalFlags & ~8 /* Immutable */;
  }
  if (leadingComments) {
    destEmitNode.leadingComments = addRange(leadingComments.slice(), destEmitNode.leadingComments);
  }
  if (trailingComments) {
    destEmitNode.trailingComments = addRange(trailingComments.slice(), destEmitNode.trailingComments);
  }
  if (commentRange) {
    destEmitNode.commentRange = commentRange;
  }
  if (sourceMapRange) {
    destEmitNode.sourceMapRange = sourceMapRange;
  }
  if (tokenSourceMapRanges) {
    destEmitNode.tokenSourceMapRanges = mergeTokenSourceMapRanges(tokenSourceMapRanges, destEmitNode.tokenSourceMapRanges);
  }
  if (constantValue !== void 0) {
    destEmitNode.constantValue = constantValue;
  }
  if (helpers) {
    for (const helper of helpers) {
      destEmitNode.helpers = appendIfUnique(destEmitNode.helpers, helper);
    }
  }
  if (startsOnNewLine !== void 0) {
    destEmitNode.startsOnNewLine = startsOnNewLine;
  }
  if (snippetElement !== void 0) {
    destEmitNode.snippetElement = snippetElement;
  }
  if (classThis) {
    destEmitNode.classThis = classThis;
  }
  if (assignedName) {
    destEmitNode.assignedName = assignedName;
  }
  return destEmitNode;
}
function mergeTokenSourceMapRanges(sourceRanges, destRanges) {
  if (!destRanges) destRanges = [];
  for (const key in sourceRanges) {
    destRanges[key] = sourceRanges[key];
  }
  return destRanges;
}
function getOrCreateEmitNode(node) {
  if (!node.emitNode) {
    if (isParseTreeNode(node)) {
      if (node.kind === 308 /* SourceFile */) {
        return node.emitNode = { annotatedNodes: [node] };
      }
      const sourceFile = getSourceFileOfNode(getParseTreeNode(getSourceFileOfNode(node))) ?? Debug.fail("Could not determine parsed source file.");
      getOrCreateEmitNode(sourceFile).annotatedNodes.push(node);
    }
    node.emitNode = {};
  } else {
    Debug.assert(!(node.emitNode.internalFlags & 8 /* Immutable */), "Invalid attempt to mutate an immutable node.");
  }
  return node.emitNode;
}
function setEmitFlags(node, emitFlags) {
  getOrCreateEmitNode(node).flags = emitFlags;
  return node;
}
function getSourceMapRange(node) {
  var _a;
  return ((_a = node.emitNode) == null ? void 0 : _a.sourceMapRange) ?? node;
}
function getStartsOnNewLine(node) {
  var _a;
  return (_a = node.emitNode) == null ? void 0 : _a.startsOnNewLine;
}
function setStartsOnNewLine(node, newLine) {
  getOrCreateEmitNode(node).startsOnNewLine = newLine;
  return node;
}
function getCommentRange(node) {
  var _a;
  return ((_a = node.emitNode) == null ? void 0 : _a.commentRange) ?? node;
}
function getSyntheticLeadingComments(node) {
  var _a;
  return (_a = node.emitNode) == null ? void 0 : _a.leadingComments;
}
function getSyntheticTrailingComments(node) {
  var _a;
  return (_a = node.emitNode) == null ? void 0 : _a.trailingComments;
}
function getSnippetElement(node) {
  var _a;
  return (_a = node.emitNode) == null ? void 0 : _a.snippetElement;
}
function setIdentifierTypeArguments(node, typeArguments) {
  getOrCreateEmitNode(node).identifierTypeArguments = typeArguments;
  return node;
}
function getIdentifierTypeArguments(node) {
  var _a;
  return (_a = node.emitNode) == null ? void 0 : _a.identifierTypeArguments;
}
function setIdentifierAutoGenerate(node, autoGenerate) {
  getOrCreateEmitNode(node).autoGenerate = autoGenerate;
  return node;
}
function isNumericLiteral(node) {
  return node.kind === 9 /* NumericLiteral */;
}
function isBigIntLiteral(node) {
  return node.kind === 10 /* BigIntLiteral */;
}
function isStringLiteral(node) {
  return node.kind === 11 /* StringLiteral */;
}
function isJsxText(node) {
  return node.kind === 12 /* JsxText */;
}
function isNoSubstitutionTemplateLiteral(node) {
  return node.kind === 15 /* NoSubstitutionTemplateLiteral */;
}
function isCommaToken(node) {
  return node.kind === 28 /* CommaToken */;
}
function isExclamationToken(node) {
  return node.kind === 54 /* ExclamationToken */;
}
function isQuestionToken(node) {
  return node.kind === 58 /* QuestionToken */;
}
function isIdentifier(node) {
  return node.kind === 80 /* Identifier */;
}
function isPrivateIdentifier(node) {
  return node.kind === 81 /* PrivateIdentifier */;
}
function isExportModifier(node) {
  return node.kind === 95 /* ExportKeyword */;
}
function isDefaultModifier(node) {
  return node.kind === 90 /* DefaultKeyword */;
}
function isAsyncModifier(node) {
  return node.kind === 134 /* AsyncKeyword */;
}
function isSuperKeyword(node) {
  return node.kind === 108 /* SuperKeyword */;
}
function isImportKeyword(node) {
  return node.kind === 102 /* ImportKeyword */;
}
function isQualifiedName(node) {
  return node.kind === 167 /* QualifiedName */;
}
function isComputedPropertyName(node) {
  return node.kind === 168 /* ComputedPropertyName */;
}
function isTypeParameterDeclaration(node) {
  return node.kind === 169 /* TypeParameter */;
}
function isParameter(node) {
  return node.kind === 170 /* Parameter */;
}
function isDecorator(node) {
  return node.kind === 171 /* Decorator */;
}
function isPropertySignature(node) {
  return node.kind === 172 /* PropertySignature */;
}
function isPropertyDeclaration(node) {
  return node.kind === 173 /* PropertyDeclaration */;
}
function isMethodSignature(node) {
  return node.kind === 174 /* MethodSignature */;
}
function isMethodDeclaration(node) {
  return node.kind === 175 /* MethodDeclaration */;
}
function isConstructorDeclaration(node) {
  return node.kind === 177 /* Constructor */;
}
function isGetAccessorDeclaration(node) {
  return node.kind === 178 /* GetAccessor */;
}
function isSetAccessorDeclaration(node) {
  return node.kind === 179 /* SetAccessor */;
}
function isCallSignatureDeclaration(node) {
  return node.kind === 180 /* CallSignature */;
}
function isConstructSignatureDeclaration(node) {
  return node.kind === 181 /* ConstructSignature */;
}
function isIndexSignatureDeclaration(node) {
  return node.kind === 182 /* IndexSignature */;
}
function isTypePredicateNode(node) {
  return node.kind === 183 /* TypePredicate */;
}
function isTypeReferenceNode(node) {
  return node.kind === 184 /* TypeReference */;
}
function isFunctionTypeNode(node) {
  return node.kind === 185 /* FunctionType */;
}
function isConstructorTypeNode(node) {
  return node.kind === 186 /* ConstructorType */;
}
function isTypeQueryNode(node) {
  return node.kind === 187 /* TypeQuery */;
}
function isTypeLiteralNode(node) {
  return node.kind === 188 /* TypeLiteral */;
}
function isArrayTypeNode(node) {
  return node.kind === 189 /* ArrayType */;
}
function isTupleTypeNode(node) {
  return node.kind === 190 /* TupleType */;
}
function isNamedTupleMember(node) {
  return node.kind === 203 /* NamedTupleMember */;
}
function isOptionalTypeNode(node) {
  return node.kind === 191 /* OptionalType */;
}
function isRestTypeNode(node) {
  return node.kind === 192 /* RestType */;
}
function isUnionTypeNode(node) {
  return node.kind === 193 /* UnionType */;
}
function isIntersectionTypeNode(node) {
  return node.kind === 194 /* IntersectionType */;
}
function isConditionalTypeNode(node) {
  return node.kind === 195 /* ConditionalType */;
}
function isInferTypeNode(node) {
  return node.kind === 196 /* InferType */;
}
function isParenthesizedTypeNode(node) {
  return node.kind === 197 /* ParenthesizedType */;
}
function isThisTypeNode(node) {
  return node.kind === 198 /* ThisType */;
}
function isTypeOperatorNode(node) {
  return node.kind === 199 /* TypeOperator */;
}
function isIndexedAccessTypeNode(node) {
  return node.kind === 200 /* IndexedAccessType */;
}
function isMappedTypeNode(node) {
  return node.kind === 201 /* MappedType */;
}
function isLiteralTypeNode(node) {
  return node.kind === 202 /* LiteralType */;
}
function isImportTypeNode(node) {
  return node.kind === 206 /* ImportType */;
}
function isObjectBindingPattern(node) {
  return node.kind === 207 /* ObjectBindingPattern */;
}
function isArrayBindingPattern(node) {
  return node.kind === 208 /* ArrayBindingPattern */;
}
function isBindingElement(node) {
  return node.kind === 209 /* BindingElement */;
}
function isArrayLiteralExpression(node) {
  return node.kind === 210 /* ArrayLiteralExpression */;
}
function isObjectLiteralExpression(node) {
  return node.kind === 211 /* ObjectLiteralExpression */;
}
function isPropertyAccessExpression(node) {
  return node.kind === 212 /* PropertyAccessExpression */;
}
function isElementAccessExpression(node) {
  return node.kind === 213 /* ElementAccessExpression */;
}
function isCallExpression(node) {
  return node.kind === 214 /* CallExpression */;
}
function isTaggedTemplateExpression(node) {
  return node.kind === 216 /* TaggedTemplateExpression */;
}
function isParenthesizedExpression(node) {
  return node.kind === 218 /* ParenthesizedExpression */;
}
function isFunctionExpression(node) {
  return node.kind === 219 /* FunctionExpression */;
}
function isArrowFunction(node) {
  return node.kind === 220 /* ArrowFunction */;
}
function isVoidExpression(node) {
  return node.kind === 223 /* VoidExpression */;
}
function isPrefixUnaryExpression(node) {
  return node.kind === 225 /* PrefixUnaryExpression */;
}
function isBinaryExpression(node) {
  return node.kind === 227 /* BinaryExpression */;
}
function isSpreadElement(node) {
  return node.kind === 231 /* SpreadElement */;
}
function isClassExpression(node) {
  return node.kind === 232 /* ClassExpression */;
}
function isOmittedExpression(node) {
  return node.kind === 233 /* OmittedExpression */;
}
function isExpressionWithTypeArguments(node) {
  return node.kind === 234 /* ExpressionWithTypeArguments */;
}
function isNonNullExpression(node) {
  return node.kind === 236 /* NonNullExpression */;
}
function isMetaProperty(node) {
  return node.kind === 237 /* MetaProperty */;
}
function isCommaListExpression(node) {
  return node.kind === 357 /* CommaListExpression */;
}
function isBlock(node) {
  return node.kind === 242 /* Block */;
}
function isVariableStatement(node) {
  return node.kind === 244 /* VariableStatement */;
}
function isExpressionStatement(node) {
  return node.kind === 245 /* ExpressionStatement */;
}
function isLabeledStatement(node) {
  return node.kind === 257 /* LabeledStatement */;
}
function isVariableDeclaration(node) {
  return node.kind === 261 /* VariableDeclaration */;
}
function isVariableDeclarationList(node) {
  return node.kind === 262 /* VariableDeclarationList */;
}
function isFunctionDeclaration(node) {
  return node.kind === 263 /* FunctionDeclaration */;
}
function isClassDeclaration(node) {
  return node.kind === 264 /* ClassDeclaration */;
}
function isInterfaceDeclaration(node) {
  return node.kind === 265 /* InterfaceDeclaration */;
}
function isTypeAliasDeclaration(node) {
  return node.kind === 266 /* TypeAliasDeclaration */;
}
function isEnumDeclaration(node) {
  return node.kind === 267 /* EnumDeclaration */;
}
function isModuleDeclaration(node) {
  return node.kind === 268 /* ModuleDeclaration */;
}
function isImportEqualsDeclaration(node) {
  return node.kind === 272 /* ImportEqualsDeclaration */;
}
function isImportDeclaration(node) {
  return node.kind === 273 /* ImportDeclaration */;
}
function isExportAssignment(node) {
  return node.kind === 278 /* ExportAssignment */;
}
function isExportDeclaration(node) {
  return node.kind === 279 /* ExportDeclaration */;
}
function isNamedExports(node) {
  return node.kind === 280 /* NamedExports */;
}
function isNotEmittedStatement(node) {
  return node.kind === 354 /* NotEmittedStatement */;
}
function isExternalModuleReference(node) {
  return node.kind === 284 /* ExternalModuleReference */;
}
function isJsxOpeningElement(node) {
  return node.kind === 287 /* JsxOpeningElement */;
}
function isJsxOpeningFragment(node) {
  return node.kind === 290 /* JsxOpeningFragment */;
}
function isJsxNamespacedName(node) {
  return node.kind === 296 /* JsxNamespacedName */;
}
function isDefaultClause(node) {
  return node.kind === 298 /* DefaultClause */;
}
function isPropertyAssignment(node) {
  return node.kind === 304 /* PropertyAssignment */;
}
function isSourceFile(node) {
  return node.kind === 308 /* SourceFile */;
}
function isJSDocTypeExpression(node) {
  return node.kind === 310 /* JSDocTypeExpression */;
}
function isJSDocNullableType(node) {
  return node.kind === 315 /* JSDocNullableType */;
}
function isJSDocFunctionType(node) {
  return node.kind === 318 /* JSDocFunctionType */;
}
function isJSDoc(node) {
  return node.kind === 321 /* JSDoc */;
}
function isJSDocTypeLiteral(node) {
  return node.kind === 323 /* JSDocTypeLiteral */;
}
function isJSDocSignature(node) {
  return node.kind === 324 /* JSDocSignature */;
}
function isJSDocPublicTag(node) {
  return node.kind === 334 /* JSDocPublicTag */;
}
function isJSDocPrivateTag(node) {
  return node.kind === 335 /* JSDocPrivateTag */;
}
function isJSDocProtectedTag(node) {
  return node.kind === 336 /* JSDocProtectedTag */;
}
function isJSDocReadonlyTag(node) {
  return node.kind === 337 /* JSDocReadonlyTag */;
}
function isJSDocOverrideTag(node) {
  return node.kind === 338 /* JSDocOverrideTag */;
}
function isJSDocOverloadTag(node) {
  return node.kind === 340 /* JSDocOverloadTag */;
}
function isJSDocDeprecatedTag(node) {
  return node.kind === 332 /* JSDocDeprecatedTag */;
}
function isJSDocParameterTag(node) {
  return node.kind === 342 /* JSDocParameterTag */;
}
function isJSDocReturnTag(node) {
  return node.kind === 343 /* JSDocReturnTag */;
}
function isJSDocTypeTag(node) {
  return node.kind === 345 /* JSDocTypeTag */;
}
function isJSDocTemplateTag(node) {
  return node.kind === 346 /* JSDocTemplateTag */;
}
function isJSDocSatisfiesTag(node) {
  return node.kind === 351 /* JSDocSatisfiesTag */;
}
var sourceFileToNodeChildren = /* @__PURE__ */ new WeakMap();
function getNodeChildren(node, sourceFile) {
  var _a;
  const kind = node.kind;
  if (!isNodeKind(kind)) {
    return emptyArray;
  }
  if (kind === 353 /* SyntaxList */) {
    return node._children;
  }
  return (_a = sourceFileToNodeChildren.get(sourceFile)) == null ? void 0 : _a.get(node);
}
function setNodeChildren(node, sourceFile, children) {
  if (node.kind === 353 /* SyntaxList */) {
    Debug.fail("Should not need to re-set the children of a SyntaxList.");
  }
  let map2 = sourceFileToNodeChildren.get(sourceFile);
  if (map2 === void 0) {
    map2 = /* @__PURE__ */ new WeakMap();
    sourceFileToNodeChildren.set(sourceFile, map2);
  }
  map2.set(node, children);
  return children;
}
function unsetNodeChildren(node, origSourceFile) {
  var _a;
  if (node.kind === 353 /* SyntaxList */) {
    Debug.fail("Did not expect to unset the children of a SyntaxList.");
  }
  (_a = sourceFileToNodeChildren.get(origSourceFile)) == null ? void 0 : _a.delete(node);
}
function transferSourceFileChildren(sourceFile, targetSourceFile) {
  const map2 = sourceFileToNodeChildren.get(sourceFile);
  if (map2 !== void 0) {
    sourceFileToNodeChildren.delete(sourceFile);
    sourceFileToNodeChildren.set(targetSourceFile, map2);
  }
}
function isLocalName(node) {
  return (getEmitFlags(node) & 32768 /* LocalName */) !== 0;
}
function isUseStrictPrologue(node) {
  return isStringLiteral(node.expression) && node.expression.text === "use strict";
}
function findUseStrictPrologue(statements) {
  for (const statement of statements) {
    if (isPrologueDirective(statement)) {
      if (isUseStrictPrologue(statement)) {
        return statement;
      }
    } else {
      break;
    }
  }
  return void 0;
}
function isCommaExpression(node) {
  return node.kind === 227 /* BinaryExpression */ && node.operatorToken.kind === 28 /* CommaToken */;
}
function isCommaSequence(node) {
  return isCommaExpression(node) || isCommaListExpression(node);
}
function isJSDocTypeAssertion(node) {
  return isParenthesizedExpression(node) && isInJSFile(node) && !!getJSDocTypeTag(node);
}
function isOuterExpression(node, kinds = 63 /* All */) {
  switch (node.kind) {
    case 218 /* ParenthesizedExpression */:
      if (kinds & -2147483648 /* ExcludeJSDocTypeAssertion */ && isJSDocTypeAssertion(node)) {
        return false;
      }
      return (kinds & 1 /* Parentheses */) !== 0;
    case 217 /* TypeAssertionExpression */:
    case 235 /* AsExpression */:
      return (kinds & 2 /* TypeAssertions */) !== 0;
    case 239 /* SatisfiesExpression */:
      return (kinds & (2 /* TypeAssertions */ | 32 /* Satisfies */)) !== 0;
    case 234 /* ExpressionWithTypeArguments */:
      return (kinds & 16 /* ExpressionsWithTypeArguments */) !== 0;
    case 236 /* NonNullExpression */:
      return (kinds & 4 /* NonNullAssertions */) !== 0;
    case 356 /* PartiallyEmittedExpression */:
      return (kinds & 8 /* PartiallyEmittedExpressions */) !== 0;
  }
  return false;
}
function skipOuterExpressions(node, kinds = 63 /* All */) {
  while (isOuterExpression(node, kinds)) {
    node = node.expression;
  }
  return node;
}
function startOnNewLine(node) {
  return setStartsOnNewLine(
    node,
    /*newLine*/
    true
  );
}
function getTargetOfBindingOrAssignmentElement(bindingElement) {
  if (isDeclarationBindingElement(bindingElement)) {
    return bindingElement.name;
  }
  if (isObjectLiteralElementLike(bindingElement)) {
    switch (bindingElement.kind) {
      case 304 /* PropertyAssignment */:
        return getTargetOfBindingOrAssignmentElement(bindingElement.initializer);
      case 305 /* ShorthandPropertyAssignment */:
        return bindingElement.name;
      case 306 /* SpreadAssignment */:
        return getTargetOfBindingOrAssignmentElement(bindingElement.expression);
    }
    return void 0;
  }
  if (isAssignmentExpression(
    bindingElement,
    /*excludeCompoundAssignment*/
    true
  )) {
    return getTargetOfBindingOrAssignmentElement(bindingElement.left);
  }
  if (isSpreadElement(bindingElement)) {
    return getTargetOfBindingOrAssignmentElement(bindingElement.expression);
  }
  return bindingElement;
}
function getElementsOfBindingOrAssignmentPattern(name) {
  switch (name.kind) {
    case 207 /* ObjectBindingPattern */:
    case 208 /* ArrayBindingPattern */:
    case 210 /* ArrayLiteralExpression */:
      return name.elements;
    case 211 /* ObjectLiteralExpression */:
      return name.properties;
  }
}
function getJSDocTypeAliasName(fullName) {
  if (fullName) {
    let rightNode = fullName;
    while (true) {
      if (isIdentifier(rightNode) || !rightNode.body) {
        return isIdentifier(rightNode) ? rightNode : rightNode.name;
      }
      rightNode = rightNode.body;
    }
  }
}
function formatGeneratedNamePart(part, generateName) {
  return typeof part === "object" ? formatGeneratedName(
    /*privateName*/
    false,
    part.prefix,
    part.node,
    part.suffix,
    generateName
  ) : typeof part === "string" ? part.length > 0 && part.charCodeAt(0) === 35 /* hash */ ? part.slice(1) : part : "";
}
function formatIdentifier(name, generateName) {
  return typeof name === "string" ? name : formatIdentifierWorker(name, Debug.checkDefined(generateName));
}
function formatIdentifierWorker(node, generateName) {
  return isGeneratedPrivateIdentifier(node) ? generateName(node).slice(1) : isGeneratedIdentifier(node) ? generateName(node) : isPrivateIdentifier(node) ? node.escapedText.slice(1) : idText(node);
}
function formatGeneratedName(privateName, prefix, baseName, suffix, generateName) {
  prefix = formatGeneratedNamePart(prefix, generateName);
  suffix = formatGeneratedNamePart(suffix, generateName);
  baseName = formatIdentifier(baseName, generateName);
  return `${privateName ? "#" : ""}${prefix}${baseName}${suffix}`;
}
function containsObjectRestOrSpread(node) {
  if (node.transformFlags & 65536 /* ContainsObjectRestOrSpread */) return true;
  if (node.transformFlags & 128 /* ContainsES2018 */) {
    for (const element of getElementsOfBindingOrAssignmentPattern(node)) {
      const target = getTargetOfBindingOrAssignmentElement(element);
      if (target && isAssignmentPattern(target)) {
        if (target.transformFlags & 65536 /* ContainsObjectRestOrSpread */) {
          return true;
        }
        if (target.transformFlags & 128 /* ContainsES2018 */) {
          if (containsObjectRestOrSpread(target)) return true;
        }
      }
    }
  }
  return false;
}
function setTextRange(range, location) {
  return location ? setTextRangePosEnd(range, location.pos, location.end) : range;
}
function canHaveModifiers(node) {
  const kind = node.kind;
  return kind === 169 /* TypeParameter */ || kind === 170 /* Parameter */ || kind === 172 /* PropertySignature */ || kind === 173 /* PropertyDeclaration */ || kind === 174 /* MethodSignature */ || kind === 175 /* MethodDeclaration */ || kind === 177 /* Constructor */ || kind === 178 /* GetAccessor */ || kind === 179 /* SetAccessor */ || kind === 182 /* IndexSignature */ || kind === 186 /* ConstructorType */ || kind === 219 /* FunctionExpression */ || kind === 220 /* ArrowFunction */ || kind === 232 /* ClassExpression */ || kind === 244 /* VariableStatement */ || kind === 263 /* FunctionDeclaration */ || kind === 264 /* ClassDeclaration */ || kind === 265 /* InterfaceDeclaration */ || kind === 266 /* TypeAliasDeclaration */ || kind === 267 /* EnumDeclaration */ || kind === 268 /* ModuleDeclaration */ || kind === 272 /* ImportEqualsDeclaration */ || kind === 273 /* ImportDeclaration */ || kind === 278 /* ExportAssignment */ || kind === 279 /* ExportDeclaration */;
}
function canHaveDecorators(node) {
  const kind = node.kind;
  return kind === 170 /* Parameter */ || kind === 173 /* PropertyDeclaration */ || kind === 175 /* MethodDeclaration */ || kind === 178 /* GetAccessor */ || kind === 179 /* SetAccessor */ || kind === 232 /* ClassExpression */ || kind === 264 /* ClassDeclaration */;
}
function visitNode2(cbNode, node) {
  return node && cbNode(node);
}
function visitNodes(cbNode, cbNodes, nodes) {
  if (nodes) {
    if (cbNodes) {
      return cbNodes(nodes);
    }
    for (const node of nodes) {
      const result = cbNode(node);
      if (result) {
        return result;
      }
    }
  }
}
function isJSDocLikeText(text, start) {
  return text.charCodeAt(start + 1) === 42 /* asterisk */ && text.charCodeAt(start + 2) === 42 /* asterisk */ && text.charCodeAt(start + 3) !== 47 /* slash */;
}
function isFileProbablyExternalModule(sourceFile) {
  return forEach(sourceFile.statements, isAnExternalModuleIndicatorNode) || getImportMetaIfNecessary(sourceFile);
}
function isAnExternalModuleIndicatorNode(node) {
  return canHaveModifiers(node) && hasModifierOfKind(node, 95 /* ExportKeyword */) || isImportEqualsDeclaration(node) && isExternalModuleReference(node.moduleReference) || isImportDeclaration(node) || isExportAssignment(node) || isExportDeclaration(node) ? node : void 0;
}
function getImportMetaIfNecessary(sourceFile) {
  return sourceFile.flags & 8388608 /* PossiblyContainsImportMeta */ ? walkTreeForImportMeta(sourceFile) : void 0;
}
function walkTreeForImportMeta(node) {
  return isImportMeta2(node) ? node : forEachChild(node, walkTreeForImportMeta);
}
function hasModifierOfKind(node, kind) {
  return some(node.modifiers, (m) => m.kind === kind);
}
function isImportMeta2(node) {
  return isMetaProperty(node) && node.keywordToken === 102 /* ImportKeyword */ && node.name.escapedText === "meta";
}
var forEachChildTable = {
  [167 /* QualifiedName */]: function forEachChildInQualifiedName(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.left) || visitNode2(cbNode, node.right);
  },
  [169 /* TypeParameter */]: function forEachChildInTypeParameter(node, cbNode, cbNodes) {
    return visitNodes(cbNode, cbNodes, node.modifiers) || visitNode2(cbNode, node.name) || visitNode2(cbNode, node.constraint) || visitNode2(cbNode, node.default) || visitNode2(cbNode, node.expression);
  },
  [305 /* ShorthandPropertyAssignment */]: function forEachChildInShorthandPropertyAssignment(node, cbNode, cbNodes) {
    return visitNodes(cbNode, cbNodes, node.modifiers) || visitNode2(cbNode, node.name) || visitNode2(cbNode, node.questionToken) || visitNode2(cbNode, node.exclamationToken) || visitNode2(cbNode, node.equalsToken) || visitNode2(cbNode, node.objectAssignmentInitializer);
  },
  [306 /* SpreadAssignment */]: function forEachChildInSpreadAssignment(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.expression);
  },
  [170 /* Parameter */]: function forEachChildInParameter(node, cbNode, cbNodes) {
    return visitNodes(cbNode, cbNodes, node.modifiers) || visitNode2(cbNode, node.dotDotDotToken) || visitNode2(cbNode, node.name) || visitNode2(cbNode, node.questionToken) || visitNode2(cbNode, node.type) || visitNode2(cbNode, node.initializer);
  },
  [173 /* PropertyDeclaration */]: function forEachChildInPropertyDeclaration(node, cbNode, cbNodes) {
    return visitNodes(cbNode, cbNodes, node.modifiers) || visitNode2(cbNode, node.name) || visitNode2(cbNode, node.questionToken) || visitNode2(cbNode, node.exclamationToken) || visitNode2(cbNode, node.type) || visitNode2(cbNode, node.initializer);
  },
  [172 /* PropertySignature */]: function forEachChildInPropertySignature(node, cbNode, cbNodes) {
    return visitNodes(cbNode, cbNodes, node.modifiers) || visitNode2(cbNode, node.name) || visitNode2(cbNode, node.questionToken) || visitNode2(cbNode, node.type) || visitNode2(cbNode, node.initializer);
  },
  [304 /* PropertyAssignment */]: function forEachChildInPropertyAssignment(node, cbNode, cbNodes) {
    return visitNodes(cbNode, cbNodes, node.modifiers) || visitNode2(cbNode, node.name) || visitNode2(cbNode, node.questionToken) || visitNode2(cbNode, node.exclamationToken) || visitNode2(cbNode, node.initializer);
  },
  [261 /* VariableDeclaration */]: function forEachChildInVariableDeclaration(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.name) || visitNode2(cbNode, node.exclamationToken) || visitNode2(cbNode, node.type) || visitNode2(cbNode, node.initializer);
  },
  [209 /* BindingElement */]: function forEachChildInBindingElement(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.dotDotDotToken) || visitNode2(cbNode, node.propertyName) || visitNode2(cbNode, node.name) || visitNode2(cbNode, node.initializer);
  },
  [182 /* IndexSignature */]: function forEachChildInIndexSignature(node, cbNode, cbNodes) {
    return visitNodes(cbNode, cbNodes, node.modifiers) || visitNodes(cbNode, cbNodes, node.typeParameters) || visitNodes(cbNode, cbNodes, node.parameters) || visitNode2(cbNode, node.type);
  },
  [186 /* ConstructorType */]: function forEachChildInConstructorType(node, cbNode, cbNodes) {
    return visitNodes(cbNode, cbNodes, node.modifiers) || visitNodes(cbNode, cbNodes, node.typeParameters) || visitNodes(cbNode, cbNodes, node.parameters) || visitNode2(cbNode, node.type);
  },
  [185 /* FunctionType */]: function forEachChildInFunctionType(node, cbNode, cbNodes) {
    return visitNodes(cbNode, cbNodes, node.modifiers) || visitNodes(cbNode, cbNodes, node.typeParameters) || visitNodes(cbNode, cbNodes, node.parameters) || visitNode2(cbNode, node.type);
  },
  [180 /* CallSignature */]: forEachChildInCallOrConstructSignature,
  [181 /* ConstructSignature */]: forEachChildInCallOrConstructSignature,
  [175 /* MethodDeclaration */]: function forEachChildInMethodDeclaration(node, cbNode, cbNodes) {
    return visitNodes(cbNode, cbNodes, node.modifiers) || visitNode2(cbNode, node.asteriskToken) || visitNode2(cbNode, node.name) || visitNode2(cbNode, node.questionToken) || visitNode2(cbNode, node.exclamationToken) || visitNodes(cbNode, cbNodes, node.typeParameters) || visitNodes(cbNode, cbNodes, node.parameters) || visitNode2(cbNode, node.type) || visitNode2(cbNode, node.body);
  },
  [174 /* MethodSignature */]: function forEachChildInMethodSignature(node, cbNode, cbNodes) {
    return visitNodes(cbNode, cbNodes, node.modifiers) || visitNode2(cbNode, node.name) || visitNode2(cbNode, node.questionToken) || visitNodes(cbNode, cbNodes, node.typeParameters) || visitNodes(cbNode, cbNodes, node.parameters) || visitNode2(cbNode, node.type);
  },
  [177 /* Constructor */]: function forEachChildInConstructor(node, cbNode, cbNodes) {
    return visitNodes(cbNode, cbNodes, node.modifiers) || visitNode2(cbNode, node.name) || visitNodes(cbNode, cbNodes, node.typeParameters) || visitNodes(cbNode, cbNodes, node.parameters) || visitNode2(cbNode, node.type) || visitNode2(cbNode, node.body);
  },
  [178 /* GetAccessor */]: function forEachChildInGetAccessor(node, cbNode, cbNodes) {
    return visitNodes(cbNode, cbNodes, node.modifiers) || visitNode2(cbNode, node.name) || visitNodes(cbNode, cbNodes, node.typeParameters) || visitNodes(cbNode, cbNodes, node.parameters) || visitNode2(cbNode, node.type) || visitNode2(cbNode, node.body);
  },
  [179 /* SetAccessor */]: function forEachChildInSetAccessor(node, cbNode, cbNodes) {
    return visitNodes(cbNode, cbNodes, node.modifiers) || visitNode2(cbNode, node.name) || visitNodes(cbNode, cbNodes, node.typeParameters) || visitNodes(cbNode, cbNodes, node.parameters) || visitNode2(cbNode, node.type) || visitNode2(cbNode, node.body);
  },
  [263 /* FunctionDeclaration */]: function forEachChildInFunctionDeclaration(node, cbNode, cbNodes) {
    return visitNodes(cbNode, cbNodes, node.modifiers) || visitNode2(cbNode, node.asteriskToken) || visitNode2(cbNode, node.name) || visitNodes(cbNode, cbNodes, node.typeParameters) || visitNodes(cbNode, cbNodes, node.parameters) || visitNode2(cbNode, node.type) || visitNode2(cbNode, node.body);
  },
  [219 /* FunctionExpression */]: function forEachChildInFunctionExpression(node, cbNode, cbNodes) {
    return visitNodes(cbNode, cbNodes, node.modifiers) || visitNode2(cbNode, node.asteriskToken) || visitNode2(cbNode, node.name) || visitNodes(cbNode, cbNodes, node.typeParameters) || visitNodes(cbNode, cbNodes, node.parameters) || visitNode2(cbNode, node.type) || visitNode2(cbNode, node.body);
  },
  [220 /* ArrowFunction */]: function forEachChildInArrowFunction(node, cbNode, cbNodes) {
    return visitNodes(cbNode, cbNodes, node.modifiers) || visitNodes(cbNode, cbNodes, node.typeParameters) || visitNodes(cbNode, cbNodes, node.parameters) || visitNode2(cbNode, node.type) || visitNode2(cbNode, node.equalsGreaterThanToken) || visitNode2(cbNode, node.body);
  },
  [176 /* ClassStaticBlockDeclaration */]: function forEachChildInClassStaticBlockDeclaration(node, cbNode, cbNodes) {
    return visitNodes(cbNode, cbNodes, node.modifiers) || visitNode2(cbNode, node.body);
  },
  [184 /* TypeReference */]: function forEachChildInTypeReference(node, cbNode, cbNodes) {
    return visitNode2(cbNode, node.typeName) || visitNodes(cbNode, cbNodes, node.typeArguments);
  },
  [183 /* TypePredicate */]: function forEachChildInTypePredicate(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.assertsModifier) || visitNode2(cbNode, node.parameterName) || visitNode2(cbNode, node.type);
  },
  [187 /* TypeQuery */]: function forEachChildInTypeQuery(node, cbNode, cbNodes) {
    return visitNode2(cbNode, node.exprName) || visitNodes(cbNode, cbNodes, node.typeArguments);
  },
  [188 /* TypeLiteral */]: function forEachChildInTypeLiteral(node, cbNode, cbNodes) {
    return visitNodes(cbNode, cbNodes, node.members);
  },
  [189 /* ArrayType */]: function forEachChildInArrayType(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.elementType);
  },
  [190 /* TupleType */]: function forEachChildInTupleType(node, cbNode, cbNodes) {
    return visitNodes(cbNode, cbNodes, node.elements);
  },
  [193 /* UnionType */]: forEachChildInUnionOrIntersectionType,
  [194 /* IntersectionType */]: forEachChildInUnionOrIntersectionType,
  [195 /* ConditionalType */]: function forEachChildInConditionalType(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.checkType) || visitNode2(cbNode, node.extendsType) || visitNode2(cbNode, node.trueType) || visitNode2(cbNode, node.falseType);
  },
  [196 /* InferType */]: function forEachChildInInferType(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.typeParameter);
  },
  [206 /* ImportType */]: function forEachChildInImportType(node, cbNode, cbNodes) {
    return visitNode2(cbNode, node.argument) || visitNode2(cbNode, node.attributes) || visitNode2(cbNode, node.qualifier) || visitNodes(cbNode, cbNodes, node.typeArguments);
  },
  [303 /* ImportTypeAssertionContainer */]: function forEachChildInImportTypeAssertionContainer(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.assertClause);
  },
  [197 /* ParenthesizedType */]: forEachChildInParenthesizedTypeOrTypeOperator,
  [199 /* TypeOperator */]: forEachChildInParenthesizedTypeOrTypeOperator,
  [200 /* IndexedAccessType */]: function forEachChildInIndexedAccessType(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.objectType) || visitNode2(cbNode, node.indexType);
  },
  [201 /* MappedType */]: function forEachChildInMappedType(node, cbNode, cbNodes) {
    return visitNode2(cbNode, node.readonlyToken) || visitNode2(cbNode, node.typeParameter) || visitNode2(cbNode, node.nameType) || visitNode2(cbNode, node.questionToken) || visitNode2(cbNode, node.type) || visitNodes(cbNode, cbNodes, node.members);
  },
  [202 /* LiteralType */]: function forEachChildInLiteralType(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.literal);
  },
  [203 /* NamedTupleMember */]: function forEachChildInNamedTupleMember(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.dotDotDotToken) || visitNode2(cbNode, node.name) || visitNode2(cbNode, node.questionToken) || visitNode2(cbNode, node.type);
  },
  [207 /* ObjectBindingPattern */]: forEachChildInObjectOrArrayBindingPattern,
  [208 /* ArrayBindingPattern */]: forEachChildInObjectOrArrayBindingPattern,
  [210 /* ArrayLiteralExpression */]: function forEachChildInArrayLiteralExpression(node, cbNode, cbNodes) {
    return visitNodes(cbNode, cbNodes, node.elements);
  },
  [211 /* ObjectLiteralExpression */]: function forEachChildInObjectLiteralExpression(node, cbNode, cbNodes) {
    return visitNodes(cbNode, cbNodes, node.properties);
  },
  [212 /* PropertyAccessExpression */]: function forEachChildInPropertyAccessExpression(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.expression) || visitNode2(cbNode, node.questionDotToken) || visitNode2(cbNode, node.name);
  },
  [213 /* ElementAccessExpression */]: function forEachChildInElementAccessExpression(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.expression) || visitNode2(cbNode, node.questionDotToken) || visitNode2(cbNode, node.argumentExpression);
  },
  [214 /* CallExpression */]: forEachChildInCallOrNewExpression,
  [215 /* NewExpression */]: forEachChildInCallOrNewExpression,
  [216 /* TaggedTemplateExpression */]: function forEachChildInTaggedTemplateExpression(node, cbNode, cbNodes) {
    return visitNode2(cbNode, node.tag) || visitNode2(cbNode, node.questionDotToken) || visitNodes(cbNode, cbNodes, node.typeArguments) || visitNode2(cbNode, node.template);
  },
  [217 /* TypeAssertionExpression */]: function forEachChildInTypeAssertionExpression(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.type) || visitNode2(cbNode, node.expression);
  },
  [218 /* ParenthesizedExpression */]: function forEachChildInParenthesizedExpression(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.expression);
  },
  [221 /* DeleteExpression */]: function forEachChildInDeleteExpression(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.expression);
  },
  [222 /* TypeOfExpression */]: function forEachChildInTypeOfExpression(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.expression);
  },
  [223 /* VoidExpression */]: function forEachChildInVoidExpression(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.expression);
  },
  [225 /* PrefixUnaryExpression */]: function forEachChildInPrefixUnaryExpression(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.operand);
  },
  [230 /* YieldExpression */]: function forEachChildInYieldExpression(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.asteriskToken) || visitNode2(cbNode, node.expression);
  },
  [224 /* AwaitExpression */]: function forEachChildInAwaitExpression(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.expression);
  },
  [226 /* PostfixUnaryExpression */]: function forEachChildInPostfixUnaryExpression(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.operand);
  },
  [227 /* BinaryExpression */]: function forEachChildInBinaryExpression(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.left) || visitNode2(cbNode, node.operatorToken) || visitNode2(cbNode, node.right);
  },
  [235 /* AsExpression */]: function forEachChildInAsExpression(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.expression) || visitNode2(cbNode, node.type);
  },
  [236 /* NonNullExpression */]: function forEachChildInNonNullExpression(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.expression);
  },
  [239 /* SatisfiesExpression */]: function forEachChildInSatisfiesExpression(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.expression) || visitNode2(cbNode, node.type);
  },
  [237 /* MetaProperty */]: function forEachChildInMetaProperty(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.name);
  },
  [228 /* ConditionalExpression */]: function forEachChildInConditionalExpression(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.condition) || visitNode2(cbNode, node.questionToken) || visitNode2(cbNode, node.whenTrue) || visitNode2(cbNode, node.colonToken) || visitNode2(cbNode, node.whenFalse);
  },
  [231 /* SpreadElement */]: function forEachChildInSpreadElement(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.expression);
  },
  [242 /* Block */]: forEachChildInBlock,
  [269 /* ModuleBlock */]: forEachChildInBlock,
  [308 /* SourceFile */]: function forEachChildInSourceFile(node, cbNode, cbNodes) {
    return visitNodes(cbNode, cbNodes, node.statements) || visitNode2(cbNode, node.endOfFileToken);
  },
  [244 /* VariableStatement */]: function forEachChildInVariableStatement(node, cbNode, cbNodes) {
    return visitNodes(cbNode, cbNodes, node.modifiers) || visitNode2(cbNode, node.declarationList);
  },
  [262 /* VariableDeclarationList */]: function forEachChildInVariableDeclarationList(node, cbNode, cbNodes) {
    return visitNodes(cbNode, cbNodes, node.declarations);
  },
  [245 /* ExpressionStatement */]: function forEachChildInExpressionStatement(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.expression);
  },
  [246 /* IfStatement */]: function forEachChildInIfStatement(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.expression) || visitNode2(cbNode, node.thenStatement) || visitNode2(cbNode, node.elseStatement);
  },
  [247 /* DoStatement */]: function forEachChildInDoStatement(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.statement) || visitNode2(cbNode, node.expression);
  },
  [248 /* WhileStatement */]: function forEachChildInWhileStatement(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.expression) || visitNode2(cbNode, node.statement);
  },
  [249 /* ForStatement */]: function forEachChildInForStatement(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.initializer) || visitNode2(cbNode, node.condition) || visitNode2(cbNode, node.incrementor) || visitNode2(cbNode, node.statement);
  },
  [250 /* ForInStatement */]: function forEachChildInForInStatement(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.initializer) || visitNode2(cbNode, node.expression) || visitNode2(cbNode, node.statement);
  },
  [251 /* ForOfStatement */]: function forEachChildInForOfStatement(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.awaitModifier) || visitNode2(cbNode, node.initializer) || visitNode2(cbNode, node.expression) || visitNode2(cbNode, node.statement);
  },
  [252 /* ContinueStatement */]: forEachChildInContinueOrBreakStatement,
  [253 /* BreakStatement */]: forEachChildInContinueOrBreakStatement,
  [254 /* ReturnStatement */]: function forEachChildInReturnStatement(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.expression);
  },
  [255 /* WithStatement */]: function forEachChildInWithStatement(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.expression) || visitNode2(cbNode, node.statement);
  },
  [256 /* SwitchStatement */]: function forEachChildInSwitchStatement(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.expression) || visitNode2(cbNode, node.caseBlock);
  },
  [270 /* CaseBlock */]: function forEachChildInCaseBlock(node, cbNode, cbNodes) {
    return visitNodes(cbNode, cbNodes, node.clauses);
  },
  [297 /* CaseClause */]: function forEachChildInCaseClause(node, cbNode, cbNodes) {
    return visitNode2(cbNode, node.expression) || visitNodes(cbNode, cbNodes, node.statements);
  },
  [298 /* DefaultClause */]: function forEachChildInDefaultClause(node, cbNode, cbNodes) {
    return visitNodes(cbNode, cbNodes, node.statements);
  },
  [257 /* LabeledStatement */]: function forEachChildInLabeledStatement(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.label) || visitNode2(cbNode, node.statement);
  },
  [258 /* ThrowStatement */]: function forEachChildInThrowStatement(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.expression);
  },
  [259 /* TryStatement */]: function forEachChildInTryStatement(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.tryBlock) || visitNode2(cbNode, node.catchClause) || visitNode2(cbNode, node.finallyBlock);
  },
  [300 /* CatchClause */]: function forEachChildInCatchClause(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.variableDeclaration) || visitNode2(cbNode, node.block);
  },
  [171 /* Decorator */]: function forEachChildInDecorator(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.expression);
  },
  [264 /* ClassDeclaration */]: forEachChildInClassDeclarationOrExpression,
  [232 /* ClassExpression */]: forEachChildInClassDeclarationOrExpression,
  [265 /* InterfaceDeclaration */]: function forEachChildInInterfaceDeclaration(node, cbNode, cbNodes) {
    return visitNodes(cbNode, cbNodes, node.modifiers) || visitNode2(cbNode, node.name) || visitNodes(cbNode, cbNodes, node.typeParameters) || visitNodes(cbNode, cbNodes, node.heritageClauses) || visitNodes(cbNode, cbNodes, node.members);
  },
  [266 /* TypeAliasDeclaration */]: function forEachChildInTypeAliasDeclaration(node, cbNode, cbNodes) {
    return visitNodes(cbNode, cbNodes, node.modifiers) || visitNode2(cbNode, node.name) || visitNodes(cbNode, cbNodes, node.typeParameters) || visitNode2(cbNode, node.type);
  },
  [267 /* EnumDeclaration */]: function forEachChildInEnumDeclaration(node, cbNode, cbNodes) {
    return visitNodes(cbNode, cbNodes, node.modifiers) || visitNode2(cbNode, node.name) || visitNodes(cbNode, cbNodes, node.members);
  },
  [307 /* EnumMember */]: function forEachChildInEnumMember(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.name) || visitNode2(cbNode, node.initializer);
  },
  [268 /* ModuleDeclaration */]: function forEachChildInModuleDeclaration(node, cbNode, cbNodes) {
    return visitNodes(cbNode, cbNodes, node.modifiers) || visitNode2(cbNode, node.name) || visitNode2(cbNode, node.body);
  },
  [272 /* ImportEqualsDeclaration */]: function forEachChildInImportEqualsDeclaration(node, cbNode, cbNodes) {
    return visitNodes(cbNode, cbNodes, node.modifiers) || visitNode2(cbNode, node.name) || visitNode2(cbNode, node.moduleReference);
  },
  [273 /* ImportDeclaration */]: function forEachChildInImportDeclaration(node, cbNode, cbNodes) {
    return visitNodes(cbNode, cbNodes, node.modifiers) || visitNode2(cbNode, node.importClause) || visitNode2(cbNode, node.moduleSpecifier) || visitNode2(cbNode, node.attributes);
  },
  [274 /* ImportClause */]: function forEachChildInImportClause(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.name) || visitNode2(cbNode, node.namedBindings);
  },
  [301 /* ImportAttributes */]: function forEachChildInImportAttributes(node, cbNode, cbNodes) {
    return visitNodes(cbNode, cbNodes, node.elements);
  },
  [302 /* ImportAttribute */]: function forEachChildInImportAttribute(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.name) || visitNode2(cbNode, node.value);
  },
  [271 /* NamespaceExportDeclaration */]: function forEachChildInNamespaceExportDeclaration(node, cbNode, cbNodes) {
    return visitNodes(cbNode, cbNodes, node.modifiers) || visitNode2(cbNode, node.name);
  },
  [275 /* NamespaceImport */]: function forEachChildInNamespaceImport(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.name);
  },
  [281 /* NamespaceExport */]: function forEachChildInNamespaceExport(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.name);
  },
  [276 /* NamedImports */]: forEachChildInNamedImportsOrExports,
  [280 /* NamedExports */]: forEachChildInNamedImportsOrExports,
  [279 /* ExportDeclaration */]: function forEachChildInExportDeclaration(node, cbNode, cbNodes) {
    return visitNodes(cbNode, cbNodes, node.modifiers) || visitNode2(cbNode, node.exportClause) || visitNode2(cbNode, node.moduleSpecifier) || visitNode2(cbNode, node.attributes);
  },
  [277 /* ImportSpecifier */]: forEachChildInImportOrExportSpecifier,
  [282 /* ExportSpecifier */]: forEachChildInImportOrExportSpecifier,
  [278 /* ExportAssignment */]: function forEachChildInExportAssignment(node, cbNode, cbNodes) {
    return visitNodes(cbNode, cbNodes, node.modifiers) || visitNode2(cbNode, node.expression);
  },
  [229 /* TemplateExpression */]: function forEachChildInTemplateExpression(node, cbNode, cbNodes) {
    return visitNode2(cbNode, node.head) || visitNodes(cbNode, cbNodes, node.templateSpans);
  },
  [240 /* TemplateSpan */]: function forEachChildInTemplateSpan(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.expression) || visitNode2(cbNode, node.literal);
  },
  [204 /* TemplateLiteralType */]: function forEachChildInTemplateLiteralType(node, cbNode, cbNodes) {
    return visitNode2(cbNode, node.head) || visitNodes(cbNode, cbNodes, node.templateSpans);
  },
  [205 /* TemplateLiteralTypeSpan */]: function forEachChildInTemplateLiteralTypeSpan(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.type) || visitNode2(cbNode, node.literal);
  },
  [168 /* ComputedPropertyName */]: function forEachChildInComputedPropertyName(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.expression);
  },
  [299 /* HeritageClause */]: function forEachChildInHeritageClause(node, cbNode, cbNodes) {
    return visitNodes(cbNode, cbNodes, node.types);
  },
  [234 /* ExpressionWithTypeArguments */]: function forEachChildInExpressionWithTypeArguments(node, cbNode, cbNodes) {
    return visitNode2(cbNode, node.expression) || visitNodes(cbNode, cbNodes, node.typeArguments);
  },
  [284 /* ExternalModuleReference */]: function forEachChildInExternalModuleReference(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.expression);
  },
  [283 /* MissingDeclaration */]: function forEachChildInMissingDeclaration(node, cbNode, cbNodes) {
    return visitNodes(cbNode, cbNodes, node.modifiers);
  },
  [357 /* CommaListExpression */]: function forEachChildInCommaListExpression(node, cbNode, cbNodes) {
    return visitNodes(cbNode, cbNodes, node.elements);
  },
  [285 /* JsxElement */]: function forEachChildInJsxElement(node, cbNode, cbNodes) {
    return visitNode2(cbNode, node.openingElement) || visitNodes(cbNode, cbNodes, node.children) || visitNode2(cbNode, node.closingElement);
  },
  [289 /* JsxFragment */]: function forEachChildInJsxFragment(node, cbNode, cbNodes) {
    return visitNode2(cbNode, node.openingFragment) || visitNodes(cbNode, cbNodes, node.children) || visitNode2(cbNode, node.closingFragment);
  },
  [286 /* JsxSelfClosingElement */]: forEachChildInJsxOpeningOrSelfClosingElement,
  [287 /* JsxOpeningElement */]: forEachChildInJsxOpeningOrSelfClosingElement,
  [293 /* JsxAttributes */]: function forEachChildInJsxAttributes(node, cbNode, cbNodes) {
    return visitNodes(cbNode, cbNodes, node.properties);
  },
  [292 /* JsxAttribute */]: function forEachChildInJsxAttribute(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.name) || visitNode2(cbNode, node.initializer);
  },
  [294 /* JsxSpreadAttribute */]: function forEachChildInJsxSpreadAttribute(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.expression);
  },
  [295 /* JsxExpression */]: function forEachChildInJsxExpression(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.dotDotDotToken) || visitNode2(cbNode, node.expression);
  },
  [288 /* JsxClosingElement */]: function forEachChildInJsxClosingElement(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.tagName);
  },
  [296 /* JsxNamespacedName */]: function forEachChildInJsxNamespacedName(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.namespace) || visitNode2(cbNode, node.name);
  },
  [191 /* OptionalType */]: forEachChildInOptionalRestOrJSDocParameterModifier,
  [192 /* RestType */]: forEachChildInOptionalRestOrJSDocParameterModifier,
  [310 /* JSDocTypeExpression */]: forEachChildInOptionalRestOrJSDocParameterModifier,
  [316 /* JSDocNonNullableType */]: forEachChildInOptionalRestOrJSDocParameterModifier,
  [315 /* JSDocNullableType */]: forEachChildInOptionalRestOrJSDocParameterModifier,
  [317 /* JSDocOptionalType */]: forEachChildInOptionalRestOrJSDocParameterModifier,
  [319 /* JSDocVariadicType */]: forEachChildInOptionalRestOrJSDocParameterModifier,
  [318 /* JSDocFunctionType */]: function forEachChildInJSDocFunctionType(node, cbNode, cbNodes) {
    return visitNodes(cbNode, cbNodes, node.parameters) || visitNode2(cbNode, node.type);
  },
  [321 /* JSDoc */]: function forEachChildInJSDoc(node, cbNode, cbNodes) {
    return (typeof node.comment === "string" ? void 0 : visitNodes(cbNode, cbNodes, node.comment)) || visitNodes(cbNode, cbNodes, node.tags);
  },
  [348 /* JSDocSeeTag */]: function forEachChildInJSDocSeeTag(node, cbNode, cbNodes) {
    return visitNode2(cbNode, node.tagName) || visitNode2(cbNode, node.name) || (typeof node.comment === "string" ? void 0 : visitNodes(cbNode, cbNodes, node.comment));
  },
  [311 /* JSDocNameReference */]: function forEachChildInJSDocNameReference(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.name);
  },
  [312 /* JSDocMemberName */]: function forEachChildInJSDocMemberName(node, cbNode, _cbNodes) {
    return visitNode2(cbNode, node.left) || visitNode2(cbNode, node.right);
  },
  [342 /* JSDocParameterTag */]: forEachChildInJSDocParameterOrPropertyTag,
  [349 /* JSDocPropertyTag */]: forEachChildInJSDocParameterOrPropertyTag,
  [331 /* JSDocAuthorTag */]: function forEachChildInJSDocAuthorTag(node, cbNode, cbNodes) {
    return visitNode2(cbNode, node.tagName) || (typeof node.comment === "string" ? void 0 : visitNodes(cbNode, cbNodes, node.comment));
  },
  [330 /* JSDocImplementsTag */]: function forEachChildInJSDocImplementsTag(node, cbNode, cbNodes) {
    return visitNode2(cbNode, node.tagName) || visitNode2(cbNode, node.class) || (typeof node.comment === "string" ? void 0 : visitNodes(cbNode, cbNodes, node.comment));
  },
  [329 /* JSDocAugmentsTag */]: function forEachChildInJSDocAugmentsTag(node, cbNode, cbNodes) {
    return visitNode2(cbNode, node.tagName) || visitNode2(cbNode, node.class) || (typeof node.comment === "string" ? void 0 : visitNodes(cbNode, cbNodes, node.comment));
  },
  [346 /* JSDocTemplateTag */]: function forEachChildInJSDocTemplateTag(node, cbNode, cbNodes) {
    return visitNode2(cbNode, node.tagName) || visitNode2(cbNode, node.constraint) || visitNodes(cbNode, cbNodes, node.typeParameters) || (typeof node.comment === "string" ? void 0 : visitNodes(cbNode, cbNodes, node.comment));
  },
  [347 /* JSDocTypedefTag */]: function forEachChildInJSDocTypedefTag(node, cbNode, cbNodes) {
    return visitNode2(cbNode, node.tagName) || (node.typeExpression && node.typeExpression.kind === 310 /* JSDocTypeExpression */ ? visitNode2(cbNode, node.typeExpression) || visitNode2(cbNode, node.fullName) || (typeof node.comment === "string" ? void 0 : visitNodes(cbNode, cbNodes, node.comment)) : visitNode2(cbNode, node.fullName) || visitNode2(cbNode, node.typeExpression) || (typeof node.comment === "string" ? void 0 : visitNodes(cbNode, cbNodes, node.comment)));
  },
  [339 /* JSDocCallbackTag */]: function forEachChildInJSDocCallbackTag(node, cbNode, cbNodes) {
    return visitNode2(cbNode, node.tagName) || visitNode2(cbNode, node.fullName) || visitNode2(cbNode, node.typeExpression) || (typeof node.comment === "string" ? void 0 : visitNodes(cbNode, cbNodes, node.comment));
  },
  [343 /* JSDocReturnTag */]: forEachChildInJSDocTypeLikeTag,
  [345 /* JSDocTypeTag */]: forEachChildInJSDocTypeLikeTag,
  [344 /* JSDocThisTag */]: forEachChildInJSDocTypeLikeTag,
  [341 /* JSDocEnumTag */]: forEachChildInJSDocTypeLikeTag,
  [351 /* JSDocSatisfiesTag */]: forEachChildInJSDocTypeLikeTag,
  [350 /* JSDocThrowsTag */]: forEachChildInJSDocTypeLikeTag,
  [340 /* JSDocOverloadTag */]: forEachChildInJSDocTypeLikeTag,
  [324 /* JSDocSignature */]: function forEachChildInJSDocSignature(node, cbNode, _cbNodes) {
    return forEach(node.typeParameters, cbNode) || forEach(node.parameters, cbNode) || visitNode2(cbNode, node.type);
  },
  [325 /* JSDocLink */]: forEachChildInJSDocLinkCodeOrPlain,
  [326 /* JSDocLinkCode */]: forEachChildInJSDocLinkCodeOrPlain,
  [327 /* JSDocLinkPlain */]: forEachChildInJSDocLinkCodeOrPlain,
  [323 /* JSDocTypeLiteral */]: function forEachChildInJSDocTypeLiteral(node, cbNode, _cbNodes) {
    return forEach(node.jsDocPropertyTags, cbNode);
  },
  [328 /* JSDocTag */]: forEachChildInJSDocTag,
  [333 /* JSDocClassTag */]: forEachChildInJSDocTag,
  [334 /* JSDocPublicTag */]: forEachChildInJSDocTag,
  [335 /* JSDocPrivateTag */]: forEachChildInJSDocTag,
  [336 /* JSDocProtectedTag */]: forEachChildInJSDocTag,
  [337 /* JSDocReadonlyTag */]: forEachChildInJSDocTag,
  [332 /* JSDocDeprecatedTag */]: forEachChildInJSDocTag,
  [338 /* JSDocOverrideTag */]: forEachChildInJSDocTag,
  [352 /* JSDocImportTag */]: forEachChildInJSDocImportTag,
  [356 /* PartiallyEmittedExpression */]: forEachChildInPartiallyEmittedExpression
};
function forEachChildInCallOrConstructSignature(node, cbNode, cbNodes) {
  return visitNodes(cbNode, cbNodes, node.typeParameters) || visitNodes(cbNode, cbNodes, node.parameters) || visitNode2(cbNode, node.type);
}
function forEachChildInUnionOrIntersectionType(node, cbNode, cbNodes) {
  return visitNodes(cbNode, cbNodes, node.types);
}
function forEachChildInParenthesizedTypeOrTypeOperator(node, cbNode, _cbNodes) {
  return visitNode2(cbNode, node.type);
}
function forEachChildInObjectOrArrayBindingPattern(node, cbNode, cbNodes) {
  return visitNodes(cbNode, cbNodes, node.elements);
}
function forEachChildInCallOrNewExpression(node, cbNode, cbNodes) {
  return visitNode2(cbNode, node.expression) || // TODO: should we separate these branches out?
  visitNode2(cbNode, node.questionDotToken) || visitNodes(cbNode, cbNodes, node.typeArguments) || visitNodes(cbNode, cbNodes, node.arguments);
}
function forEachChildInBlock(node, cbNode, cbNodes) {
  return visitNodes(cbNode, cbNodes, node.statements);
}
function forEachChildInContinueOrBreakStatement(node, cbNode, _cbNodes) {
  return visitNode2(cbNode, node.label);
}
function forEachChildInClassDeclarationOrExpression(node, cbNode, cbNodes) {
  return visitNodes(cbNode, cbNodes, node.modifiers) || visitNode2(cbNode, node.name) || visitNodes(cbNode, cbNodes, node.typeParameters) || visitNodes(cbNode, cbNodes, node.heritageClauses) || visitNodes(cbNode, cbNodes, node.members);
}
function forEachChildInNamedImportsOrExports(node, cbNode, cbNodes) {
  return visitNodes(cbNode, cbNodes, node.elements);
}
function forEachChildInImportOrExportSpecifier(node, cbNode, _cbNodes) {
  return visitNode2(cbNode, node.propertyName) || visitNode2(cbNode, node.name);
}
function forEachChildInJsxOpeningOrSelfClosingElement(node, cbNode, cbNodes) {
  return visitNode2(cbNode, node.tagName) || visitNodes(cbNode, cbNodes, node.typeArguments) || visitNode2(cbNode, node.attributes);
}
function forEachChildInOptionalRestOrJSDocParameterModifier(node, cbNode, _cbNodes) {
  return visitNode2(cbNode, node.type);
}
function forEachChildInJSDocParameterOrPropertyTag(node, cbNode, cbNodes) {
  return visitNode2(cbNode, node.tagName) || (node.isNameFirst ? visitNode2(cbNode, node.name) || visitNode2(cbNode, node.typeExpression) : visitNode2(cbNode, node.typeExpression) || visitNode2(cbNode, node.name)) || (typeof node.comment === "string" ? void 0 : visitNodes(cbNode, cbNodes, node.comment));
}
function forEachChildInJSDocTypeLikeTag(node, cbNode, cbNodes) {
  return visitNode2(cbNode, node.tagName) || visitNode2(cbNode, node.typeExpression) || (typeof node.comment === "string" ? void 0 : visitNodes(cbNode, cbNodes, node.comment));
}
function forEachChildInJSDocLinkCodeOrPlain(node, cbNode, _cbNodes) {
  return visitNode2(cbNode, node.name);
}
function forEachChildInJSDocTag(node, cbNode, cbNodes) {
  return visitNode2(cbNode, node.tagName) || (typeof node.comment === "string" ? void 0 : visitNodes(cbNode, cbNodes, node.comment));
}
function forEachChildInJSDocImportTag(node, cbNode, cbNodes) {
  return visitNode2(cbNode, node.tagName) || visitNode2(cbNode, node.importClause) || visitNode2(cbNode, node.moduleSpecifier) || visitNode2(cbNode, node.attributes) || (typeof node.comment === "string" ? void 0 : visitNodes(cbNode, cbNodes, node.comment));
}
function forEachChildInPartiallyEmittedExpression(node, cbNode, _cbNodes) {
  return visitNode2(cbNode, node.expression);
}
function forEachChild(node, cbNode, cbNodes) {
  if (node === void 0 || node.kind <= 166 /* LastToken */) {
    return;
  }
  const fn = forEachChildTable[node.kind];
  return fn === void 0 ? void 0 : fn(node, cbNode, cbNodes);
}
function forEachChildRecursively(rootNode, cbNode, cbNodes) {
  const queue = gatherPossibleChildren(rootNode);
  const parents = [];
  while (parents.length < queue.length) {
    parents.push(rootNode);
  }
  while (queue.length !== 0) {
    const current = queue.pop();
    const parent2 = parents.pop();
    if (isArray(current)) {
      if (cbNodes) {
        const res = cbNodes(current, parent2);
        if (res) {
          if (res === "skip") continue;
          return res;
        }
      }
      for (let i = current.length - 1; i >= 0; --i) {
        queue.push(current[i]);
        parents.push(parent2);
      }
    } else {
      const res = cbNode(current, parent2);
      if (res) {
        if (res === "skip") continue;
        return res;
      }
      if (current.kind >= 167 /* FirstNode */) {
        for (const child of gatherPossibleChildren(current)) {
          queue.push(child);
          parents.push(current);
        }
      }
    }
  }
}
function gatherPossibleChildren(node) {
  const children = [];
  forEachChild(node, addWorkItem, addWorkItem);
  return children;
  function addWorkItem(n) {
    children.unshift(n);
  }
}
function setExternalModuleIndicator(sourceFile) {
  sourceFile.externalModuleIndicator = isFileProbablyExternalModule(sourceFile);
}
function createSourceFile(fileName, sourceText, languageVersionOrOptions, setParentNodes = false, scriptKind) {
  var _a, _b;
  (_a = tracing) == null ? void 0 : _a.push(
    tracing.Phase.Parse,
    "createSourceFile",
    { path: fileName },
    /*separateBeginAndEnd*/
    true
  );
  mark("beforeParse");
  let result;
  const {
    languageVersion,
    setExternalModuleIndicator: overrideSetExternalModuleIndicator,
    impliedNodeFormat: format,
    jsDocParsingMode
  } = typeof languageVersionOrOptions === "object" ? languageVersionOrOptions : { languageVersion: languageVersionOrOptions };
  if (languageVersion === 100 /* JSON */) {
    result = Parser.parseSourceFile(
      fileName,
      sourceText,
      languageVersion,
      /*syntaxCursor*/
      void 0,
      setParentNodes,
      6 /* JSON */,
      noop,
      jsDocParsingMode
    );
  } else {
    const setIndicator = format === void 0 ? overrideSetExternalModuleIndicator : (file) => {
      file.impliedNodeFormat = format;
      return (overrideSetExternalModuleIndicator || setExternalModuleIndicator)(file);
    };
    result = Parser.parseSourceFile(
      fileName,
      sourceText,
      languageVersion,
      /*syntaxCursor*/
      void 0,
      setParentNodes,
      scriptKind,
      setIndicator,
      jsDocParsingMode
    );
  }
  mark("afterParse");
  measure("Parse", "beforeParse", "afterParse");
  (_b = tracing) == null ? void 0 : _b.pop();
  return result;
}
function isExternalModule(file) {
  return file.externalModuleIndicator !== void 0;
}
function updateSourceFile(sourceFile, newText, textChangeRange, aggressiveChecks = false) {
  const newSourceFile = IncrementalParser.updateSourceFile(sourceFile, newText, textChangeRange, aggressiveChecks);
  newSourceFile.flags |= sourceFile.flags & 12582912 /* PermanentlySetIncrementalFlags */;
  return newSourceFile;
}
var Parser;
((Parser2) => {
  var scanner2 = createScanner(
    99 /* Latest */,
    /*skipTrivia*/
    true
  );
  var disallowInAndDecoratorContext = 8192 /* DisallowInContext */ | 32768 /* DecoratorContext */;
  var NodeConstructor2;
  var TokenConstructor2;
  var IdentifierConstructor2;
  var PrivateIdentifierConstructor2;
  var SourceFileConstructor2;
  function countNode(node) {
    nodeCount++;
    return node;
  }
  var baseNodeFactory = {
    createBaseSourceFileNode: (kind) => countNode(new SourceFileConstructor2(
      kind,
      /*pos*/
      0,
      /*end*/
      0
    )),
    createBaseIdentifierNode: (kind) => countNode(new IdentifierConstructor2(
      kind,
      /*pos*/
      0,
      /*end*/
      0
    )),
    createBasePrivateIdentifierNode: (kind) => countNode(new PrivateIdentifierConstructor2(
      kind,
      /*pos*/
      0,
      /*end*/
      0
    )),
    createBaseTokenNode: (kind) => countNode(new TokenConstructor2(
      kind,
      /*pos*/
      0,
      /*end*/
      0
    )),
    createBaseNode: (kind) => countNode(new NodeConstructor2(
      kind,
      /*pos*/
      0,
      /*end*/
      0
    ))
  };
  var factory2 = createNodeFactory(1 /* NoParenthesizerRules */ | 2 /* NoNodeConverters */ | 8 /* NoOriginalNode */, baseNodeFactory);
  var {
    createNodeArray: factoryCreateNodeArray,
    createNumericLiteral: factoryCreateNumericLiteral,
    createStringLiteral: factoryCreateStringLiteral,
    createLiteralLikeNode: factoryCreateLiteralLikeNode,
    createIdentifier: factoryCreateIdentifier,
    createPrivateIdentifier: factoryCreatePrivateIdentifier,
    createToken: factoryCreateToken,
    createArrayLiteralExpression: factoryCreateArrayLiteralExpression,
    createObjectLiteralExpression: factoryCreateObjectLiteralExpression,
    createPropertyAccessExpression: factoryCreatePropertyAccessExpression,
    createPropertyAccessChain: factoryCreatePropertyAccessChain,
    createElementAccessExpression: factoryCreateElementAccessExpression,
    createElementAccessChain: factoryCreateElementAccessChain,
    createCallExpression: factoryCreateCallExpression,
    createCallChain: factoryCreateCallChain,
    createNewExpression: factoryCreateNewExpression,
    createParenthesizedExpression: factoryCreateParenthesizedExpression,
    createBlock: factoryCreateBlock,
    createVariableStatement: factoryCreateVariableStatement,
    createExpressionStatement: factoryCreateExpressionStatement,
    createIfStatement: factoryCreateIfStatement,
    createWhileStatement: factoryCreateWhileStatement,
    createForStatement: factoryCreateForStatement,
    createForOfStatement: factoryCreateForOfStatement,
    createVariableDeclaration: factoryCreateVariableDeclaration,
    createVariableDeclarationList: factoryCreateVariableDeclarationList
  } = factory2;
  var fileName;
  var sourceFlags;
  var sourceText;
  var languageVersion;
  var scriptKind;
  var languageVariant;
  var parseDiagnostics;
  var jsDocDiagnostics;
  var syntaxCursor;
  var currentToken;
  var nodeCount;
  var identifiers;
  var identifierCount;
  var parsingContext;
  var notParenthesizedArrow;
  var contextFlags;
  var topLevel = true;
  var parseErrorBeforeNextFinishedNode = false;
  function parseSourceFile(fileName2, sourceText2, languageVersion2, syntaxCursor2, setParentNodes = false, scriptKind2, setExternalModuleIndicatorOverride, jsDocParsingMode = 0 /* ParseAll */) {
    var _a;
    scriptKind2 = ensureScriptKind(fileName2, scriptKind2);
    if (scriptKind2 === 6 /* JSON */) {
      const result2 = parseJsonText2(fileName2, sourceText2, languageVersion2, syntaxCursor2, setParentNodes);
      convertToJson(
        result2,
        (_a = result2.statements[0]) == null ? void 0 : _a.expression,
        result2.parseDiagnostics,
        /*returnValue*/
        false,
        /*jsonConversionNotifier*/
        void 0
      );
      result2.referencedFiles = emptyArray;
      result2.typeReferenceDirectives = emptyArray;
      result2.libReferenceDirectives = emptyArray;
      result2.amdDependencies = emptyArray;
      result2.hasNoDefaultLib = false;
      result2.pragmas = emptyMap;
      return result2;
    }
    initializeState(fileName2, sourceText2, languageVersion2, syntaxCursor2, scriptKind2, jsDocParsingMode);
    const result = parseSourceFileWorker(languageVersion2, setParentNodes, scriptKind2, setExternalModuleIndicatorOverride || setExternalModuleIndicator, jsDocParsingMode);
    clearState();
    return result;
  }
  Parser2.parseSourceFile = parseSourceFile;
  function parseIsolatedEntityName2(content, languageVersion2) {
    initializeState(
      "",
      content,
      languageVersion2,
      /*syntaxCursor*/
      void 0,
      1 /* JS */,
      0 /* ParseAll */
    );
    nextToken();
    const entityName = parseEntityName(
      /*allowReservedWords*/
      true
    );
    const isValid = token() === 1 /* EndOfFileToken */ && !parseDiagnostics.length;
    clearState();
    return isValid ? entityName : void 0;
  }
  Parser2.parseIsolatedEntityName = parseIsolatedEntityName2;
  function parseJsonText2(fileName2, sourceText2, languageVersion2 = 2 /* ES2015 */, syntaxCursor2, setParentNodes = false) {
    initializeState(fileName2, sourceText2, languageVersion2, syntaxCursor2, 6 /* JSON */, 0 /* ParseAll */);
    sourceFlags = contextFlags;
    nextToken();
    const pos = getNodePos();
    let statements, endOfFileToken;
    if (token() === 1 /* EndOfFileToken */) {
      statements = createNodeArray([], pos, pos);
      endOfFileToken = parseTokenNode();
    } else {
      let expressions;
      while (token() !== 1 /* EndOfFileToken */) {
        let expression2;
        switch (token()) {
          case 23 /* OpenBracketToken */:
            expression2 = parseArrayLiteralExpression();
            break;
          case 112 /* TrueKeyword */:
          case 97 /* FalseKeyword */:
          case 106 /* NullKeyword */:
            expression2 = parseTokenNode();
            break;
          case 41 /* MinusToken */:
            if (lookAhead(() => nextToken() === 9 /* NumericLiteral */ && nextToken() !== 59 /* ColonToken */)) {
              expression2 = parsePrefixUnaryExpression();
            } else {
              expression2 = parseObjectLiteralExpression();
            }
            break;
          case 9 /* NumericLiteral */:
          case 11 /* StringLiteral */:
            if (lookAhead(() => nextToken() !== 59 /* ColonToken */)) {
              expression2 = parseLiteralNode();
              break;
            }
          // falls through
          default:
            expression2 = parseObjectLiteralExpression();
            break;
        }
        if (expressions && isArray(expressions)) {
          expressions.push(expression2);
        } else if (expressions) {
          expressions = [expressions, expression2];
        } else {
          expressions = expression2;
          if (token() !== 1 /* EndOfFileToken */) {
            parseErrorAtCurrentToken(Diagnostics.Unexpected_token);
          }
        }
      }
      const expression = isArray(expressions) ? finishNode(factoryCreateArrayLiteralExpression(expressions), pos) : Debug.checkDefined(expressions);
      const statement = factoryCreateExpressionStatement(expression);
      finishNode(statement, pos);
      statements = createNodeArray([statement], pos);
      endOfFileToken = parseExpectedToken(1 /* EndOfFileToken */, Diagnostics.Unexpected_token);
    }
    const sourceFile = createSourceFile2(
      fileName2,
      2 /* ES2015 */,
      6 /* JSON */,
      /*isDeclarationFile*/
      false,
      statements,
      endOfFileToken,
      sourceFlags,
      noop
    );
    if (setParentNodes) {
      fixupParentReferences(sourceFile);
    }
    sourceFile.nodeCount = nodeCount;
    sourceFile.identifierCount = identifierCount;
    sourceFile.identifiers = identifiers;
    sourceFile.parseDiagnostics = attachFileToDiagnostics(parseDiagnostics, sourceFile);
    if (jsDocDiagnostics) {
      sourceFile.jsDocDiagnostics = attachFileToDiagnostics(jsDocDiagnostics, sourceFile);
    }
    const result = sourceFile;
    clearState();
    return result;
  }
  Parser2.parseJsonText = parseJsonText2;
  function initializeState(_fileName, _sourceText, _languageVersion, _syntaxCursor, _scriptKind, _jsDocParsingMode) {
    NodeConstructor2 = objectAllocator.getNodeConstructor();
    TokenConstructor2 = objectAllocator.getTokenConstructor();
    IdentifierConstructor2 = objectAllocator.getIdentifierConstructor();
    PrivateIdentifierConstructor2 = objectAllocator.getPrivateIdentifierConstructor();
    SourceFileConstructor2 = objectAllocator.getSourceFileConstructor();
    fileName = normalizePath(_fileName);
    sourceText = _sourceText;
    languageVersion = _languageVersion;
    syntaxCursor = _syntaxCursor;
    scriptKind = _scriptKind;
    languageVariant = getLanguageVariant(_scriptKind);
    parseDiagnostics = [];
    parsingContext = 0;
    identifiers = /* @__PURE__ */ new Map();
    identifierCount = 0;
    nodeCount = 0;
    sourceFlags = 0;
    topLevel = true;
    switch (scriptKind) {
      case 1 /* JS */:
      case 2 /* JSX */:
        contextFlags = 524288 /* JavaScriptFile */;
        break;
      case 6 /* JSON */:
        contextFlags = 524288 /* JavaScriptFile */ | 134217728 /* JsonFile */;
        break;
      default:
        contextFlags = 0 /* None */;
        break;
    }
    parseErrorBeforeNextFinishedNode = false;
    scanner2.setText(sourceText);
    scanner2.setOnError(scanError);
    scanner2.setScriptTarget(languageVersion);
    scanner2.setLanguageVariant(languageVariant);
    scanner2.setScriptKind(scriptKind);
    scanner2.setJSDocParsingMode(_jsDocParsingMode);
  }
  function clearState() {
    scanner2.clearCommentDirectives();
    scanner2.setText("");
    scanner2.setOnError(void 0);
    scanner2.setScriptKind(0 /* Unknown */);
    scanner2.setJSDocParsingMode(0 /* ParseAll */);
    sourceText = void 0;
    languageVersion = void 0;
    syntaxCursor = void 0;
    scriptKind = void 0;
    languageVariant = void 0;
    sourceFlags = 0;
    parseDiagnostics = void 0;
    jsDocDiagnostics = void 0;
    parsingContext = 0;
    identifiers = void 0;
    notParenthesizedArrow = void 0;
    topLevel = true;
  }
  function parseSourceFileWorker(languageVersion2, setParentNodes, scriptKind2, setExternalModuleIndicator2, jsDocParsingMode) {
    const isDeclarationFile = isDeclarationFileName(fileName);
    if (isDeclarationFile) {
      contextFlags |= 33554432 /* Ambient */;
    }
    sourceFlags = contextFlags;
    nextToken();
    const statements = parseList(0 /* SourceElements */, parseStatement);
    Debug.assert(token() === 1 /* EndOfFileToken */);
    const endHasJSDoc = hasPrecedingJSDocComment();
    const endOfFileToken = withJSDoc(parseTokenNode(), endHasJSDoc);
    const sourceFile = createSourceFile2(fileName, languageVersion2, scriptKind2, isDeclarationFile, statements, endOfFileToken, sourceFlags, setExternalModuleIndicator2);
    processCommentPragmas(sourceFile, sourceText);
    processPragmasIntoFields(sourceFile, reportPragmaDiagnostic);
    sourceFile.commentDirectives = scanner2.getCommentDirectives();
    sourceFile.nodeCount = nodeCount;
    sourceFile.identifierCount = identifierCount;
    sourceFile.identifiers = identifiers;
    sourceFile.parseDiagnostics = attachFileToDiagnostics(parseDiagnostics, sourceFile);
    sourceFile.jsDocParsingMode = jsDocParsingMode;
    if (jsDocDiagnostics) {
      sourceFile.jsDocDiagnostics = attachFileToDiagnostics(jsDocDiagnostics, sourceFile);
    }
    if (setParentNodes) {
      fixupParentReferences(sourceFile);
    }
    return sourceFile;
    function reportPragmaDiagnostic(pos, end, diagnostic) {
      parseDiagnostics.push(createDetachedDiagnostic(fileName, sourceText, pos, end, diagnostic));
    }
  }
  let hasDeprecatedTag = false;
  function withJSDoc(node, hasJSDoc) {
    if (!hasJSDoc) {
      return node;
    }
    Debug.assert(!node.jsDoc);
    const jsDoc = mapDefined(getJSDocCommentRanges(node, sourceText), (comment) => JSDocParser.parseJSDocComment(node, comment.pos, comment.end - comment.pos));
    if (jsDoc.length) node.jsDoc = jsDoc;
    if (hasDeprecatedTag) {
      hasDeprecatedTag = false;
      node.flags |= 536870912 /* Deprecated */;
    }
    return node;
  }
  function reparseTopLevelAwait(sourceFile) {
    const savedSyntaxCursor = syntaxCursor;
    const baseSyntaxCursor = IncrementalParser.createSyntaxCursor(sourceFile);
    syntaxCursor = { currentNode: currentNode2 };
    const statements = [];
    const savedParseDiagnostics = parseDiagnostics;
    parseDiagnostics = [];
    let pos = 0;
    let start = findNextStatementWithAwait(sourceFile.statements, 0);
    while (start !== -1) {
      const prevStatement = sourceFile.statements[pos];
      const nextStatement = sourceFile.statements[start];
      addRange(statements, sourceFile.statements, pos, start);
      pos = findNextStatementWithoutAwait(sourceFile.statements, start);
      const diagnosticStart = findIndex(savedParseDiagnostics, (diagnostic) => diagnostic.start >= prevStatement.pos);
      const diagnosticEnd = diagnosticStart >= 0 ? findIndex(savedParseDiagnostics, (diagnostic) => diagnostic.start >= nextStatement.pos, diagnosticStart) : -1;
      if (diagnosticStart >= 0) {
        addRange(parseDiagnostics, savedParseDiagnostics, diagnosticStart, diagnosticEnd >= 0 ? diagnosticEnd : void 0);
      }
      speculationHelper(() => {
        const savedContextFlags = contextFlags;
        contextFlags |= 65536 /* AwaitContext */;
        scanner2.resetTokenState(nextStatement.pos);
        nextToken();
        while (token() !== 1 /* EndOfFileToken */) {
          const startPos = scanner2.getTokenFullStart();
          const statement = parseListElement(0 /* SourceElements */, parseStatement);
          statements.push(statement);
          if (startPos === scanner2.getTokenFullStart()) {
            nextToken();
          }
          if (pos >= 0) {
            const nonAwaitStatement = sourceFile.statements[pos];
            if (statement.end === nonAwaitStatement.pos) {
              break;
            }
            if (statement.end > nonAwaitStatement.pos) {
              pos = findNextStatementWithoutAwait(sourceFile.statements, pos + 1);
            }
          }
        }
        contextFlags = savedContextFlags;
      }, 2 /* Reparse */);
      start = pos >= 0 ? findNextStatementWithAwait(sourceFile.statements, pos) : -1;
    }
    if (pos >= 0) {
      const prevStatement = sourceFile.statements[pos];
      addRange(statements, sourceFile.statements, pos);
      const diagnosticStart = findIndex(savedParseDiagnostics, (diagnostic) => diagnostic.start >= prevStatement.pos);
      if (diagnosticStart >= 0) {
        addRange(parseDiagnostics, savedParseDiagnostics, diagnosticStart);
      }
    }
    syntaxCursor = savedSyntaxCursor;
    return factory2.updateSourceFile(sourceFile, setTextRange(factoryCreateNodeArray(statements), sourceFile.statements));
    function containsPossibleTopLevelAwait(node) {
      return !(node.flags & 65536 /* AwaitContext */) && !!(node.transformFlags & 67108864 /* ContainsPossibleTopLevelAwait */);
    }
    function findNextStatementWithAwait(statements2, start2) {
      for (let i = start2; i < statements2.length; i++) {
        if (containsPossibleTopLevelAwait(statements2[i])) {
          return i;
        }
      }
      return -1;
    }
    function findNextStatementWithoutAwait(statements2, start2) {
      for (let i = start2; i < statements2.length; i++) {
        if (!containsPossibleTopLevelAwait(statements2[i])) {
          return i;
        }
      }
      return -1;
    }
    function currentNode2(position) {
      const node = baseSyntaxCursor.currentNode(position);
      if (topLevel && node && containsPossibleTopLevelAwait(node)) {
        markAsIntersectingIncrementalChange(node);
      }
      return node;
    }
  }
  function fixupParentReferences(rootNode) {
    setParentRecursive(
      rootNode,
      /*incremental*/
      true
    );
  }
  Parser2.fixupParentReferences = fixupParentReferences;
  function createSourceFile2(fileName2, languageVersion2, scriptKind2, isDeclarationFile, statements, endOfFileToken, flags, setExternalModuleIndicator2) {
    let sourceFile = factory2.createSourceFile(statements, endOfFileToken, flags);
    setTextRangePosWidth(sourceFile, 0, sourceText.length);
    setFields(sourceFile);
    if (!isDeclarationFile && isExternalModule(sourceFile) && sourceFile.transformFlags & 67108864 /* ContainsPossibleTopLevelAwait */) {
      const oldSourceFile = sourceFile;
      sourceFile = reparseTopLevelAwait(sourceFile);
      if (oldSourceFile !== sourceFile) setFields(sourceFile);
    }
    return sourceFile;
    function setFields(sourceFile2) {
      sourceFile2.text = sourceText;
      sourceFile2.bindDiagnostics = [];
      sourceFile2.bindSuggestionDiagnostics = void 0;
      sourceFile2.languageVersion = languageVersion2;
      sourceFile2.fileName = fileName2;
      sourceFile2.languageVariant = getLanguageVariant(scriptKind2);
      sourceFile2.isDeclarationFile = isDeclarationFile;
      sourceFile2.scriptKind = scriptKind2;
      setExternalModuleIndicator2(sourceFile2);
      sourceFile2.setExternalModuleIndicator = setExternalModuleIndicator2;
    }
  }
  function setContextFlag(val, flag) {
    if (val) {
      contextFlags |= flag;
    } else {
      contextFlags &= ~flag;
    }
  }
  function setDisallowInContext(val) {
    setContextFlag(val, 8192 /* DisallowInContext */);
  }
  function setYieldContext(val) {
    setContextFlag(val, 16384 /* YieldContext */);
  }
  function setDecoratorContext(val) {
    setContextFlag(val, 32768 /* DecoratorContext */);
  }
  function setAwaitContext(val) {
    setContextFlag(val, 65536 /* AwaitContext */);
  }
  function doOutsideOfContext(context, func) {
    const contextFlagsToClear = context & contextFlags;
    if (contextFlagsToClear) {
      setContextFlag(
        /*val*/
        false,
        contextFlagsToClear
      );
      const result = func();
      setContextFlag(
        /*val*/
        true,
        contextFlagsToClear
      );
      return result;
    }
    return func();
  }
  function doInsideOfContext(context, func) {
    const contextFlagsToSet = context & ~contextFlags;
    if (contextFlagsToSet) {
      setContextFlag(
        /*val*/
        true,
        contextFlagsToSet
      );
      const result = func();
      setContextFlag(
        /*val*/
        false,
        contextFlagsToSet
      );
      return result;
    }
    return func();
  }
  function allowInAnd(func) {
    return doOutsideOfContext(8192 /* DisallowInContext */, func);
  }
  function disallowInAnd(func) {
    return doInsideOfContext(8192 /* DisallowInContext */, func);
  }
  function allowConditionalTypesAnd(func) {
    return doOutsideOfContext(131072 /* DisallowConditionalTypesContext */, func);
  }
  function disallowConditionalTypesAnd(func) {
    return doInsideOfContext(131072 /* DisallowConditionalTypesContext */, func);
  }
  function doInYieldContext(func) {
    return doInsideOfContext(16384 /* YieldContext */, func);
  }
  function doInDecoratorContext(func) {
    return doInsideOfContext(32768 /* DecoratorContext */, func);
  }
  function doInAwaitContext(func) {
    return doInsideOfContext(65536 /* AwaitContext */, func);
  }
  function doOutsideOfAwaitContext(func) {
    return doOutsideOfContext(65536 /* AwaitContext */, func);
  }
  function doInYieldAndAwaitContext(func) {
    return doInsideOfContext(16384 /* YieldContext */ | 65536 /* AwaitContext */, func);
  }
  function doOutsideOfYieldAndAwaitContext(func) {
    return doOutsideOfContext(16384 /* YieldContext */ | 65536 /* AwaitContext */, func);
  }
  function inContext(flags) {
    return (contextFlags & flags) !== 0;
  }
  function inYieldContext() {
    return inContext(16384 /* YieldContext */);
  }
  function inDisallowInContext() {
    return inContext(8192 /* DisallowInContext */);
  }
  function inDisallowConditionalTypesContext() {
    return inContext(131072 /* DisallowConditionalTypesContext */);
  }
  function inDecoratorContext() {
    return inContext(32768 /* DecoratorContext */);
  }
  function inAwaitContext() {
    return inContext(65536 /* AwaitContext */);
  }
  function parseErrorAtCurrentToken(message, ...args) {
    return parseErrorAt(scanner2.getTokenStart(), scanner2.getTokenEnd(), message, ...args);
  }
  function parseErrorAtPosition(start, length2, message, ...args) {
    const lastError = lastOrUndefined(parseDiagnostics);
    let result;
    if (!lastError || start !== lastError.start) {
      result = createDetachedDiagnostic(fileName, sourceText, start, length2, message, ...args);
      parseDiagnostics.push(result);
    }
    parseErrorBeforeNextFinishedNode = true;
    return result;
  }
  function parseErrorAt(start, end, message, ...args) {
    return parseErrorAtPosition(start, end - start, message, ...args);
  }
  function parseErrorAtRange(range, message, ...args) {
    parseErrorAt(range.pos, range.end, message, ...args);
  }
  function scanError(message, length2, arg0) {
    parseErrorAtPosition(scanner2.getTokenEnd(), length2, message, arg0);
  }
  function getNodePos() {
    return scanner2.getTokenFullStart();
  }
  function hasPrecedingJSDocComment() {
    return scanner2.hasPrecedingJSDocComment();
  }
  function token() {
    return currentToken;
  }
  function nextTokenWithoutCheck() {
    return currentToken = scanner2.scan();
  }
  function nextTokenAnd(func) {
    nextToken();
    return func();
  }
  function nextToken() {
    if (isKeyword(currentToken) && (scanner2.hasUnicodeEscape() || scanner2.hasExtendedUnicodeEscape())) {
      parseErrorAt(scanner2.getTokenStart(), scanner2.getTokenEnd(), Diagnostics.Keywords_cannot_contain_escape_characters);
    }
    return nextTokenWithoutCheck();
  }
  function nextTokenJSDoc() {
    return currentToken = scanner2.scanJsDocToken();
  }
  function nextJSDocCommentTextToken(inBackticks) {
    return currentToken = scanner2.scanJSDocCommentTextToken(inBackticks);
  }
  function reScanGreaterToken() {
    return currentToken = scanner2.reScanGreaterToken();
  }
  function reScanSlashToken() {
    return currentToken = scanner2.reScanSlashToken();
  }
  function reScanTemplateToken(isTaggedTemplate) {
    return currentToken = scanner2.reScanTemplateToken(isTaggedTemplate);
  }
  function reScanLessThanToken() {
    return currentToken = scanner2.reScanLessThanToken();
  }
  function reScanHashToken() {
    return currentToken = scanner2.reScanHashToken();
  }
  function scanJsxIdentifier() {
    return currentToken = scanner2.scanJsxIdentifier();
  }
  function scanJsxText() {
    return currentToken = scanner2.scanJsxToken();
  }
  function scanJsxAttributeValue() {
    return currentToken = scanner2.scanJsxAttributeValue();
  }
  function speculationHelper(callback, speculationKind) {
    const saveToken = currentToken;
    const saveParseDiagnosticsLength = parseDiagnostics.length;
    const saveParseErrorBeforeNextFinishedNode = parseErrorBeforeNextFinishedNode;
    const saveContextFlags = contextFlags;
    const result = speculationKind !== 0 /* TryParse */ ? scanner2.lookAhead(callback) : scanner2.tryScan(callback);
    Debug.assert(saveContextFlags === contextFlags);
    if (!result || speculationKind !== 0 /* TryParse */) {
      currentToken = saveToken;
      if (speculationKind !== 2 /* Reparse */) {
        parseDiagnostics.length = saveParseDiagnosticsLength;
      }
      parseErrorBeforeNextFinishedNode = saveParseErrorBeforeNextFinishedNode;
    }
    return result;
  }
  function lookAhead(callback) {
    return speculationHelper(callback, 1 /* Lookahead */);
  }
  function tryParse(callback) {
    return speculationHelper(callback, 0 /* TryParse */);
  }
  function isBindingIdentifier() {
    if (token() === 80 /* Identifier */) {
      return true;
    }
    return token() > 118 /* LastReservedWord */;
  }
  function isIdentifier2() {
    if (token() === 80 /* Identifier */) {
      return true;
    }
    if (token() === 127 /* YieldKeyword */ && inYieldContext()) {
      return false;
    }
    if (token() === 135 /* AwaitKeyword */ && inAwaitContext()) {
      return false;
    }
    return token() > 118 /* LastReservedWord */;
  }
  function parseExpected(kind, diagnosticMessage, shouldAdvance = true) {
    if (token() === kind) {
      if (shouldAdvance) {
        nextToken();
      }
      return true;
    }
    if (diagnosticMessage) {
      parseErrorAtCurrentToken(diagnosticMessage);
    } else {
      parseErrorAtCurrentToken(Diagnostics._0_expected, tokenToString(kind));
    }
    return false;
  }
  const viableKeywordSuggestions = Object.keys(textToKeywordObj).filter((keyword) => keyword.length > 2);
  function parseErrorForMissingSemicolonAfter(node) {
    if (isTaggedTemplateExpression(node)) {
      parseErrorAt(skipTrivia(sourceText, node.template.pos), node.template.end, Diagnostics.Module_declaration_names_may_only_use_or_quoted_strings);
      return;
    }
    const expressionText = isIdentifier(node) ? idText(node) : void 0;
    if (!expressionText || !isIdentifierText(expressionText, languageVersion)) {
      parseErrorAtCurrentToken(Diagnostics._0_expected, tokenToString(27 /* SemicolonToken */));
      return;
    }
    const pos = skipTrivia(sourceText, node.pos);
    switch (expressionText) {
      case "const":
      case "let":
      case "var":
        parseErrorAt(pos, node.end, Diagnostics.Variable_declaration_not_allowed_at_this_location);
        return;
      case "declare":
        return;
      case "interface":
        parseErrorForInvalidName(Diagnostics.Interface_name_cannot_be_0, Diagnostics.Interface_must_be_given_a_name, 19 /* OpenBraceToken */);
        return;
      case "is":
        parseErrorAt(pos, scanner2.getTokenStart(), Diagnostics.A_type_predicate_is_only_allowed_in_return_type_position_for_functions_and_methods);
        return;
      case "module":
      case "namespace":
        parseErrorForInvalidName(Diagnostics.Namespace_name_cannot_be_0, Diagnostics.Namespace_must_be_given_a_name, 19 /* OpenBraceToken */);
        return;
      case "type":
        parseErrorForInvalidName(Diagnostics.Type_alias_name_cannot_be_0, Diagnostics.Type_alias_must_be_given_a_name, 64 /* EqualsToken */);
        return;
    }
    const suggestion = getSpellingSuggestion(expressionText, viableKeywordSuggestions, identity) ?? getSpaceSuggestion(expressionText);
    if (suggestion) {
      parseErrorAt(pos, node.end, Diagnostics.Unknown_keyword_or_identifier_Did_you_mean_0, suggestion);
      return;
    }
    if (token() === 0 /* Unknown */) {
      return;
    }
    parseErrorAt(pos, node.end, Diagnostics.Unexpected_keyword_or_identifier);
  }
  function parseErrorForInvalidName(nameDiagnostic, blankDiagnostic, tokenIfBlankName) {
    if (token() === tokenIfBlankName) {
      parseErrorAtCurrentToken(blankDiagnostic);
    } else {
      parseErrorAtCurrentToken(nameDiagnostic, scanner2.getTokenValue());
    }
  }
  function getSpaceSuggestion(expressionText) {
    for (const keyword of viableKeywordSuggestions) {
      if (expressionText.length > keyword.length + 2 && startsWith(expressionText, keyword)) {
        return `${keyword} ${expressionText.slice(keyword.length)}`;
      }
    }
    return void 0;
  }
  function parseSemicolonAfterPropertyName(name, type, initializer) {
    if (token() === 60 /* AtToken */ && !scanner2.hasPrecedingLineBreak()) {
      parseErrorAtCurrentToken(Diagnostics.Decorators_must_precede_the_name_and_all_keywords_of_property_declarations);
      return;
    }
    if (token() === 21 /* OpenParenToken */) {
      parseErrorAtCurrentToken(Diagnostics.Cannot_start_a_function_call_in_a_type_annotation);
      nextToken();
      return;
    }
    if (type && !canParseSemicolon()) {
      if (initializer) {
        parseErrorAtCurrentToken(Diagnostics._0_expected, tokenToString(27 /* SemicolonToken */));
      } else {
        parseErrorAtCurrentToken(Diagnostics.Expected_for_property_initializer);
      }
      return;
    }
    if (tryParseSemicolon()) {
      return;
    }
    if (initializer) {
      parseErrorAtCurrentToken(Diagnostics._0_expected, tokenToString(27 /* SemicolonToken */));
      return;
    }
    parseErrorForMissingSemicolonAfter(name);
  }
  function parseExpectedJSDoc(kind) {
    if (token() === kind) {
      nextTokenJSDoc();
      return true;
    }
    Debug.assert(isKeywordOrPunctuation(kind));
    parseErrorAtCurrentToken(Diagnostics._0_expected, tokenToString(kind));
    return false;
  }
  function parseExpectedMatchingBrackets(openKind, closeKind, openParsed, openPosition) {
    if (token() === closeKind) {
      nextToken();
      return;
    }
    const lastError = parseErrorAtCurrentToken(Diagnostics._0_expected, tokenToString(closeKind));
    if (!openParsed) {
      return;
    }
    if (lastError) {
      addRelatedInfo(
        lastError,
        createDetachedDiagnostic(fileName, sourceText, openPosition, 1, Diagnostics.The_parser_expected_to_find_a_1_to_match_the_0_token_here, tokenToString(openKind), tokenToString(closeKind))
      );
    }
  }
  function parseOptional(t) {
    if (token() === t) {
      nextToken();
      return true;
    }
    return false;
  }
  function parseOptionalToken(t) {
    if (token() === t) {
      return parseTokenNode();
    }
    return void 0;
  }
  function parseOptionalTokenJSDoc(t) {
    if (token() === t) {
      return parseTokenNodeJSDoc();
    }
    return void 0;
  }
  function parseExpectedToken(t, diagnosticMessage, arg0) {
    return parseOptionalToken(t) || createMissingNode(
      t,
      /*reportAtCurrentPosition*/
      false,
      diagnosticMessage || Diagnostics._0_expected,
      arg0 || tokenToString(t)
    );
  }
  function parseExpectedTokenJSDoc(t) {
    const optional = parseOptionalTokenJSDoc(t);
    if (optional) return optional;
    Debug.assert(isKeywordOrPunctuation(t));
    return createMissingNode(
      t,
      /*reportAtCurrentPosition*/
      false,
      Diagnostics._0_expected,
      tokenToString(t)
    );
  }
  function parseTokenNode() {
    const pos = getNodePos();
    const kind = token();
    nextToken();
    return finishNode(factoryCreateToken(kind), pos);
  }
  function parseTokenNodeJSDoc() {
    const pos = getNodePos();
    const kind = token();
    nextTokenJSDoc();
    return finishNode(factoryCreateToken(kind), pos);
  }
  function canParseSemicolon() {
    if (token() === 27 /* SemicolonToken */) {
      return true;
    }
    return token() === 20 /* CloseBraceToken */ || token() === 1 /* EndOfFileToken */ || scanner2.hasPrecedingLineBreak();
  }
  function tryParseSemicolon() {
    if (!canParseSemicolon()) {
      return false;
    }
    if (token() === 27 /* SemicolonToken */) {
      nextToken();
    }
    return true;
  }
  function parseSemicolon() {
    return tryParseSemicolon() || parseExpected(27 /* SemicolonToken */);
  }
  function createNodeArray(elements, pos, end, hasTrailingComma) {
    const array = factoryCreateNodeArray(elements, hasTrailingComma);
    setTextRangePosEnd(array, pos, end ?? scanner2.getTokenFullStart());
    return array;
  }
  function finishNode(node, pos, end) {
    setTextRangePosEnd(node, pos, end ?? scanner2.getTokenFullStart());
    if (contextFlags) {
      node.flags |= contextFlags;
    }
    if (parseErrorBeforeNextFinishedNode) {
      parseErrorBeforeNextFinishedNode = false;
      node.flags |= 262144 /* ThisNodeHasError */;
    }
    return node;
  }
  function createMissingNode(kind, reportAtCurrentPosition, diagnosticMessage, ...args) {
    if (reportAtCurrentPosition) {
      parseErrorAtPosition(scanner2.getTokenFullStart(), 0, diagnosticMessage, ...args);
    } else if (diagnosticMessage) {
      parseErrorAtCurrentToken(diagnosticMessage, ...args);
    }
    const pos = getNodePos();
    const result = kind === 80 /* Identifier */ ? factoryCreateIdentifier(
      "",
      /*originalKeywordKind*/
      void 0
    ) : isTemplateLiteralKind(kind) ? factory2.createTemplateLiteralLikeNode(
      kind,
      "",
      "",
      /*templateFlags*/
      void 0
    ) : kind === 9 /* NumericLiteral */ ? factoryCreateNumericLiteral(
      "",
      /*numericLiteralFlags*/
      void 0
    ) : kind === 11 /* StringLiteral */ ? factoryCreateStringLiteral(
      "",
      /*isSingleQuote*/
      void 0
    ) : kind === 283 /* MissingDeclaration */ ? factory2.createMissingDeclaration() : factoryCreateToken(kind);
    return finishNode(result, pos);
  }
  function internIdentifier(text) {
    let identifier = identifiers.get(text);
    if (identifier === void 0) {
      identifiers.set(text, identifier = text);
    }
    return identifier;
  }
  function createIdentifier(isIdentifier3, diagnosticMessage, privateIdentifierDiagnosticMessage) {
    if (isIdentifier3) {
      identifierCount++;
      const pos = scanner2.hasPrecedingJSDocLeadingAsterisks() ? scanner2.getTokenStart() : getNodePos();
      const originalKeywordKind = token();
      const text = internIdentifier(scanner2.getTokenValue());
      const hasExtendedUnicodeEscape = scanner2.hasExtendedUnicodeEscape();
      nextTokenWithoutCheck();
      return finishNode(factoryCreateIdentifier(text, originalKeywordKind, hasExtendedUnicodeEscape), pos);
    }
    if (token() === 81 /* PrivateIdentifier */) {
      parseErrorAtCurrentToken(privateIdentifierDiagnosticMessage || Diagnostics.Private_identifiers_are_not_allowed_outside_class_bodies);
      return createIdentifier(
        /*isIdentifier*/
        true
      );
    }
    if (token() === 0 /* Unknown */ && scanner2.tryScan(() => scanner2.reScanInvalidIdentifier() === 80 /* Identifier */)) {
      return createIdentifier(
        /*isIdentifier*/
        true
      );
    }
    identifierCount++;
    const reportAtCurrentPosition = token() === 1 /* EndOfFileToken */;
    const isReservedWord = scanner2.isReservedWord();
    const msgArg = scanner2.getTokenText();
    const defaultMessage = isReservedWord ? Diagnostics.Identifier_expected_0_is_a_reserved_word_that_cannot_be_used_here : Diagnostics.Identifier_expected;
    return createMissingNode(80 /* Identifier */, reportAtCurrentPosition, diagnosticMessage || defaultMessage, msgArg);
  }
  function parseBindingIdentifier(privateIdentifierDiagnosticMessage) {
    return createIdentifier(
      isBindingIdentifier(),
      /*diagnosticMessage*/
      void 0,
      privateIdentifierDiagnosticMessage
    );
  }
  function parseIdentifier(diagnosticMessage, privateIdentifierDiagnosticMessage) {
    return createIdentifier(isIdentifier2(), diagnosticMessage, privateIdentifierDiagnosticMessage);
  }
  function parseIdentifierName(diagnosticMessage) {
    return createIdentifier(tokenIsIdentifierOrKeyword(token()), diagnosticMessage);
  }
  function parseIdentifierNameErrorOnUnicodeEscapeSequence() {
    if (scanner2.hasUnicodeEscape() || scanner2.hasExtendedUnicodeEscape()) {
      parseErrorAtCurrentToken(Diagnostics.Unicode_escape_sequence_cannot_appear_here);
    }
    return createIdentifier(tokenIsIdentifierOrKeyword(token()));
  }
  function isLiteralPropertyName() {
    return tokenIsIdentifierOrKeyword(token()) || token() === 11 /* StringLiteral */ || token() === 9 /* NumericLiteral */ || token() === 10 /* BigIntLiteral */;
  }
  function isImportAttributeName2() {
    return tokenIsIdentifierOrKeyword(token()) || token() === 11 /* StringLiteral */;
  }
  function parsePropertyNameWorker(allowComputedPropertyNames) {
    if (token() === 11 /* StringLiteral */ || token() === 9 /* NumericLiteral */ || token() === 10 /* BigIntLiteral */) {
      const node = parseLiteralNode();
      node.text = internIdentifier(node.text);
      return node;
    }
    if (allowComputedPropertyNames && token() === 23 /* OpenBracketToken */) {
      return parseComputedPropertyName();
    }
    if (token() === 81 /* PrivateIdentifier */) {
      return parsePrivateIdentifier();
    }
    return parseIdentifierName();
  }
  function parsePropertyName() {
    return parsePropertyNameWorker(
      /*allowComputedPropertyNames*/
      true
    );
  }
  function parseComputedPropertyName() {
    const pos = getNodePos();
    parseExpected(23 /* OpenBracketToken */);
    const expression = allowInAnd(parseExpression);
    parseExpected(24 /* CloseBracketToken */);
    return finishNode(factory2.createComputedPropertyName(expression), pos);
  }
  function parsePrivateIdentifier() {
    const pos = getNodePos();
    const node = factoryCreatePrivateIdentifier(internIdentifier(scanner2.getTokenValue()));
    nextToken();
    return finishNode(node, pos);
  }
  function parseContextualModifier(t) {
    return token() === t && tryParse(nextTokenCanFollowModifier);
  }
  function nextTokenIsOnSameLineAndCanFollowModifier() {
    nextToken();
    if (scanner2.hasPrecedingLineBreak()) {
      return false;
    }
    return canFollowModifier();
  }
  function nextTokenCanFollowModifier() {
    switch (token()) {
      case 87 /* ConstKeyword */:
        return nextToken() === 94 /* EnumKeyword */;
      case 95 /* ExportKeyword */:
        nextToken();
        if (token() === 90 /* DefaultKeyword */) {
          return lookAhead(nextTokenCanFollowDefaultKeyword);
        }
        if (token() === 156 /* TypeKeyword */) {
          return lookAhead(nextTokenCanFollowExportModifier);
        }
        return canFollowExportModifier();
      case 90 /* DefaultKeyword */:
        return nextTokenCanFollowDefaultKeyword();
      case 126 /* StaticKeyword */:
        nextToken();
        return canFollowModifier();
      case 139 /* GetKeyword */:
      case 153 /* SetKeyword */:
        nextToken();
        return canFollowGetOrSetKeyword();
      default:
        return nextTokenIsOnSameLineAndCanFollowModifier();
    }
  }
  function canFollowExportModifier() {
    return token() === 60 /* AtToken */ || token() !== 42 /* AsteriskToken */ && token() !== 130 /* AsKeyword */ && token() !== 19 /* OpenBraceToken */ && canFollowModifier();
  }
  function nextTokenCanFollowExportModifier() {
    nextToken();
    return canFollowExportModifier();
  }
  function parseAnyContextualModifier() {
    return isModifierKind(token()) && tryParse(nextTokenCanFollowModifier);
  }
  function canFollowModifier() {
    return token() === 23 /* OpenBracketToken */ || token() === 19 /* OpenBraceToken */ || token() === 42 /* AsteriskToken */ || token() === 26 /* DotDotDotToken */ || isLiteralPropertyName();
  }
  function canFollowGetOrSetKeyword() {
    return token() === 23 /* OpenBracketToken */ || isLiteralPropertyName();
  }
  function nextTokenCanFollowDefaultKeyword() {
    nextToken();
    return token() === 86 /* ClassKeyword */ || token() === 100 /* FunctionKeyword */ || token() === 120 /* InterfaceKeyword */ || token() === 60 /* AtToken */ || token() === 128 /* AbstractKeyword */ && lookAhead(nextTokenIsClassKeywordOnSameLine) || token() === 134 /* AsyncKeyword */ && lookAhead(nextTokenIsFunctionKeywordOnSameLine);
  }
  function isListElement2(parsingContext2, inErrorRecovery) {
    const node = currentNode(parsingContext2);
    if (node) {
      return true;
    }
    switch (parsingContext2) {
      case 0 /* SourceElements */:
      case 1 /* BlockStatements */:
      case 3 /* SwitchClauseStatements */:
        return !(token() === 27 /* SemicolonToken */ && inErrorRecovery) && isStartOfStatement();
      case 2 /* SwitchClauses */:
        return token() === 84 /* CaseKeyword */ || token() === 90 /* DefaultKeyword */;
      case 4 /* TypeMembers */:
        return lookAhead(isTypeMemberStart);
      case 5 /* ClassMembers */:
        return lookAhead(isClassMemberStart) || token() === 27 /* SemicolonToken */ && !inErrorRecovery;
      case 6 /* EnumMembers */:
        return token() === 23 /* OpenBracketToken */ || isLiteralPropertyName();
      case 12 /* ObjectLiteralMembers */:
        switch (token()) {
          case 23 /* OpenBracketToken */:
          case 42 /* AsteriskToken */:
          case 26 /* DotDotDotToken */:
          case 25 /* DotToken */:
            return true;
          default:
            return isLiteralPropertyName();
        }
      case 18 /* RestProperties */:
        return isLiteralPropertyName();
      case 9 /* ObjectBindingElements */:
        return token() === 23 /* OpenBracketToken */ || token() === 26 /* DotDotDotToken */ || isLiteralPropertyName();
      case 24 /* ImportAttributes */:
        return isImportAttributeName2();
      case 7 /* HeritageClauseElement */:
        if (token() === 19 /* OpenBraceToken */) {
          return lookAhead(isValidHeritageClauseObjectLiteral);
        }
        if (!inErrorRecovery) {
          return isStartOfLeftHandSideExpression() && !isHeritageClauseExtendsOrImplementsKeyword();
        } else {
          return isIdentifier2() && !isHeritageClauseExtendsOrImplementsKeyword();
        }
      case 8 /* VariableDeclarations */:
        return isBindingIdentifierOrPrivateIdentifierOrPattern();
      case 10 /* ArrayBindingElements */:
        return token() === 28 /* CommaToken */ || token() === 26 /* DotDotDotToken */ || isBindingIdentifierOrPrivateIdentifierOrPattern();
      case 19 /* TypeParameters */:
        return token() === 103 /* InKeyword */ || token() === 87 /* ConstKeyword */ || isIdentifier2();
      case 15 /* ArrayLiteralMembers */:
        switch (token()) {
          case 28 /* CommaToken */:
          case 25 /* DotToken */:
            return true;
        }
      // falls through
      case 11 /* ArgumentExpressions */:
        return token() === 26 /* DotDotDotToken */ || isStartOfExpression();
      case 16 /* Parameters */:
        return isStartOfParameter(
          /*isJSDocParameter*/
          false
        );
      case 17 /* JSDocParameters */:
        return isStartOfParameter(
          /*isJSDocParameter*/
          true
        );
      case 20 /* TypeArguments */:
      case 21 /* TupleElementTypes */:
        return token() === 28 /* CommaToken */ || isStartOfType();
      case 22 /* HeritageClauses */:
        return isHeritageClause2();
      case 23 /* ImportOrExportSpecifiers */:
        if (token() === 161 /* FromKeyword */ && lookAhead(nextTokenIsStringLiteral)) {
          return false;
        }
        if (token() === 11 /* StringLiteral */) {
          return true;
        }
        return tokenIsIdentifierOrKeyword(token());
      case 13 /* JsxAttributes */:
        return tokenIsIdentifierOrKeyword(token()) || token() === 19 /* OpenBraceToken */;
      case 14 /* JsxChildren */:
        return true;
      case 25 /* JSDocComment */:
        return true;
      case 26 /* Count */:
        return Debug.fail("ParsingContext.Count used as a context");
      // Not a real context, only a marker.
      default:
        Debug.assertNever(parsingContext2, "Non-exhaustive case in 'isListElement'.");
    }
  }
  function isValidHeritageClauseObjectLiteral() {
    Debug.assert(token() === 19 /* OpenBraceToken */);
    if (nextToken() === 20 /* CloseBraceToken */) {
      const next = nextToken();
      return next === 28 /* CommaToken */ || next === 19 /* OpenBraceToken */ || next === 96 /* ExtendsKeyword */ || next === 119 /* ImplementsKeyword */;
    }
    return true;
  }
  function nextTokenIsIdentifier() {
    nextToken();
    return isIdentifier2();
  }
  function nextTokenIsIdentifierOrKeyword() {
    nextToken();
    return tokenIsIdentifierOrKeyword(token());
  }
  function nextTokenIsIdentifierOrKeywordOrGreaterThan() {
    nextToken();
    return tokenIsIdentifierOrKeywordOrGreaterThan(token());
  }
  function isHeritageClauseExtendsOrImplementsKeyword() {
    if (token() === 119 /* ImplementsKeyword */ || token() === 96 /* ExtendsKeyword */) {
      return lookAhead(nextTokenIsStartOfExpression);
    }
    return false;
  }
  function nextTokenIsStartOfExpression() {
    nextToken();
    return isStartOfExpression();
  }
  function nextTokenIsStartOfType() {
    nextToken();
    return isStartOfType();
  }
  function isListTerminator(kind) {
    if (token() === 1 /* EndOfFileToken */) {
      return true;
    }
    switch (kind) {
      case 1 /* BlockStatements */:
      case 2 /* SwitchClauses */:
      case 4 /* TypeMembers */:
      case 5 /* ClassMembers */:
      case 6 /* EnumMembers */:
      case 12 /* ObjectLiteralMembers */:
      case 9 /* ObjectBindingElements */:
      case 23 /* ImportOrExportSpecifiers */:
      case 24 /* ImportAttributes */:
        return token() === 20 /* CloseBraceToken */;
      case 3 /* SwitchClauseStatements */:
        return token() === 20 /* CloseBraceToken */ || token() === 84 /* CaseKeyword */ || token() === 90 /* DefaultKeyword */;
      case 7 /* HeritageClauseElement */:
        return token() === 19 /* OpenBraceToken */ || token() === 96 /* ExtendsKeyword */ || token() === 119 /* ImplementsKeyword */;
      case 8 /* VariableDeclarations */:
        return isVariableDeclaratorListTerminator();
      case 19 /* TypeParameters */:
        return token() === 32 /* GreaterThanToken */ || token() === 21 /* OpenParenToken */ || token() === 19 /* OpenBraceToken */ || token() === 96 /* ExtendsKeyword */ || token() === 119 /* ImplementsKeyword */;
      case 11 /* ArgumentExpressions */:
        return token() === 22 /* CloseParenToken */ || token() === 27 /* SemicolonToken */;
      case 15 /* ArrayLiteralMembers */:
      case 21 /* TupleElementTypes */:
      case 10 /* ArrayBindingElements */:
        return token() === 24 /* CloseBracketToken */;
      case 17 /* JSDocParameters */:
      case 16 /* Parameters */:
      case 18 /* RestProperties */:
        return token() === 22 /* CloseParenToken */ || token() === 24 /* CloseBracketToken */;
      case 20 /* TypeArguments */:
        return token() !== 28 /* CommaToken */;
      case 22 /* HeritageClauses */:
        return token() === 19 /* OpenBraceToken */ || token() === 20 /* CloseBraceToken */;
      case 13 /* JsxAttributes */:
        return token() === 32 /* GreaterThanToken */ || token() === 44 /* SlashToken */;
      case 14 /* JsxChildren */:
        return token() === 30 /* LessThanToken */ && lookAhead(nextTokenIsSlash);
      default:
        return false;
    }
  }
  function isVariableDeclaratorListTerminator() {
    if (canParseSemicolon()) {
      return true;
    }
    if (isInOrOfKeyword(token())) {
      return true;
    }
    if (token() === 39 /* EqualsGreaterThanToken */) {
      return true;
    }
    return false;
  }
  function isInSomeParsingContext() {
    Debug.assert(parsingContext, "Missing parsing context");
    for (let kind = 0; kind < 26 /* Count */; kind++) {
      if (parsingContext & 1 << kind) {
        if (isListElement2(
          kind,
          /*inErrorRecovery*/
          true
        ) || isListTerminator(kind)) {
          return true;
        }
      }
    }
    return false;
  }
  function parseList(kind, parseElement) {
    const saveParsingContext = parsingContext;
    parsingContext |= 1 << kind;
    const list = [];
    const listPos = getNodePos();
    while (!isListTerminator(kind)) {
      if (isListElement2(
        kind,
        /*inErrorRecovery*/
        false
      )) {
        list.push(parseListElement(kind, parseElement));
        continue;
      }
      if (abortParsingListOrMoveToNextToken(kind)) {
        break;
      }
    }
    parsingContext = saveParsingContext;
    return createNodeArray(list, listPos);
  }
  function parseListElement(parsingContext2, parseElement) {
    const node = currentNode(parsingContext2);
    if (node) {
      return consumeNode(node);
    }
    return parseElement();
  }
  function currentNode(parsingContext2, pos) {
    var _a;
    if (!syntaxCursor || !isReusableParsingContext(parsingContext2) || parseErrorBeforeNextFinishedNode) {
      return void 0;
    }
    const node = syntaxCursor.currentNode(pos ?? scanner2.getTokenFullStart());
    if (nodeIsMissing(node) || intersectsIncrementalChange(node) || containsParseError(node)) {
      return void 0;
    }
    const nodeContextFlags = node.flags & 101441536 /* ContextFlags */;
    if (nodeContextFlags !== contextFlags) {
      return void 0;
    }
    if (!canReuseNode(node, parsingContext2)) {
      return void 0;
    }
    if (canHaveJSDoc(node) && ((_a = node.jsDoc) == null ? void 0 : _a.jsDocCache)) {
      node.jsDoc.jsDocCache = void 0;
    }
    return node;
  }
  function consumeNode(node) {
    scanner2.resetTokenState(node.end);
    nextToken();
    return node;
  }
  function isReusableParsingContext(parsingContext2) {
    switch (parsingContext2) {
      case 5 /* ClassMembers */:
      case 2 /* SwitchClauses */:
      case 0 /* SourceElements */:
      case 1 /* BlockStatements */:
      case 3 /* SwitchClauseStatements */:
      case 6 /* EnumMembers */:
      case 4 /* TypeMembers */:
      case 8 /* VariableDeclarations */:
      case 17 /* JSDocParameters */:
      case 16 /* Parameters */:
        return true;
    }
    return false;
  }
  function canReuseNode(node, parsingContext2) {
    switch (parsingContext2) {
      case 5 /* ClassMembers */:
        return isReusableClassMember(node);
      case 2 /* SwitchClauses */:
        return isReusableSwitchClause(node);
      case 0 /* SourceElements */:
      case 1 /* BlockStatements */:
      case 3 /* SwitchClauseStatements */:
        return isReusableStatement(node);
      case 6 /* EnumMembers */:
        return isReusableEnumMember(node);
      case 4 /* TypeMembers */:
        return isReusableTypeMember(node);
      case 8 /* VariableDeclarations */:
        return isReusableVariableDeclaration(node);
      case 17 /* JSDocParameters */:
      case 16 /* Parameters */:
        return isReusableParameter(node);
    }
    return false;
  }
  function isReusableClassMember(node) {
    if (node) {
      switch (node.kind) {
        case 177 /* Constructor */:
        case 182 /* IndexSignature */:
        case 178 /* GetAccessor */:
        case 179 /* SetAccessor */:
        case 173 /* PropertyDeclaration */:
        case 241 /* SemicolonClassElement */:
          return true;
        case 175 /* MethodDeclaration */:
          const methodDeclaration = node;
          const nameIsConstructor = methodDeclaration.name.kind === 80 /* Identifier */ && methodDeclaration.name.escapedText === "constructor";
          return !nameIsConstructor;
      }
    }
    return false;
  }
  function isReusableSwitchClause(node) {
    if (node) {
      switch (node.kind) {
        case 297 /* CaseClause */:
        case 298 /* DefaultClause */:
          return true;
      }
    }
    return false;
  }
  function isReusableStatement(node) {
    if (node) {
      switch (node.kind) {
        case 263 /* FunctionDeclaration */:
        case 244 /* VariableStatement */:
        case 242 /* Block */:
        case 246 /* IfStatement */:
        case 245 /* ExpressionStatement */:
        case 258 /* ThrowStatement */:
        case 254 /* ReturnStatement */:
        case 256 /* SwitchStatement */:
        case 253 /* BreakStatement */:
        case 252 /* ContinueStatement */:
        case 250 /* ForInStatement */:
        case 251 /* ForOfStatement */:
        case 249 /* ForStatement */:
        case 248 /* WhileStatement */:
        case 255 /* WithStatement */:
        case 243 /* EmptyStatement */:
        case 259 /* TryStatement */:
        case 257 /* LabeledStatement */:
        case 247 /* DoStatement */:
        case 260 /* DebuggerStatement */:
        case 273 /* ImportDeclaration */:
        case 272 /* ImportEqualsDeclaration */:
        case 279 /* ExportDeclaration */:
        case 278 /* ExportAssignment */:
        case 268 /* ModuleDeclaration */:
        case 264 /* ClassDeclaration */:
        case 265 /* InterfaceDeclaration */:
        case 267 /* EnumDeclaration */:
        case 266 /* TypeAliasDeclaration */:
          return true;
      }
    }
    return false;
  }
  function isReusableEnumMember(node) {
    return node.kind === 307 /* EnumMember */;
  }
  function isReusableTypeMember(node) {
    if (node) {
      switch (node.kind) {
        case 181 /* ConstructSignature */:
        case 174 /* MethodSignature */:
        case 182 /* IndexSignature */:
        case 172 /* PropertySignature */:
        case 180 /* CallSignature */:
          return true;
      }
    }
    return false;
  }
  function isReusableVariableDeclaration(node) {
    if (node.kind !== 261 /* VariableDeclaration */) {
      return false;
    }
    const variableDeclarator = node;
    return variableDeclarator.initializer === void 0;
  }
  function isReusableParameter(node) {
    if (node.kind !== 170 /* Parameter */) {
      return false;
    }
    const parameter = node;
    return parameter.initializer === void 0;
  }
  function abortParsingListOrMoveToNextToken(kind) {
    parsingContextErrors(kind);
    if (isInSomeParsingContext()) {
      return true;
    }
    nextToken();
    return false;
  }
  function parsingContextErrors(context) {
    switch (context) {
      case 0 /* SourceElements */:
        return token() === 90 /* DefaultKeyword */ ? parseErrorAtCurrentToken(Diagnostics._0_expected, tokenToString(95 /* ExportKeyword */)) : parseErrorAtCurrentToken(Diagnostics.Declaration_or_statement_expected);
      case 1 /* BlockStatements */:
        return parseErrorAtCurrentToken(Diagnostics.Declaration_or_statement_expected);
      case 2 /* SwitchClauses */:
        return parseErrorAtCurrentToken(Diagnostics.case_or_default_expected);
      case 3 /* SwitchClauseStatements */:
        return parseErrorAtCurrentToken(Diagnostics.Statement_expected);
      case 18 /* RestProperties */:
      // fallthrough
      case 4 /* TypeMembers */:
        return parseErrorAtCurrentToken(Diagnostics.Property_or_signature_expected);
      case 5 /* ClassMembers */:
        return parseErrorAtCurrentToken(Diagnostics.Unexpected_token_A_constructor_method_accessor_or_property_was_expected);
      case 6 /* EnumMembers */:
        return parseErrorAtCurrentToken(Diagnostics.Enum_member_expected);
      case 7 /* HeritageClauseElement */:
        return parseErrorAtCurrentToken(Diagnostics.Expression_expected);
      case 8 /* VariableDeclarations */:
        return isKeyword(token()) ? parseErrorAtCurrentToken(Diagnostics._0_is_not_allowed_as_a_variable_declaration_name, tokenToString(token())) : parseErrorAtCurrentToken(Diagnostics.Variable_declaration_expected);
      case 9 /* ObjectBindingElements */:
        return parseErrorAtCurrentToken(Diagnostics.Property_destructuring_pattern_expected);
      case 10 /* ArrayBindingElements */:
        return parseErrorAtCurrentToken(Diagnostics.Array_element_destructuring_pattern_expected);
      case 11 /* ArgumentExpressions */:
        return parseErrorAtCurrentToken(Diagnostics.Argument_expression_expected);
      case 12 /* ObjectLiteralMembers */:
        return parseErrorAtCurrentToken(Diagnostics.Property_assignment_expected);
      case 15 /* ArrayLiteralMembers */:
        return parseErrorAtCurrentToken(Diagnostics.Expression_or_comma_expected);
      case 17 /* JSDocParameters */:
        return parseErrorAtCurrentToken(Diagnostics.Parameter_declaration_expected);
      case 16 /* Parameters */:
        return isKeyword(token()) ? parseErrorAtCurrentToken(Diagnostics._0_is_not_allowed_as_a_parameter_name, tokenToString(token())) : parseErrorAtCurrentToken(Diagnostics.Parameter_declaration_expected);
      case 19 /* TypeParameters */:
        return parseErrorAtCurrentToken(Diagnostics.Type_parameter_declaration_expected);
      case 20 /* TypeArguments */:
        return parseErrorAtCurrentToken(Diagnostics.Type_argument_expected);
      case 21 /* TupleElementTypes */:
        return parseErrorAtCurrentToken(Diagnostics.Type_expected);
      case 22 /* HeritageClauses */:
        return parseErrorAtCurrentToken(Diagnostics.Unexpected_token_expected);
      case 23 /* ImportOrExportSpecifiers */:
        if (token() === 161 /* FromKeyword */) {
          return parseErrorAtCurrentToken(Diagnostics._0_expected, "}");
        }
        return parseErrorAtCurrentToken(Diagnostics.Identifier_expected);
      case 13 /* JsxAttributes */:
        return parseErrorAtCurrentToken(Diagnostics.Identifier_expected);
      case 14 /* JsxChildren */:
        return parseErrorAtCurrentToken(Diagnostics.Identifier_expected);
      case 24 /* ImportAttributes */:
        return parseErrorAtCurrentToken(Diagnostics.Identifier_or_string_literal_expected);
      case 25 /* JSDocComment */:
        return parseErrorAtCurrentToken(Diagnostics.Identifier_expected);
      case 26 /* Count */:
        return Debug.fail("ParsingContext.Count used as a context");
      // Not a real context, only a marker.
      default:
        Debug.assertNever(context);
    }
  }
  function parseDelimitedList(kind, parseElement, considerSemicolonAsDelimiter) {
    const saveParsingContext = parsingContext;
    parsingContext |= 1 << kind;
    const list = [];
    const listPos = getNodePos();
    let commaStart = -1;
    while (true) {
      if (isListElement2(
        kind,
        /*inErrorRecovery*/
        false
      )) {
        const startPos = scanner2.getTokenFullStart();
        const result = parseListElement(kind, parseElement);
        if (!result) {
          parsingContext = saveParsingContext;
          return void 0;
        }
        list.push(result);
        commaStart = scanner2.getTokenStart();
        if (parseOptional(28 /* CommaToken */)) {
          continue;
        }
        commaStart = -1;
        if (isListTerminator(kind)) {
          break;
        }
        parseExpected(28 /* CommaToken */, getExpectedCommaDiagnostic(kind));
        if (considerSemicolonAsDelimiter && token() === 27 /* SemicolonToken */ && !scanner2.hasPrecedingLineBreak()) {
          nextToken();
        }
        if (startPos === scanner2.getTokenFullStart()) {
          nextToken();
        }
        continue;
      }
      if (isListTerminator(kind)) {
        break;
      }
      if (abortParsingListOrMoveToNextToken(kind)) {
        break;
      }
    }
    parsingContext = saveParsingContext;
    return createNodeArray(
      list,
      listPos,
      /*end*/
      void 0,
      commaStart >= 0
    );
  }
  function getExpectedCommaDiagnostic(kind) {
    return kind === 6 /* EnumMembers */ ? Diagnostics.An_enum_member_name_must_be_followed_by_a_or : void 0;
  }
  function createMissingList() {
    const list = createNodeArray([], getNodePos());
    list.isMissingList = true;
    return list;
  }
  function isMissingList(arr) {
    return !!arr.isMissingList;
  }
  function parseBracketedList(kind, parseElement, open, close) {
    if (parseExpected(open)) {
      const result = parseDelimitedList(kind, parseElement);
      parseExpected(close);
      return result;
    }
    return createMissingList();
  }
  function parseEntityName(allowReservedWords, diagnosticMessage) {
    const pos = getNodePos();
    let entity = allowReservedWords ? parseIdentifierName(diagnosticMessage) : parseIdentifier(diagnosticMessage);
    while (parseOptional(25 /* DotToken */)) {
      if (token() === 30 /* LessThanToken */) {
        break;
      }
      entity = finishNode(
        factory2.createQualifiedName(
          entity,
          parseRightSideOfDot(
            allowReservedWords,
            /*allowPrivateIdentifiers*/
            false,
            /*allowUnicodeEscapeSequenceInIdentifierName*/
            true
          )
        ),
        pos
      );
    }
    return entity;
  }
  function createQualifiedName(entity, name) {
    return finishNode(factory2.createQualifiedName(entity, name), entity.pos);
  }
  function parseRightSideOfDot(allowIdentifierNames, allowPrivateIdentifiers, allowUnicodeEscapeSequenceInIdentifierName) {
    if (scanner2.hasPrecedingLineBreak() && tokenIsIdentifierOrKeyword(token())) {
      const matchesPattern = lookAhead(nextTokenIsIdentifierOrKeywordOnSameLine);
      if (matchesPattern) {
        return createMissingNode(
          80 /* Identifier */,
          /*reportAtCurrentPosition*/
          true,
          Diagnostics.Identifier_expected
        );
      }
    }
    if (token() === 81 /* PrivateIdentifier */) {
      const node = parsePrivateIdentifier();
      return allowPrivateIdentifiers ? node : createMissingNode(
        80 /* Identifier */,
        /*reportAtCurrentPosition*/
        true,
        Diagnostics.Identifier_expected
      );
    }
    if (allowIdentifierNames) {
      return allowUnicodeEscapeSequenceInIdentifierName ? parseIdentifierName() : parseIdentifierNameErrorOnUnicodeEscapeSequence();
    }
    return parseIdentifier();
  }
  function parseTemplateSpans(isTaggedTemplate) {
    const pos = getNodePos();
    const list = [];
    let node;
    do {
      node = parseTemplateSpan(isTaggedTemplate);
      list.push(node);
    } while (node.literal.kind === 17 /* TemplateMiddle */);
    return createNodeArray(list, pos);
  }
  function parseTemplateExpression(isTaggedTemplate) {
    const pos = getNodePos();
    return finishNode(
      factory2.createTemplateExpression(
        parseTemplateHead(isTaggedTemplate),
        parseTemplateSpans(isTaggedTemplate)
      ),
      pos
    );
  }
  function parseTemplateType() {
    const pos = getNodePos();
    return finishNode(
      factory2.createTemplateLiteralType(
        parseTemplateHead(
          /*isTaggedTemplate*/
          false
        ),
        parseTemplateTypeSpans()
      ),
      pos
    );
  }
  function parseTemplateTypeSpans() {
    const pos = getNodePos();
    const list = [];
    let node;
    do {
      node = parseTemplateTypeSpan();
      list.push(node);
    } while (node.literal.kind === 17 /* TemplateMiddle */);
    return createNodeArray(list, pos);
  }
  function parseTemplateTypeSpan() {
    const pos = getNodePos();
    return finishNode(
      factory2.createTemplateLiteralTypeSpan(
        parseType(),
        parseLiteralOfTemplateSpan(
          /*isTaggedTemplate*/
          false
        )
      ),
      pos
    );
  }
  function parseLiteralOfTemplateSpan(isTaggedTemplate) {
    if (token() === 20 /* CloseBraceToken */) {
      reScanTemplateToken(isTaggedTemplate);
      return parseTemplateMiddleOrTemplateTail();
    } else {
      return parseExpectedToken(18 /* TemplateTail */, Diagnostics._0_expected, tokenToString(20 /* CloseBraceToken */));
    }
  }
  function parseTemplateSpan(isTaggedTemplate) {
    const pos = getNodePos();
    return finishNode(
      factory2.createTemplateSpan(
        allowInAnd(parseExpression),
        parseLiteralOfTemplateSpan(isTaggedTemplate)
      ),
      pos
    );
  }
  function parseLiteralNode() {
    return parseLiteralLikeNode(token());
  }
  function parseTemplateHead(isTaggedTemplate) {
    if (!isTaggedTemplate && scanner2.getTokenFlags() & 26656 /* IsInvalid */) {
      reScanTemplateToken(
        /*isTaggedTemplate*/
        false
      );
    }
    const fragment = parseLiteralLikeNode(token());
    Debug.assert(fragment.kind === 16 /* TemplateHead */, "Template head has wrong token kind");
    return fragment;
  }
  function parseTemplateMiddleOrTemplateTail() {
    const fragment = parseLiteralLikeNode(token());
    Debug.assert(fragment.kind === 17 /* TemplateMiddle */ || fragment.kind === 18 /* TemplateTail */, "Template fragment has wrong token kind");
    return fragment;
  }
  function getTemplateLiteralRawText(kind) {
    const isLast = kind === 15 /* NoSubstitutionTemplateLiteral */ || kind === 18 /* TemplateTail */;
    const tokenText = scanner2.getTokenText();
    return tokenText.substring(1, tokenText.length - (scanner2.isUnterminated() ? 0 : isLast ? 1 : 2));
  }
  function parseLiteralLikeNode(kind) {
    const pos = getNodePos();
    const node = isTemplateLiteralKind(kind) ? factory2.createTemplateLiteralLikeNode(kind, scanner2.getTokenValue(), getTemplateLiteralRawText(kind), scanner2.getTokenFlags() & 7176 /* TemplateLiteralLikeFlags */) : (
      // Note that theoretically the following condition would hold true literals like 009,
      // which is not octal. But because of how the scanner separates the tokens, we would
      // never get a token like this. Instead, we would get 00 and 9 as two separate tokens.
      // We also do not need to check for negatives because any prefix operator would be part of a
      // parent unary expression.
      kind === 9 /* NumericLiteral */ ? factoryCreateNumericLiteral(scanner2.getTokenValue(), scanner2.getNumericLiteralFlags()) : kind === 11 /* StringLiteral */ ? factoryCreateStringLiteral(
        scanner2.getTokenValue(),
        /*isSingleQuote*/
        void 0,
        scanner2.hasExtendedUnicodeEscape()
      ) : isLiteralKind(kind) ? factoryCreateLiteralLikeNode(kind, scanner2.getTokenValue()) : Debug.fail()
    );
    if (scanner2.hasExtendedUnicodeEscape()) {
      node.hasExtendedUnicodeEscape = true;
    }
    if (scanner2.isUnterminated()) {
      node.isUnterminated = true;
    }
    nextToken();
    return finishNode(node, pos);
  }
  function parseEntityNameOfTypeReference() {
    return parseEntityName(
      /*allowReservedWords*/
      true,
      Diagnostics.Type_expected
    );
  }
  function parseTypeArgumentsOfTypeReference() {
    if (!scanner2.hasPrecedingLineBreak() && reScanLessThanToken() === 30 /* LessThanToken */) {
      return parseBracketedList(20 /* TypeArguments */, parseType, 30 /* LessThanToken */, 32 /* GreaterThanToken */);
    }
  }
  function parseTypeReference() {
    const pos = getNodePos();
    return finishNode(
      factory2.createTypeReferenceNode(
        parseEntityNameOfTypeReference(),
        parseTypeArgumentsOfTypeReference()
      ),
      pos
    );
  }
  function typeHasArrowFunctionBlockingParseError(node) {
    switch (node.kind) {
      case 184 /* TypeReference */:
        return nodeIsMissing(node.typeName);
      case 185 /* FunctionType */:
      case 186 /* ConstructorType */: {
        const { parameters, type } = node;
        return isMissingList(parameters) || typeHasArrowFunctionBlockingParseError(type);
      }
      case 197 /* ParenthesizedType */:
        return typeHasArrowFunctionBlockingParseError(node.type);
      default:
        return false;
    }
  }
  function parseThisTypePredicate(lhs) {
    nextToken();
    return finishNode(factory2.createTypePredicateNode(
      /*assertsModifier*/
      void 0,
      lhs,
      parseType()
    ), lhs.pos);
  }
  function parseThisTypeNode() {
    const pos = getNodePos();
    nextToken();
    return finishNode(factory2.createThisTypeNode(), pos);
  }
  function parseJSDocAllType() {
    const pos = getNodePos();
    nextToken();
    return finishNode(factory2.createJSDocAllType(), pos);
  }
  function parseJSDocNonNullableType() {
    const pos = getNodePos();
    nextToken();
    return finishNode(factory2.createJSDocNonNullableType(
      parseNonArrayType(),
      /*postfix*/
      false
    ), pos);
  }
  function parseJSDocUnknownOrNullableType() {
    const pos = getNodePos();
    nextToken();
    if (token() === 28 /* CommaToken */ || token() === 20 /* CloseBraceToken */ || token() === 22 /* CloseParenToken */ || token() === 32 /* GreaterThanToken */ || token() === 64 /* EqualsToken */ || token() === 52 /* BarToken */) {
      return finishNode(factory2.createJSDocUnknownType(), pos);
    } else {
      return finishNode(factory2.createJSDocNullableType(
        parseType(),
        /*postfix*/
        false
      ), pos);
    }
  }
  function parseJSDocFunctionType() {
    const pos = getNodePos();
    const hasJSDoc = hasPrecedingJSDocComment();
    if (tryParse(nextTokenIsOpenParen)) {
      const parameters = parseParameters(4 /* Type */ | 32 /* JSDoc */);
      const type = parseReturnType(
        59 /* ColonToken */,
        /*isType*/
        false
      );
      return withJSDoc(finishNode(factory2.createJSDocFunctionType(parameters, type), pos), hasJSDoc);
    }
    return finishNode(factory2.createTypeReferenceNode(
      parseIdentifierName(),
      /*typeArguments*/
      void 0
    ), pos);
  }
  function parseJSDocParameter() {
    const pos = getNodePos();
    let name;
    if (token() === 110 /* ThisKeyword */ || token() === 105 /* NewKeyword */) {
      name = parseIdentifierName();
      parseExpected(59 /* ColonToken */);
    }
    return finishNode(
      factory2.createParameterDeclaration(
        /*modifiers*/
        void 0,
        /*dotDotDotToken*/
        void 0,
        // TODO(rbuckton): JSDoc parameters don't have names (except `this`/`new`), should we manufacture an empty identifier?
        name,
        /*questionToken*/
        void 0,
        parseJSDocType(),
        /*initializer*/
        void 0
      ),
      pos
    );
  }
  function parseJSDocType() {
    scanner2.setSkipJsDocLeadingAsterisks(true);
    const pos = getNodePos();
    if (parseOptional(144 /* ModuleKeyword */)) {
      const moduleTag = factory2.createJSDocNamepathType(
        /*type*/
        void 0
      );
      terminate:
        while (true) {
          switch (token()) {
            case 20 /* CloseBraceToken */:
            case 1 /* EndOfFileToken */:
            case 28 /* CommaToken */:
            case 5 /* WhitespaceTrivia */:
              break terminate;
            default:
              nextTokenJSDoc();
          }
        }
      scanner2.setSkipJsDocLeadingAsterisks(false);
      return finishNode(moduleTag, pos);
    }
    const hasDotDotDot = parseOptional(26 /* DotDotDotToken */);
    let type = parseTypeOrTypePredicate();
    scanner2.setSkipJsDocLeadingAsterisks(false);
    if (hasDotDotDot) {
      type = finishNode(factory2.createJSDocVariadicType(type), pos);
    }
    if (token() === 64 /* EqualsToken */) {
      nextToken();
      return finishNode(factory2.createJSDocOptionalType(type), pos);
    }
    return type;
  }
  function parseTypeQuery() {
    const pos = getNodePos();
    parseExpected(114 /* TypeOfKeyword */);
    const entityName = parseEntityName(
      /*allowReservedWords*/
      true
    );
    const typeArguments = !scanner2.hasPrecedingLineBreak() ? tryParseTypeArguments() : void 0;
    return finishNode(factory2.createTypeQueryNode(entityName, typeArguments), pos);
  }
  function parseTypeParameter() {
    const pos = getNodePos();
    const modifiers = parseModifiers(
      /*allowDecorators*/
      false,
      /*permitConstAsModifier*/
      true
    );
    const name = parseIdentifier();
    let constraint;
    let expression;
    if (parseOptional(96 /* ExtendsKeyword */)) {
      if (isStartOfType() || !isStartOfExpression()) {
        constraint = parseType();
      } else {
        expression = parseUnaryExpressionOrHigher();
      }
    }
    const defaultType = parseOptional(64 /* EqualsToken */) ? parseType() : void 0;
    const node = factory2.createTypeParameterDeclaration(modifiers, name, constraint, defaultType);
    node.expression = expression;
    return finishNode(node, pos);
  }
  function parseTypeParameters() {
    if (token() === 30 /* LessThanToken */) {
      return parseBracketedList(19 /* TypeParameters */, parseTypeParameter, 30 /* LessThanToken */, 32 /* GreaterThanToken */);
    }
  }
  function isStartOfParameter(isJSDocParameter) {
    return token() === 26 /* DotDotDotToken */ || isBindingIdentifierOrPrivateIdentifierOrPattern() || isModifierKind(token()) || token() === 60 /* AtToken */ || isStartOfType(
      /*inStartOfParameter*/
      !isJSDocParameter
    );
  }
  function parseNameOfParameter(modifiers) {
    const name = parseIdentifierOrPattern(Diagnostics.Private_identifiers_cannot_be_used_as_parameters);
    if (getFullWidth(name) === 0 && !some(modifiers) && isModifierKind(token())) {
      nextToken();
    }
    return name;
  }
  function isParameterNameStart() {
    return isBindingIdentifier() || token() === 23 /* OpenBracketToken */ || token() === 19 /* OpenBraceToken */;
  }
  function parseParameter(inOuterAwaitContext) {
    return parseParameterWorker(inOuterAwaitContext);
  }
  function parseParameterForSpeculation(inOuterAwaitContext) {
    return parseParameterWorker(
      inOuterAwaitContext,
      /*allowAmbiguity*/
      false
    );
  }
  function parseParameterWorker(inOuterAwaitContext, allowAmbiguity = true) {
    const pos = getNodePos();
    const hasJSDoc = hasPrecedingJSDocComment();
    const modifiers = inOuterAwaitContext ? doInAwaitContext(() => parseModifiers(
      /*allowDecorators*/
      true
    )) : doOutsideOfAwaitContext(() => parseModifiers(
      /*allowDecorators*/
      true
    ));
    if (token() === 110 /* ThisKeyword */) {
      const node2 = factory2.createParameterDeclaration(
        modifiers,
        /*dotDotDotToken*/
        void 0,
        createIdentifier(
          /*isIdentifier*/
          true
        ),
        /*questionToken*/
        void 0,
        parseTypeAnnotation(),
        /*initializer*/
        void 0
      );
      const modifier = firstOrUndefined(modifiers);
      if (modifier) {
        parseErrorAtRange(modifier, Diagnostics.Neither_decorators_nor_modifiers_may_be_applied_to_this_parameters);
      }
      return withJSDoc(finishNode(node2, pos), hasJSDoc);
    }
    const savedTopLevel = topLevel;
    topLevel = false;
    const dotDotDotToken = parseOptionalToken(26 /* DotDotDotToken */);
    if (!allowAmbiguity && !isParameterNameStart()) {
      return void 0;
    }
    const node = withJSDoc(
      finishNode(
        factory2.createParameterDeclaration(
          modifiers,
          dotDotDotToken,
          parseNameOfParameter(modifiers),
          parseOptionalToken(58 /* QuestionToken */),
          parseTypeAnnotation(),
          parseInitializer()
        ),
        pos
      ),
      hasJSDoc
    );
    topLevel = savedTopLevel;
    return node;
  }
  function parseReturnType(returnToken, isType) {
    if (shouldParseReturnType(returnToken, isType)) {
      return allowConditionalTypesAnd(parseTypeOrTypePredicate);
    }
  }
  function shouldParseReturnType(returnToken, isType) {
    if (returnToken === 39 /* EqualsGreaterThanToken */) {
      parseExpected(returnToken);
      return true;
    } else if (parseOptional(59 /* ColonToken */)) {
      return true;
    } else if (isType && token() === 39 /* EqualsGreaterThanToken */) {
      parseErrorAtCurrentToken(Diagnostics._0_expected, tokenToString(59 /* ColonToken */));
      nextToken();
      return true;
    }
    return false;
  }
  function parseParametersWorker(flags, allowAmbiguity) {
    const savedYieldContext = inYieldContext();
    const savedAwaitContext = inAwaitContext();
    setYieldContext(!!(flags & 1 /* Yield */));
    setAwaitContext(!!(flags & 2 /* Await */));
    const parameters = flags & 32 /* JSDoc */ ? parseDelimitedList(17 /* JSDocParameters */, parseJSDocParameter) : parseDelimitedList(16 /* Parameters */, () => allowAmbiguity ? parseParameter(savedAwaitContext) : parseParameterForSpeculation(savedAwaitContext));
    setYieldContext(savedYieldContext);
    setAwaitContext(savedAwaitContext);
    return parameters;
  }
  function parseParameters(flags) {
    if (!parseExpected(21 /* OpenParenToken */)) {
      return createMissingList();
    }
    const parameters = parseParametersWorker(
      flags,
      /*allowAmbiguity*/
      true
    );
    parseExpected(22 /* CloseParenToken */);
    return parameters;
  }
  function parseTypeMemberSemicolon() {
    if (parseOptional(28 /* CommaToken */)) {
      return;
    }
    parseSemicolon();
  }
  function parseSignatureMember(kind) {
    const pos = getNodePos();
    const hasJSDoc = hasPrecedingJSDocComment();
    if (kind === 181 /* ConstructSignature */) {
      parseExpected(105 /* NewKeyword */);
    }
    const typeParameters = parseTypeParameters();
    const parameters = parseParameters(4 /* Type */);
    const type = parseReturnType(
      59 /* ColonToken */,
      /*isType*/
      true
    );
    parseTypeMemberSemicolon();
    const node = kind === 180 /* CallSignature */ ? factory2.createCallSignature(typeParameters, parameters, type) : factory2.createConstructSignature(typeParameters, parameters, type);
    return withJSDoc(finishNode(node, pos), hasJSDoc);
  }
  function isIndexSignature() {
    return token() === 23 /* OpenBracketToken */ && lookAhead(isUnambiguouslyIndexSignature);
  }
  function isUnambiguouslyIndexSignature() {
    nextToken();
    if (token() === 26 /* DotDotDotToken */ || token() === 24 /* CloseBracketToken */) {
      return true;
    }
    if (isModifierKind(token())) {
      nextToken();
      if (isIdentifier2()) {
        return true;
      }
    } else if (!isIdentifier2()) {
      return false;
    } else {
      nextToken();
    }
    if (token() === 59 /* ColonToken */ || token() === 28 /* CommaToken */) {
      return true;
    }
    if (token() !== 58 /* QuestionToken */) {
      return false;
    }
    nextToken();
    return token() === 59 /* ColonToken */ || token() === 28 /* CommaToken */ || token() === 24 /* CloseBracketToken */;
  }
  function parseIndexSignatureDeclaration(pos, hasJSDoc, modifiers) {
    const parameters = parseBracketedList(16 /* Parameters */, () => parseParameter(
      /*inOuterAwaitContext*/
      false
    ), 23 /* OpenBracketToken */, 24 /* CloseBracketToken */);
    const type = parseTypeAnnotation();
    parseTypeMemberSemicolon();
    const node = factory2.createIndexSignature(modifiers, parameters, type);
    return withJSDoc(finishNode(node, pos), hasJSDoc);
  }
  function parsePropertyOrMethodSignature(pos, hasJSDoc, modifiers) {
    const name = parsePropertyName();
    const questionToken = parseOptionalToken(58 /* QuestionToken */);
    let node;
    if (token() === 21 /* OpenParenToken */ || token() === 30 /* LessThanToken */) {
      const typeParameters = parseTypeParameters();
      const parameters = parseParameters(4 /* Type */);
      const type = parseReturnType(
        59 /* ColonToken */,
        /*isType*/
        true
      );
      node = factory2.createMethodSignature(modifiers, name, questionToken, typeParameters, parameters, type);
    } else {
      const type = parseTypeAnnotation();
      node = factory2.createPropertySignature(modifiers, name, questionToken, type);
      if (token() === 64 /* EqualsToken */) node.initializer = parseInitializer();
    }
    parseTypeMemberSemicolon();
    return withJSDoc(finishNode(node, pos), hasJSDoc);
  }
  function isTypeMemberStart() {
    if (token() === 21 /* OpenParenToken */ || token() === 30 /* LessThanToken */ || token() === 139 /* GetKeyword */ || token() === 153 /* SetKeyword */) {
      return true;
    }
    let idToken = false;
    while (isModifierKind(token())) {
      idToken = true;
      nextToken();
    }
    if (token() === 23 /* OpenBracketToken */) {
      return true;
    }
    if (isLiteralPropertyName()) {
      idToken = true;
      nextToken();
    }
    if (idToken) {
      return token() === 21 /* OpenParenToken */ || token() === 30 /* LessThanToken */ || token() === 58 /* QuestionToken */ || token() === 59 /* ColonToken */ || token() === 28 /* CommaToken */ || canParseSemicolon();
    }
    return false;
  }
  function parseTypeMember() {
    if (token() === 21 /* OpenParenToken */ || token() === 30 /* LessThanToken */) {
      return parseSignatureMember(180 /* CallSignature */);
    }
    if (token() === 105 /* NewKeyword */ && lookAhead(nextTokenIsOpenParenOrLessThan)) {
      return parseSignatureMember(181 /* ConstructSignature */);
    }
    const pos = getNodePos();
    const hasJSDoc = hasPrecedingJSDocComment();
    const modifiers = parseModifiers(
      /*allowDecorators*/
      false
    );
    if (parseContextualModifier(139 /* GetKeyword */)) {
      return parseAccessorDeclaration(pos, hasJSDoc, modifiers, 178 /* GetAccessor */, 4 /* Type */);
    }
    if (parseContextualModifier(153 /* SetKeyword */)) {
      return parseAccessorDeclaration(pos, hasJSDoc, modifiers, 179 /* SetAccessor */, 4 /* Type */);
    }
    if (isIndexSignature()) {
      return parseIndexSignatureDeclaration(pos, hasJSDoc, modifiers);
    }
    return parsePropertyOrMethodSignature(pos, hasJSDoc, modifiers);
  }
  function nextTokenIsOpenParenOrLessThan() {
    nextToken();
    return token() === 21 /* OpenParenToken */ || token() === 30 /* LessThanToken */;
  }
  function nextTokenIsDot() {
    return nextToken() === 25 /* DotToken */;
  }
  function nextTokenIsOpenParenOrLessThanOrDot() {
    switch (nextToken()) {
      case 21 /* OpenParenToken */:
      case 30 /* LessThanToken */:
      case 25 /* DotToken */:
        return true;
    }
    return false;
  }
  function parseTypeLiteral() {
    const pos = getNodePos();
    return finishNode(factory2.createTypeLiteralNode(parseObjectTypeMembers()), pos);
  }
  function parseObjectTypeMembers() {
    let members;
    if (parseExpected(19 /* OpenBraceToken */)) {
      members = parseList(4 /* TypeMembers */, parseTypeMember);
      parseExpected(20 /* CloseBraceToken */);
    } else {
      members = createMissingList();
    }
    return members;
  }
  function isStartOfMappedType() {
    nextToken();
    if (token() === 40 /* PlusToken */ || token() === 41 /* MinusToken */) {
      return nextToken() === 148 /* ReadonlyKeyword */;
    }
    if (token() === 148 /* ReadonlyKeyword */) {
      nextToken();
    }
    return token() === 23 /* OpenBracketToken */ && nextTokenIsIdentifier() && nextToken() === 103 /* InKeyword */;
  }
  function parseMappedTypeParameter() {
    const pos = getNodePos();
    const name = parseIdentifierName();
    parseExpected(103 /* InKeyword */);
    const type = parseType();
    return finishNode(factory2.createTypeParameterDeclaration(
      /*modifiers*/
      void 0,
      name,
      type,
      /*defaultType*/
      void 0
    ), pos);
  }
  function parseMappedType() {
    const pos = getNodePos();
    parseExpected(19 /* OpenBraceToken */);
    let readonlyToken;
    if (token() === 148 /* ReadonlyKeyword */ || token() === 40 /* PlusToken */ || token() === 41 /* MinusToken */) {
      readonlyToken = parseTokenNode();
      if (readonlyToken.kind !== 148 /* ReadonlyKeyword */) {
        parseExpected(148 /* ReadonlyKeyword */);
      }
    }
    parseExpected(23 /* OpenBracketToken */);
    const typeParameter = parseMappedTypeParameter();
    const nameType = parseOptional(130 /* AsKeyword */) ? parseType() : void 0;
    parseExpected(24 /* CloseBracketToken */);
    let questionToken;
    if (token() === 58 /* QuestionToken */ || token() === 40 /* PlusToken */ || token() === 41 /* MinusToken */) {
      questionToken = parseTokenNode();
      if (questionToken.kind !== 58 /* QuestionToken */) {
        parseExpected(58 /* QuestionToken */);
      }
    }
    const type = parseTypeAnnotation();
    parseSemicolon();
    const members = parseList(4 /* TypeMembers */, parseTypeMember);
    parseExpected(20 /* CloseBraceToken */);
    return finishNode(factory2.createMappedTypeNode(readonlyToken, typeParameter, nameType, questionToken, type, members), pos);
  }
  function parseTupleElementType() {
    const pos = getNodePos();
    if (parseOptional(26 /* DotDotDotToken */)) {
      return finishNode(factory2.createRestTypeNode(parseType()), pos);
    }
    const type = parseType();
    if (isJSDocNullableType(type) && type.pos === type.type.pos) {
      const node = factory2.createOptionalTypeNode(type.type);
      setTextRange(node, type);
      node.flags = type.flags;
      return node;
    }
    return type;
  }
  function isNextTokenColonOrQuestionColon() {
    return nextToken() === 59 /* ColonToken */ || token() === 58 /* QuestionToken */ && nextToken() === 59 /* ColonToken */;
  }
  function isTupleElementName() {
    if (token() === 26 /* DotDotDotToken */) {
      return tokenIsIdentifierOrKeyword(nextToken()) && isNextTokenColonOrQuestionColon();
    }
    return tokenIsIdentifierOrKeyword(token()) && isNextTokenColonOrQuestionColon();
  }
  function parseTupleElementNameOrTupleElementType() {
    if (lookAhead(isTupleElementName)) {
      const pos = getNodePos();
      const hasJSDoc = hasPrecedingJSDocComment();
      const dotDotDotToken = parseOptionalToken(26 /* DotDotDotToken */);
      const name = parseIdentifierName();
      const questionToken = parseOptionalToken(58 /* QuestionToken */);
      parseExpected(59 /* ColonToken */);
      const type = parseTupleElementType();
      const node = factory2.createNamedTupleMember(dotDotDotToken, name, questionToken, type);
      return withJSDoc(finishNode(node, pos), hasJSDoc);
    }
    return parseTupleElementType();
  }
  function parseTupleType() {
    const pos = getNodePos();
    return finishNode(
      factory2.createTupleTypeNode(
        parseBracketedList(21 /* TupleElementTypes */, parseTupleElementNameOrTupleElementType, 23 /* OpenBracketToken */, 24 /* CloseBracketToken */)
      ),
      pos
    );
  }
  function parseParenthesizedType() {
    const pos = getNodePos();
    parseExpected(21 /* OpenParenToken */);
    const type = parseType();
    parseExpected(22 /* CloseParenToken */);
    return finishNode(factory2.createParenthesizedType(type), pos);
  }
  function parseModifiersForConstructorType() {
    let modifiers;
    if (token() === 128 /* AbstractKeyword */) {
      const pos = getNodePos();
      nextToken();
      const modifier = finishNode(factoryCreateToken(128 /* AbstractKeyword */), pos);
      modifiers = createNodeArray([modifier], pos);
    }
    return modifiers;
  }
  function parseFunctionOrConstructorType() {
    const pos = getNodePos();
    const hasJSDoc = hasPrecedingJSDocComment();
    const modifiers = parseModifiersForConstructorType();
    const isConstructorType = parseOptional(105 /* NewKeyword */);
    Debug.assert(!modifiers || isConstructorType, "Per isStartOfFunctionOrConstructorType, a function type cannot have modifiers.");
    const typeParameters = parseTypeParameters();
    const parameters = parseParameters(4 /* Type */);
    const type = parseReturnType(
      39 /* EqualsGreaterThanToken */,
      /*isType*/
      false
    );
    const node = isConstructorType ? factory2.createConstructorTypeNode(modifiers, typeParameters, parameters, type) : factory2.createFunctionTypeNode(typeParameters, parameters, type);
    return withJSDoc(finishNode(node, pos), hasJSDoc);
  }
  function parseKeywordAndNoDot() {
    const node = parseTokenNode();
    return token() === 25 /* DotToken */ ? void 0 : node;
  }
  function parseLiteralTypeNode(negative) {
    const pos = getNodePos();
    if (negative) {
      nextToken();
    }
    let expression = token() === 112 /* TrueKeyword */ || token() === 97 /* FalseKeyword */ || token() === 106 /* NullKeyword */ ? parseTokenNode() : parseLiteralLikeNode(token());
    if (negative) {
      expression = finishNode(factory2.createPrefixUnaryExpression(41 /* MinusToken */, expression), pos);
    }
    return finishNode(factory2.createLiteralTypeNode(expression), pos);
  }
  function isStartOfTypeOfImportType() {
    nextToken();
    return token() === 102 /* ImportKeyword */;
  }
  function parseImportType() {
    sourceFlags |= 4194304 /* PossiblyContainsDynamicImport */;
    const pos = getNodePos();
    const isTypeOf = parseOptional(114 /* TypeOfKeyword */);
    parseExpected(102 /* ImportKeyword */);
    parseExpected(21 /* OpenParenToken */);
    const type = parseType();
    let attributes;
    if (parseOptional(28 /* CommaToken */)) {
      const openBracePosition = scanner2.getTokenStart();
      parseExpected(19 /* OpenBraceToken */);
      const currentToken2 = token();
      if (currentToken2 === 118 /* WithKeyword */ || currentToken2 === 132 /* AssertKeyword */) {
        nextToken();
      } else {
        parseErrorAtCurrentToken(Diagnostics._0_expected, tokenToString(118 /* WithKeyword */));
      }
      parseExpected(59 /* ColonToken */);
      attributes = parseImportAttributes(
        currentToken2,
        /*skipKeyword*/
        true
      );
      parseOptional(28 /* CommaToken */);
      if (!parseExpected(20 /* CloseBraceToken */)) {
        const lastError = lastOrUndefined(parseDiagnostics);
        if (lastError && lastError.code === Diagnostics._0_expected.code) {
          addRelatedInfo(
            lastError,
            createDetachedDiagnostic(fileName, sourceText, openBracePosition, 1, Diagnostics.The_parser_expected_to_find_a_1_to_match_the_0_token_here, "{", "}")
          );
        }
      }
    }
    parseExpected(22 /* CloseParenToken */);
    const qualifier = parseOptional(25 /* DotToken */) ? parseEntityNameOfTypeReference() : void 0;
    const typeArguments = parseTypeArgumentsOfTypeReference();
    return finishNode(factory2.createImportTypeNode(type, attributes, qualifier, typeArguments, isTypeOf), pos);
  }
  function nextTokenIsNumericOrBigIntLiteral() {
    nextToken();
    return token() === 9 /* NumericLiteral */ || token() === 10 /* BigIntLiteral */;
  }
  function parseNonArrayType() {
    switch (token()) {
      case 133 /* AnyKeyword */:
      case 159 /* UnknownKeyword */:
      case 154 /* StringKeyword */:
      case 150 /* NumberKeyword */:
      case 163 /* BigIntKeyword */:
      case 155 /* SymbolKeyword */:
      case 136 /* BooleanKeyword */:
      case 157 /* UndefinedKeyword */:
      case 146 /* NeverKeyword */:
      case 151 /* ObjectKeyword */:
        return tryParse(parseKeywordAndNoDot) || parseTypeReference();
      case 67 /* AsteriskEqualsToken */:
        scanner2.reScanAsteriskEqualsToken();
      // falls through
      case 42 /* AsteriskToken */:
        return parseJSDocAllType();
      case 61 /* QuestionQuestionToken */:
        scanner2.reScanQuestionToken();
      // falls through
      case 58 /* QuestionToken */:
        return parseJSDocUnknownOrNullableType();
      case 100 /* FunctionKeyword */:
        return parseJSDocFunctionType();
      case 54 /* ExclamationToken */:
        return parseJSDocNonNullableType();
      case 15 /* NoSubstitutionTemplateLiteral */:
      case 11 /* StringLiteral */:
      case 9 /* NumericLiteral */:
      case 10 /* BigIntLiteral */:
      case 112 /* TrueKeyword */:
      case 97 /* FalseKeyword */:
      case 106 /* NullKeyword */:
        return parseLiteralTypeNode();
      case 41 /* MinusToken */:
        return lookAhead(nextTokenIsNumericOrBigIntLiteral) ? parseLiteralTypeNode(
          /*negative*/
          true
        ) : parseTypeReference();
      case 116 /* VoidKeyword */:
        return parseTokenNode();
      case 110 /* ThisKeyword */: {
        const thisKeyword = parseThisTypeNode();
        if (token() === 142 /* IsKeyword */ && !scanner2.hasPrecedingLineBreak()) {
          return parseThisTypePredicate(thisKeyword);
        } else {
          return thisKeyword;
        }
      }
      case 114 /* TypeOfKeyword */:
        return lookAhead(isStartOfTypeOfImportType) ? parseImportType() : parseTypeQuery();
      case 19 /* OpenBraceToken */:
        return lookAhead(isStartOfMappedType) ? parseMappedType() : parseTypeLiteral();
      case 23 /* OpenBracketToken */:
        return parseTupleType();
      case 21 /* OpenParenToken */:
        return parseParenthesizedType();
      case 102 /* ImportKeyword */:
        return parseImportType();
      case 131 /* AssertsKeyword */:
        return lookAhead(nextTokenIsIdentifierOrKeywordOnSameLine) ? parseAssertsTypePredicate() : parseTypeReference();
      case 16 /* TemplateHead */:
        return parseTemplateType();
      default:
        return parseTypeReference();
    }
  }
  function isStartOfType(inStartOfParameter) {
    switch (token()) {
      case 133 /* AnyKeyword */:
      case 159 /* UnknownKeyword */:
      case 154 /* StringKeyword */:
      case 150 /* NumberKeyword */:
      case 163 /* BigIntKeyword */:
      case 136 /* BooleanKeyword */:
      case 148 /* ReadonlyKeyword */:
      case 155 /* SymbolKeyword */:
      case 158 /* UniqueKeyword */:
      case 116 /* VoidKeyword */:
      case 157 /* UndefinedKeyword */:
      case 106 /* NullKeyword */:
      case 110 /* ThisKeyword */:
      case 114 /* TypeOfKeyword */:
      case 146 /* NeverKeyword */:
      case 19 /* OpenBraceToken */:
      case 23 /* OpenBracketToken */:
      case 30 /* LessThanToken */:
      case 52 /* BarToken */:
      case 51 /* AmpersandToken */:
      case 105 /* NewKeyword */:
      case 11 /* StringLiteral */:
      case 9 /* NumericLiteral */:
      case 10 /* BigIntLiteral */:
      case 112 /* TrueKeyword */:
      case 97 /* FalseKeyword */:
      case 151 /* ObjectKeyword */:
      case 42 /* AsteriskToken */:
      case 58 /* QuestionToken */:
      case 54 /* ExclamationToken */:
      case 26 /* DotDotDotToken */:
      case 140 /* InferKeyword */:
      case 102 /* ImportKeyword */:
      case 131 /* AssertsKeyword */:
      case 15 /* NoSubstitutionTemplateLiteral */:
      case 16 /* TemplateHead */:
        return true;
      case 100 /* FunctionKeyword */:
        return !inStartOfParameter;
      case 41 /* MinusToken */:
        return !inStartOfParameter && lookAhead(nextTokenIsNumericOrBigIntLiteral);
      case 21 /* OpenParenToken */:
        return !inStartOfParameter && lookAhead(isStartOfParenthesizedOrFunctionType);
      default:
        return isIdentifier2();
    }
  }
  function isStartOfParenthesizedOrFunctionType() {
    nextToken();
    return token() === 22 /* CloseParenToken */ || isStartOfParameter(
      /*isJSDocParameter*/
      false
    ) || isStartOfType();
  }
  function parsePostfixTypeOrHigher() {
    const pos = getNodePos();
    let type = parseNonArrayType();
    while (!scanner2.hasPrecedingLineBreak()) {
      switch (token()) {
        case 54 /* ExclamationToken */:
          nextToken();
          type = finishNode(factory2.createJSDocNonNullableType(
            type,
            /*postfix*/
            true
          ), pos);
          break;
        case 58 /* QuestionToken */:
          if (lookAhead(nextTokenIsStartOfType)) {
            return type;
          }
          nextToken();
          type = finishNode(factory2.createJSDocNullableType(
            type,
            /*postfix*/
            true
          ), pos);
          break;
        case 23 /* OpenBracketToken */:
          parseExpected(23 /* OpenBracketToken */);
          if (isStartOfType()) {
            const indexType = parseType();
            parseExpected(24 /* CloseBracketToken */);
            type = finishNode(factory2.createIndexedAccessTypeNode(type, indexType), pos);
          } else {
            parseExpected(24 /* CloseBracketToken */);
            type = finishNode(factory2.createArrayTypeNode(type), pos);
          }
          break;
        default:
          return type;
      }
    }
    return type;
  }
  function parseTypeOperator(operator) {
    const pos = getNodePos();
    parseExpected(operator);
    return finishNode(factory2.createTypeOperatorNode(operator, parseTypeOperatorOrHigher()), pos);
  }
  function tryParseConstraintOfInferType() {
    if (parseOptional(96 /* ExtendsKeyword */)) {
      const constraint = disallowConditionalTypesAnd(parseType);
      if (inDisallowConditionalTypesContext() || token() !== 58 /* QuestionToken */) {
        return constraint;
      }
    }
  }
  function parseTypeParameterOfInferType() {
    const pos = getNodePos();
    const name = parseIdentifier();
    const constraint = tryParse(tryParseConstraintOfInferType);
    const node = factory2.createTypeParameterDeclaration(
      /*modifiers*/
      void 0,
      name,
      constraint
    );
    return finishNode(node, pos);
  }
  function parseInferType() {
    const pos = getNodePos();
    parseExpected(140 /* InferKeyword */);
    return finishNode(factory2.createInferTypeNode(parseTypeParameterOfInferType()), pos);
  }
  function parseTypeOperatorOrHigher() {
    const operator = token();
    switch (operator) {
      case 143 /* KeyOfKeyword */:
      case 158 /* UniqueKeyword */:
      case 148 /* ReadonlyKeyword */:
        return parseTypeOperator(operator);
      case 140 /* InferKeyword */:
        return parseInferType();
    }
    return allowConditionalTypesAnd(parsePostfixTypeOrHigher);
  }
  function parseFunctionOrConstructorTypeToError(isInUnionType) {
    if (isStartOfFunctionTypeOrConstructorType()) {
      const type = parseFunctionOrConstructorType();
      let diagnostic;
      if (isFunctionTypeNode(type)) {
        diagnostic = isInUnionType ? Diagnostics.Function_type_notation_must_be_parenthesized_when_used_in_a_union_type : Diagnostics.Function_type_notation_must_be_parenthesized_when_used_in_an_intersection_type;
      } else {
        diagnostic = isInUnionType ? Diagnostics.Constructor_type_notation_must_be_parenthesized_when_used_in_a_union_type : Diagnostics.Constructor_type_notation_must_be_parenthesized_when_used_in_an_intersection_type;
      }
      parseErrorAtRange(type, diagnostic);
      return type;
    }
    return void 0;
  }
  function parseUnionOrIntersectionType(operator, parseConstituentType, createTypeNode) {
    const pos = getNodePos();
    const isUnionType = operator === 52 /* BarToken */;
    const hasLeadingOperator = parseOptional(operator);
    let type = hasLeadingOperator && parseFunctionOrConstructorTypeToError(isUnionType) || parseConstituentType();
    if (token() === operator || hasLeadingOperator) {
      const types = [type];
      while (parseOptional(operator)) {
        types.push(parseFunctionOrConstructorTypeToError(isUnionType) || parseConstituentType());
      }
      type = finishNode(createTypeNode(createNodeArray(types, pos)), pos);
    }
    return type;
  }
  function parseIntersectionTypeOrHigher() {
    return parseUnionOrIntersectionType(51 /* AmpersandToken */, parseTypeOperatorOrHigher, factory2.createIntersectionTypeNode);
  }
  function parseUnionTypeOrHigher() {
    return parseUnionOrIntersectionType(52 /* BarToken */, parseIntersectionTypeOrHigher, factory2.createUnionTypeNode);
  }
  function nextTokenIsNewKeyword() {
    nextToken();
    return token() === 105 /* NewKeyword */;
  }
  function isStartOfFunctionTypeOrConstructorType() {
    if (token() === 30 /* LessThanToken */) {
      return true;
    }
    if (token() === 21 /* OpenParenToken */ && lookAhead(isUnambiguouslyStartOfFunctionType)) {
      return true;
    }
    return token() === 105 /* NewKeyword */ || token() === 128 /* AbstractKeyword */ && lookAhead(nextTokenIsNewKeyword);
  }
  function skipParameterStart() {
    if (isModifierKind(token())) {
      parseModifiers(
        /*allowDecorators*/
        false
      );
    }
    if (isIdentifier2() || token() === 110 /* ThisKeyword */) {
      nextToken();
      return true;
    }
    if (token() === 23 /* OpenBracketToken */ || token() === 19 /* OpenBraceToken */) {
      const previousErrorCount = parseDiagnostics.length;
      parseIdentifierOrPattern();
      return previousErrorCount === parseDiagnostics.length;
    }
    return false;
  }
  function isUnambiguouslyStartOfFunctionType() {
    nextToken();
    if (token() === 22 /* CloseParenToken */ || token() === 26 /* DotDotDotToken */) {
      return true;
    }
    if (skipParameterStart()) {
      if (token() === 59 /* ColonToken */ || token() === 28 /* CommaToken */ || token() === 58 /* QuestionToken */ || token() === 64 /* EqualsToken */) {
        return true;
      }
      if (token() === 22 /* CloseParenToken */) {
        nextToken();
        if (token() === 39 /* EqualsGreaterThanToken */) {
          return true;
        }
      }
    }
    return false;
  }
  function parseTypeOrTypePredicate() {
    const pos = getNodePos();
    const typePredicateVariable = isIdentifier2() && tryParse(parseTypePredicatePrefix);
    const type = parseType();
    if (typePredicateVariable) {
      return finishNode(factory2.createTypePredicateNode(
        /*assertsModifier*/
        void 0,
        typePredicateVariable,
        type
      ), pos);
    } else {
      return type;
    }
  }
  function parseTypePredicatePrefix() {
    const id = parseIdentifier();
    if (token() === 142 /* IsKeyword */ && !scanner2.hasPrecedingLineBreak()) {
      nextToken();
      return id;
    }
  }
  function parseAssertsTypePredicate() {
    const pos = getNodePos();
    const assertsModifier = parseExpectedToken(131 /* AssertsKeyword */);
    const parameterName = token() === 110 /* ThisKeyword */ ? parseThisTypeNode() : parseIdentifier();
    const type = parseOptional(142 /* IsKeyword */) ? parseType() : void 0;
    return finishNode(factory2.createTypePredicateNode(assertsModifier, parameterName, type), pos);
  }
  function parseType() {
    if (contextFlags & 81920 /* TypeExcludesFlags */) {
      return doOutsideOfContext(81920 /* TypeExcludesFlags */, parseType);
    }
    if (isStartOfFunctionTypeOrConstructorType()) {
      return parseFunctionOrConstructorType();
    }
    const pos = getNodePos();
    const type = parseUnionTypeOrHigher();
    if (!inDisallowConditionalTypesContext() && !scanner2.hasPrecedingLineBreak() && parseOptional(96 /* ExtendsKeyword */)) {
      const extendsType = disallowConditionalTypesAnd(parseType);
      parseExpected(58 /* QuestionToken */);
      const trueType = allowConditionalTypesAnd(parseType);
      parseExpected(59 /* ColonToken */);
      const falseType = allowConditionalTypesAnd(parseType);
      return finishNode(factory2.createConditionalTypeNode(type, extendsType, trueType, falseType), pos);
    }
    return type;
  }
  function parseTypeAnnotation() {
    return parseOptional(59 /* ColonToken */) ? parseType() : void 0;
  }
  function isStartOfLeftHandSideExpression() {
    switch (token()) {
      case 110 /* ThisKeyword */:
      case 108 /* SuperKeyword */:
      case 106 /* NullKeyword */:
      case 112 /* TrueKeyword */:
      case 97 /* FalseKeyword */:
      case 9 /* NumericLiteral */:
      case 10 /* BigIntLiteral */:
      case 11 /* StringLiteral */:
      case 15 /* NoSubstitutionTemplateLiteral */:
      case 16 /* TemplateHead */:
      case 21 /* OpenParenToken */:
      case 23 /* OpenBracketToken */:
      case 19 /* OpenBraceToken */:
      case 100 /* FunctionKeyword */:
      case 86 /* ClassKeyword */:
      case 105 /* NewKeyword */:
      case 44 /* SlashToken */:
      case 69 /* SlashEqualsToken */:
      case 80 /* Identifier */:
        return true;
      case 102 /* ImportKeyword */:
        return lookAhead(nextTokenIsOpenParenOrLessThanOrDot);
      default:
        return isIdentifier2();
    }
  }
  function isStartOfExpression() {
    if (isStartOfLeftHandSideExpression()) {
      return true;
    }
    switch (token()) {
      case 40 /* PlusToken */:
      case 41 /* MinusToken */:
      case 55 /* TildeToken */:
      case 54 /* ExclamationToken */:
      case 91 /* DeleteKeyword */:
      case 114 /* TypeOfKeyword */:
      case 116 /* VoidKeyword */:
      case 46 /* PlusPlusToken */:
      case 47 /* MinusMinusToken */:
      case 30 /* LessThanToken */:
      case 135 /* AwaitKeyword */:
      case 127 /* YieldKeyword */:
      case 81 /* PrivateIdentifier */:
      case 60 /* AtToken */:
        return true;
      default:
        if (isBinaryOperator2()) {
          return true;
        }
        return isIdentifier2();
    }
  }
  function isStartOfExpressionStatement() {
    return token() !== 19 /* OpenBraceToken */ && token() !== 100 /* FunctionKeyword */ && token() !== 86 /* ClassKeyword */ && token() !== 60 /* AtToken */ && isStartOfExpression();
  }
  function parseExpression() {
    const saveDecoratorContext = inDecoratorContext();
    if (saveDecoratorContext) {
      setDecoratorContext(
        /*val*/
        false
      );
    }
    const pos = getNodePos();
    let expr = parseAssignmentExpressionOrHigher(
      /*allowReturnTypeInArrowFunction*/
      true
    );
    let operatorToken;
    while (operatorToken = parseOptionalToken(28 /* CommaToken */)) {
      expr = makeBinaryExpression(expr, operatorToken, parseAssignmentExpressionOrHigher(
        /*allowReturnTypeInArrowFunction*/
        true
      ), pos);
    }
    if (saveDecoratorContext) {
      setDecoratorContext(
        /*val*/
        true
      );
    }
    return expr;
  }
  function parseInitializer() {
    return parseOptional(64 /* EqualsToken */) ? parseAssignmentExpressionOrHigher(
      /*allowReturnTypeInArrowFunction*/
      true
    ) : void 0;
  }
  function parseAssignmentExpressionOrHigher(allowReturnTypeInArrowFunction) {
    if (isYieldExpression2()) {
      return parseYieldExpression();
    }
    const arrowExpression = tryParseParenthesizedArrowFunctionExpression(allowReturnTypeInArrowFunction) || tryParseAsyncSimpleArrowFunctionExpression(allowReturnTypeInArrowFunction);
    if (arrowExpression) {
      return arrowExpression;
    }
    const pos = getNodePos();
    const hasJSDoc = hasPrecedingJSDocComment();
    const expr = parseBinaryExpressionOrHigher(0 /* Lowest */);
    if (expr.kind === 80 /* Identifier */ && token() === 39 /* EqualsGreaterThanToken */) {
      return parseSimpleArrowFunctionExpression(
        pos,
        expr,
        allowReturnTypeInArrowFunction,
        hasJSDoc,
        /*asyncModifier*/
        void 0
      );
    }
    if (isLeftHandSideExpression(expr) && isAssignmentOperator(reScanGreaterToken())) {
      return makeBinaryExpression(expr, parseTokenNode(), parseAssignmentExpressionOrHigher(allowReturnTypeInArrowFunction), pos);
    }
    return parseConditionalExpressionRest(expr, pos, allowReturnTypeInArrowFunction);
  }
  function isYieldExpression2() {
    if (token() === 127 /* YieldKeyword */) {
      if (inYieldContext()) {
        return true;
      }
      return lookAhead(nextTokenIsIdentifierOrKeywordOrLiteralOnSameLine);
    }
    return false;
  }
  function nextTokenIsIdentifierOnSameLine() {
    nextToken();
    return !scanner2.hasPrecedingLineBreak() && isIdentifier2();
  }
  function parseYieldExpression() {
    const pos = getNodePos();
    nextToken();
    if (!scanner2.hasPrecedingLineBreak() && (token() === 42 /* AsteriskToken */ || isStartOfExpression())) {
      return finishNode(
        factory2.createYieldExpression(
          parseOptionalToken(42 /* AsteriskToken */),
          parseAssignmentExpressionOrHigher(
            /*allowReturnTypeInArrowFunction*/
            true
          )
        ),
        pos
      );
    } else {
      return finishNode(factory2.createYieldExpression(
        /*asteriskToken*/
        void 0,
        /*expression*/
        void 0
      ), pos);
    }
  }
  function parseSimpleArrowFunctionExpression(pos, identifier, allowReturnTypeInArrowFunction, hasJSDoc, asyncModifier) {
    Debug.assert(token() === 39 /* EqualsGreaterThanToken */, "parseSimpleArrowFunctionExpression should only have been called if we had a =>");
    const parameter = factory2.createParameterDeclaration(
      /*modifiers*/
      void 0,
      /*dotDotDotToken*/
      void 0,
      identifier,
      /*questionToken*/
      void 0,
      /*type*/
      void 0,
      /*initializer*/
      void 0
    );
    finishNode(parameter, identifier.pos);
    const parameters = createNodeArray([parameter], parameter.pos, parameter.end);
    const equalsGreaterThanToken = parseExpectedToken(39 /* EqualsGreaterThanToken */);
    const body = parseArrowFunctionExpressionBody(
      /*isAsync*/
      !!asyncModifier,
      allowReturnTypeInArrowFunction
    );
    const node = factory2.createArrowFunction(
      asyncModifier,
      /*typeParameters*/
      void 0,
      parameters,
      /*type*/
      void 0,
      equalsGreaterThanToken,
      body
    );
    return withJSDoc(finishNode(node, pos), hasJSDoc);
  }
  function tryParseParenthesizedArrowFunctionExpression(allowReturnTypeInArrowFunction) {
    const triState = isParenthesizedArrowFunctionExpression();
    if (triState === 0 /* False */) {
      return void 0;
    }
    return triState === 1 /* True */ ? parseParenthesizedArrowFunctionExpression(
      /*allowAmbiguity*/
      true,
      /*allowReturnTypeInArrowFunction*/
      true
    ) : tryParse(() => parsePossibleParenthesizedArrowFunctionExpression(allowReturnTypeInArrowFunction));
  }
  function isParenthesizedArrowFunctionExpression() {
    if (token() === 21 /* OpenParenToken */ || token() === 30 /* LessThanToken */ || token() === 134 /* AsyncKeyword */) {
      return lookAhead(isParenthesizedArrowFunctionExpressionWorker);
    }
    if (token() === 39 /* EqualsGreaterThanToken */) {
      return 1 /* True */;
    }
    return 0 /* False */;
  }
  function isParenthesizedArrowFunctionExpressionWorker() {
    if (token() === 134 /* AsyncKeyword */) {
      nextToken();
      if (scanner2.hasPrecedingLineBreak()) {
        return 0 /* False */;
      }
      if (token() !== 21 /* OpenParenToken */ && token() !== 30 /* LessThanToken */) {
        return 0 /* False */;
      }
    }
    const first2 = token();
    const second = nextToken();
    if (first2 === 21 /* OpenParenToken */) {
      if (second === 22 /* CloseParenToken */) {
        const third = nextToken();
        switch (third) {
          case 39 /* EqualsGreaterThanToken */:
          case 59 /* ColonToken */:
          case 19 /* OpenBraceToken */:
            return 1 /* True */;
          default:
            return 0 /* False */;
        }
      }
      if (second === 23 /* OpenBracketToken */ || second === 19 /* OpenBraceToken */) {
        return 2 /* Unknown */;
      }
      if (second === 26 /* DotDotDotToken */) {
        return 1 /* True */;
      }
      if (isModifierKind(second) && second !== 134 /* AsyncKeyword */ && lookAhead(nextTokenIsIdentifier)) {
        if (nextToken() === 130 /* AsKeyword */) {
          return 0 /* False */;
        }
        return 1 /* True */;
      }
      if (!isIdentifier2() && second !== 110 /* ThisKeyword */) {
        return 0 /* False */;
      }
      switch (nextToken()) {
        case 59 /* ColonToken */:
          return 1 /* True */;
        case 58 /* QuestionToken */:
          nextToken();
          if (token() === 59 /* ColonToken */ || token() === 28 /* CommaToken */ || token() === 64 /* EqualsToken */ || token() === 22 /* CloseParenToken */) {
            return 1 /* True */;
          }
          return 0 /* False */;
        case 28 /* CommaToken */:
        case 64 /* EqualsToken */:
        case 22 /* CloseParenToken */:
          return 2 /* Unknown */;
      }
      return 0 /* False */;
    } else {
      Debug.assert(first2 === 30 /* LessThanToken */);
      if (!isIdentifier2() && token() !== 87 /* ConstKeyword */) {
        return 0 /* False */;
      }
      if (languageVariant === 1 /* JSX */) {
        const isArrowFunctionInJsx = lookAhead(() => {
          parseOptional(87 /* ConstKeyword */);
          const third = nextToken();
          if (third === 96 /* ExtendsKeyword */) {
            const fourth = nextToken();
            switch (fourth) {
              case 64 /* EqualsToken */:
              case 32 /* GreaterThanToken */:
              case 44 /* SlashToken */:
                return false;
              default:
                return true;
            }
          } else if (third === 28 /* CommaToken */ || third === 64 /* EqualsToken */) {
            return true;
          }
          return false;
        });
        if (isArrowFunctionInJsx) {
          return 1 /* True */;
        }
        return 0 /* False */;
      }
      return 2 /* Unknown */;
    }
  }
  function parsePossibleParenthesizedArrowFunctionExpression(allowReturnTypeInArrowFunction) {
    const tokenPos = scanner2.getTokenStart();
    if (notParenthesizedArrow == null ? void 0 : notParenthesizedArrow.has(tokenPos)) {
      return void 0;
    }
    const result = parseParenthesizedArrowFunctionExpression(
      /*allowAmbiguity*/
      false,
      allowReturnTypeInArrowFunction
    );
    if (!result) {
      (notParenthesizedArrow || (notParenthesizedArrow = /* @__PURE__ */ new Set())).add(tokenPos);
    }
    return result;
  }
  function tryParseAsyncSimpleArrowFunctionExpression(allowReturnTypeInArrowFunction) {
    if (token() === 134 /* AsyncKeyword */) {
      if (lookAhead(isUnParenthesizedAsyncArrowFunctionWorker) === 1 /* True */) {
        const pos = getNodePos();
        const hasJSDoc = hasPrecedingJSDocComment();
        const asyncModifier = parseModifiersForArrowFunction();
        const expr = parseBinaryExpressionOrHigher(0 /* Lowest */);
        return parseSimpleArrowFunctionExpression(pos, expr, allowReturnTypeInArrowFunction, hasJSDoc, asyncModifier);
      }
    }
    return void 0;
  }
  function isUnParenthesizedAsyncArrowFunctionWorker() {
    if (token() === 134 /* AsyncKeyword */) {
      nextToken();
      if (scanner2.hasPrecedingLineBreak() || token() === 39 /* EqualsGreaterThanToken */) {
        return 0 /* False */;
      }
      const expr = parseBinaryExpressionOrHigher(0 /* Lowest */);
      if (!scanner2.hasPrecedingLineBreak() && expr.kind === 80 /* Identifier */ && token() === 39 /* EqualsGreaterThanToken */) {
        return 1 /* True */;
      }
    }
    return 0 /* False */;
  }
  function parseParenthesizedArrowFunctionExpression(allowAmbiguity, allowReturnTypeInArrowFunction) {
    const pos = getNodePos();
    const hasJSDoc = hasPrecedingJSDocComment();
    const modifiers = parseModifiersForArrowFunction();
    const isAsync = some(modifiers, isAsyncModifier) ? 2 /* Await */ : 0 /* None */;
    const typeParameters = parseTypeParameters();
    let parameters;
    if (!parseExpected(21 /* OpenParenToken */)) {
      if (!allowAmbiguity) {
        return void 0;
      }
      parameters = createMissingList();
    } else {
      if (!allowAmbiguity) {
        const maybeParameters = parseParametersWorker(isAsync, allowAmbiguity);
        if (!maybeParameters) {
          return void 0;
        }
        parameters = maybeParameters;
      } else {
        parameters = parseParametersWorker(isAsync, allowAmbiguity);
      }
      if (!parseExpected(22 /* CloseParenToken */) && !allowAmbiguity) {
        return void 0;
      }
    }
    const hasReturnColon = token() === 59 /* ColonToken */;
    const type = parseReturnType(
      59 /* ColonToken */,
      /*isType*/
      false
    );
    if (type && !allowAmbiguity && typeHasArrowFunctionBlockingParseError(type)) {
      return void 0;
    }
    let unwrappedType = type;
    while ((unwrappedType == null ? void 0 : unwrappedType.kind) === 197 /* ParenthesizedType */) {
      unwrappedType = unwrappedType.type;
    }
    const hasJSDocFunctionType = unwrappedType && isJSDocFunctionType(unwrappedType);
    if (!allowAmbiguity && token() !== 39 /* EqualsGreaterThanToken */ && (hasJSDocFunctionType || token() !== 19 /* OpenBraceToken */)) {
      return void 0;
    }
    const lastToken = token();
    const equalsGreaterThanToken = parseExpectedToken(39 /* EqualsGreaterThanToken */);
    const body = lastToken === 39 /* EqualsGreaterThanToken */ || lastToken === 19 /* OpenBraceToken */ ? parseArrowFunctionExpressionBody(some(modifiers, isAsyncModifier), allowReturnTypeInArrowFunction) : parseIdentifier();
    if (!allowReturnTypeInArrowFunction && hasReturnColon) {
      if (token() !== 59 /* ColonToken */) {
        return void 0;
      }
    }
    const node = factory2.createArrowFunction(modifiers, typeParameters, parameters, type, equalsGreaterThanToken, body);
    return withJSDoc(finishNode(node, pos), hasJSDoc);
  }
  function parseArrowFunctionExpressionBody(isAsync, allowReturnTypeInArrowFunction) {
    if (token() === 19 /* OpenBraceToken */) {
      return parseFunctionBlock(isAsync ? 2 /* Await */ : 0 /* None */);
    }
    if (token() !== 27 /* SemicolonToken */ && token() !== 100 /* FunctionKeyword */ && token() !== 86 /* ClassKeyword */ && isStartOfStatement() && !isStartOfExpressionStatement()) {
      return parseFunctionBlock(16 /* IgnoreMissingOpenBrace */ | (isAsync ? 2 /* Await */ : 0 /* None */));
    }
    const savedYieldContext = inYieldContext();
    setYieldContext(false);
    const savedTopLevel = topLevel;
    topLevel = false;
    const node = isAsync ? doInAwaitContext(() => parseAssignmentExpressionOrHigher(allowReturnTypeInArrowFunction)) : doOutsideOfAwaitContext(() => parseAssignmentExpressionOrHigher(allowReturnTypeInArrowFunction));
    topLevel = savedTopLevel;
    setYieldContext(savedYieldContext);
    return node;
  }
  function parseConditionalExpressionRest(leftOperand, pos, allowReturnTypeInArrowFunction) {
    const questionToken = parseOptionalToken(58 /* QuestionToken */);
    if (!questionToken) {
      return leftOperand;
    }
    let colonToken;
    return finishNode(
      factory2.createConditionalExpression(
        leftOperand,
        questionToken,
        doOutsideOfContext(disallowInAndDecoratorContext, () => parseAssignmentExpressionOrHigher(
          /*allowReturnTypeInArrowFunction*/
          false
        )),
        colonToken = parseExpectedToken(59 /* ColonToken */),
        nodeIsPresent(colonToken) ? parseAssignmentExpressionOrHigher(allowReturnTypeInArrowFunction) : createMissingNode(
          80 /* Identifier */,
          /*reportAtCurrentPosition*/
          false,
          Diagnostics._0_expected,
          tokenToString(59 /* ColonToken */)
        )
      ),
      pos
    );
  }
  function parseBinaryExpressionOrHigher(precedence) {
    const pos = getNodePos();
    const leftOperand = parseUnaryExpressionOrHigher();
    return parseBinaryExpressionRest(precedence, leftOperand, pos);
  }
  function isInOrOfKeyword(t) {
    return t === 103 /* InKeyword */ || t === 165 /* OfKeyword */;
  }
  function parseBinaryExpressionRest(precedence, leftOperand, pos) {
    while (true) {
      reScanGreaterToken();
      const newPrecedence = getBinaryOperatorPrecedence(token());
      const consumeCurrentOperator = token() === 43 /* AsteriskAsteriskToken */ ? newPrecedence >= precedence : newPrecedence > precedence;
      if (!consumeCurrentOperator) {
        break;
      }
      if (token() === 103 /* InKeyword */ && inDisallowInContext()) {
        break;
      }
      if (token() === 130 /* AsKeyword */ || token() === 152 /* SatisfiesKeyword */) {
        if (scanner2.hasPrecedingLineBreak()) {
          break;
        } else {
          const keywordKind = token();
          nextToken();
          leftOperand = keywordKind === 152 /* SatisfiesKeyword */ ? makeSatisfiesExpression(leftOperand, parseType()) : makeAsExpression(leftOperand, parseType());
        }
      } else {
        leftOperand = makeBinaryExpression(leftOperand, parseTokenNode(), parseBinaryExpressionOrHigher(newPrecedence), pos);
      }
    }
    return leftOperand;
  }
  function isBinaryOperator2() {
    if (inDisallowInContext() && token() === 103 /* InKeyword */) {
      return false;
    }
    return getBinaryOperatorPrecedence(token()) > 0;
  }
  function makeSatisfiesExpression(left, right) {
    return finishNode(factory2.createSatisfiesExpression(left, right), left.pos);
  }
  function makeBinaryExpression(left, operatorToken, right, pos) {
    return finishNode(factory2.createBinaryExpression(left, operatorToken, right), pos);
  }
  function makeAsExpression(left, right) {
    return finishNode(factory2.createAsExpression(left, right), left.pos);
  }
  function parsePrefixUnaryExpression() {
    const pos = getNodePos();
    return finishNode(factory2.createPrefixUnaryExpression(token(), nextTokenAnd(parseSimpleUnaryExpression)), pos);
  }
  function parseDeleteExpression() {
    const pos = getNodePos();
    return finishNode(factory2.createDeleteExpression(nextTokenAnd(parseSimpleUnaryExpression)), pos);
  }
  function parseTypeOfExpression() {
    const pos = getNodePos();
    return finishNode(factory2.createTypeOfExpression(nextTokenAnd(parseSimpleUnaryExpression)), pos);
  }
  function parseVoidExpression() {
    const pos = getNodePos();
    return finishNode(factory2.createVoidExpression(nextTokenAnd(parseSimpleUnaryExpression)), pos);
  }
  function isAwaitExpression2() {
    if (token() === 135 /* AwaitKeyword */) {
      if (inAwaitContext()) {
        return true;
      }
      return lookAhead(nextTokenIsIdentifierOrKeywordOrLiteralOnSameLine);
    }
    return false;
  }
  function parseAwaitExpression() {
    const pos = getNodePos();
    return finishNode(factory2.createAwaitExpression(nextTokenAnd(parseSimpleUnaryExpression)), pos);
  }
  function parseUnaryExpressionOrHigher() {
    if (isUpdateExpression()) {
      const pos = getNodePos();
      const updateExpression = parseUpdateExpression();
      return token() === 43 /* AsteriskAsteriskToken */ ? parseBinaryExpressionRest(getBinaryOperatorPrecedence(token()), updateExpression, pos) : updateExpression;
    }
    const unaryOperator = token();
    const simpleUnaryExpression = parseSimpleUnaryExpression();
    if (token() === 43 /* AsteriskAsteriskToken */) {
      const pos = skipTrivia(sourceText, simpleUnaryExpression.pos);
      const { end } = simpleUnaryExpression;
      if (simpleUnaryExpression.kind === 217 /* TypeAssertionExpression */) {
        parseErrorAt(pos, end, Diagnostics.A_type_assertion_expression_is_not_allowed_in_the_left_hand_side_of_an_exponentiation_expression_Consider_enclosing_the_expression_in_parentheses);
      } else {
        Debug.assert(isKeywordOrPunctuation(unaryOperator));
        parseErrorAt(pos, end, Diagnostics.An_unary_expression_with_the_0_operator_is_not_allowed_in_the_left_hand_side_of_an_exponentiation_expression_Consider_enclosing_the_expression_in_parentheses, tokenToString(unaryOperator));
      }
    }
    return simpleUnaryExpression;
  }
  function parseSimpleUnaryExpression() {
    switch (token()) {
      case 40 /* PlusToken */:
      case 41 /* MinusToken */:
      case 55 /* TildeToken */:
      case 54 /* ExclamationToken */:
        return parsePrefixUnaryExpression();
      case 91 /* DeleteKeyword */:
        return parseDeleteExpression();
      case 114 /* TypeOfKeyword */:
        return parseTypeOfExpression();
      case 116 /* VoidKeyword */:
        return parseVoidExpression();
      case 30 /* LessThanToken */:
        if (languageVariant === 1 /* JSX */) {
          return parseJsxElementOrSelfClosingElementOrFragment(
            /*inExpressionContext*/
            true,
            /*topInvalidNodePosition*/
            void 0,
            /*openingTag*/
            void 0,
            /*mustBeUnary*/
            true
          );
        }
        return parseTypeAssertion();
      case 135 /* AwaitKeyword */:
        if (isAwaitExpression2()) {
          return parseAwaitExpression();
        }
      // falls through
      default:
        return parseUpdateExpression();
    }
  }
  function isUpdateExpression() {
    switch (token()) {
      case 40 /* PlusToken */:
      case 41 /* MinusToken */:
      case 55 /* TildeToken */:
      case 54 /* ExclamationToken */:
      case 91 /* DeleteKeyword */:
      case 114 /* TypeOfKeyword */:
      case 116 /* VoidKeyword */:
      case 135 /* AwaitKeyword */:
        return false;
      case 30 /* LessThanToken */:
        if (languageVariant !== 1 /* JSX */) {
          return false;
        }
      // We are in JSX context and the token is part of JSXElement.
      // falls through
      default:
        return true;
    }
  }
  function parseUpdateExpression() {
    if (token() === 46 /* PlusPlusToken */ || token() === 47 /* MinusMinusToken */) {
      const pos = getNodePos();
      return finishNode(factory2.createPrefixUnaryExpression(token(), nextTokenAnd(parseLeftHandSideExpressionOrHigher)), pos);
    } else if (languageVariant === 1 /* JSX */ && token() === 30 /* LessThanToken */ && lookAhead(nextTokenIsIdentifierOrKeywordOrGreaterThan)) {
      return parseJsxElementOrSelfClosingElementOrFragment(
        /*inExpressionContext*/
        true
      );
    }
    const expression = parseLeftHandSideExpressionOrHigher();
    Debug.assert(isLeftHandSideExpression(expression));
    if ((token() === 46 /* PlusPlusToken */ || token() === 47 /* MinusMinusToken */) && !scanner2.hasPrecedingLineBreak()) {
      const operator = token();
      nextToken();
      return finishNode(factory2.createPostfixUnaryExpression(expression, operator), expression.pos);
    }
    return expression;
  }
  function parseLeftHandSideExpressionOrHigher() {
    const pos = getNodePos();
    let expression;
    if (token() === 102 /* ImportKeyword */) {
      if (lookAhead(nextTokenIsOpenParenOrLessThan)) {
        sourceFlags |= 4194304 /* PossiblyContainsDynamicImport */;
        expression = parseTokenNode();
      } else if (lookAhead(nextTokenIsDot)) {
        nextToken();
        nextToken();
        expression = finishNode(factory2.createMetaProperty(102 /* ImportKeyword */, parseIdentifierName()), pos);
        if (expression.name.escapedText === "defer") {
          if (token() === 21 /* OpenParenToken */ || token() === 30 /* LessThanToken */) {
            sourceFlags |= 4194304 /* PossiblyContainsDynamicImport */;
          }
        } else {
          sourceFlags |= 8388608 /* PossiblyContainsImportMeta */;
        }
      } else {
        expression = parseMemberExpressionOrHigher();
      }
    } else {
      expression = token() === 108 /* SuperKeyword */ ? parseSuperExpression() : parseMemberExpressionOrHigher();
    }
    return parseCallExpressionRest(pos, expression);
  }
  function parseMemberExpressionOrHigher() {
    const pos = getNodePos();
    const expression = parsePrimaryExpression();
    return parseMemberExpressionRest(
      pos,
      expression,
      /*allowOptionalChain*/
      true
    );
  }
  function parseSuperExpression() {
    const pos = getNodePos();
    let expression = parseTokenNode();
    if (token() === 30 /* LessThanToken */) {
      const startPos = getNodePos();
      const typeArguments = tryParse(parseTypeArgumentsInExpression);
      if (typeArguments !== void 0) {
        parseErrorAt(startPos, getNodePos(), Diagnostics.super_may_not_use_type_arguments);
        if (!isTemplateStartOfTaggedTemplate()) {
          expression = factory2.createExpressionWithTypeArguments(expression, typeArguments);
        }
      }
    }
    if (token() === 21 /* OpenParenToken */ || token() === 25 /* DotToken */ || token() === 23 /* OpenBracketToken */) {
      return expression;
    }
    parseExpectedToken(25 /* DotToken */, Diagnostics.super_must_be_followed_by_an_argument_list_or_member_access);
    return finishNode(factoryCreatePropertyAccessExpression(expression, parseRightSideOfDot(
      /*allowIdentifierNames*/
      true,
      /*allowPrivateIdentifiers*/
      true,
      /*allowUnicodeEscapeSequenceInIdentifierName*/
      true
    )), pos);
  }
  function parseJsxElementOrSelfClosingElementOrFragment(inExpressionContext, topInvalidNodePosition, openingTag, mustBeUnary = false) {
    const pos = getNodePos();
    const opening = parseJsxOpeningOrSelfClosingElementOrOpeningFragment(inExpressionContext);
    let result;
    if (opening.kind === 287 /* JsxOpeningElement */) {
      let children = parseJsxChildren(opening);
      let closingElement;
      const lastChild = children[children.length - 1];
      if ((lastChild == null ? void 0 : lastChild.kind) === 285 /* JsxElement */ && !tagNamesAreEquivalent(lastChild.openingElement.tagName, lastChild.closingElement.tagName) && tagNamesAreEquivalent(opening.tagName, lastChild.closingElement.tagName)) {
        const end = lastChild.children.end;
        const newLast = finishNode(
          factory2.createJsxElement(
            lastChild.openingElement,
            lastChild.children,
            finishNode(factory2.createJsxClosingElement(finishNode(factoryCreateIdentifier(""), end, end)), end, end)
          ),
          lastChild.openingElement.pos,
          end
        );
        children = createNodeArray([...children.slice(0, children.length - 1), newLast], children.pos, end);
        closingElement = lastChild.closingElement;
      } else {
        closingElement = parseJsxClosingElement(opening, inExpressionContext);
        if (!tagNamesAreEquivalent(opening.tagName, closingElement.tagName)) {
          if (openingTag && isJsxOpeningElement(openingTag) && tagNamesAreEquivalent(closingElement.tagName, openingTag.tagName)) {
            parseErrorAtRange(opening.tagName, Diagnostics.JSX_element_0_has_no_corresponding_closing_tag, getTextOfNodeFromSourceText(sourceText, opening.tagName));
          } else {
            parseErrorAtRange(closingElement.tagName, Diagnostics.Expected_corresponding_JSX_closing_tag_for_0, getTextOfNodeFromSourceText(sourceText, opening.tagName));
          }
        }
      }
      result = finishNode(factory2.createJsxElement(opening, children, closingElement), pos);
    } else if (opening.kind === 290 /* JsxOpeningFragment */) {
      result = finishNode(factory2.createJsxFragment(opening, parseJsxChildren(opening), parseJsxClosingFragment(inExpressionContext)), pos);
    } else {
      Debug.assert(opening.kind === 286 /* JsxSelfClosingElement */);
      result = opening;
    }
    if (!mustBeUnary && inExpressionContext && token() === 30 /* LessThanToken */) {
      const topBadPos = typeof topInvalidNodePosition === "undefined" ? result.pos : topInvalidNodePosition;
      const invalidElement = tryParse(() => parseJsxElementOrSelfClosingElementOrFragment(
        /*inExpressionContext*/
        true,
        topBadPos
      ));
      if (invalidElement) {
        const operatorToken = createMissingNode(
          28 /* CommaToken */,
          /*reportAtCurrentPosition*/
          false
        );
        setTextRangePosWidth(operatorToken, invalidElement.pos, 0);
        parseErrorAt(skipTrivia(sourceText, topBadPos), invalidElement.end, Diagnostics.JSX_expressions_must_have_one_parent_element);
        return finishNode(factory2.createBinaryExpression(result, operatorToken, invalidElement), pos);
      }
    }
    return result;
  }
  function parseJsxText() {
    const pos = getNodePos();
    const node = factory2.createJsxText(scanner2.getTokenValue(), currentToken === 13 /* JsxTextAllWhiteSpaces */);
    currentToken = scanner2.scanJsxToken();
    return finishNode(node, pos);
  }
  function parseJsxChild(openingTag, token2) {
    switch (token2) {
      case 1 /* EndOfFileToken */:
        if (isJsxOpeningFragment(openingTag)) {
          parseErrorAtRange(openingTag, Diagnostics.JSX_fragment_has_no_corresponding_closing_tag);
        } else {
          const tag = openingTag.tagName;
          const start = Math.min(skipTrivia(sourceText, tag.pos), tag.end);
          parseErrorAt(start, tag.end, Diagnostics.JSX_element_0_has_no_corresponding_closing_tag, getTextOfNodeFromSourceText(sourceText, openingTag.tagName));
        }
        return void 0;
      case 31 /* LessThanSlashToken */:
      case 7 /* ConflictMarkerTrivia */:
        return void 0;
      case 12 /* JsxText */:
      case 13 /* JsxTextAllWhiteSpaces */:
        return parseJsxText();
      case 19 /* OpenBraceToken */:
        return parseJsxExpression(
          /*inExpressionContext*/
          false
        );
      case 30 /* LessThanToken */:
        return parseJsxElementOrSelfClosingElementOrFragment(
          /*inExpressionContext*/
          false,
          /*topInvalidNodePosition*/
          void 0,
          openingTag
        );
      default:
        return Debug.assertNever(token2);
    }
  }
  function parseJsxChildren(openingTag) {
    const list = [];
    const listPos = getNodePos();
    const saveParsingContext = parsingContext;
    parsingContext |= 1 << 14 /* JsxChildren */;
    while (true) {
      const child = parseJsxChild(openingTag, currentToken = scanner2.reScanJsxToken());
      if (!child) break;
      list.push(child);
      if (isJsxOpeningElement(openingTag) && (child == null ? void 0 : child.kind) === 285 /* JsxElement */ && !tagNamesAreEquivalent(child.openingElement.tagName, child.closingElement.tagName) && tagNamesAreEquivalent(openingTag.tagName, child.closingElement.tagName)) {
        break;
      }
    }
    parsingContext = saveParsingContext;
    return createNodeArray(list, listPos);
  }
  function parseJsxAttributes() {
    const pos = getNodePos();
    return finishNode(factory2.createJsxAttributes(parseList(13 /* JsxAttributes */, parseJsxAttribute)), pos);
  }
  function parseJsxOpeningOrSelfClosingElementOrOpeningFragment(inExpressionContext) {
    const pos = getNodePos();
    parseExpected(30 /* LessThanToken */);
    if (token() === 32 /* GreaterThanToken */) {
      scanJsxText();
      return finishNode(factory2.createJsxOpeningFragment(), pos);
    }
    const tagName = parseJsxElementName();
    const typeArguments = (contextFlags & 524288 /* JavaScriptFile */) === 0 ? tryParseTypeArguments() : void 0;
    const attributes = parseJsxAttributes();
    let node;
    if (token() === 32 /* GreaterThanToken */) {
      scanJsxText();
      node = factory2.createJsxOpeningElement(tagName, typeArguments, attributes);
    } else {
      parseExpected(44 /* SlashToken */);
      if (parseExpected(
        32 /* GreaterThanToken */,
        /*diagnosticMessage*/
        void 0,
        /*shouldAdvance*/
        false
      )) {
        if (inExpressionContext) {
          nextToken();
        } else {
          scanJsxText();
        }
      }
      node = factory2.createJsxSelfClosingElement(tagName, typeArguments, attributes);
    }
    return finishNode(node, pos);
  }
  function parseJsxElementName() {
    const pos = getNodePos();
    const initialExpression = parseJsxTagName();
    if (isJsxNamespacedName(initialExpression)) {
      return initialExpression;
    }
    let expression = initialExpression;
    while (parseOptional(25 /* DotToken */)) {
      expression = finishNode(factoryCreatePropertyAccessExpression(expression, parseRightSideOfDot(
        /*allowIdentifierNames*/
        true,
        /*allowPrivateIdentifiers*/
        false,
        /*allowUnicodeEscapeSequenceInIdentifierName*/
        false
      )), pos);
    }
    return expression;
  }
  function parseJsxTagName() {
    const pos = getNodePos();
    scanJsxIdentifier();
    const isThis2 = token() === 110 /* ThisKeyword */;
    const tagName = parseIdentifierNameErrorOnUnicodeEscapeSequence();
    if (parseOptional(59 /* ColonToken */)) {
      scanJsxIdentifier();
      return finishNode(factory2.createJsxNamespacedName(tagName, parseIdentifierNameErrorOnUnicodeEscapeSequence()), pos);
    }
    return isThis2 ? finishNode(factory2.createToken(110 /* ThisKeyword */), pos) : tagName;
  }
  function parseJsxExpression(inExpressionContext) {
    const pos = getNodePos();
    if (!parseExpected(19 /* OpenBraceToken */)) {
      return void 0;
    }
    let dotDotDotToken;
    let expression;
    if (token() !== 20 /* CloseBraceToken */) {
      if (!inExpressionContext) {
        dotDotDotToken = parseOptionalToken(26 /* DotDotDotToken */);
      }
      expression = parseExpression();
    }
    if (inExpressionContext) {
      parseExpected(20 /* CloseBraceToken */);
    } else {
      if (parseExpected(
        20 /* CloseBraceToken */,
        /*diagnosticMessage*/
        void 0,
        /*shouldAdvance*/
        false
      )) {
        scanJsxText();
      }
    }
    return finishNode(factory2.createJsxExpression(dotDotDotToken, expression), pos);
  }
  function parseJsxAttribute() {
    if (token() === 19 /* OpenBraceToken */) {
      return parseJsxSpreadAttribute();
    }
    const pos = getNodePos();
    return finishNode(factory2.createJsxAttribute(parseJsxAttributeName(), parseJsxAttributeValue()), pos);
  }
  function parseJsxAttributeValue() {
    if (token() === 64 /* EqualsToken */) {
      if (scanJsxAttributeValue() === 11 /* StringLiteral */) {
        return parseLiteralNode();
      }
      if (token() === 19 /* OpenBraceToken */) {
        return parseJsxExpression(
          /*inExpressionContext*/
          true
        );
      }
      if (token() === 30 /* LessThanToken */) {
        return parseJsxElementOrSelfClosingElementOrFragment(
          /*inExpressionContext*/
          true
        );
      }
      parseErrorAtCurrentToken(Diagnostics.or_JSX_element_expected);
    }
    return void 0;
  }
  function parseJsxAttributeName() {
    const pos = getNodePos();
    scanJsxIdentifier();
    const attrName = parseIdentifierNameErrorOnUnicodeEscapeSequence();
    if (parseOptional(59 /* ColonToken */)) {
      scanJsxIdentifier();
      return finishNode(factory2.createJsxNamespacedName(attrName, parseIdentifierNameErrorOnUnicodeEscapeSequence()), pos);
    }
    return attrName;
  }
  function parseJsxSpreadAttribute() {
    const pos = getNodePos();
    parseExpected(19 /* OpenBraceToken */);
    parseExpected(26 /* DotDotDotToken */);
    const expression = parseExpression();
    parseExpected(20 /* CloseBraceToken */);
    return finishNode(factory2.createJsxSpreadAttribute(expression), pos);
  }
  function parseJsxClosingElement(open, inExpressionContext) {
    const pos = getNodePos();
    parseExpected(31 /* LessThanSlashToken */);
    const tagName = parseJsxElementName();
    if (parseExpected(
      32 /* GreaterThanToken */,
      /*diagnosticMessage*/
      void 0,
      /*shouldAdvance*/
      false
    )) {
      if (inExpressionContext || !tagNamesAreEquivalent(open.tagName, tagName)) {
        nextToken();
      } else {
        scanJsxText();
      }
    }
    return finishNode(factory2.createJsxClosingElement(tagName), pos);
  }
  function parseJsxClosingFragment(inExpressionContext) {
    const pos = getNodePos();
    parseExpected(31 /* LessThanSlashToken */);
    if (parseExpected(
      32 /* GreaterThanToken */,
      Diagnostics.Expected_corresponding_closing_tag_for_JSX_fragment,
      /*shouldAdvance*/
      false
    )) {
      if (inExpressionContext) {
        nextToken();
      } else {
        scanJsxText();
      }
    }
    return finishNode(factory2.createJsxJsxClosingFragment(), pos);
  }
  function parseTypeAssertion() {
    Debug.assert(languageVariant !== 1 /* JSX */, "Type assertions should never be parsed in JSX; they should be parsed as comparisons or JSX elements/fragments.");
    const pos = getNodePos();
    parseExpected(30 /* LessThanToken */);
    const type = parseType();
    parseExpected(32 /* GreaterThanToken */);
    const expression = parseSimpleUnaryExpression();
    return finishNode(factory2.createTypeAssertion(type, expression), pos);
  }
  function nextTokenIsIdentifierOrKeywordOrOpenBracketOrTemplate() {
    nextToken();
    return tokenIsIdentifierOrKeyword(token()) || token() === 23 /* OpenBracketToken */ || isTemplateStartOfTaggedTemplate();
  }
  function isStartOfOptionalPropertyOrElementAccessChain() {
    return token() === 29 /* QuestionDotToken */ && lookAhead(nextTokenIsIdentifierOrKeywordOrOpenBracketOrTemplate);
  }
  function tryReparseOptionalChain(node) {
    if (node.flags & 64 /* OptionalChain */) {
      return true;
    }
    if (isNonNullExpression(node)) {
      let expr = node.expression;
      while (isNonNullExpression(expr) && !(expr.flags & 64 /* OptionalChain */)) {
        expr = expr.expression;
      }
      if (expr.flags & 64 /* OptionalChain */) {
        while (isNonNullExpression(node)) {
          node.flags |= 64 /* OptionalChain */;
          node = node.expression;
        }
        return true;
      }
    }
    return false;
  }
  function parsePropertyAccessExpressionRest(pos, expression, questionDotToken) {
    const name = parseRightSideOfDot(
      /*allowIdentifierNames*/
      true,
      /*allowPrivateIdentifiers*/
      true,
      /*allowUnicodeEscapeSequenceInIdentifierName*/
      true
    );
    const isOptionalChain2 = questionDotToken || tryReparseOptionalChain(expression);
    const propertyAccess = isOptionalChain2 ? factoryCreatePropertyAccessChain(expression, questionDotToken, name) : factoryCreatePropertyAccessExpression(expression, name);
    if (isOptionalChain2 && isPrivateIdentifier(propertyAccess.name)) {
      parseErrorAtRange(propertyAccess.name, Diagnostics.An_optional_chain_cannot_contain_private_identifiers);
    }
    if (isExpressionWithTypeArguments(expression) && expression.typeArguments) {
      const pos2 = expression.typeArguments.pos - 1;
      const end = skipTrivia(sourceText, expression.typeArguments.end) + 1;
      parseErrorAt(pos2, end, Diagnostics.An_instantiation_expression_cannot_be_followed_by_a_property_access);
    }
    return finishNode(propertyAccess, pos);
  }
  function parseElementAccessExpressionRest(pos, expression, questionDotToken) {
    let argumentExpression;
    if (token() === 24 /* CloseBracketToken */) {
      argumentExpression = createMissingNode(
        80 /* Identifier */,
        /*reportAtCurrentPosition*/
        true,
        Diagnostics.An_element_access_expression_should_take_an_argument
      );
    } else {
      const argument = allowInAnd(parseExpression);
      if (isStringOrNumericLiteralLike(argument)) {
        argument.text = internIdentifier(argument.text);
      }
      argumentExpression = argument;
    }
    parseExpected(24 /* CloseBracketToken */);
    const indexedAccess = questionDotToken || tryReparseOptionalChain(expression) ? factoryCreateElementAccessChain(expression, questionDotToken, argumentExpression) : factoryCreateElementAccessExpression(expression, argumentExpression);
    return finishNode(indexedAccess, pos);
  }
  function parseMemberExpressionRest(pos, expression, allowOptionalChain) {
    while (true) {
      let questionDotToken;
      let isPropertyAccess = false;
      if (allowOptionalChain && isStartOfOptionalPropertyOrElementAccessChain()) {
        questionDotToken = parseExpectedToken(29 /* QuestionDotToken */);
        isPropertyAccess = tokenIsIdentifierOrKeyword(token());
      } else {
        isPropertyAccess = parseOptional(25 /* DotToken */);
      }
      if (isPropertyAccess) {
        expression = parsePropertyAccessExpressionRest(pos, expression, questionDotToken);
        continue;
      }
      if ((questionDotToken || !inDecoratorContext()) && parseOptional(23 /* OpenBracketToken */)) {
        expression = parseElementAccessExpressionRest(pos, expression, questionDotToken);
        continue;
      }
      if (isTemplateStartOfTaggedTemplate()) {
        expression = !questionDotToken && expression.kind === 234 /* ExpressionWithTypeArguments */ ? parseTaggedTemplateRest(pos, expression.expression, questionDotToken, expression.typeArguments) : parseTaggedTemplateRest(
          pos,
          expression,
          questionDotToken,
          /*typeArguments*/
          void 0
        );
        continue;
      }
      if (!questionDotToken) {
        if (token() === 54 /* ExclamationToken */ && !scanner2.hasPrecedingLineBreak()) {
          nextToken();
          expression = finishNode(factory2.createNonNullExpression(expression), pos);
          continue;
        }
        const typeArguments = tryParse(parseTypeArgumentsInExpression);
        if (typeArguments) {
          expression = finishNode(factory2.createExpressionWithTypeArguments(expression, typeArguments), pos);
          continue;
        }
      }
      return expression;
    }
  }
  function isTemplateStartOfTaggedTemplate() {
    return token() === 15 /* NoSubstitutionTemplateLiteral */ || token() === 16 /* TemplateHead */;
  }
  function parseTaggedTemplateRest(pos, tag, questionDotToken, typeArguments) {
    const tagExpression = factory2.createTaggedTemplateExpression(
      tag,
      typeArguments,
      token() === 15 /* NoSubstitutionTemplateLiteral */ ? (reScanTemplateToken(
        /*isTaggedTemplate*/
        true
      ), parseLiteralNode()) : parseTemplateExpression(
        /*isTaggedTemplate*/
        true
      )
    );
    if (questionDotToken || tag.flags & 64 /* OptionalChain */) {
      tagExpression.flags |= 64 /* OptionalChain */;
    }
    tagExpression.questionDotToken = questionDotToken;
    return finishNode(tagExpression, pos);
  }
  function parseCallExpressionRest(pos, expression) {
    while (true) {
      expression = parseMemberExpressionRest(
        pos,
        expression,
        /*allowOptionalChain*/
        true
      );
      let typeArguments;
      const questionDotToken = parseOptionalToken(29 /* QuestionDotToken */);
      if (questionDotToken) {
        typeArguments = tryParse(parseTypeArgumentsInExpression);
        if (isTemplateStartOfTaggedTemplate()) {
          expression = parseTaggedTemplateRest(pos, expression, questionDotToken, typeArguments);
          continue;
        }
      }
      if (typeArguments || token() === 21 /* OpenParenToken */) {
        if (!questionDotToken && expression.kind === 234 /* ExpressionWithTypeArguments */) {
          typeArguments = expression.typeArguments;
          expression = expression.expression;
        }
        const argumentList = parseArgumentList();
        const callExpr = questionDotToken || tryReparseOptionalChain(expression) ? factoryCreateCallChain(expression, questionDotToken, typeArguments, argumentList) : factoryCreateCallExpression(expression, typeArguments, argumentList);
        expression = finishNode(callExpr, pos);
        continue;
      }
      if (questionDotToken) {
        const name = createMissingNode(
          80 /* Identifier */,
          /*reportAtCurrentPosition*/
          false,
          Diagnostics.Identifier_expected
        );
        expression = finishNode(factoryCreatePropertyAccessChain(expression, questionDotToken, name), pos);
      }
      break;
    }
    return expression;
  }
  function parseArgumentList() {
    parseExpected(21 /* OpenParenToken */);
    const result = parseDelimitedList(11 /* ArgumentExpressions */, parseArgumentExpression);
    parseExpected(22 /* CloseParenToken */);
    return result;
  }
  function parseTypeArgumentsInExpression() {
    if ((contextFlags & 524288 /* JavaScriptFile */) !== 0) {
      return void 0;
    }
    if (reScanLessThanToken() !== 30 /* LessThanToken */) {
      return void 0;
    }
    nextToken();
    const typeArguments = parseDelimitedList(20 /* TypeArguments */, parseType);
    if (reScanGreaterToken() !== 32 /* GreaterThanToken */) {
      return void 0;
    }
    nextToken();
    return typeArguments && canFollowTypeArgumentsInExpression() ? typeArguments : void 0;
  }
  function canFollowTypeArgumentsInExpression() {
    switch (token()) {
      // These tokens can follow a type argument list in a call expression.
      case 21 /* OpenParenToken */:
      // foo<x>(
      case 15 /* NoSubstitutionTemplateLiteral */:
      // foo<T> `...`
      case 16 /* TemplateHead */:
        return true;
      // A type argument list followed by `<` never makes sense, and a type argument list followed
      // by `>` is ambiguous with a (re-scanned) `>>` operator, so we disqualify both. Also, in
      // this context, `+` and `-` are unary operators, not binary operators.
      case 30 /* LessThanToken */:
      case 32 /* GreaterThanToken */:
      case 40 /* PlusToken */:
      case 41 /* MinusToken */:
        return false;
    }
    return scanner2.hasPrecedingLineBreak() || isBinaryOperator2() || !isStartOfExpression();
  }
  function parsePrimaryExpression() {
    switch (token()) {
      case 15 /* NoSubstitutionTemplateLiteral */:
        if (scanner2.getTokenFlags() & 26656 /* IsInvalid */) {
          reScanTemplateToken(
            /*isTaggedTemplate*/
            false
          );
        }
      // falls through
      case 9 /* NumericLiteral */:
      case 10 /* BigIntLiteral */:
      case 11 /* StringLiteral */:
        return parseLiteralNode();
      case 110 /* ThisKeyword */:
      case 108 /* SuperKeyword */:
      case 106 /* NullKeyword */:
      case 112 /* TrueKeyword */:
      case 97 /* FalseKeyword */:
        return parseTokenNode();
      case 21 /* OpenParenToken */:
        return parseParenthesizedExpression();
      case 23 /* OpenBracketToken */:
        return parseArrayLiteralExpression();
      case 19 /* OpenBraceToken */:
        return parseObjectLiteralExpression();
      case 134 /* AsyncKeyword */:
        if (!lookAhead(nextTokenIsFunctionKeywordOnSameLine)) {
          break;
        }
        return parseFunctionExpression();
      case 60 /* AtToken */:
        return parseDecoratedExpression();
      case 86 /* ClassKeyword */:
        return parseClassExpression();
      case 100 /* FunctionKeyword */:
        return parseFunctionExpression();
      case 105 /* NewKeyword */:
        return parseNewExpressionOrNewDotTarget();
      case 44 /* SlashToken */:
      case 69 /* SlashEqualsToken */:
        if (reScanSlashToken() === 14 /* RegularExpressionLiteral */) {
          return parseLiteralNode();
        }
        break;
      case 16 /* TemplateHead */:
        return parseTemplateExpression(
          /*isTaggedTemplate*/
          false
        );
      case 81 /* PrivateIdentifier */:
        return parsePrivateIdentifier();
    }
    return parseIdentifier(Diagnostics.Expression_expected);
  }
  function parseParenthesizedExpression() {
    const pos = getNodePos();
    const hasJSDoc = hasPrecedingJSDocComment();
    parseExpected(21 /* OpenParenToken */);
    const expression = allowInAnd(parseExpression);
    parseExpected(22 /* CloseParenToken */);
    return withJSDoc(finishNode(factoryCreateParenthesizedExpression(expression), pos), hasJSDoc);
  }
  function parseSpreadElement() {
    const pos = getNodePos();
    parseExpected(26 /* DotDotDotToken */);
    const expression = parseAssignmentExpressionOrHigher(
      /*allowReturnTypeInArrowFunction*/
      true
    );
    return finishNode(factory2.createSpreadElement(expression), pos);
  }
  function parseArgumentOrArrayLiteralElement() {
    return token() === 26 /* DotDotDotToken */ ? parseSpreadElement() : token() === 28 /* CommaToken */ ? finishNode(factory2.createOmittedExpression(), getNodePos()) : parseAssignmentExpressionOrHigher(
      /*allowReturnTypeInArrowFunction*/
      true
    );
  }
  function parseArgumentExpression() {
    return doOutsideOfContext(disallowInAndDecoratorContext, parseArgumentOrArrayLiteralElement);
  }
  function parseArrayLiteralExpression() {
    const pos = getNodePos();
    const openBracketPosition = scanner2.getTokenStart();
    const openBracketParsed = parseExpected(23 /* OpenBracketToken */);
    const multiLine = scanner2.hasPrecedingLineBreak();
    const elements = parseDelimitedList(15 /* ArrayLiteralMembers */, parseArgumentOrArrayLiteralElement);
    parseExpectedMatchingBrackets(23 /* OpenBracketToken */, 24 /* CloseBracketToken */, openBracketParsed, openBracketPosition);
    return finishNode(factoryCreateArrayLiteralExpression(elements, multiLine), pos);
  }
  function parseObjectLiteralElement() {
    const pos = getNodePos();
    const hasJSDoc = hasPrecedingJSDocComment();
    if (parseOptionalToken(26 /* DotDotDotToken */)) {
      const expression = parseAssignmentExpressionOrHigher(
        /*allowReturnTypeInArrowFunction*/
        true
      );
      return withJSDoc(finishNode(factory2.createSpreadAssignment(expression), pos), hasJSDoc);
    }
    const modifiers = parseModifiers(
      /*allowDecorators*/
      true
    );
    if (parseContextualModifier(139 /* GetKeyword */)) {
      return parseAccessorDeclaration(pos, hasJSDoc, modifiers, 178 /* GetAccessor */, 0 /* None */);
    }
    if (parseContextualModifier(153 /* SetKeyword */)) {
      return parseAccessorDeclaration(pos, hasJSDoc, modifiers, 179 /* SetAccessor */, 0 /* None */);
    }
    const asteriskToken = parseOptionalToken(42 /* AsteriskToken */);
    const tokenIsIdentifier = isIdentifier2();
    const name = parsePropertyName();
    const questionToken = parseOptionalToken(58 /* QuestionToken */);
    const exclamationToken = parseOptionalToken(54 /* ExclamationToken */);
    if (asteriskToken || token() === 21 /* OpenParenToken */ || token() === 30 /* LessThanToken */) {
      return parseMethodDeclaration(pos, hasJSDoc, modifiers, asteriskToken, name, questionToken, exclamationToken);
    }
    let node;
    const isShorthandPropertyAssignment2 = tokenIsIdentifier && token() !== 59 /* ColonToken */;
    if (isShorthandPropertyAssignment2) {
      const equalsToken = parseOptionalToken(64 /* EqualsToken */);
      const objectAssignmentInitializer = equalsToken ? allowInAnd(() => parseAssignmentExpressionOrHigher(
        /*allowReturnTypeInArrowFunction*/
        true
      )) : void 0;
      node = factory2.createShorthandPropertyAssignment(name, objectAssignmentInitializer);
      node.equalsToken = equalsToken;
    } else {
      parseExpected(59 /* ColonToken */);
      const initializer = allowInAnd(() => parseAssignmentExpressionOrHigher(
        /*allowReturnTypeInArrowFunction*/
        true
      ));
      node = factory2.createPropertyAssignment(name, initializer);
    }
    node.modifiers = modifiers;
    node.questionToken = questionToken;
    node.exclamationToken = exclamationToken;
    return withJSDoc(finishNode(node, pos), hasJSDoc);
  }
  function parseObjectLiteralExpression() {
    const pos = getNodePos();
    const openBracePosition = scanner2.getTokenStart();
    const openBraceParsed = parseExpected(19 /* OpenBraceToken */);
    const multiLine = scanner2.hasPrecedingLineBreak();
    const properties = parseDelimitedList(
      12 /* ObjectLiteralMembers */,
      parseObjectLiteralElement,
      /*considerSemicolonAsDelimiter*/
      true
    );
    parseExpectedMatchingBrackets(19 /* OpenBraceToken */, 20 /* CloseBraceToken */, openBraceParsed, openBracePosition);
    return finishNode(factoryCreateObjectLiteralExpression(properties, multiLine), pos);
  }
  function parseFunctionExpression() {
    const savedDecoratorContext = inDecoratorContext();
    setDecoratorContext(
      /*val*/
      false
    );
    const pos = getNodePos();
    const hasJSDoc = hasPrecedingJSDocComment();
    const modifiers = parseModifiers(
      /*allowDecorators*/
      false
    );
    parseExpected(100 /* FunctionKeyword */);
    const asteriskToken = parseOptionalToken(42 /* AsteriskToken */);
    const isGenerator = asteriskToken ? 1 /* Yield */ : 0 /* None */;
    const isAsync = some(modifiers, isAsyncModifier) ? 2 /* Await */ : 0 /* None */;
    const name = isGenerator && isAsync ? doInYieldAndAwaitContext(parseOptionalBindingIdentifier) : isGenerator ? doInYieldContext(parseOptionalBindingIdentifier) : isAsync ? doInAwaitContext(parseOptionalBindingIdentifier) : parseOptionalBindingIdentifier();
    const typeParameters = parseTypeParameters();
    const parameters = parseParameters(isGenerator | isAsync);
    const type = parseReturnType(
      59 /* ColonToken */,
      /*isType*/
      false
    );
    const body = parseFunctionBlock(isGenerator | isAsync);
    setDecoratorContext(savedDecoratorContext);
    const node = factory2.createFunctionExpression(modifiers, asteriskToken, name, typeParameters, parameters, type, body);
    return withJSDoc(finishNode(node, pos), hasJSDoc);
  }
  function parseOptionalBindingIdentifier() {
    return isBindingIdentifier() ? parseBindingIdentifier() : void 0;
  }
  function parseNewExpressionOrNewDotTarget() {
    const pos = getNodePos();
    parseExpected(105 /* NewKeyword */);
    if (parseOptional(25 /* DotToken */)) {
      const name = parseIdentifierName();
      return finishNode(factory2.createMetaProperty(105 /* NewKeyword */, name), pos);
    }
    const expressionPos = getNodePos();
    let expression = parseMemberExpressionRest(
      expressionPos,
      parsePrimaryExpression(),
      /*allowOptionalChain*/
      false
    );
    let typeArguments;
    if (expression.kind === 234 /* ExpressionWithTypeArguments */) {
      typeArguments = expression.typeArguments;
      expression = expression.expression;
    }
    if (token() === 29 /* QuestionDotToken */) {
      parseErrorAtCurrentToken(Diagnostics.Invalid_optional_chain_from_new_expression_Did_you_mean_to_call_0, getTextOfNodeFromSourceText(sourceText, expression));
    }
    const argumentList = token() === 21 /* OpenParenToken */ ? parseArgumentList() : void 0;
    return finishNode(factoryCreateNewExpression(expression, typeArguments, argumentList), pos);
  }
  function parseBlock(ignoreMissingOpenBrace, diagnosticMessage) {
    const pos = getNodePos();
    const hasJSDoc = hasPrecedingJSDocComment();
    const openBracePosition = scanner2.getTokenStart();
    const openBraceParsed = parseExpected(19 /* OpenBraceToken */, diagnosticMessage);
    if (openBraceParsed || ignoreMissingOpenBrace) {
      const multiLine = scanner2.hasPrecedingLineBreak();
      const statements = parseList(1 /* BlockStatements */, parseStatement);
      parseExpectedMatchingBrackets(19 /* OpenBraceToken */, 20 /* CloseBraceToken */, openBraceParsed, openBracePosition);
      const result = withJSDoc(finishNode(factoryCreateBlock(statements, multiLine), pos), hasJSDoc);
      if (token() === 64 /* EqualsToken */) {
        parseErrorAtCurrentToken(Diagnostics.Declaration_or_statement_expected_This_follows_a_block_of_statements_so_if_you_intended_to_write_a_destructuring_assignment_you_might_need_to_wrap_the_whole_assignment_in_parentheses);
        nextToken();
      }
      return result;
    } else {
      const statements = createMissingList();
      return withJSDoc(finishNode(factoryCreateBlock(
        statements,
        /*multiLine*/
        void 0
      ), pos), hasJSDoc);
    }
  }
  function parseFunctionBlock(flags, diagnosticMessage) {
    const savedYieldContext = inYieldContext();
    setYieldContext(!!(flags & 1 /* Yield */));
    const savedAwaitContext = inAwaitContext();
    setAwaitContext(!!(flags & 2 /* Await */));
    const savedTopLevel = topLevel;
    topLevel = false;
    const saveDecoratorContext = inDecoratorContext();
    if (saveDecoratorContext) {
      setDecoratorContext(
        /*val*/
        false
      );
    }
    const block = parseBlock(!!(flags & 16 /* IgnoreMissingOpenBrace */), diagnosticMessage);
    if (saveDecoratorContext) {
      setDecoratorContext(
        /*val*/
        true
      );
    }
    topLevel = savedTopLevel;
    setYieldContext(savedYieldContext);
    setAwaitContext(savedAwaitContext);
    return block;
  }
  function parseEmptyStatement() {
    const pos = getNodePos();
    const hasJSDoc = hasPrecedingJSDocComment();
    parseExpected(27 /* SemicolonToken */);
    return withJSDoc(finishNode(factory2.createEmptyStatement(), pos), hasJSDoc);
  }
  function parseIfStatement() {
    const pos = getNodePos();
    const hasJSDoc = hasPrecedingJSDocComment();
    parseExpected(101 /* IfKeyword */);
    const openParenPosition = scanner2.getTokenStart();
    const openParenParsed = parseExpected(21 /* OpenParenToken */);
    const expression = allowInAnd(parseExpression);
    parseExpectedMatchingBrackets(21 /* OpenParenToken */, 22 /* CloseParenToken */, openParenParsed, openParenPosition);
    const thenStatement = parseStatement();
    const elseStatement = parseOptional(93 /* ElseKeyword */) ? parseStatement() : void 0;
    return withJSDoc(finishNode(factoryCreateIfStatement(expression, thenStatement, elseStatement), pos), hasJSDoc);
  }
  function parseDoStatement() {
    const pos = getNodePos();
    const hasJSDoc = hasPrecedingJSDocComment();
    parseExpected(92 /* DoKeyword */);
    const statement = parseStatement();
    parseExpected(117 /* WhileKeyword */);
    const openParenPosition = scanner2.getTokenStart();
    const openParenParsed = parseExpected(21 /* OpenParenToken */);
    const expression = allowInAnd(parseExpression);
    parseExpectedMatchingBrackets(21 /* OpenParenToken */, 22 /* CloseParenToken */, openParenParsed, openParenPosition);
    parseOptional(27 /* SemicolonToken */);
    return withJSDoc(finishNode(factory2.createDoStatement(statement, expression), pos), hasJSDoc);
  }
  function parseWhileStatement() {
    const pos = getNodePos();
    const hasJSDoc = hasPrecedingJSDocComment();
    parseExpected(117 /* WhileKeyword */);
    const openParenPosition = scanner2.getTokenStart();
    const openParenParsed = parseExpected(21 /* OpenParenToken */);
    const expression = allowInAnd(parseExpression);
    parseExpectedMatchingBrackets(21 /* OpenParenToken */, 22 /* CloseParenToken */, openParenParsed, openParenPosition);
    const statement = parseStatement();
    return withJSDoc(finishNode(factoryCreateWhileStatement(expression, statement), pos), hasJSDoc);
  }
  function parseForOrForInOrForOfStatement() {
    const pos = getNodePos();
    const hasJSDoc = hasPrecedingJSDocComment();
    parseExpected(99 /* ForKeyword */);
    const awaitToken = parseOptionalToken(135 /* AwaitKeyword */);
    parseExpected(21 /* OpenParenToken */);
    let initializer;
    if (token() !== 27 /* SemicolonToken */) {
      if (token() === 115 /* VarKeyword */ || token() === 121 /* LetKeyword */ || token() === 87 /* ConstKeyword */ || token() === 160 /* UsingKeyword */ && lookAhead(nextTokenIsBindingIdentifierOrStartOfDestructuringOnSameLineDisallowOf) || // this one is meant to allow of
      token() === 135 /* AwaitKeyword */ && lookAhead(nextTokenIsUsingKeywordThenBindingIdentifierOrStartOfObjectDestructuringOnSameLine)) {
        initializer = parseVariableDeclarationList(
          /*inForStatementInitializer*/
          true
        );
      } else {
        initializer = disallowInAnd(parseExpression);
      }
    }
    let node;
    if (awaitToken ? parseExpected(165 /* OfKeyword */) : parseOptional(165 /* OfKeyword */)) {
      const expression = allowInAnd(() => parseAssignmentExpressionOrHigher(
        /*allowReturnTypeInArrowFunction*/
        true
      ));
      parseExpected(22 /* CloseParenToken */);
      node = factoryCreateForOfStatement(awaitToken, initializer, expression, parseStatement());
    } else if (parseOptional(103 /* InKeyword */)) {
      const expression = allowInAnd(parseExpression);
      parseExpected(22 /* CloseParenToken */);
      node = factory2.createForInStatement(initializer, expression, parseStatement());
    } else {
      parseExpected(27 /* SemicolonToken */);
      const condition = token() !== 27 /* SemicolonToken */ && token() !== 22 /* CloseParenToken */ ? allowInAnd(parseExpression) : void 0;
      parseExpected(27 /* SemicolonToken */);
      const incrementor = token() !== 22 /* CloseParenToken */ ? allowInAnd(parseExpression) : void 0;
      parseExpected(22 /* CloseParenToken */);
      node = factoryCreateForStatement(initializer, condition, incrementor, parseStatement());
    }
    return withJSDoc(finishNode(node, pos), hasJSDoc);
  }
  function parseBreakOrContinueStatement(kind) {
    const pos = getNodePos();
    const hasJSDoc = hasPrecedingJSDocComment();
    parseExpected(kind === 253 /* BreakStatement */ ? 83 /* BreakKeyword */ : 88 /* ContinueKeyword */);
    const label = canParseSemicolon() ? void 0 : parseIdentifier();
    parseSemicolon();
    const node = kind === 253 /* BreakStatement */ ? factory2.createBreakStatement(label) : factory2.createContinueStatement(label);
    return withJSDoc(finishNode(node, pos), hasJSDoc);
  }
  function parseReturnStatement() {
    const pos = getNodePos();
    const hasJSDoc = hasPrecedingJSDocComment();
    parseExpected(107 /* ReturnKeyword */);
    const expression = canParseSemicolon() ? void 0 : allowInAnd(parseExpression);
    parseSemicolon();
    return withJSDoc(finishNode(factory2.createReturnStatement(expression), pos), hasJSDoc);
  }
  function parseWithStatement() {
    const pos = getNodePos();
    const hasJSDoc = hasPrecedingJSDocComment();
    parseExpected(118 /* WithKeyword */);
    const openParenPosition = scanner2.getTokenStart();
    const openParenParsed = parseExpected(21 /* OpenParenToken */);
    const expression = allowInAnd(parseExpression);
    parseExpectedMatchingBrackets(21 /* OpenParenToken */, 22 /* CloseParenToken */, openParenParsed, openParenPosition);
    const statement = doInsideOfContext(67108864 /* InWithStatement */, parseStatement);
    return withJSDoc(finishNode(factory2.createWithStatement(expression, statement), pos), hasJSDoc);
  }
  function parseCaseClause() {
    const pos = getNodePos();
    const hasJSDoc = hasPrecedingJSDocComment();
    parseExpected(84 /* CaseKeyword */);
    const expression = allowInAnd(parseExpression);
    parseExpected(59 /* ColonToken */);
    const statements = parseList(3 /* SwitchClauseStatements */, parseStatement);
    return withJSDoc(finishNode(factory2.createCaseClause(expression, statements), pos), hasJSDoc);
  }
  function parseDefaultClause() {
    const pos = getNodePos();
    parseExpected(90 /* DefaultKeyword */);
    parseExpected(59 /* ColonToken */);
    const statements = parseList(3 /* SwitchClauseStatements */, parseStatement);
    return finishNode(factory2.createDefaultClause(statements), pos);
  }
  function parseCaseOrDefaultClause() {
    return token() === 84 /* CaseKeyword */ ? parseCaseClause() : parseDefaultClause();
  }
  function parseCaseBlock() {
    const pos = getNodePos();
    parseExpected(19 /* OpenBraceToken */);
    const clauses = parseList(2 /* SwitchClauses */, parseCaseOrDefaultClause);
    parseExpected(20 /* CloseBraceToken */);
    return finishNode(factory2.createCaseBlock(clauses), pos);
  }
  function parseSwitchStatement() {
    const pos = getNodePos();
    const hasJSDoc = hasPrecedingJSDocComment();
    parseExpected(109 /* SwitchKeyword */);
    parseExpected(21 /* OpenParenToken */);
    const expression = allowInAnd(parseExpression);
    parseExpected(22 /* CloseParenToken */);
    const caseBlock = parseCaseBlock();
    return withJSDoc(finishNode(factory2.createSwitchStatement(expression, caseBlock), pos), hasJSDoc);
  }
  function parseThrowStatement() {
    const pos = getNodePos();
    const hasJSDoc = hasPrecedingJSDocComment();
    parseExpected(111 /* ThrowKeyword */);
    let expression = scanner2.hasPrecedingLineBreak() ? void 0 : allowInAnd(parseExpression);
    if (expression === void 0) {
      identifierCount++;
      expression = finishNode(factoryCreateIdentifier(""), getNodePos());
    }
    if (!tryParseSemicolon()) {
      parseErrorForMissingSemicolonAfter(expression);
    }
    return withJSDoc(finishNode(factory2.createThrowStatement(expression), pos), hasJSDoc);
  }
  function parseTryStatement() {
    const pos = getNodePos();
    const hasJSDoc = hasPrecedingJSDocComment();
    parseExpected(113 /* TryKeyword */);
    const tryBlock = parseBlock(
      /*ignoreMissingOpenBrace*/
      false
    );
    const catchClause = token() === 85 /* CatchKeyword */ ? parseCatchClause() : void 0;
    let finallyBlock;
    if (!catchClause || token() === 98 /* FinallyKeyword */) {
      parseExpected(98 /* FinallyKeyword */, Diagnostics.catch_or_finally_expected);
      finallyBlock = parseBlock(
        /*ignoreMissingOpenBrace*/
        false
      );
    }
    return withJSDoc(finishNode(factory2.createTryStatement(tryBlock, catchClause, finallyBlock), pos), hasJSDoc);
  }
  function parseCatchClause() {
    const pos = getNodePos();
    parseExpected(85 /* CatchKeyword */);
    let variableDeclaration;
    if (parseOptional(21 /* OpenParenToken */)) {
      variableDeclaration = parseVariableDeclaration();
      parseExpected(22 /* CloseParenToken */);
    } else {
      variableDeclaration = void 0;
    }
    const block = parseBlock(
      /*ignoreMissingOpenBrace*/
      false
    );
    return finishNode(factory2.createCatchClause(variableDeclaration, block), pos);
  }
  function parseDebuggerStatement() {
    const pos = getNodePos();
    const hasJSDoc = hasPrecedingJSDocComment();
    parseExpected(89 /* DebuggerKeyword */);
    parseSemicolon();
    return withJSDoc(finishNode(factory2.createDebuggerStatement(), pos), hasJSDoc);
  }
  function parseExpressionOrLabeledStatement() {
    const pos = getNodePos();
    let hasJSDoc = hasPrecedingJSDocComment();
    let node;
    const hasParen = token() === 21 /* OpenParenToken */;
    const expression = allowInAnd(parseExpression);
    if (isIdentifier(expression) && parseOptional(59 /* ColonToken */)) {
      node = factory2.createLabeledStatement(expression, parseStatement());
    } else {
      if (!tryParseSemicolon()) {
        parseErrorForMissingSemicolonAfter(expression);
      }
      node = factoryCreateExpressionStatement(expression);
      if (hasParen) {
        hasJSDoc = false;
      }
    }
    return withJSDoc(finishNode(node, pos), hasJSDoc);
  }
  function nextTokenIsIdentifierOrKeywordOnSameLine() {
    nextToken();
    return tokenIsIdentifierOrKeyword(token()) && !scanner2.hasPrecedingLineBreak();
  }
  function nextTokenIsClassKeywordOnSameLine() {
    nextToken();
    return token() === 86 /* ClassKeyword */ && !scanner2.hasPrecedingLineBreak();
  }
  function nextTokenIsFunctionKeywordOnSameLine() {
    nextToken();
    return token() === 100 /* FunctionKeyword */ && !scanner2.hasPrecedingLineBreak();
  }
  function nextTokenIsIdentifierOrKeywordOrLiteralOnSameLine() {
    nextToken();
    return (tokenIsIdentifierOrKeyword(token()) || token() === 9 /* NumericLiteral */ || token() === 10 /* BigIntLiteral */ || token() === 11 /* StringLiteral */) && !scanner2.hasPrecedingLineBreak();
  }
  function isDeclaration2() {
    while (true) {
      switch (token()) {
        case 115 /* VarKeyword */:
        case 121 /* LetKeyword */:
        case 87 /* ConstKeyword */:
        case 100 /* FunctionKeyword */:
        case 86 /* ClassKeyword */:
        case 94 /* EnumKeyword */:
          return true;
        case 160 /* UsingKeyword */:
          return isUsingDeclaration();
        case 135 /* AwaitKeyword */:
          return isAwaitUsingDeclaration();
        // 'declare', 'module', 'namespace', 'interface'* and 'type' are all legal JavaScript identifiers;
        // however, an identifier cannot be followed by another identifier on the same line. This is what we
        // count on to parse out the respective declarations. For instance, we exploit this to say that
        //
        //    namespace n
        //
        // can be none other than the beginning of a namespace declaration, but need to respect that JavaScript sees
        //
        //    namespace
        //    n
        //
        // as the identifier 'namespace' on one line followed by the identifier 'n' on another.
        // We need to look one token ahead to see if it permissible to try parsing a declaration.
        //
        // *Note*: 'interface' is actually a strict mode reserved word. So while
        //
        //   "use strict"
        //   interface
        //   I {}
        //
        // could be legal, it would add complexity for very little gain.
        case 120 /* InterfaceKeyword */:
        case 156 /* TypeKeyword */:
        case 166 /* DeferKeyword */:
          return nextTokenIsIdentifierOnSameLine();
        case 144 /* ModuleKeyword */:
        case 145 /* NamespaceKeyword */:
          return nextTokenIsIdentifierOrStringLiteralOnSameLine();
        case 128 /* AbstractKeyword */:
        case 129 /* AccessorKeyword */:
        case 134 /* AsyncKeyword */:
        case 138 /* DeclareKeyword */:
        case 123 /* PrivateKeyword */:
        case 124 /* ProtectedKeyword */:
        case 125 /* PublicKeyword */:
        case 148 /* ReadonlyKeyword */:
          const previousToken = token();
          nextToken();
          if (scanner2.hasPrecedingLineBreak()) {
            return false;
          }
          if (previousToken === 138 /* DeclareKeyword */ && token() === 156 /* TypeKeyword */) {
            return true;
          }
          continue;
        case 162 /* GlobalKeyword */:
          nextToken();
          return token() === 19 /* OpenBraceToken */ || token() === 80 /* Identifier */ || token() === 95 /* ExportKeyword */;
        case 102 /* ImportKeyword */:
          nextToken();
          return token() === 166 /* DeferKeyword */ || token() === 11 /* StringLiteral */ || token() === 42 /* AsteriskToken */ || token() === 19 /* OpenBraceToken */ || tokenIsIdentifierOrKeyword(token());
        case 95 /* ExportKeyword */:
          let currentToken2 = nextToken();
          if (currentToken2 === 156 /* TypeKeyword */) {
            currentToken2 = lookAhead(nextToken);
          }
          if (currentToken2 === 64 /* EqualsToken */ || currentToken2 === 42 /* AsteriskToken */ || currentToken2 === 19 /* OpenBraceToken */ || currentToken2 === 90 /* DefaultKeyword */ || currentToken2 === 130 /* AsKeyword */ || currentToken2 === 60 /* AtToken */) {
            return true;
          }
          continue;
        case 126 /* StaticKeyword */:
          nextToken();
          continue;
        default:
          return false;
      }
    }
  }
  function isStartOfDeclaration() {
    return lookAhead(isDeclaration2);
  }
  function isStartOfStatement() {
    switch (token()) {
      case 60 /* AtToken */:
      case 27 /* SemicolonToken */:
      case 19 /* OpenBraceToken */:
      case 115 /* VarKeyword */:
      case 121 /* LetKeyword */:
      case 160 /* UsingKeyword */:
      case 100 /* FunctionKeyword */:
      case 86 /* ClassKeyword */:
      case 94 /* EnumKeyword */:
      case 101 /* IfKeyword */:
      case 92 /* DoKeyword */:
      case 117 /* WhileKeyword */:
      case 99 /* ForKeyword */:
      case 88 /* ContinueKeyword */:
      case 83 /* BreakKeyword */:
      case 107 /* ReturnKeyword */:
      case 118 /* WithKeyword */:
      case 109 /* SwitchKeyword */:
      case 111 /* ThrowKeyword */:
      case 113 /* TryKeyword */:
      case 89 /* DebuggerKeyword */:
      // 'catch' and 'finally' do not actually indicate that the code is part of a statement,
      // however, we say they are here so that we may gracefully parse them and error later.
      // falls through
      case 85 /* CatchKeyword */:
      case 98 /* FinallyKeyword */:
        return true;
      case 102 /* ImportKeyword */:
        return isStartOfDeclaration() || lookAhead(nextTokenIsOpenParenOrLessThanOrDot);
      case 87 /* ConstKeyword */:
      case 95 /* ExportKeyword */:
        return isStartOfDeclaration();
      case 134 /* AsyncKeyword */:
      case 138 /* DeclareKeyword */:
      case 120 /* InterfaceKeyword */:
      case 144 /* ModuleKeyword */:
      case 145 /* NamespaceKeyword */:
      case 156 /* TypeKeyword */:
      case 162 /* GlobalKeyword */:
      case 166 /* DeferKeyword */:
        return true;
      case 129 /* AccessorKeyword */:
      case 125 /* PublicKeyword */:
      case 123 /* PrivateKeyword */:
      case 124 /* ProtectedKeyword */:
      case 126 /* StaticKeyword */:
      case 148 /* ReadonlyKeyword */:
        return isStartOfDeclaration() || !lookAhead(nextTokenIsIdentifierOrKeywordOnSameLine);
      default:
        return isStartOfExpression();
    }
  }
  function nextTokenIsBindingIdentifierOrStartOfDestructuring() {
    nextToken();
    return isBindingIdentifier() || token() === 19 /* OpenBraceToken */ || token() === 23 /* OpenBracketToken */;
  }
  function isLetDeclaration() {
    return lookAhead(nextTokenIsBindingIdentifierOrStartOfDestructuring);
  }
  function nextTokenIsBindingIdentifierOrStartOfDestructuringOnSameLineDisallowOf() {
    return nextTokenIsBindingIdentifierOrStartOfDestructuringOnSameLine(
      /*disallowOf*/
      true
    );
  }
  function nextTokenIsEqualsOrSemicolonOrColonToken() {
    nextToken();
    return token() === 64 /* EqualsToken */ || token() === 27 /* SemicolonToken */ || token() === 59 /* ColonToken */;
  }
  function nextTokenIsBindingIdentifierOrStartOfDestructuringOnSameLine(disallowOf) {
    nextToken();
    if (disallowOf && token() === 165 /* OfKeyword */) {
      return lookAhead(nextTokenIsEqualsOrSemicolonOrColonToken);
    }
    return (isBindingIdentifier() || token() === 19 /* OpenBraceToken */) && !scanner2.hasPrecedingLineBreak();
  }
  function isUsingDeclaration() {
    return lookAhead(nextTokenIsBindingIdentifierOrStartOfDestructuringOnSameLine);
  }
  function nextTokenIsUsingKeywordThenBindingIdentifierOrStartOfObjectDestructuringOnSameLine(disallowOf) {
    if (nextToken() === 160 /* UsingKeyword */) {
      return nextTokenIsBindingIdentifierOrStartOfDestructuringOnSameLine(disallowOf);
    }
    return false;
  }
  function isAwaitUsingDeclaration() {
    return lookAhead(nextTokenIsUsingKeywordThenBindingIdentifierOrStartOfObjectDestructuringOnSameLine);
  }
  function parseStatement() {
    switch (token()) {
      case 27 /* SemicolonToken */:
        return parseEmptyStatement();
      case 19 /* OpenBraceToken */:
        return parseBlock(
          /*ignoreMissingOpenBrace*/
          false
        );
      case 115 /* VarKeyword */:
        return parseVariableStatement(
          getNodePos(),
          hasPrecedingJSDocComment(),
          /*modifiers*/
          void 0
        );
      case 121 /* LetKeyword */:
        if (isLetDeclaration()) {
          return parseVariableStatement(
            getNodePos(),
            hasPrecedingJSDocComment(),
            /*modifiers*/
            void 0
          );
        }
        break;
      case 135 /* AwaitKeyword */:
        if (isAwaitUsingDeclaration()) {
          return parseVariableStatement(
            getNodePos(),
            hasPrecedingJSDocComment(),
            /*modifiers*/
            void 0
          );
        }
        break;
      case 160 /* UsingKeyword */:
        if (isUsingDeclaration()) {
          return parseVariableStatement(
            getNodePos(),
            hasPrecedingJSDocComment(),
            /*modifiers*/
            void 0
          );
        }
        break;
      case 100 /* FunctionKeyword */:
        return parseFunctionDeclaration(
          getNodePos(),
          hasPrecedingJSDocComment(),
          /*modifiers*/
          void 0
        );
      case 86 /* ClassKeyword */:
        return parseClassDeclaration(
          getNodePos(),
          hasPrecedingJSDocComment(),
          /*modifiers*/
          void 0
        );
      case 101 /* IfKeyword */:
        return parseIfStatement();
      case 92 /* DoKeyword */:
        return parseDoStatement();
      case 117 /* WhileKeyword */:
        return parseWhileStatement();
      case 99 /* ForKeyword */:
        return parseForOrForInOrForOfStatement();
      case 88 /* ContinueKeyword */:
        return parseBreakOrContinueStatement(252 /* ContinueStatement */);
      case 83 /* BreakKeyword */:
        return parseBreakOrContinueStatement(253 /* BreakStatement */);
      case 107 /* ReturnKeyword */:
        return parseReturnStatement();
      case 118 /* WithKeyword */:
        return parseWithStatement();
      case 109 /* SwitchKeyword */:
        return parseSwitchStatement();
      case 111 /* ThrowKeyword */:
        return parseThrowStatement();
      case 113 /* TryKeyword */:
      // Include 'catch' and 'finally' for error recovery.
      // falls through
      case 85 /* CatchKeyword */:
      case 98 /* FinallyKeyword */:
        return parseTryStatement();
      case 89 /* DebuggerKeyword */:
        return parseDebuggerStatement();
      case 60 /* AtToken */:
        return parseDeclaration();
      case 134 /* AsyncKeyword */:
      case 120 /* InterfaceKeyword */:
      case 156 /* TypeKeyword */:
      case 144 /* ModuleKeyword */:
      case 145 /* NamespaceKeyword */:
      case 138 /* DeclareKeyword */:
      case 87 /* ConstKeyword */:
      case 94 /* EnumKeyword */:
      case 95 /* ExportKeyword */:
      case 102 /* ImportKeyword */:
      case 123 /* PrivateKeyword */:
      case 124 /* ProtectedKeyword */:
      case 125 /* PublicKeyword */:
      case 128 /* AbstractKeyword */:
      case 129 /* AccessorKeyword */:
      case 126 /* StaticKeyword */:
      case 148 /* ReadonlyKeyword */:
      case 162 /* GlobalKeyword */:
        if (isStartOfDeclaration()) {
          return parseDeclaration();
        }
        break;
    }
    return parseExpressionOrLabeledStatement();
  }
  function isDeclareModifier(modifier) {
    return modifier.kind === 138 /* DeclareKeyword */;
  }
  function parseDeclaration() {
    const pos = getNodePos();
    const hasJSDoc = hasPrecedingJSDocComment();
    const modifiers = parseModifiers(
      /*allowDecorators*/
      true
    );
    const isAmbient = some(modifiers, isDeclareModifier);
    if (isAmbient) {
      const node = tryReuseAmbientDeclaration(pos);
      if (node) {
        return node;
      }
      for (const m of modifiers) {
        m.flags |= 33554432 /* Ambient */;
      }
      return doInsideOfContext(33554432 /* Ambient */, () => parseDeclarationWorker(pos, hasJSDoc, modifiers));
    } else {
      return parseDeclarationWorker(pos, hasJSDoc, modifiers);
    }
  }
  function tryReuseAmbientDeclaration(pos) {
    return doInsideOfContext(33554432 /* Ambient */, () => {
      const node = currentNode(parsingContext, pos);
      if (node) {
        return consumeNode(node);
      }
    });
  }
  function parseDeclarationWorker(pos, hasJSDoc, modifiersIn) {
    switch (token()) {
      case 115 /* VarKeyword */:
      case 121 /* LetKeyword */:
      case 87 /* ConstKeyword */:
      case 160 /* UsingKeyword */:
        return parseVariableStatement(pos, hasJSDoc, modifiersIn);
      case 135 /* AwaitKeyword */:
        if (!isAwaitUsingDeclaration()) {
          break;
        }
        return parseVariableStatement(pos, hasJSDoc, modifiersIn);
      case 100 /* FunctionKeyword */:
        return parseFunctionDeclaration(pos, hasJSDoc, modifiersIn);
      case 86 /* ClassKeyword */:
        return parseClassDeclaration(pos, hasJSDoc, modifiersIn);
      case 120 /* InterfaceKeyword */:
        return parseInterfaceDeclaration(pos, hasJSDoc, modifiersIn);
      case 156 /* TypeKeyword */:
        return parseTypeAliasDeclaration(pos, hasJSDoc, modifiersIn);
      case 94 /* EnumKeyword */:
        return parseEnumDeclaration(pos, hasJSDoc, modifiersIn);
      case 162 /* GlobalKeyword */:
      case 144 /* ModuleKeyword */:
      case 145 /* NamespaceKeyword */:
        return parseModuleDeclaration(pos, hasJSDoc, modifiersIn);
      case 102 /* ImportKeyword */:
        return parseImportDeclarationOrImportEqualsDeclaration(pos, hasJSDoc, modifiersIn);
      case 95 /* ExportKeyword */:
        nextToken();
        switch (token()) {
          case 90 /* DefaultKeyword */:
          case 64 /* EqualsToken */:
            return parseExportAssignment(pos, hasJSDoc, modifiersIn);
          case 130 /* AsKeyword */:
            return parseNamespaceExportDeclaration(pos, hasJSDoc, modifiersIn);
          default:
            return parseExportDeclaration(pos, hasJSDoc, modifiersIn);
        }
    }
    if (modifiersIn) {
      const missing = createMissingNode(
        283 /* MissingDeclaration */,
        /*reportAtCurrentPosition*/
        true,
        Diagnostics.Declaration_expected
      );
      setTextRangePos(missing, pos);
      missing.modifiers = modifiersIn;
      return missing;
    }
    return void 0;
  }
  function nextTokenIsStringLiteral() {
    return nextToken() === 11 /* StringLiteral */;
  }
  function nextTokenIsFromKeywordOrEqualsToken() {
    nextToken();
    return token() === 161 /* FromKeyword */ || token() === 64 /* EqualsToken */;
  }
  function nextTokenIsIdentifierOrStringLiteralOnSameLine() {
    nextToken();
    return !scanner2.hasPrecedingLineBreak() && (isIdentifier2() || token() === 11 /* StringLiteral */);
  }
  function parseFunctionBlockOrSemicolon(flags, diagnosticMessage) {
    if (token() !== 19 /* OpenBraceToken */) {
      if (flags & 4 /* Type */) {
        parseTypeMemberSemicolon();
        return;
      }
      if (canParseSemicolon()) {
        parseSemicolon();
        return;
      }
    }
    return parseFunctionBlock(flags, diagnosticMessage);
  }
  function parseArrayBindingElement() {
    const pos = getNodePos();
    if (token() === 28 /* CommaToken */) {
      return finishNode(factory2.createOmittedExpression(), pos);
    }
    const dotDotDotToken = parseOptionalToken(26 /* DotDotDotToken */);
    const name = parseIdentifierOrPattern();
    const initializer = parseInitializer();
    return finishNode(factory2.createBindingElement(
      dotDotDotToken,
      /*propertyName*/
      void 0,
      name,
      initializer
    ), pos);
  }
  function parseObjectBindingElement() {
    const pos = getNodePos();
    const dotDotDotToken = parseOptionalToken(26 /* DotDotDotToken */);
    const tokenIsIdentifier = isBindingIdentifier();
    let propertyName = parsePropertyName();
    let name;
    if (tokenIsIdentifier && token() !== 59 /* ColonToken */) {
      name = propertyName;
      propertyName = void 0;
    } else {
      parseExpected(59 /* ColonToken */);
      name = parseIdentifierOrPattern();
    }
    const initializer = parseInitializer();
    return finishNode(factory2.createBindingElement(dotDotDotToken, propertyName, name, initializer), pos);
  }
  function parseObjectBindingPattern() {
    const pos = getNodePos();
    parseExpected(19 /* OpenBraceToken */);
    const elements = allowInAnd(() => parseDelimitedList(9 /* ObjectBindingElements */, parseObjectBindingElement));
    parseExpected(20 /* CloseBraceToken */);
    return finishNode(factory2.createObjectBindingPattern(elements), pos);
  }
  function parseArrayBindingPattern() {
    const pos = getNodePos();
    parseExpected(23 /* OpenBracketToken */);
    const elements = allowInAnd(() => parseDelimitedList(10 /* ArrayBindingElements */, parseArrayBindingElement));
    parseExpected(24 /* CloseBracketToken */);
    return finishNode(factory2.createArrayBindingPattern(elements), pos);
  }
  function isBindingIdentifierOrPrivateIdentifierOrPattern() {
    return token() === 19 /* OpenBraceToken */ || token() === 23 /* OpenBracketToken */ || token() === 81 /* PrivateIdentifier */ || isBindingIdentifier();
  }
  function parseIdentifierOrPattern(privateIdentifierDiagnosticMessage) {
    if (token() === 23 /* OpenBracketToken */) {
      return parseArrayBindingPattern();
    }
    if (token() === 19 /* OpenBraceToken */) {
      return parseObjectBindingPattern();
    }
    return parseBindingIdentifier(privateIdentifierDiagnosticMessage);
  }
  function parseVariableDeclarationAllowExclamation() {
    return parseVariableDeclaration(
      /*allowExclamation*/
      true
    );
  }
  function parseVariableDeclaration(allowExclamation) {
    const pos = getNodePos();
    const hasJSDoc = hasPrecedingJSDocComment();
    const name = parseIdentifierOrPattern(Diagnostics.Private_identifiers_are_not_allowed_in_variable_declarations);
    let exclamationToken;
    if (allowExclamation && name.kind === 80 /* Identifier */ && token() === 54 /* ExclamationToken */ && !scanner2.hasPrecedingLineBreak()) {
      exclamationToken = parseTokenNode();
    }
    const type = parseTypeAnnotation();
    const initializer = isInOrOfKeyword(token()) ? void 0 : parseInitializer();
    const node = factoryCreateVariableDeclaration(name, exclamationToken, type, initializer);
    return withJSDoc(finishNode(node, pos), hasJSDoc);
  }
  function parseVariableDeclarationList(inForStatementInitializer) {
    const pos = getNodePos();
    let flags = 0;
    switch (token()) {
      case 115 /* VarKeyword */:
        break;
      case 121 /* LetKeyword */:
        flags |= 1 /* Let */;
        break;
      case 87 /* ConstKeyword */:
        flags |= 2 /* Const */;
        break;
      case 160 /* UsingKeyword */:
        flags |= 4 /* Using */;
        break;
      case 135 /* AwaitKeyword */:
        if (!isAwaitUsingDeclaration()) {
          break;
        }
        flags |= 6 /* AwaitUsing */;
        nextToken();
        break;
      default:
        Debug.fail();
    }
    nextToken();
    let declarations;
    if (token() === 165 /* OfKeyword */ && lookAhead(canFollowContextualOfKeyword)) {
      declarations = createMissingList();
    } else {
      const savedDisallowIn = inDisallowInContext();
      setDisallowInContext(inForStatementInitializer);
      declarations = parseDelimitedList(
        8 /* VariableDeclarations */,
        inForStatementInitializer ? parseVariableDeclaration : parseVariableDeclarationAllowExclamation
      );
      setDisallowInContext(savedDisallowIn);
    }
    return finishNode(factoryCreateVariableDeclarationList(declarations, flags), pos);
  }
  function canFollowContextualOfKeyword() {
    return nextTokenIsIdentifier() && nextToken() === 22 /* CloseParenToken */;
  }
  function parseVariableStatement(pos, hasJSDoc, modifiers) {
    const declarationList = parseVariableDeclarationList(
      /*inForStatementInitializer*/
      false
    );
    parseSemicolon();
    const node = factoryCreateVariableStatement(modifiers, declarationList);
    return withJSDoc(finishNode(node, pos), hasJSDoc);
  }
  function parseFunctionDeclaration(pos, hasJSDoc, modifiers) {
    const savedAwaitContext = inAwaitContext();
    const modifierFlags = modifiersToFlags(modifiers);
    parseExpected(100 /* FunctionKeyword */);
    const asteriskToken = parseOptionalToken(42 /* AsteriskToken */);
    const name = modifierFlags & 2048 /* Default */ ? parseOptionalBindingIdentifier() : parseBindingIdentifier();
    const isGenerator = asteriskToken ? 1 /* Yield */ : 0 /* None */;
    const isAsync = modifierFlags & 1024 /* Async */ ? 2 /* Await */ : 0 /* None */;
    const typeParameters = parseTypeParameters();
    if (modifierFlags & 32 /* Export */) setAwaitContext(
      /*value*/
      true
    );
    const parameters = parseParameters(isGenerator | isAsync);
    const type = parseReturnType(
      59 /* ColonToken */,
      /*isType*/
      false
    );
    const body = parseFunctionBlockOrSemicolon(isGenerator | isAsync, Diagnostics.or_expected);
    setAwaitContext(savedAwaitContext);
    const node = factory2.createFunctionDeclaration(modifiers, asteriskToken, name, typeParameters, parameters, type, body);
    return withJSDoc(finishNode(node, pos), hasJSDoc);
  }
  function parseConstructorName() {
    if (token() === 137 /* ConstructorKeyword */) {
      return parseExpected(137 /* ConstructorKeyword */);
    }
    if (token() === 11 /* StringLiteral */ && lookAhead(nextToken) === 21 /* OpenParenToken */) {
      return tryParse(() => {
        const literalNode = parseLiteralNode();
        return literalNode.text === "constructor" ? literalNode : void 0;
      });
    }
  }
  function tryParseConstructorDeclaration(pos, hasJSDoc, modifiers) {
    return tryParse(() => {
      if (parseConstructorName()) {
        const typeParameters = parseTypeParameters();
        const parameters = parseParameters(0 /* None */);
        const type = parseReturnType(
          59 /* ColonToken */,
          /*isType*/
          false
        );
        const body = parseFunctionBlockOrSemicolon(0 /* None */, Diagnostics.or_expected);
        const node = factory2.createConstructorDeclaration(modifiers, parameters, body);
        node.typeParameters = typeParameters;
        node.type = type;
        return withJSDoc(finishNode(node, pos), hasJSDoc);
      }
    });
  }
  function parseMethodDeclaration(pos, hasJSDoc, modifiers, asteriskToken, name, questionToken, exclamationToken, diagnosticMessage) {
    const isGenerator = asteriskToken ? 1 /* Yield */ : 0 /* None */;
    const isAsync = some(modifiers, isAsyncModifier) ? 2 /* Await */ : 0 /* None */;
    const typeParameters = parseTypeParameters();
    const parameters = parseParameters(isGenerator | isAsync);
    const type = parseReturnType(
      59 /* ColonToken */,
      /*isType*/
      false
    );
    const body = parseFunctionBlockOrSemicolon(isGenerator | isAsync, diagnosticMessage);
    const node = factory2.createMethodDeclaration(
      modifiers,
      asteriskToken,
      name,
      questionToken,
      typeParameters,
      parameters,
      type,
      body
    );
    node.exclamationToken = exclamationToken;
    return withJSDoc(finishNode(node, pos), hasJSDoc);
  }
  function parsePropertyDeclaration(pos, hasJSDoc, modifiers, name, questionToken) {
    const exclamationToken = !questionToken && !scanner2.hasPrecedingLineBreak() ? parseOptionalToken(54 /* ExclamationToken */) : void 0;
    const type = parseTypeAnnotation();
    const initializer = doOutsideOfContext(16384 /* YieldContext */ | 65536 /* AwaitContext */ | 8192 /* DisallowInContext */, parseInitializer);
    parseSemicolonAfterPropertyName(name, type, initializer);
    const node = factory2.createPropertyDeclaration(
      modifiers,
      name,
      questionToken || exclamationToken,
      type,
      initializer
    );
    return withJSDoc(finishNode(node, pos), hasJSDoc);
  }
  function parsePropertyOrMethodDeclaration(pos, hasJSDoc, modifiers) {
    const asteriskToken = parseOptionalToken(42 /* AsteriskToken */);
    const name = parsePropertyName();
    const questionToken = parseOptionalToken(58 /* QuestionToken */);
    if (asteriskToken || token() === 21 /* OpenParenToken */ || token() === 30 /* LessThanToken */) {
      return parseMethodDeclaration(
        pos,
        hasJSDoc,
        modifiers,
        asteriskToken,
        name,
        questionToken,
        /*exclamationToken*/
        void 0,
        Diagnostics.or_expected
      );
    }
    return parsePropertyDeclaration(pos, hasJSDoc, modifiers, name, questionToken);
  }
  function parseAccessorDeclaration(pos, hasJSDoc, modifiers, kind, flags) {
    const name = parsePropertyName();
    const typeParameters = parseTypeParameters();
    const parameters = parseParameters(0 /* None */);
    const type = parseReturnType(
      59 /* ColonToken */,
      /*isType*/
      false
    );
    const body = parseFunctionBlockOrSemicolon(flags);
    const node = kind === 178 /* GetAccessor */ ? factory2.createGetAccessorDeclaration(modifiers, name, parameters, type, body) : factory2.createSetAccessorDeclaration(modifiers, name, parameters, body);
    node.typeParameters = typeParameters;
    if (isSetAccessorDeclaration(node)) node.type = type;
    return withJSDoc(finishNode(node, pos), hasJSDoc);
  }
  function isClassMemberStart() {
    let idToken;
    if (token() === 60 /* AtToken */) {
      return true;
    }
    while (isModifierKind(token())) {
      idToken = token();
      if (isClassMemberModifier(idToken)) {
        return true;
      }
      nextToken();
    }
    if (token() === 42 /* AsteriskToken */) {
      return true;
    }
    if (isLiteralPropertyName()) {
      idToken = token();
      nextToken();
    }
    if (token() === 23 /* OpenBracketToken */) {
      return true;
    }
    if (idToken !== void 0) {
      if (!isKeyword(idToken) || idToken === 153 /* SetKeyword */ || idToken === 139 /* GetKeyword */) {
        return true;
      }
      switch (token()) {
        case 21 /* OpenParenToken */:
        // Method declaration
        case 30 /* LessThanToken */:
        // Generic Method declaration
        case 54 /* ExclamationToken */:
        // Non-null assertion on property name
        case 59 /* ColonToken */:
        // Type Annotation for declaration
        case 64 /* EqualsToken */:
        // Initializer for declaration
        case 58 /* QuestionToken */:
          return true;
        default:
          return canParseSemicolon();
      }
    }
    return false;
  }
  function parseClassStaticBlockDeclaration(pos, hasJSDoc, modifiers) {
    parseExpectedToken(126 /* StaticKeyword */);
    const body = parseClassStaticBlockBody();
    const node = withJSDoc(finishNode(factory2.createClassStaticBlockDeclaration(body), pos), hasJSDoc);
    node.modifiers = modifiers;
    return node;
  }
  function parseClassStaticBlockBody() {
    const savedYieldContext = inYieldContext();
    const savedAwaitContext = inAwaitContext();
    setYieldContext(false);
    setAwaitContext(true);
    const body = parseBlock(
      /*ignoreMissingOpenBrace*/
      false
    );
    setYieldContext(savedYieldContext);
    setAwaitContext(savedAwaitContext);
    return body;
  }
  function parseDecoratorExpression() {
    if (inAwaitContext() && token() === 135 /* AwaitKeyword */) {
      const pos = getNodePos();
      const awaitExpression = parseIdentifier(Diagnostics.Expression_expected);
      nextToken();
      const memberExpression = parseMemberExpressionRest(
        pos,
        awaitExpression,
        /*allowOptionalChain*/
        true
      );
      return parseCallExpressionRest(pos, memberExpression);
    }
    return parseLeftHandSideExpressionOrHigher();
  }
  function tryParseDecorator() {
    const pos = getNodePos();
    if (!parseOptional(60 /* AtToken */)) {
      return void 0;
    }
    const expression = doInDecoratorContext(parseDecoratorExpression);
    return finishNode(factory2.createDecorator(expression), pos);
  }
  function tryParseModifier(hasSeenStaticModifier, permitConstAsModifier, stopOnStartOfClassStaticBlock) {
    const pos = getNodePos();
    const kind = token();
    if (token() === 87 /* ConstKeyword */ && permitConstAsModifier) {
      if (!tryParse(nextTokenIsOnSameLineAndCanFollowModifier)) {
        return void 0;
      }
    } else if (stopOnStartOfClassStaticBlock && token() === 126 /* StaticKeyword */ && lookAhead(nextTokenIsOpenBrace)) {
      return void 0;
    } else if (hasSeenStaticModifier && token() === 126 /* StaticKeyword */) {
      return void 0;
    } else {
      if (!parseAnyContextualModifier()) {
        return void 0;
      }
    }
    return finishNode(factoryCreateToken(kind), pos);
  }
  function parseModifiers(allowDecorators, permitConstAsModifier, stopOnStartOfClassStaticBlock) {
    const pos = getNodePos();
    let list;
    let decorator, modifier, hasSeenStaticModifier = false, hasLeadingModifier = false, hasTrailingDecorator = false;
    if (allowDecorators && token() === 60 /* AtToken */) {
      while (decorator = tryParseDecorator()) {
        list = append(list, decorator);
      }
    }
    while (modifier = tryParseModifier(hasSeenStaticModifier, permitConstAsModifier, stopOnStartOfClassStaticBlock)) {
      if (modifier.kind === 126 /* StaticKeyword */) hasSeenStaticModifier = true;
      list = append(list, modifier);
      hasLeadingModifier = true;
    }
    if (hasLeadingModifier && allowDecorators && token() === 60 /* AtToken */) {
      while (decorator = tryParseDecorator()) {
        list = append(list, decorator);
        hasTrailingDecorator = true;
      }
    }
    if (hasTrailingDecorator) {
      while (modifier = tryParseModifier(hasSeenStaticModifier, permitConstAsModifier, stopOnStartOfClassStaticBlock)) {
        if (modifier.kind === 126 /* StaticKeyword */) hasSeenStaticModifier = true;
        list = append(list, modifier);
      }
    }
    return list && createNodeArray(list, pos);
  }
  function parseModifiersForArrowFunction() {
    let modifiers;
    if (token() === 134 /* AsyncKeyword */) {
      const pos = getNodePos();
      nextToken();
      const modifier = finishNode(factoryCreateToken(134 /* AsyncKeyword */), pos);
      modifiers = createNodeArray([modifier], pos);
    }
    return modifiers;
  }
  function parseClassElement() {
    const pos = getNodePos();
    const hasJSDoc = hasPrecedingJSDocComment();
    if (token() === 27 /* SemicolonToken */) {
      nextToken();
      return withJSDoc(finishNode(factory2.createSemicolonClassElement(), pos), hasJSDoc);
    }
    const modifiers = parseModifiers(
      /*allowDecorators*/
      true,
      /*permitConstAsModifier*/
      true,
      /*stopOnStartOfClassStaticBlock*/
      true
    );
    if (token() === 126 /* StaticKeyword */ && lookAhead(nextTokenIsOpenBrace)) {
      return parseClassStaticBlockDeclaration(pos, hasJSDoc, modifiers);
    }
    if (parseContextualModifier(139 /* GetKeyword */)) {
      return parseAccessorDeclaration(pos, hasJSDoc, modifiers, 178 /* GetAccessor */, 0 /* None */);
    }
    if (parseContextualModifier(153 /* SetKeyword */)) {
      return parseAccessorDeclaration(pos, hasJSDoc, modifiers, 179 /* SetAccessor */, 0 /* None */);
    }
    if (token() === 137 /* ConstructorKeyword */ || token() === 11 /* StringLiteral */) {
      const constructorDeclaration = tryParseConstructorDeclaration(pos, hasJSDoc, modifiers);
      if (constructorDeclaration) {
        return constructorDeclaration;
      }
    }
    if (isIndexSignature()) {
      return parseIndexSignatureDeclaration(pos, hasJSDoc, modifiers);
    }
    if (tokenIsIdentifierOrKeyword(token()) || token() === 11 /* StringLiteral */ || token() === 9 /* NumericLiteral */ || token() === 10 /* BigIntLiteral */ || token() === 42 /* AsteriskToken */ || token() === 23 /* OpenBracketToken */) {
      const isAmbient = some(modifiers, isDeclareModifier);
      if (isAmbient) {
        for (const m of modifiers) {
          m.flags |= 33554432 /* Ambient */;
        }
        return doInsideOfContext(33554432 /* Ambient */, () => parsePropertyOrMethodDeclaration(pos, hasJSDoc, modifiers));
      } else {
        return parsePropertyOrMethodDeclaration(pos, hasJSDoc, modifiers);
      }
    }
    if (modifiers) {
      const name = createMissingNode(
        80 /* Identifier */,
        /*reportAtCurrentPosition*/
        true,
        Diagnostics.Declaration_expected
      );
      return parsePropertyDeclaration(
        pos,
        hasJSDoc,
        modifiers,
        name,
        /*questionToken*/
        void 0
      );
    }
    return Debug.fail("Should not have attempted to parse class member declaration.");
  }
  function parseDecoratedExpression() {
    const pos = getNodePos();
    const hasJSDoc = hasPrecedingJSDocComment();
    const modifiers = parseModifiers(
      /*allowDecorators*/
      true
    );
    if (token() === 86 /* ClassKeyword */) {
      return parseClassDeclarationOrExpression(pos, hasJSDoc, modifiers, 232 /* ClassExpression */);
    }
    const missing = createMissingNode(
      283 /* MissingDeclaration */,
      /*reportAtCurrentPosition*/
      true,
      Diagnostics.Expression_expected
    );
    setTextRangePos(missing, pos);
    missing.modifiers = modifiers;
    return missing;
  }
  function parseClassExpression() {
    return parseClassDeclarationOrExpression(
      getNodePos(),
      hasPrecedingJSDocComment(),
      /*modifiers*/
      void 0,
      232 /* ClassExpression */
    );
  }
  function parseClassDeclaration(pos, hasJSDoc, modifiers) {
    return parseClassDeclarationOrExpression(pos, hasJSDoc, modifiers, 264 /* ClassDeclaration */);
  }
  function parseClassDeclarationOrExpression(pos, hasJSDoc, modifiers, kind) {
    const savedAwaitContext = inAwaitContext();
    parseExpected(86 /* ClassKeyword */);
    const name = parseNameOfClassDeclarationOrExpression();
    const typeParameters = parseTypeParameters();
    if (some(modifiers, isExportModifier)) setAwaitContext(
      /*value*/
      true
    );
    const heritageClauses = parseHeritageClauses();
    let members;
    if (parseExpected(19 /* OpenBraceToken */)) {
      members = parseClassMembers();
      parseExpected(20 /* CloseBraceToken */);
    } else {
      members = createMissingList();
    }
    setAwaitContext(savedAwaitContext);
    const node = kind === 264 /* ClassDeclaration */ ? factory2.createClassDeclaration(modifiers, name, typeParameters, heritageClauses, members) : factory2.createClassExpression(modifiers, name, typeParameters, heritageClauses, members);
    return withJSDoc(finishNode(node, pos), hasJSDoc);
  }
  function parseNameOfClassDeclarationOrExpression() {
    return isBindingIdentifier() && !isImplementsClause() ? createIdentifier(isBindingIdentifier()) : void 0;
  }
  function isImplementsClause() {
    return token() === 119 /* ImplementsKeyword */ && lookAhead(nextTokenIsIdentifierOrKeyword);
  }
  function parseHeritageClauses() {
    if (isHeritageClause2()) {
      return parseList(22 /* HeritageClauses */, parseHeritageClause);
    }
    return void 0;
  }
  function parseHeritageClause() {
    const pos = getNodePos();
    const tok = token();
    Debug.assert(tok === 96 /* ExtendsKeyword */ || tok === 119 /* ImplementsKeyword */);
    nextToken();
    const types = parseDelimitedList(7 /* HeritageClauseElement */, parseExpressionWithTypeArguments);
    return finishNode(factory2.createHeritageClause(tok, types), pos);
  }
  function parseExpressionWithTypeArguments() {
    const pos = getNodePos();
    const expression = parseLeftHandSideExpressionOrHigher();
    if (expression.kind === 234 /* ExpressionWithTypeArguments */) {
      return expression;
    }
    const typeArguments = tryParseTypeArguments();
    return finishNode(factory2.createExpressionWithTypeArguments(expression, typeArguments), pos);
  }
  function tryParseTypeArguments() {
    return token() === 30 /* LessThanToken */ ? parseBracketedList(20 /* TypeArguments */, parseType, 30 /* LessThanToken */, 32 /* GreaterThanToken */) : void 0;
  }
  function isHeritageClause2() {
    return token() === 96 /* ExtendsKeyword */ || token() === 119 /* ImplementsKeyword */;
  }
  function parseClassMembers() {
    return parseList(5 /* ClassMembers */, parseClassElement);
  }
  function parseInterfaceDeclaration(pos, hasJSDoc, modifiers) {
    parseExpected(120 /* InterfaceKeyword */);
    const name = parseIdentifier();
    const typeParameters = parseTypeParameters();
    const heritageClauses = parseHeritageClauses();
    const members = parseObjectTypeMembers();
    const node = factory2.createInterfaceDeclaration(modifiers, name, typeParameters, heritageClauses, members);
    return withJSDoc(finishNode(node, pos), hasJSDoc);
  }
  function parseTypeAliasDeclaration(pos, hasJSDoc, modifiers) {
    parseExpected(156 /* TypeKeyword */);
    if (scanner2.hasPrecedingLineBreak()) {
      parseErrorAtCurrentToken(Diagnostics.Line_break_not_permitted_here);
    }
    const name = parseIdentifier();
    const typeParameters = parseTypeParameters();
    parseExpected(64 /* EqualsToken */);
    const type = token() === 141 /* IntrinsicKeyword */ && tryParse(parseKeywordAndNoDot) || parseType();
    parseSemicolon();
    const node = factory2.createTypeAliasDeclaration(modifiers, name, typeParameters, type);
    return withJSDoc(finishNode(node, pos), hasJSDoc);
  }
  function parseEnumMember() {
    const pos = getNodePos();
    const hasJSDoc = hasPrecedingJSDocComment();
    const name = parsePropertyName();
    const initializer = allowInAnd(parseInitializer);
    return withJSDoc(finishNode(factory2.createEnumMember(name, initializer), pos), hasJSDoc);
  }
  function parseEnumDeclaration(pos, hasJSDoc, modifiers) {
    parseExpected(94 /* EnumKeyword */);
    const name = parseIdentifier();
    let members;
    if (parseExpected(19 /* OpenBraceToken */)) {
      members = doOutsideOfYieldAndAwaitContext(() => parseDelimitedList(6 /* EnumMembers */, parseEnumMember));
      parseExpected(20 /* CloseBraceToken */);
    } else {
      members = createMissingList();
    }
    const node = factory2.createEnumDeclaration(modifiers, name, members);
    return withJSDoc(finishNode(node, pos), hasJSDoc);
  }
  function parseModuleBlock() {
    const pos = getNodePos();
    let statements;
    if (parseExpected(19 /* OpenBraceToken */)) {
      statements = parseList(1 /* BlockStatements */, parseStatement);
      parseExpected(20 /* CloseBraceToken */);
    } else {
      statements = createMissingList();
    }
    return finishNode(factory2.createModuleBlock(statements), pos);
  }
  function parseModuleOrNamespaceDeclaration(pos, hasJSDoc, modifiers, flags) {
    const namespaceFlag = flags & 32 /* Namespace */;
    const name = flags & 8 /* NestedNamespace */ ? parseIdentifierName() : parseIdentifier();
    const body = parseOptional(25 /* DotToken */) ? parseModuleOrNamespaceDeclaration(
      getNodePos(),
      /*hasJSDoc*/
      false,
      /*modifiers*/
      void 0,
      8 /* NestedNamespace */ | namespaceFlag
    ) : parseModuleBlock();
    const node = factory2.createModuleDeclaration(modifiers, name, body, flags);
    return withJSDoc(finishNode(node, pos), hasJSDoc);
  }
  function parseAmbientExternalModuleDeclaration(pos, hasJSDoc, modifiersIn) {
    let flags = 0;
    let name;
    if (token() === 162 /* GlobalKeyword */) {
      name = parseIdentifier();
      flags |= 2048 /* GlobalAugmentation */;
    } else {
      name = parseLiteralNode();
      name.text = internIdentifier(name.text);
    }
    let body;
    if (token() === 19 /* OpenBraceToken */) {
      body = parseModuleBlock();
    } else {
      parseSemicolon();
    }
    const node = factory2.createModuleDeclaration(modifiersIn, name, body, flags);
    return withJSDoc(finishNode(node, pos), hasJSDoc);
  }
  function parseModuleDeclaration(pos, hasJSDoc, modifiersIn) {
    let flags = 0;
    if (token() === 162 /* GlobalKeyword */) {
      return parseAmbientExternalModuleDeclaration(pos, hasJSDoc, modifiersIn);
    } else if (parseOptional(145 /* NamespaceKeyword */)) {
      flags |= 32 /* Namespace */;
    } else {
      parseExpected(144 /* ModuleKeyword */);
      if (token() === 11 /* StringLiteral */) {
        return parseAmbientExternalModuleDeclaration(pos, hasJSDoc, modifiersIn);
      }
    }
    return parseModuleOrNamespaceDeclaration(pos, hasJSDoc, modifiersIn, flags);
  }
  function isExternalModuleReference2() {
    return token() === 149 /* RequireKeyword */ && lookAhead(nextTokenIsOpenParen);
  }
  function nextTokenIsOpenParen() {
    return nextToken() === 21 /* OpenParenToken */;
  }
  function nextTokenIsOpenBrace() {
    return nextToken() === 19 /* OpenBraceToken */;
  }
  function nextTokenIsSlash() {
    return nextToken() === 44 /* SlashToken */;
  }
  function parseNamespaceExportDeclaration(pos, hasJSDoc, modifiers) {
    parseExpected(130 /* AsKeyword */);
    parseExpected(145 /* NamespaceKeyword */);
    const name = parseIdentifier();
    parseSemicolon();
    const node = factory2.createNamespaceExportDeclaration(name);
    node.modifiers = modifiers;
    return withJSDoc(finishNode(node, pos), hasJSDoc);
  }
  function parseImportDeclarationOrImportEqualsDeclaration(pos, hasJSDoc, modifiers) {
    parseExpected(102 /* ImportKeyword */);
    const afterImportPos = scanner2.getTokenFullStart();
    let identifier;
    if (isIdentifier2()) {
      identifier = parseIdentifier();
    }
    let phaseModifier;
    if ((identifier == null ? void 0 : identifier.escapedText) === "type" && (token() !== 161 /* FromKeyword */ || isIdentifier2() && lookAhead(nextTokenIsFromKeywordOrEqualsToken)) && (isIdentifier2() || tokenAfterImportDefinitelyProducesImportDeclaration())) {
      phaseModifier = 156 /* TypeKeyword */;
      identifier = isIdentifier2() ? parseIdentifier() : void 0;
    } else if ((identifier == null ? void 0 : identifier.escapedText) === "defer" && (token() === 161 /* FromKeyword */ ? !lookAhead(nextTokenIsStringLiteral) : token() !== 28 /* CommaToken */ && token() !== 64 /* EqualsToken */)) {
      phaseModifier = 166 /* DeferKeyword */;
      identifier = isIdentifier2() ? parseIdentifier() : void 0;
    }
    if (identifier && !tokenAfterImportedIdentifierDefinitelyProducesImportDeclaration() && phaseModifier !== 166 /* DeferKeyword */) {
      return parseImportEqualsDeclaration(pos, hasJSDoc, modifiers, identifier, phaseModifier === 156 /* TypeKeyword */);
    }
    const importClause = tryParseImportClause(
      identifier,
      afterImportPos,
      phaseModifier,
      /*skipJsDocLeadingAsterisks*/
      void 0
    );
    const moduleSpecifier = parseModuleSpecifier();
    const attributes = tryParseImportAttributes();
    parseSemicolon();
    const node = factory2.createImportDeclaration(modifiers, importClause, moduleSpecifier, attributes);
    return withJSDoc(finishNode(node, pos), hasJSDoc);
  }
  function tryParseImportClause(identifier, pos, phaseModifier, skipJsDocLeadingAsterisks = false) {
    let importClause;
    if (identifier || // import id
    token() === 42 /* AsteriskToken */ || // import *
    token() === 19 /* OpenBraceToken */) {
      importClause = parseImportClause(identifier, pos, phaseModifier, skipJsDocLeadingAsterisks);
      parseExpected(161 /* FromKeyword */);
    }
    return importClause;
  }
  function tryParseImportAttributes() {
    const currentToken2 = token();
    if (currentToken2 === 118 /* WithKeyword */ || currentToken2 === 132 /* AssertKeyword */ && !scanner2.hasPrecedingLineBreak()) {
      return parseImportAttributes(currentToken2);
    }
  }
  function parseImportAttribute() {
    const pos = getNodePos();
    const name = tokenIsIdentifierOrKeyword(token()) ? parseIdentifierName() : parseLiteralLikeNode(11 /* StringLiteral */);
    parseExpected(59 /* ColonToken */);
    const value = parseAssignmentExpressionOrHigher(
      /*allowReturnTypeInArrowFunction*/
      true
    );
    return finishNode(factory2.createImportAttribute(name, value), pos);
  }
  function parseImportAttributes(token2, skipKeyword) {
    const pos = getNodePos();
    if (!skipKeyword) {
      parseExpected(token2);
    }
    const openBracePosition = scanner2.getTokenStart();
    if (parseExpected(19 /* OpenBraceToken */)) {
      const multiLine = scanner2.hasPrecedingLineBreak();
      const elements = parseDelimitedList(
        24 /* ImportAttributes */,
        parseImportAttribute,
        /*considerSemicolonAsDelimiter*/
        true
      );
      if (!parseExpected(20 /* CloseBraceToken */)) {
        const lastError = lastOrUndefined(parseDiagnostics);
        if (lastError && lastError.code === Diagnostics._0_expected.code) {
          addRelatedInfo(
            lastError,
            createDetachedDiagnostic(fileName, sourceText, openBracePosition, 1, Diagnostics.The_parser_expected_to_find_a_1_to_match_the_0_token_here, "{", "}")
          );
        }
      }
      return finishNode(factory2.createImportAttributes(elements, multiLine, token2), pos);
    } else {
      const elements = createNodeArray(
        [],
        getNodePos(),
        /*end*/
        void 0,
        /*hasTrailingComma*/
        false
      );
      return finishNode(factory2.createImportAttributes(
        elements,
        /*multiLine*/
        false,
        token2
      ), pos);
    }
  }
  function tokenAfterImportDefinitelyProducesImportDeclaration() {
    return token() === 42 /* AsteriskToken */ || token() === 19 /* OpenBraceToken */;
  }
  function tokenAfterImportedIdentifierDefinitelyProducesImportDeclaration() {
    return token() === 28 /* CommaToken */ || token() === 161 /* FromKeyword */;
  }
  function parseImportEqualsDeclaration(pos, hasJSDoc, modifiers, identifier, isTypeOnly) {
    parseExpected(64 /* EqualsToken */);
    const moduleReference = parseModuleReference();
    parseSemicolon();
    const node = factory2.createImportEqualsDeclaration(modifiers, isTypeOnly, identifier, moduleReference);
    const finished = withJSDoc(finishNode(node, pos), hasJSDoc);
    return finished;
  }
  function parseImportClause(identifier, pos, phaseModifier, skipJsDocLeadingAsterisks) {
    let namedBindings;
    if (!identifier || parseOptional(28 /* CommaToken */)) {
      if (skipJsDocLeadingAsterisks) scanner2.setSkipJsDocLeadingAsterisks(true);
      if (token() === 42 /* AsteriskToken */) {
        namedBindings = parseNamespaceImport();
      } else {
        namedBindings = parseNamedImportsOrExports(276 /* NamedImports */);
      }
      if (skipJsDocLeadingAsterisks) scanner2.setSkipJsDocLeadingAsterisks(false);
    }
    return finishNode(factory2.createImportClause(phaseModifier, identifier, namedBindings), pos);
  }
  function parseModuleReference() {
    return isExternalModuleReference2() ? parseExternalModuleReference() : parseEntityName(
      /*allowReservedWords*/
      false
    );
  }
  function parseExternalModuleReference() {
    const pos = getNodePos();
    parseExpected(149 /* RequireKeyword */);
    parseExpected(21 /* OpenParenToken */);
    const expression = parseModuleSpecifier();
    parseExpected(22 /* CloseParenToken */);
    return finishNode(factory2.createExternalModuleReference(expression), pos);
  }
  function parseModuleSpecifier() {
    if (token() === 11 /* StringLiteral */) {
      const result = parseLiteralNode();
      result.text = internIdentifier(result.text);
      return result;
    } else {
      return parseExpression();
    }
  }
  function parseNamespaceImport() {
    const pos = getNodePos();
    parseExpected(42 /* AsteriskToken */);
    parseExpected(130 /* AsKeyword */);
    const name = parseIdentifier();
    return finishNode(factory2.createNamespaceImport(name), pos);
  }
  function canParseModuleExportName() {
    return tokenIsIdentifierOrKeyword(token()) || token() === 11 /* StringLiteral */;
  }
  function parseModuleExportName(parseName) {
    return token() === 11 /* StringLiteral */ ? parseLiteralNode() : parseName();
  }
  function parseNamedImportsOrExports(kind) {
    const pos = getNodePos();
    const node = kind === 276 /* NamedImports */ ? factory2.createNamedImports(parseBracketedList(23 /* ImportOrExportSpecifiers */, parseImportSpecifier, 19 /* OpenBraceToken */, 20 /* CloseBraceToken */)) : factory2.createNamedExports(parseBracketedList(23 /* ImportOrExportSpecifiers */, parseExportSpecifier, 19 /* OpenBraceToken */, 20 /* CloseBraceToken */));
    return finishNode(node, pos);
  }
  function parseExportSpecifier() {
    const hasJSDoc = hasPrecedingJSDocComment();
    return withJSDoc(parseImportOrExportSpecifier(282 /* ExportSpecifier */), hasJSDoc);
  }
  function parseImportSpecifier() {
    return parseImportOrExportSpecifier(277 /* ImportSpecifier */);
  }
  function parseImportOrExportSpecifier(kind) {
    const pos = getNodePos();
    let checkIdentifierIsKeyword = isKeyword(token()) && !isIdentifier2();
    let checkIdentifierStart = scanner2.getTokenStart();
    let checkIdentifierEnd = scanner2.getTokenEnd();
    let isTypeOnly = false;
    let propertyName;
    let canParseAsKeyword = true;
    let name = parseModuleExportName(parseIdentifierName);
    if (name.kind === 80 /* Identifier */ && name.escapedText === "type") {
      if (token() === 130 /* AsKeyword */) {
        const firstAs = parseIdentifierName();
        if (token() === 130 /* AsKeyword */) {
          const secondAs = parseIdentifierName();
          if (canParseModuleExportName()) {
            isTypeOnly = true;
            propertyName = firstAs;
            name = parseModuleExportName(parseNameWithKeywordCheck);
            canParseAsKeyword = false;
          } else {
            propertyName = name;
            name = secondAs;
            canParseAsKeyword = false;
          }
        } else if (canParseModuleExportName()) {
          propertyName = name;
          canParseAsKeyword = false;
          name = parseModuleExportName(parseNameWithKeywordCheck);
        } else {
          isTypeOnly = true;
          name = firstAs;
        }
      } else if (canParseModuleExportName()) {
        isTypeOnly = true;
        name = parseModuleExportName(parseNameWithKeywordCheck);
      }
    }
    if (canParseAsKeyword && token() === 130 /* AsKeyword */) {
      propertyName = name;
      parseExpected(130 /* AsKeyword */);
      name = parseModuleExportName(parseNameWithKeywordCheck);
    }
    if (kind === 277 /* ImportSpecifier */) {
      if (name.kind !== 80 /* Identifier */) {
        parseErrorAt(skipTrivia(sourceText, name.pos), name.end, Diagnostics.Identifier_expected);
        name = setTextRangePosEnd(createMissingNode(
          80 /* Identifier */,
          /*reportAtCurrentPosition*/
          false
        ), name.pos, name.pos);
      } else if (checkIdentifierIsKeyword) {
        parseErrorAt(checkIdentifierStart, checkIdentifierEnd, Diagnostics.Identifier_expected);
      }
    }
    const node = kind === 277 /* ImportSpecifier */ ? factory2.createImportSpecifier(isTypeOnly, propertyName, name) : factory2.createExportSpecifier(isTypeOnly, propertyName, name);
    return finishNode(node, pos);
    function parseNameWithKeywordCheck() {
      checkIdentifierIsKeyword = isKeyword(token()) && !isIdentifier2();
      checkIdentifierStart = scanner2.getTokenStart();
      checkIdentifierEnd = scanner2.getTokenEnd();
      return parseIdentifierName();
    }
  }
  function parseNamespaceExport(pos) {
    return finishNode(factory2.createNamespaceExport(parseModuleExportName(parseIdentifierName)), pos);
  }
  function parseExportDeclaration(pos, hasJSDoc, modifiers) {
    const savedAwaitContext = inAwaitContext();
    setAwaitContext(
      /*value*/
      true
    );
    let exportClause;
    let moduleSpecifier;
    let attributes;
    const isTypeOnly = parseOptional(156 /* TypeKeyword */);
    const namespaceExportPos = getNodePos();
    if (parseOptional(42 /* AsteriskToken */)) {
      if (parseOptional(130 /* AsKeyword */)) {
        exportClause = parseNamespaceExport(namespaceExportPos);
      }
      parseExpected(161 /* FromKeyword */);
      moduleSpecifier = parseModuleSpecifier();
    } else {
      exportClause = parseNamedImportsOrExports(280 /* NamedExports */);
      if (token() === 161 /* FromKeyword */ || token() === 11 /* StringLiteral */ && !scanner2.hasPrecedingLineBreak()) {
        parseExpected(161 /* FromKeyword */);
        moduleSpecifier = parseModuleSpecifier();
      }
    }
    const currentToken2 = token();
    if (moduleSpecifier && (currentToken2 === 118 /* WithKeyword */ || currentToken2 === 132 /* AssertKeyword */) && !scanner2.hasPrecedingLineBreak()) {
      attributes = parseImportAttributes(currentToken2);
    }
    parseSemicolon();
    setAwaitContext(savedAwaitContext);
    const node = factory2.createExportDeclaration(modifiers, isTypeOnly, exportClause, moduleSpecifier, attributes);
    return withJSDoc(finishNode(node, pos), hasJSDoc);
  }
  function parseExportAssignment(pos, hasJSDoc, modifiers) {
    const savedAwaitContext = inAwaitContext();
    setAwaitContext(
      /*value*/
      true
    );
    let isExportEquals;
    if (parseOptional(64 /* EqualsToken */)) {
      isExportEquals = true;
    } else {
      parseExpected(90 /* DefaultKeyword */);
    }
    const expression = parseAssignmentExpressionOrHigher(
      /*allowReturnTypeInArrowFunction*/
      true
    );
    parseSemicolon();
    setAwaitContext(savedAwaitContext);
    const node = factory2.createExportAssignment(modifiers, isExportEquals, expression);
    return withJSDoc(finishNode(node, pos), hasJSDoc);
  }
  let ParsingContext;
  ((ParsingContext2) => {
    ParsingContext2[ParsingContext2["SourceElements"] = 0] = "SourceElements";
    ParsingContext2[ParsingContext2["BlockStatements"] = 1] = "BlockStatements";
    ParsingContext2[ParsingContext2["SwitchClauses"] = 2] = "SwitchClauses";
    ParsingContext2[ParsingContext2["SwitchClauseStatements"] = 3] = "SwitchClauseStatements";
    ParsingContext2[ParsingContext2["TypeMembers"] = 4] = "TypeMembers";
    ParsingContext2[ParsingContext2["ClassMembers"] = 5] = "ClassMembers";
    ParsingContext2[ParsingContext2["EnumMembers"] = 6] = "EnumMembers";
    ParsingContext2[ParsingContext2["HeritageClauseElement"] = 7] = "HeritageClauseElement";
    ParsingContext2[ParsingContext2["VariableDeclarations"] = 8] = "VariableDeclarations";
    ParsingContext2[ParsingContext2["ObjectBindingElements"] = 9] = "ObjectBindingElements";
    ParsingContext2[ParsingContext2["ArrayBindingElements"] = 10] = "ArrayBindingElements";
    ParsingContext2[ParsingContext2["ArgumentExpressions"] = 11] = "ArgumentExpressions";
    ParsingContext2[ParsingContext2["ObjectLiteralMembers"] = 12] = "ObjectLiteralMembers";
    ParsingContext2[ParsingContext2["JsxAttributes"] = 13] = "JsxAttributes";
    ParsingContext2[ParsingContext2["JsxChildren"] = 14] = "JsxChildren";
    ParsingContext2[ParsingContext2["ArrayLiteralMembers"] = 15] = "ArrayLiteralMembers";
    ParsingContext2[ParsingContext2["Parameters"] = 16] = "Parameters";
    ParsingContext2[ParsingContext2["JSDocParameters"] = 17] = "JSDocParameters";
    ParsingContext2[ParsingContext2["RestProperties"] = 18] = "RestProperties";
    ParsingContext2[ParsingContext2["TypeParameters"] = 19] = "TypeParameters";
    ParsingContext2[ParsingContext2["TypeArguments"] = 20] = "TypeArguments";
    ParsingContext2[ParsingContext2["TupleElementTypes"] = 21] = "TupleElementTypes";
    ParsingContext2[ParsingContext2["HeritageClauses"] = 22] = "HeritageClauses";
    ParsingContext2[ParsingContext2["ImportOrExportSpecifiers"] = 23] = "ImportOrExportSpecifiers";
    ParsingContext2[ParsingContext2["ImportAttributes"] = 24] = "ImportAttributes";
    ParsingContext2[ParsingContext2["JSDocComment"] = 25] = "JSDocComment";
    ParsingContext2[ParsingContext2["Count"] = 26] = "Count";
  })(ParsingContext || (ParsingContext = {}));
  let Tristate;
  ((Tristate2) => {
    Tristate2[Tristate2["False"] = 0] = "False";
    Tristate2[Tristate2["True"] = 1] = "True";
    Tristate2[Tristate2["Unknown"] = 2] = "Unknown";
  })(Tristate || (Tristate = {}));
  let JSDocParser;
  ((JSDocParser2) => {
    function parseJSDocTypeExpressionForTests2(content, start, length2) {
      initializeState(
        "file.js",
        content,
        99 /* Latest */,
        /*syntaxCursor*/
        void 0,
        1 /* JS */,
        0 /* ParseAll */
      );
      scanner2.setText(content, start, length2);
      currentToken = scanner2.scan();
      const jsDocTypeExpression = parseJSDocTypeExpression();
      const sourceFile = createSourceFile2(
        "file.js",
        99 /* Latest */,
        1 /* JS */,
        /*isDeclarationFile*/
        false,
        [],
        factoryCreateToken(1 /* EndOfFileToken */),
        0 /* None */,
        noop
      );
      const diagnostics = attachFileToDiagnostics(parseDiagnostics, sourceFile);
      if (jsDocDiagnostics) {
        sourceFile.jsDocDiagnostics = attachFileToDiagnostics(jsDocDiagnostics, sourceFile);
      }
      clearState();
      return jsDocTypeExpression ? { jsDocTypeExpression, diagnostics } : void 0;
    }
    JSDocParser2.parseJSDocTypeExpressionForTests = parseJSDocTypeExpressionForTests2;
    function parseJSDocTypeExpression(mayOmitBraces) {
      const pos = getNodePos();
      const hasBrace = (mayOmitBraces ? parseOptional : parseExpected)(19 /* OpenBraceToken */);
      const type = doInsideOfContext(16777216 /* JSDoc */, parseJSDocType);
      if (!mayOmitBraces || hasBrace) {
        parseExpectedJSDoc(20 /* CloseBraceToken */);
      }
      const result = factory2.createJSDocTypeExpression(type);
      fixupParentReferences(result);
      return finishNode(result, pos);
    }
    JSDocParser2.parseJSDocTypeExpression = parseJSDocTypeExpression;
    function parseJSDocNameReference() {
      const pos = getNodePos();
      const hasBrace = parseOptional(19 /* OpenBraceToken */);
      const p2 = getNodePos();
      let entityName = parseEntityName(
        /*allowReservedWords*/
        false
      );
      while (token() === 81 /* PrivateIdentifier */) {
        reScanHashToken();
        nextTokenJSDoc();
        entityName = finishNode(factory2.createJSDocMemberName(entityName, parseIdentifier()), p2);
      }
      if (hasBrace) {
        parseExpectedJSDoc(20 /* CloseBraceToken */);
      }
      const result = factory2.createJSDocNameReference(entityName);
      fixupParentReferences(result);
      return finishNode(result, pos);
    }
    JSDocParser2.parseJSDocNameReference = parseJSDocNameReference;
    function parseIsolatedJSDocComment2(content, start, length2) {
      initializeState(
        "",
        content,
        99 /* Latest */,
        /*syntaxCursor*/
        void 0,
        1 /* JS */,
        0 /* ParseAll */
      );
      const jsDoc = doInsideOfContext(16777216 /* JSDoc */, () => parseJSDocCommentWorker(start, length2));
      const sourceFile = { languageVariant: 0 /* Standard */, text: content };
      const diagnostics = attachFileToDiagnostics(parseDiagnostics, sourceFile);
      clearState();
      return jsDoc ? { jsDoc, diagnostics } : void 0;
    }
    JSDocParser2.parseIsolatedJSDocComment = parseIsolatedJSDocComment2;
    function parseJSDocComment(parent2, start, length2) {
      const saveToken = currentToken;
      const saveParseDiagnosticsLength = parseDiagnostics.length;
      const saveParseErrorBeforeNextFinishedNode = parseErrorBeforeNextFinishedNode;
      const comment = doInsideOfContext(16777216 /* JSDoc */, () => parseJSDocCommentWorker(start, length2));
      setParent(comment, parent2);
      if (contextFlags & 524288 /* JavaScriptFile */) {
        if (!jsDocDiagnostics) {
          jsDocDiagnostics = [];
        }
        addRange(jsDocDiagnostics, parseDiagnostics, saveParseDiagnosticsLength);
      }
      currentToken = saveToken;
      parseDiagnostics.length = saveParseDiagnosticsLength;
      parseErrorBeforeNextFinishedNode = saveParseErrorBeforeNextFinishedNode;
      return comment;
    }
    JSDocParser2.parseJSDocComment = parseJSDocComment;
    let JSDocState;
    ((JSDocState2) => {
      JSDocState2[JSDocState2["BeginningOfLine"] = 0] = "BeginningOfLine";
      JSDocState2[JSDocState2["SawAsterisk"] = 1] = "SawAsterisk";
      JSDocState2[JSDocState2["SavingComments"] = 2] = "SavingComments";
      JSDocState2[JSDocState2["SavingBackticks"] = 3] = "SavingBackticks";
    })(JSDocState || (JSDocState = {}));
    let PropertyLikeParse;
    ((PropertyLikeParse2) => {
      PropertyLikeParse2[PropertyLikeParse2["Property"] = 1] = "Property";
      PropertyLikeParse2[PropertyLikeParse2["Parameter"] = 2] = "Parameter";
      PropertyLikeParse2[PropertyLikeParse2["CallbackParameter"] = 4] = "CallbackParameter";
    })(PropertyLikeParse || (PropertyLikeParse = {}));
    function parseJSDocCommentWorker(start = 0, length2) {
      const content = sourceText;
      const end = length2 === void 0 ? content.length : start + length2;
      length2 = end - start;
      Debug.assert(start >= 0);
      Debug.assert(start <= end);
      Debug.assert(end <= content.length);
      if (!isJSDocLikeText(content, start)) {
        return void 0;
      }
      let tags;
      let tagsPos;
      let tagsEnd;
      let linkEnd;
      let commentsPos;
      let comments = [];
      const parts = [];
      const saveParsingContext = parsingContext;
      parsingContext |= 1 << 25 /* JSDocComment */;
      const result = scanner2.scanRange(start + 3, length2 - 5, doJSDocScan);
      parsingContext = saveParsingContext;
      return result;
      function doJSDocScan() {
        let state = 1 /* SawAsterisk */;
        let margin;
        let indent3 = start - (content.lastIndexOf("\n", start) + 1) + 4;
        function pushComment(text) {
          if (!margin) {
            margin = indent3;
          }
          comments.push(text);
          indent3 += text.length;
        }
        nextTokenJSDoc();
        while (parseOptionalJsdoc(5 /* WhitespaceTrivia */)) ;
        if (parseOptionalJsdoc(4 /* NewLineTrivia */)) {
          state = 0 /* BeginningOfLine */;
          indent3 = 0;
        }
        loop:
          while (true) {
            switch (token()) {
              case 60 /* AtToken */:
                removeTrailingWhitespace(comments);
                if (!commentsPos) commentsPos = getNodePos();
                addTag(parseTag(indent3));
                state = 0 /* BeginningOfLine */;
                margin = void 0;
                break;
              case 4 /* NewLineTrivia */:
                comments.push(scanner2.getTokenText());
                state = 0 /* BeginningOfLine */;
                indent3 = 0;
                break;
              case 42 /* AsteriskToken */:
                const asterisk = scanner2.getTokenText();
                if (state === 1 /* SawAsterisk */) {
                  state = 2 /* SavingComments */;
                  pushComment(asterisk);
                } else {
                  Debug.assert(state === 0 /* BeginningOfLine */);
                  state = 1 /* SawAsterisk */;
                  indent3 += asterisk.length;
                }
                break;
              case 5 /* WhitespaceTrivia */:
                Debug.assert(state !== 2 /* SavingComments */, "whitespace shouldn't come from the scanner while saving top-level comment text");
                const whitespace = scanner2.getTokenText();
                if (margin !== void 0 && indent3 + whitespace.length > margin) {
                  comments.push(whitespace.slice(margin - indent3));
                }
                indent3 += whitespace.length;
                break;
              case 1 /* EndOfFileToken */:
                break loop;
              case 82 /* JSDocCommentTextToken */:
                state = 2 /* SavingComments */;
                pushComment(scanner2.getTokenValue());
                break;
              case 19 /* OpenBraceToken */:
                state = 2 /* SavingComments */;
                const commentEnd = scanner2.getTokenFullStart();
                const linkStart = scanner2.getTokenEnd() - 1;
                const link = parseJSDocLink(linkStart);
                if (link) {
                  if (!linkEnd) {
                    removeLeadingNewlines(comments);
                  }
                  parts.push(finishNode(factory2.createJSDocText(comments.join("")), linkEnd ?? start, commentEnd));
                  parts.push(link);
                  comments = [];
                  linkEnd = scanner2.getTokenEnd();
                  break;
                }
              // fallthrough if it's not a {@link sequence
              default:
                state = 2 /* SavingComments */;
                pushComment(scanner2.getTokenText());
                break;
            }
            if (state === 2 /* SavingComments */) {
              nextJSDocCommentTextToken(
                /*inBackticks*/
                false
              );
            } else {
              nextTokenJSDoc();
            }
          }
        const trimmedComments = comments.join("").trimEnd();
        if (parts.length && trimmedComments.length) {
          parts.push(finishNode(factory2.createJSDocText(trimmedComments), linkEnd ?? start, commentsPos));
        }
        if (parts.length && tags) Debug.assertIsDefined(commentsPos, "having parsed tags implies that the end of the comment span should be set");
        const tagsArray = tags && createNodeArray(tags, tagsPos, tagsEnd);
        return finishNode(factory2.createJSDocComment(parts.length ? createNodeArray(parts, start, commentsPos) : trimmedComments.length ? trimmedComments : void 0, tagsArray), start, end);
      }
      function removeLeadingNewlines(comments2) {
        while (comments2.length && (comments2[0] === "\n" || comments2[0] === "\r")) {
          comments2.shift();
        }
      }
      function removeTrailingWhitespace(comments2) {
        while (comments2.length) {
          const trimmed = comments2[comments2.length - 1].trimEnd();
          if (trimmed === "") {
            comments2.pop();
          } else if (trimmed.length < comments2[comments2.length - 1].length) {
            comments2[comments2.length - 1] = trimmed;
            break;
          } else {
            break;
          }
        }
      }
      function isNextNonwhitespaceTokenEndOfFile() {
        while (true) {
          nextTokenJSDoc();
          if (token() === 1 /* EndOfFileToken */) {
            return true;
          }
          if (!(token() === 5 /* WhitespaceTrivia */ || token() === 4 /* NewLineTrivia */)) {
            return false;
          }
        }
      }
      function skipWhitespace() {
        if (token() === 5 /* WhitespaceTrivia */ || token() === 4 /* NewLineTrivia */) {
          if (lookAhead(isNextNonwhitespaceTokenEndOfFile)) {
            return;
          }
        }
        while (token() === 5 /* WhitespaceTrivia */ || token() === 4 /* NewLineTrivia */) {
          nextTokenJSDoc();
        }
      }
      function skipWhitespaceOrAsterisk() {
        if (token() === 5 /* WhitespaceTrivia */ || token() === 4 /* NewLineTrivia */) {
          if (lookAhead(isNextNonwhitespaceTokenEndOfFile)) {
            return "";
          }
        }
        let precedingLineBreak = scanner2.hasPrecedingLineBreak();
        let seenLineBreak = false;
        let indentText = "";
        while (precedingLineBreak && token() === 42 /* AsteriskToken */ || token() === 5 /* WhitespaceTrivia */ || token() === 4 /* NewLineTrivia */) {
          indentText += scanner2.getTokenText();
          if (token() === 4 /* NewLineTrivia */) {
            precedingLineBreak = true;
            seenLineBreak = true;
            indentText = "";
          } else if (token() === 42 /* AsteriskToken */) {
            precedingLineBreak = false;
          }
          nextTokenJSDoc();
        }
        return seenLineBreak ? indentText : "";
      }
      function parseTag(margin) {
        Debug.assert(token() === 60 /* AtToken */);
        const start2 = scanner2.getTokenStart();
        nextTokenJSDoc();
        const tagName = parseJSDocIdentifierName(
          /*message*/
          void 0
        );
        const indentText = skipWhitespaceOrAsterisk();
        let tag;
        switch (tagName.escapedText) {
          case "author":
            tag = parseAuthorTag(start2, tagName, margin, indentText);
            break;
          case "implements":
            tag = parseImplementsTag(start2, tagName, margin, indentText);
            break;
          case "augments":
          case "extends":
            tag = parseAugmentsTag(start2, tagName, margin, indentText);
            break;
          case "class":
          case "constructor":
            tag = parseSimpleTag(start2, factory2.createJSDocClassTag, tagName, margin, indentText);
            break;
          case "public":
            tag = parseSimpleTag(start2, factory2.createJSDocPublicTag, tagName, margin, indentText);
            break;
          case "private":
            tag = parseSimpleTag(start2, factory2.createJSDocPrivateTag, tagName, margin, indentText);
            break;
          case "protected":
            tag = parseSimpleTag(start2, factory2.createJSDocProtectedTag, tagName, margin, indentText);
            break;
          case "readonly":
            tag = parseSimpleTag(start2, factory2.createJSDocReadonlyTag, tagName, margin, indentText);
            break;
          case "override":
            tag = parseSimpleTag(start2, factory2.createJSDocOverrideTag, tagName, margin, indentText);
            break;
          case "deprecated":
            hasDeprecatedTag = true;
            tag = parseSimpleTag(start2, factory2.createJSDocDeprecatedTag, tagName, margin, indentText);
            break;
          case "this":
            tag = parseThisTag(start2, tagName, margin, indentText);
            break;
          case "enum":
            tag = parseEnumTag(start2, tagName, margin, indentText);
            break;
          case "arg":
          case "argument":
          case "param":
            return parseParameterOrPropertyTag(start2, tagName, 2 /* Parameter */, margin);
          case "return":
          case "returns":
            tag = parseReturnTag(start2, tagName, margin, indentText);
            break;
          case "template":
            tag = parseTemplateTag(start2, tagName, margin, indentText);
            break;
          case "type":
            tag = parseTypeTag(start2, tagName, margin, indentText);
            break;
          case "typedef":
            tag = parseTypedefTag(start2, tagName, margin, indentText);
            break;
          case "callback":
            tag = parseCallbackTag(start2, tagName, margin, indentText);
            break;
          case "overload":
            tag = parseOverloadTag(start2, tagName, margin, indentText);
            break;
          case "satisfies":
            tag = parseSatisfiesTag(start2, tagName, margin, indentText);
            break;
          case "see":
            tag = parseSeeTag(start2, tagName, margin, indentText);
            break;
          case "exception":
          case "throws":
            tag = parseThrowsTag(start2, tagName, margin, indentText);
            break;
          case "import":
            tag = parseImportTag(start2, tagName, margin, indentText);
            break;
          default:
            tag = parseUnknownTag(start2, tagName, margin, indentText);
            break;
        }
        return tag;
      }
      function parseTrailingTagComments(pos, end2, margin, indentText) {
        if (!indentText) {
          margin += end2 - pos;
        }
        return parseTagComments(margin, indentText.slice(margin));
      }
      function parseTagComments(indent3, initialMargin) {
        const commentsPos2 = getNodePos();
        let comments2 = [];
        const parts2 = [];
        let linkEnd2;
        let state = 0 /* BeginningOfLine */;
        let margin;
        function pushComment(text) {
          if (!margin) {
            margin = indent3;
          }
          comments2.push(text);
          indent3 += text.length;
        }
        if (initialMargin !== void 0) {
          if (initialMargin !== "") {
            pushComment(initialMargin);
          }
          state = 1 /* SawAsterisk */;
        }
        let tok = token();
        loop:
          while (true) {
            switch (tok) {
              case 4 /* NewLineTrivia */:
                state = 0 /* BeginningOfLine */;
                comments2.push(scanner2.getTokenText());
                indent3 = 0;
                break;
              case 60 /* AtToken */:
                scanner2.resetTokenState(scanner2.getTokenEnd() - 1);
                break loop;
              case 1 /* EndOfFileToken */:
                break loop;
              case 5 /* WhitespaceTrivia */:
                Debug.assert(state !== 2 /* SavingComments */ && state !== 3 /* SavingBackticks */, "whitespace shouldn't come from the scanner while saving comment text");
                const whitespace = scanner2.getTokenText();
                if (margin !== void 0 && indent3 + whitespace.length > margin) {
                  comments2.push(whitespace.slice(margin - indent3));
                  state = 2 /* SavingComments */;
                }
                indent3 += whitespace.length;
                break;
              case 19 /* OpenBraceToken */:
                state = 2 /* SavingComments */;
                const commentEnd = scanner2.getTokenFullStart();
                const linkStart = scanner2.getTokenEnd() - 1;
                const link = parseJSDocLink(linkStart);
                if (link) {
                  parts2.push(finishNode(factory2.createJSDocText(comments2.join("")), linkEnd2 ?? commentsPos2, commentEnd));
                  parts2.push(link);
                  comments2 = [];
                  linkEnd2 = scanner2.getTokenEnd();
                } else {
                  pushComment(scanner2.getTokenText());
                }
                break;
              case 62 /* BacktickToken */:
                if (state === 3 /* SavingBackticks */) {
                  state = 2 /* SavingComments */;
                } else {
                  state = 3 /* SavingBackticks */;
                }
                pushComment(scanner2.getTokenText());
                break;
              case 82 /* JSDocCommentTextToken */:
                if (state !== 3 /* SavingBackticks */) {
                  state = 2 /* SavingComments */;
                }
                pushComment(scanner2.getTokenValue());
                break;
              case 42 /* AsteriskToken */:
                if (state === 0 /* BeginningOfLine */) {
                  state = 1 /* SawAsterisk */;
                  indent3 += 1;
                  break;
                }
              // record the * as a comment
              // falls through
              default:
                if (state !== 3 /* SavingBackticks */) {
                  state = 2 /* SavingComments */;
                }
                pushComment(scanner2.getTokenText());
                break;
            }
            if (state === 2 /* SavingComments */ || state === 3 /* SavingBackticks */) {
              tok = nextJSDocCommentTextToken(state === 3 /* SavingBackticks */);
            } else {
              tok = nextTokenJSDoc();
            }
          }
        removeLeadingNewlines(comments2);
        const trimmedComments = comments2.join("").trimEnd();
        if (parts2.length) {
          if (trimmedComments.length) {
            parts2.push(finishNode(factory2.createJSDocText(trimmedComments), linkEnd2 ?? commentsPos2));
          }
          return createNodeArray(parts2, commentsPos2, scanner2.getTokenEnd());
        } else if (trimmedComments.length) {
          return trimmedComments;
        }
      }
      function parseJSDocLink(start2) {
        const linkType = tryParse(parseJSDocLinkPrefix);
        if (!linkType) {
          return void 0;
        }
        nextTokenJSDoc();
        skipWhitespace();
        const name = parseJSDocLinkName();
        const text = [];
        while (token() !== 20 /* CloseBraceToken */ && token() !== 4 /* NewLineTrivia */ && token() !== 1 /* EndOfFileToken */) {
          text.push(scanner2.getTokenText());
          nextTokenJSDoc();
        }
        const create = linkType === "link" ? factory2.createJSDocLink : linkType === "linkcode" ? factory2.createJSDocLinkCode : factory2.createJSDocLinkPlain;
        return finishNode(create(name, text.join("")), start2, scanner2.getTokenEnd());
      }
      function parseJSDocLinkName() {
        if (tokenIsIdentifierOrKeyword(token())) {
          const pos = getNodePos();
          let name = parseIdentifierName();
          while (parseOptional(25 /* DotToken */)) {
            name = finishNode(factory2.createQualifiedName(name, token() === 81 /* PrivateIdentifier */ ? createMissingNode(
              80 /* Identifier */,
              /*reportAtCurrentPosition*/
              false
            ) : parseIdentifierName()), pos);
          }
          while (token() === 81 /* PrivateIdentifier */) {
            reScanHashToken();
            nextTokenJSDoc();
            name = finishNode(factory2.createJSDocMemberName(name, parseIdentifier()), pos);
          }
          return name;
        }
        return void 0;
      }
      function parseJSDocLinkPrefix() {
        skipWhitespaceOrAsterisk();
        if (token() === 19 /* OpenBraceToken */ && nextTokenJSDoc() === 60 /* AtToken */ && tokenIsIdentifierOrKeyword(nextTokenJSDoc())) {
          const kind = scanner2.getTokenValue();
          if (isJSDocLinkTag(kind)) return kind;
        }
      }
      function isJSDocLinkTag(kind) {
        return kind === "link" || kind === "linkcode" || kind === "linkplain";
      }
      function parseUnknownTag(start2, tagName, indent3, indentText) {
        return finishNode(factory2.createJSDocUnknownTag(tagName, parseTrailingTagComments(start2, getNodePos(), indent3, indentText)), start2);
      }
      function addTag(tag) {
        if (!tag) {
          return;
        }
        if (!tags) {
          tags = [tag];
          tagsPos = tag.pos;
        } else {
          tags.push(tag);
        }
        tagsEnd = tag.end;
      }
      function tryParseTypeExpression() {
        skipWhitespaceOrAsterisk();
        return token() === 19 /* OpenBraceToken */ ? parseJSDocTypeExpression() : void 0;
      }
      function parseBracketNameInPropertyAndParamTag() {
        const isBracketed = parseOptionalJsdoc(23 /* OpenBracketToken */);
        if (isBracketed) {
          skipWhitespace();
        }
        const isBackquoted = parseOptionalJsdoc(62 /* BacktickToken */);
        const name = parseJSDocEntityName();
        if (isBackquoted) {
          parseExpectedTokenJSDoc(62 /* BacktickToken */);
        }
        if (isBracketed) {
          skipWhitespace();
          if (parseOptionalToken(64 /* EqualsToken */)) {
            parseExpression();
          }
          parseExpected(24 /* CloseBracketToken */);
        }
        return { name, isBracketed };
      }
      function isObjectOrObjectArrayTypeReference(node) {
        switch (node.kind) {
          case 151 /* ObjectKeyword */:
            return true;
          case 189 /* ArrayType */:
            return isObjectOrObjectArrayTypeReference(node.elementType);
          default:
            return isTypeReferenceNode(node) && isIdentifier(node.typeName) && node.typeName.escapedText === "Object" && !node.typeArguments;
        }
      }
      function parseParameterOrPropertyTag(start2, tagName, target, indent3) {
        let typeExpression = tryParseTypeExpression();
        let isNameFirst = !typeExpression;
        skipWhitespaceOrAsterisk();
        const { name, isBracketed } = parseBracketNameInPropertyAndParamTag();
        const indentText = skipWhitespaceOrAsterisk();
        if (isNameFirst && !lookAhead(parseJSDocLinkPrefix)) {
          typeExpression = tryParseTypeExpression();
        }
        const comment = parseTrailingTagComments(start2, getNodePos(), indent3, indentText);
        const nestedTypeLiteral = parseNestedTypeLiteral(typeExpression, name, target, indent3);
        if (nestedTypeLiteral) {
          typeExpression = nestedTypeLiteral;
          isNameFirst = true;
        }
        const result2 = target === 1 /* Property */ ? factory2.createJSDocPropertyTag(tagName, name, isBracketed, typeExpression, isNameFirst, comment) : factory2.createJSDocParameterTag(tagName, name, isBracketed, typeExpression, isNameFirst, comment);
        return finishNode(result2, start2);
      }
      function parseNestedTypeLiteral(typeExpression, name, target, indent3) {
        if (typeExpression && isObjectOrObjectArrayTypeReference(typeExpression.type)) {
          const pos = getNodePos();
          let child;
          let children;
          while (child = tryParse(() => parseChildParameterOrPropertyTag(target, indent3, name))) {
            if (child.kind === 342 /* JSDocParameterTag */ || child.kind === 349 /* JSDocPropertyTag */) {
              children = append(children, child);
            } else if (child.kind === 346 /* JSDocTemplateTag */) {
              parseErrorAtRange(child.tagName, Diagnostics.A_JSDoc_template_tag_may_not_follow_a_typedef_callback_or_overload_tag);
            }
          }
          if (children) {
            const literal = finishNode(factory2.createJSDocTypeLiteral(children, typeExpression.type.kind === 189 /* ArrayType */), pos);
            return finishNode(factory2.createJSDocTypeExpression(literal), pos);
          }
        }
      }
      function parseReturnTag(start2, tagName, indent3, indentText) {
        if (some(tags, isJSDocReturnTag)) {
          parseErrorAt(tagName.pos, scanner2.getTokenStart(), Diagnostics._0_tag_already_specified, unescapeLeadingUnderscores(tagName.escapedText));
        }
        const typeExpression = tryParseTypeExpression();
        return finishNode(factory2.createJSDocReturnTag(tagName, typeExpression, parseTrailingTagComments(start2, getNodePos(), indent3, indentText)), start2);
      }
      function parseTypeTag(start2, tagName, indent3, indentText) {
        if (some(tags, isJSDocTypeTag)) {
          parseErrorAt(tagName.pos, scanner2.getTokenStart(), Diagnostics._0_tag_already_specified, unescapeLeadingUnderscores(tagName.escapedText));
        }
        const typeExpression = parseJSDocTypeExpression(
          /*mayOmitBraces*/
          true
        );
        const comments2 = indent3 !== void 0 && indentText !== void 0 ? parseTrailingTagComments(start2, getNodePos(), indent3, indentText) : void 0;
        return finishNode(factory2.createJSDocTypeTag(tagName, typeExpression, comments2), start2);
      }
      function parseSeeTag(start2, tagName, indent3, indentText) {
        const isMarkdownOrJSDocLink = token() === 23 /* OpenBracketToken */ || lookAhead(() => nextTokenJSDoc() === 60 /* AtToken */ && tokenIsIdentifierOrKeyword(nextTokenJSDoc()) && isJSDocLinkTag(scanner2.getTokenValue()));
        const nameExpression = isMarkdownOrJSDocLink ? void 0 : parseJSDocNameReference();
        const comments2 = indent3 !== void 0 && indentText !== void 0 ? parseTrailingTagComments(start2, getNodePos(), indent3, indentText) : void 0;
        return finishNode(factory2.createJSDocSeeTag(tagName, nameExpression, comments2), start2);
      }
      function parseThrowsTag(start2, tagName, indent3, indentText) {
        const typeExpression = tryParseTypeExpression();
        const comment = parseTrailingTagComments(start2, getNodePos(), indent3, indentText);
        return finishNode(factory2.createJSDocThrowsTag(tagName, typeExpression, comment), start2);
      }
      function parseAuthorTag(start2, tagName, indent3, indentText) {
        const commentStart = getNodePos();
        const textOnly = parseAuthorNameAndEmail();
        let commentEnd = scanner2.getTokenFullStart();
        const comments2 = parseTrailingTagComments(start2, commentEnd, indent3, indentText);
        if (!comments2) {
          commentEnd = scanner2.getTokenFullStart();
        }
        const allParts = typeof comments2 !== "string" ? createNodeArray(concatenate([finishNode(textOnly, commentStart, commentEnd)], comments2), commentStart) : textOnly.text + comments2;
        return finishNode(factory2.createJSDocAuthorTag(tagName, allParts), start2);
      }
      function parseAuthorNameAndEmail() {
        const comments2 = [];
        let inEmail = false;
        let token2 = scanner2.getToken();
        while (token2 !== 1 /* EndOfFileToken */ && token2 !== 4 /* NewLineTrivia */) {
          if (token2 === 30 /* LessThanToken */) {
            inEmail = true;
          } else if (token2 === 60 /* AtToken */ && !inEmail) {
            break;
          } else if (token2 === 32 /* GreaterThanToken */ && inEmail) {
            comments2.push(scanner2.getTokenText());
            scanner2.resetTokenState(scanner2.getTokenEnd());
            break;
          }
          comments2.push(scanner2.getTokenText());
          token2 = nextTokenJSDoc();
        }
        return factory2.createJSDocText(comments2.join(""));
      }
      function parseImplementsTag(start2, tagName, margin, indentText) {
        const className = parseExpressionWithTypeArgumentsForAugments();
        return finishNode(factory2.createJSDocImplementsTag(tagName, className, parseTrailingTagComments(start2, getNodePos(), margin, indentText)), start2);
      }
      function parseAugmentsTag(start2, tagName, margin, indentText) {
        const className = parseExpressionWithTypeArgumentsForAugments();
        return finishNode(factory2.createJSDocAugmentsTag(tagName, className, parseTrailingTagComments(start2, getNodePos(), margin, indentText)), start2);
      }
      function parseSatisfiesTag(start2, tagName, margin, indentText) {
        const typeExpression = parseJSDocTypeExpression(
          /*mayOmitBraces*/
          false
        );
        const comments2 = margin !== void 0 && indentText !== void 0 ? parseTrailingTagComments(start2, getNodePos(), margin, indentText) : void 0;
        return finishNode(factory2.createJSDocSatisfiesTag(tagName, typeExpression, comments2), start2);
      }
      function parseImportTag(start2, tagName, margin, indentText) {
        const afterImportTagPos = scanner2.getTokenFullStart();
        let identifier;
        if (isIdentifier2()) {
          identifier = parseIdentifier();
        }
        const importClause = tryParseImportClause(
          identifier,
          afterImportTagPos,
          156 /* TypeKeyword */,
          /*skipJsDocLeadingAsterisks*/
          true
        );
        const moduleSpecifier = parseModuleSpecifier();
        const attributes = tryParseImportAttributes();
        const comments2 = margin !== void 0 && indentText !== void 0 ? parseTrailingTagComments(start2, getNodePos(), margin, indentText) : void 0;
        return finishNode(factory2.createJSDocImportTag(tagName, importClause, moduleSpecifier, attributes, comments2), start2);
      }
      function parseExpressionWithTypeArgumentsForAugments() {
        const usedBrace = parseOptional(19 /* OpenBraceToken */);
        const pos = getNodePos();
        const expression = parsePropertyAccessEntityNameExpression();
        scanner2.setSkipJsDocLeadingAsterisks(true);
        const typeArguments = tryParseTypeArguments();
        scanner2.setSkipJsDocLeadingAsterisks(false);
        const node = factory2.createExpressionWithTypeArguments(expression, typeArguments);
        const res = finishNode(node, pos);
        if (usedBrace) {
          skipWhitespace();
          parseExpected(20 /* CloseBraceToken */);
        }
        return res;
      }
      function parsePropertyAccessEntityNameExpression() {
        const pos = getNodePos();
        let node = parseJSDocIdentifierName();
        while (parseOptional(25 /* DotToken */)) {
          const name = parseJSDocIdentifierName();
          node = finishNode(factoryCreatePropertyAccessExpression(node, name), pos);
        }
        return node;
      }
      function parseSimpleTag(start2, createTag, tagName, margin, indentText) {
        return finishNode(createTag(tagName, parseTrailingTagComments(start2, getNodePos(), margin, indentText)), start2);
      }
      function parseThisTag(start2, tagName, margin, indentText) {
        const typeExpression = parseJSDocTypeExpression(
          /*mayOmitBraces*/
          true
        );
        skipWhitespace();
        return finishNode(factory2.createJSDocThisTag(tagName, typeExpression, parseTrailingTagComments(start2, getNodePos(), margin, indentText)), start2);
      }
      function parseEnumTag(start2, tagName, margin, indentText) {
        const typeExpression = parseJSDocTypeExpression(
          /*mayOmitBraces*/
          true
        );
        skipWhitespace();
        return finishNode(factory2.createJSDocEnumTag(tagName, typeExpression, parseTrailingTagComments(start2, getNodePos(), margin, indentText)), start2);
      }
      function parseTypedefTag(start2, tagName, indent3, indentText) {
        let typeExpression = tryParseTypeExpression();
        skipWhitespaceOrAsterisk();
        const fullName = parseJSDocTypeNameWithNamespace();
        skipWhitespace();
        let comment = parseTagComments(indent3);
        let end2;
        if (!typeExpression || isObjectOrObjectArrayTypeReference(typeExpression.type)) {
          let child;
          let childTypeTag;
          let jsDocPropertyTags;
          let hasChildren = false;
          while (child = tryParse(() => parseChildPropertyTag(indent3))) {
            if (child.kind === 346 /* JSDocTemplateTag */) {
              break;
            }
            hasChildren = true;
            if (child.kind === 345 /* JSDocTypeTag */) {
              if (childTypeTag) {
                const lastError = parseErrorAtCurrentToken(Diagnostics.A_JSDoc_typedef_comment_may_not_contain_multiple_type_tags);
                if (lastError) {
                  addRelatedInfo(lastError, createDetachedDiagnostic(fileName, sourceText, 0, 0, Diagnostics.The_tag_was_first_specified_here));
                }
                break;
              } else {
                childTypeTag = child;
              }
            } else {
              jsDocPropertyTags = append(jsDocPropertyTags, child);
            }
          }
          if (hasChildren) {
            const isArrayType = typeExpression && typeExpression.type.kind === 189 /* ArrayType */;
            const jsdocTypeLiteral = factory2.createJSDocTypeLiteral(jsDocPropertyTags, isArrayType);
            typeExpression = childTypeTag && childTypeTag.typeExpression && !isObjectOrObjectArrayTypeReference(childTypeTag.typeExpression.type) ? childTypeTag.typeExpression : finishNode(jsdocTypeLiteral, start2);
            end2 = typeExpression.end;
          }
        }
        end2 = end2 || comment !== void 0 ? getNodePos() : (fullName ?? typeExpression ?? tagName).end;
        if (!comment) {
          comment = parseTrailingTagComments(start2, end2, indent3, indentText);
        }
        const typedefTag = factory2.createJSDocTypedefTag(tagName, typeExpression, fullName, comment);
        return finishNode(typedefTag, start2, end2);
      }
      function parseJSDocTypeNameWithNamespace(nested) {
        const start2 = scanner2.getTokenStart();
        if (!tokenIsIdentifierOrKeyword(token())) {
          return void 0;
        }
        const typeNameOrNamespaceName = parseJSDocIdentifierName();
        if (parseOptional(25 /* DotToken */)) {
          const body = parseJSDocTypeNameWithNamespace(
            /*nested*/
            true
          );
          const jsDocNamespaceNode = factory2.createModuleDeclaration(
            /*modifiers*/
            void 0,
            typeNameOrNamespaceName,
            body,
            nested ? 8 /* NestedNamespace */ : void 0
          );
          return finishNode(jsDocNamespaceNode, start2);
        }
        if (nested) {
          typeNameOrNamespaceName.flags |= 4096 /* IdentifierIsInJSDocNamespace */;
        }
        return typeNameOrNamespaceName;
      }
      function parseCallbackTagParameters(indent3) {
        const pos = getNodePos();
        let child;
        let parameters;
        while (child = tryParse(() => parseChildParameterOrPropertyTag(4 /* CallbackParameter */, indent3))) {
          if (child.kind === 346 /* JSDocTemplateTag */) {
            parseErrorAtRange(child.tagName, Diagnostics.A_JSDoc_template_tag_may_not_follow_a_typedef_callback_or_overload_tag);
            break;
          }
          parameters = append(parameters, child);
        }
        return createNodeArray(parameters || [], pos);
      }
      function parseJSDocSignature(start2, indent3) {
        const parameters = parseCallbackTagParameters(indent3);
        const returnTag = tryParse(() => {
          if (parseOptionalJsdoc(60 /* AtToken */)) {
            const tag = parseTag(indent3);
            if (tag && tag.kind === 343 /* JSDocReturnTag */) {
              return tag;
            }
          }
        });
        return finishNode(factory2.createJSDocSignature(
          /*typeParameters*/
          void 0,
          parameters,
          returnTag
        ), start2);
      }
      function parseCallbackTag(start2, tagName, indent3, indentText) {
        const fullName = parseJSDocTypeNameWithNamespace();
        skipWhitespace();
        let comment = parseTagComments(indent3);
        const typeExpression = parseJSDocSignature(start2, indent3);
        if (!comment) {
          comment = parseTrailingTagComments(start2, getNodePos(), indent3, indentText);
        }
        const end2 = comment !== void 0 ? getNodePos() : typeExpression.end;
        return finishNode(factory2.createJSDocCallbackTag(tagName, typeExpression, fullName, comment), start2, end2);
      }
      function parseOverloadTag(start2, tagName, indent3, indentText) {
        skipWhitespace();
        let comment = parseTagComments(indent3);
        const typeExpression = parseJSDocSignature(start2, indent3);
        if (!comment) {
          comment = parseTrailingTagComments(start2, getNodePos(), indent3, indentText);
        }
        const end2 = comment !== void 0 ? getNodePos() : typeExpression.end;
        return finishNode(factory2.createJSDocOverloadTag(tagName, typeExpression, comment), start2, end2);
      }
      function escapedTextsEqual(a, b) {
        while (!isIdentifier(a) || !isIdentifier(b)) {
          if (!isIdentifier(a) && !isIdentifier(b) && a.right.escapedText === b.right.escapedText) {
            a = a.left;
            b = b.left;
          } else {
            return false;
          }
        }
        return a.escapedText === b.escapedText;
      }
      function parseChildPropertyTag(indent3) {
        return parseChildParameterOrPropertyTag(1 /* Property */, indent3);
      }
      function parseChildParameterOrPropertyTag(target, indent3, name) {
        let canParseTag = true;
        let seenAsterisk = false;
        while (true) {
          switch (nextTokenJSDoc()) {
            case 60 /* AtToken */:
              if (canParseTag) {
                const child = tryParseChildTag(target, indent3);
                if (child && (child.kind === 342 /* JSDocParameterTag */ || child.kind === 349 /* JSDocPropertyTag */) && name && (isIdentifier(child.name) || !escapedTextsEqual(name, child.name.left))) {
                  return false;
                }
                return child;
              }
              seenAsterisk = false;
              break;
            case 4 /* NewLineTrivia */:
              canParseTag = true;
              seenAsterisk = false;
              break;
            case 42 /* AsteriskToken */:
              if (seenAsterisk) {
                canParseTag = false;
              }
              seenAsterisk = true;
              break;
            case 80 /* Identifier */:
              canParseTag = false;
              break;
            case 1 /* EndOfFileToken */:
              return false;
          }
        }
      }
      function tryParseChildTag(target, indent3) {
        Debug.assert(token() === 60 /* AtToken */);
        const start2 = scanner2.getTokenFullStart();
        nextTokenJSDoc();
        const tagName = parseJSDocIdentifierName();
        const indentText = skipWhitespaceOrAsterisk();
        let t;
        switch (tagName.escapedText) {
          case "type":
            return target === 1 /* Property */ && parseTypeTag(start2, tagName);
          case "prop":
          case "property":
            t = 1 /* Property */;
            break;
          case "arg":
          case "argument":
          case "param":
            t = 2 /* Parameter */ | 4 /* CallbackParameter */;
            break;
          case "template":
            return parseTemplateTag(start2, tagName, indent3, indentText);
          case "this":
            return parseThisTag(start2, tagName, indent3, indentText);
          default:
            return false;
        }
        if (!(target & t)) {
          return false;
        }
        return parseParameterOrPropertyTag(start2, tagName, target, indent3);
      }
      function parseTemplateTagTypeParameter() {
        const typeParameterPos = getNodePos();
        const isBracketed = parseOptionalJsdoc(23 /* OpenBracketToken */);
        if (isBracketed) {
          skipWhitespace();
        }
        const modifiers = parseModifiers(
          /*allowDecorators*/
          false,
          /*permitConstAsModifier*/
          true
        );
        const name = parseJSDocIdentifierName(Diagnostics.Unexpected_token_A_type_parameter_name_was_expected_without_curly_braces);
        let defaultType;
        if (isBracketed) {
          skipWhitespace();
          parseExpected(64 /* EqualsToken */);
          defaultType = doInsideOfContext(16777216 /* JSDoc */, parseJSDocType);
          parseExpected(24 /* CloseBracketToken */);
        }
        if (nodeIsMissing(name)) {
          return void 0;
        }
        return finishNode(factory2.createTypeParameterDeclaration(
          modifiers,
          name,
          /*constraint*/
          void 0,
          defaultType
        ), typeParameterPos);
      }
      function parseTemplateTagTypeParameters() {
        const pos = getNodePos();
        const typeParameters = [];
        do {
          skipWhitespace();
          const node = parseTemplateTagTypeParameter();
          if (node !== void 0) {
            typeParameters.push(node);
          }
          skipWhitespaceOrAsterisk();
        } while (parseOptionalJsdoc(28 /* CommaToken */));
        return createNodeArray(typeParameters, pos);
      }
      function parseTemplateTag(start2, tagName, indent3, indentText) {
        const constraint = token() === 19 /* OpenBraceToken */ ? parseJSDocTypeExpression() : void 0;
        const typeParameters = parseTemplateTagTypeParameters();
        return finishNode(factory2.createJSDocTemplateTag(tagName, constraint, typeParameters, parseTrailingTagComments(start2, getNodePos(), indent3, indentText)), start2);
      }
      function parseOptionalJsdoc(t) {
        if (token() === t) {
          nextTokenJSDoc();
          return true;
        }
        return false;
      }
      function parseJSDocEntityName() {
        let entity = parseJSDocIdentifierName();
        if (parseOptional(23 /* OpenBracketToken */)) {
          parseExpected(24 /* CloseBracketToken */);
        }
        while (parseOptional(25 /* DotToken */)) {
          const name = parseJSDocIdentifierName();
          if (parseOptional(23 /* OpenBracketToken */)) {
            parseExpected(24 /* CloseBracketToken */);
          }
          entity = createQualifiedName(entity, name);
        }
        return entity;
      }
      function parseJSDocIdentifierName(message) {
        if (!tokenIsIdentifierOrKeyword(token())) {
          return createMissingNode(
            80 /* Identifier */,
            /*reportAtCurrentPosition*/
            !message,
            message || Diagnostics.Identifier_expected
          );
        }
        identifierCount++;
        const start2 = scanner2.getTokenStart();
        const end2 = scanner2.getTokenEnd();
        const originalKeywordKind = token();
        const text = internIdentifier(scanner2.getTokenValue());
        const result2 = finishNode(factoryCreateIdentifier(text, originalKeywordKind), start2, end2);
        nextTokenJSDoc();
        return result2;
      }
    }
  })(JSDocParser = Parser2.JSDocParser || (Parser2.JSDocParser = {}));
})(Parser || (Parser = {}));
var incrementallyParsedFiles = /* @__PURE__ */ new WeakSet();
function markAsIncrementallyParsed(sourceFile) {
  if (incrementallyParsedFiles.has(sourceFile)) {
    Debug.fail("Source file has already been incrementally parsed");
  }
  incrementallyParsedFiles.add(sourceFile);
}
var intersectingChangeSet = /* @__PURE__ */ new WeakSet();
function intersectsIncrementalChange(node) {
  return intersectingChangeSet.has(node);
}
function markAsIntersectingIncrementalChange(node) {
  intersectingChangeSet.add(node);
}
var IncrementalParser;
((IncrementalParser2) => {
  function updateSourceFile2(sourceFile, newText, textChangeRange, aggressiveChecks) {
    aggressiveChecks = aggressiveChecks || Debug.shouldAssert(2 /* Aggressive */);
    checkChangeRange(sourceFile, newText, textChangeRange, aggressiveChecks);
    if (textChangeRangeIsUnchanged(textChangeRange)) {
      return sourceFile;
    }
    if (sourceFile.statements.length === 0) {
      return Parser.parseSourceFile(
        sourceFile.fileName,
        newText,
        sourceFile.languageVersion,
        /*syntaxCursor*/
        void 0,
        /*setParentNodes*/
        true,
        sourceFile.scriptKind,
        sourceFile.setExternalModuleIndicator,
        sourceFile.jsDocParsingMode
      );
    }
    markAsIncrementallyParsed(sourceFile);
    Parser.fixupParentReferences(sourceFile);
    const oldText = sourceFile.text;
    const syntaxCursor = createSyntaxCursor(sourceFile);
    const changeRange = extendToAffectedRange(sourceFile, textChangeRange);
    checkChangeRange(sourceFile, newText, changeRange, aggressiveChecks);
    Debug.assert(changeRange.span.start <= textChangeRange.span.start);
    Debug.assert(textSpanEnd(changeRange.span) === textSpanEnd(textChangeRange.span));
    Debug.assert(textSpanEnd(textChangeRangeNewSpan(changeRange)) === textSpanEnd(textChangeRangeNewSpan(textChangeRange)));
    const delta = textChangeRangeNewSpan(changeRange).length - changeRange.span.length;
    updateTokenPositionsAndMarkElements(sourceFile, changeRange.span.start, textSpanEnd(changeRange.span), textSpanEnd(textChangeRangeNewSpan(changeRange)), delta, oldText, newText, aggressiveChecks);
    const result = Parser.parseSourceFile(
      sourceFile.fileName,
      newText,
      sourceFile.languageVersion,
      syntaxCursor,
      /*setParentNodes*/
      true,
      sourceFile.scriptKind,
      sourceFile.setExternalModuleIndicator,
      sourceFile.jsDocParsingMode
    );
    result.commentDirectives = getNewCommentDirectives(
      sourceFile.commentDirectives,
      result.commentDirectives,
      changeRange.span.start,
      textSpanEnd(changeRange.span),
      delta,
      oldText,
      newText,
      aggressiveChecks
    );
    result.impliedNodeFormat = sourceFile.impliedNodeFormat;
    transferSourceFileChildren(sourceFile, result);
    return result;
  }
  IncrementalParser2.updateSourceFile = updateSourceFile2;
  function getNewCommentDirectives(oldDirectives, newDirectives, changeStart, changeRangeOldEnd, delta, oldText, newText, aggressiveChecks) {
    if (!oldDirectives) return newDirectives;
    let commentDirectives;
    let addedNewlyScannedDirectives = false;
    for (const directive of oldDirectives) {
      const { range, type } = directive;
      if (range.end < changeStart) {
        commentDirectives = append(commentDirectives, directive);
      } else if (range.pos > changeRangeOldEnd) {
        addNewlyScannedDirectives();
        const updatedDirective = {
          range: { pos: range.pos + delta, end: range.end + delta },
          type
        };
        commentDirectives = append(commentDirectives, updatedDirective);
        if (aggressiveChecks) {
          Debug.assert(oldText.substring(range.pos, range.end) === newText.substring(updatedDirective.range.pos, updatedDirective.range.end));
        }
      }
    }
    addNewlyScannedDirectives();
    return commentDirectives;
    function addNewlyScannedDirectives() {
      if (addedNewlyScannedDirectives) return;
      addedNewlyScannedDirectives = true;
      if (!commentDirectives) {
        commentDirectives = newDirectives;
      } else if (newDirectives) {
        commentDirectives.push(...newDirectives);
      }
    }
  }
  function moveElementEntirelyPastChangeRange(element, origSourceFile, isArray2, delta, oldText, newText, aggressiveChecks) {
    if (isArray2) {
      visitArray2(element);
    } else {
      visitNode3(element);
    }
    return;
    function visitNode3(node) {
      let text = "";
      if (aggressiveChecks && shouldCheckNode(node)) {
        text = oldText.substring(node.pos, node.end);
      }
      unsetNodeChildren(node, origSourceFile);
      setTextRangePosEnd(node, node.pos + delta, node.end + delta);
      if (aggressiveChecks && shouldCheckNode(node)) {
        Debug.assert(text === newText.substring(node.pos, node.end));
      }
      forEachChild(node, visitNode3, visitArray2);
      if (hasJSDocNodes(node)) {
        for (const jsDocComment of node.jsDoc) {
          visitNode3(jsDocComment);
        }
      }
      checkNodePositions(node, aggressiveChecks);
    }
    function visitArray2(array) {
      setTextRangePosEnd(array, array.pos + delta, array.end + delta);
      for (const node of array) {
        visitNode3(node);
      }
    }
  }
  function shouldCheckNode(node) {
    switch (node.kind) {
      case 11 /* StringLiteral */:
      case 9 /* NumericLiteral */:
      case 80 /* Identifier */:
        return true;
    }
    return false;
  }
  function adjustIntersectingElement(element, changeStart, changeRangeOldEnd, changeRangeNewEnd, delta) {
    Debug.assert(element.end >= changeStart, "Adjusting an element that was entirely before the change range");
    Debug.assert(element.pos <= changeRangeOldEnd, "Adjusting an element that was entirely after the change range");
    Debug.assert(element.pos <= element.end);
    const pos = Math.min(element.pos, changeRangeNewEnd);
    const end = element.end >= changeRangeOldEnd ? (
      // Element ends after the change range.  Always adjust the end pos.
      element.end + delta
    ) : (
      // Element ends in the change range.  The element will keep its position if
      // possible. Or Move backward to the new-end if it's in the 'Y' range.
      Math.min(element.end, changeRangeNewEnd)
    );
    Debug.assert(pos <= end);
    if (element.parent) {
      const parent2 = element.parent;
      Debug.assertGreaterThanOrEqual(pos, parent2.pos);
      Debug.assertLessThanOrEqual(end, parent2.end);
    }
    setTextRangePosEnd(element, pos, end);
  }
  function checkNodePositions(node, aggressiveChecks) {
    if (aggressiveChecks) {
      let pos = node.pos;
      const visitNode3 = (child) => {
        Debug.assert(child.pos >= pos);
        pos = child.end;
      };
      if (hasJSDocNodes(node)) {
        for (const jsDocComment of node.jsDoc) {
          visitNode3(jsDocComment);
        }
      }
      forEachChild(node, visitNode3);
      Debug.assert(pos <= node.end);
    }
  }
  function updateTokenPositionsAndMarkElements(sourceFile, changeStart, changeRangeOldEnd, changeRangeNewEnd, delta, oldText, newText, aggressiveChecks) {
    visitNode3(sourceFile);
    return;
    function visitNode3(child) {
      Debug.assert(child.pos <= child.end);
      if (child.pos > changeRangeOldEnd) {
        moveElementEntirelyPastChangeRange(
          child,
          sourceFile,
          /*isArray*/
          false,
          delta,
          oldText,
          newText,
          aggressiveChecks
        );
        return;
      }
      const fullEnd = child.end;
      if (fullEnd >= changeStart) {
        markAsIntersectingIncrementalChange(child);
        unsetNodeChildren(child, sourceFile);
        adjustIntersectingElement(child, changeStart, changeRangeOldEnd, changeRangeNewEnd, delta);
        forEachChild(child, visitNode3, visitArray2);
        if (hasJSDocNodes(child)) {
          for (const jsDocComment of child.jsDoc) {
            visitNode3(jsDocComment);
          }
        }
        checkNodePositions(child, aggressiveChecks);
        return;
      }
      Debug.assert(fullEnd < changeStart);
    }
    function visitArray2(array) {
      Debug.assert(array.pos <= array.end);
      if (array.pos > changeRangeOldEnd) {
        moveElementEntirelyPastChangeRange(
          array,
          sourceFile,
          /*isArray*/
          true,
          delta,
          oldText,
          newText,
          aggressiveChecks
        );
        return;
      }
      const fullEnd = array.end;
      if (fullEnd >= changeStart) {
        markAsIntersectingIncrementalChange(array);
        adjustIntersectingElement(array, changeStart, changeRangeOldEnd, changeRangeNewEnd, delta);
        for (const node of array) {
          visitNode3(node);
        }
        return;
      }
      Debug.assert(fullEnd < changeStart);
    }
  }
  function extendToAffectedRange(sourceFile, changeRange) {
    const maxLookahead = 1;
    let start = changeRange.span.start;
    for (let i = 0; start > 0 && i <= maxLookahead; i++) {
      const nearestNode = findNearestNodeStartingBeforeOrAtPosition(sourceFile, start);
      Debug.assert(nearestNode.pos <= start);
      const position = nearestNode.pos;
      start = Math.max(0, position - 1);
    }
    const finalSpan = createTextSpanFromBounds(start, textSpanEnd(changeRange.span));
    const finalLength = changeRange.newLength + (changeRange.span.start - start);
    return createTextChangeRange(finalSpan, finalLength);
  }
  function findNearestNodeStartingBeforeOrAtPosition(sourceFile, position) {
    let bestResult = sourceFile;
    let lastNodeEntirelyBeforePosition;
    forEachChild(sourceFile, visit);
    if (lastNodeEntirelyBeforePosition) {
      const lastChildOfLastEntireNodeBeforePosition = getLastDescendant(lastNodeEntirelyBeforePosition);
      if (lastChildOfLastEntireNodeBeforePosition.pos > bestResult.pos) {
        bestResult = lastChildOfLastEntireNodeBeforePosition;
      }
    }
    return bestResult;
    function getLastDescendant(node) {
      while (true) {
        const lastChild = getLastChild(node);
        if (lastChild) {
          node = lastChild;
        } else {
          return node;
        }
      }
    }
    function visit(child) {
      if (nodeIsMissing(child)) {
        return;
      }
      if (child.pos <= position) {
        if (child.pos >= bestResult.pos) {
          bestResult = child;
        }
        if (position < child.end) {
          forEachChild(child, visit);
          return true;
        } else {
          Debug.assert(child.end <= position);
          lastNodeEntirelyBeforePosition = child;
        }
      } else {
        Debug.assert(child.pos > position);
        return true;
      }
    }
  }
  function checkChangeRange(sourceFile, newText, textChangeRange, aggressiveChecks) {
    const oldText = sourceFile.text;
    if (textChangeRange) {
      Debug.assert(oldText.length - textChangeRange.span.length + textChangeRange.newLength === newText.length);
      if (aggressiveChecks || Debug.shouldAssert(3 /* VeryAggressive */)) {
        const oldTextPrefix = oldText.substr(0, textChangeRange.span.start);
        const newTextPrefix = newText.substr(0, textChangeRange.span.start);
        Debug.assert(oldTextPrefix === newTextPrefix);
        const oldTextSuffix = oldText.substring(textSpanEnd(textChangeRange.span), oldText.length);
        const newTextSuffix = newText.substring(textSpanEnd(textChangeRangeNewSpan(textChangeRange)), newText.length);
        Debug.assert(oldTextSuffix === newTextSuffix);
      }
    }
  }
  function createSyntaxCursor(sourceFile) {
    let currentArray = sourceFile.statements;
    let currentArrayIndex = 0;
    Debug.assert(currentArrayIndex < currentArray.length);
    let current = currentArray[currentArrayIndex];
    let lastQueriedPosition = -1 /* Value */;
    return {
      currentNode(position) {
        if (position !== lastQueriedPosition) {
          if (current && current.end === position && currentArrayIndex < currentArray.length - 1) {
            currentArrayIndex++;
            current = currentArray[currentArrayIndex];
          }
          if (!current || current.pos !== position) {
            findHighestListElementThatStartsAtPosition(position);
          }
        }
        lastQueriedPosition = position;
        Debug.assert(!current || current.pos === position);
        return current;
      }
    };
    function findHighestListElementThatStartsAtPosition(position) {
      currentArray = void 0;
      currentArrayIndex = -1 /* Value */;
      current = void 0;
      forEachChild(sourceFile, visitNode3, visitArray2);
      return;
      function visitNode3(node) {
        if (position >= node.pos && position < node.end) {
          forEachChild(node, visitNode3, visitArray2);
          return true;
        }
        return false;
      }
      function visitArray2(array) {
        if (position >= array.pos && position < array.end) {
          for (let i = 0; i < array.length; i++) {
            const child = array[i];
            if (child) {
              if (child.pos === position) {
                currentArray = array;
                currentArrayIndex = i;
                current = child;
                return true;
              } else {
                if (child.pos < position && position < child.end) {
                  forEachChild(child, visitNode3, visitArray2);
                  return true;
                }
              }
            }
          }
        }
        return false;
      }
    }
  }
  IncrementalParser2.createSyntaxCursor = createSyntaxCursor;
  let InvalidPosition;
  ((InvalidPosition2) => {
    InvalidPosition2[InvalidPosition2["Value"] = -1] = "Value";
  })(InvalidPosition || (InvalidPosition = {}));
})(IncrementalParser || (IncrementalParser = {}));
function isDeclarationFileName(fileName) {
  return getDeclarationFileExtension(fileName) !== void 0;
}
function getDeclarationFileExtension(fileName) {
  const standardExtension = getAnyExtensionFromPath(
    fileName,
    supportedDeclarationExtensions,
    /*ignoreCase*/
    false
  );
  if (standardExtension) {
    return standardExtension;
  }
  if (fileExtensionIs(fileName, ".ts" /* Ts */)) {
    const baseName = getBaseFileName(fileName);
    const index = baseName.lastIndexOf(".d.");
    if (index >= 0) {
      return baseName.substring(index);
    }
  }
  return void 0;
}
function parseResolutionMode(mode, pos, end, reportDiagnostic) {
  if (!mode) {
    return void 0;
  }
  if (mode === "import") {
    return 99 /* ESNext */;
  }
  if (mode === "require") {
    return 1 /* CommonJS */;
  }
  reportDiagnostic(pos, end - pos, Diagnostics.resolution_mode_should_be_either_require_or_import);
  return void 0;
}
function processCommentPragmas(context, sourceText) {
  const pragmas = [];
  for (const range of getLeadingCommentRanges(sourceText, 0) || emptyArray) {
    const comment = sourceText.substring(range.pos, range.end);
    extractPragmas(pragmas, range, comment);
  }
  context.pragmas = /* @__PURE__ */ new Map();
  for (const pragma of pragmas) {
    if (context.pragmas.has(pragma.name)) {
      const currentValue = context.pragmas.get(pragma.name);
      if (currentValue instanceof Array) {
        currentValue.push(pragma.args);
      } else {
        context.pragmas.set(pragma.name, [currentValue, pragma.args]);
      }
      continue;
    }
    context.pragmas.set(pragma.name, pragma.args);
  }
}
function processPragmasIntoFields(context, reportDiagnostic) {
  context.checkJsDirective = void 0;
  context.referencedFiles = [];
  context.typeReferenceDirectives = [];
  context.libReferenceDirectives = [];
  context.amdDependencies = [];
  context.pragmas.forEach((entryOrList, key) => {
    switch (key) {
      case "reference": {
        const referencedFiles = context.referencedFiles;
        const typeReferenceDirectives = context.typeReferenceDirectives;
        const libReferenceDirectives = context.libReferenceDirectives;
        forEach(toArray(entryOrList), (arg) => {
          const { types, lib, path, ["resolution-mode"]: res, preserve: _preserve } = arg.arguments;
          const preserve = _preserve === "true" ? true : void 0;
          if (arg.arguments["no-default-lib"] === "true") {
          } else if (types) {
            const parsed = parseResolutionMode(res, types.pos, types.end, reportDiagnostic);
            typeReferenceDirectives.push({ pos: types.pos, end: types.end, fileName: types.value, ...parsed ? { resolutionMode: parsed } : {}, ...preserve ? { preserve } : {} });
          } else if (lib) {
            libReferenceDirectives.push({ pos: lib.pos, end: lib.end, fileName: lib.value, ...preserve ? { preserve } : {} });
          } else if (path) {
            referencedFiles.push({ pos: path.pos, end: path.end, fileName: path.value, ...preserve ? { preserve } : {} });
          } else {
            reportDiagnostic(arg.range.pos, arg.range.end - arg.range.pos, Diagnostics.Invalid_reference_directive_syntax);
          }
        });
        break;
      }
      case "amd-dependency": {
        context.amdDependencies = map(
          toArray(entryOrList),
          (x) => ({ name: x.arguments.name, path: x.arguments.path })
        );
        break;
      }
      case "amd-module": {
        if (entryOrList instanceof Array) {
          for (const entry of entryOrList) {
            if (context.moduleName) {
              reportDiagnostic(entry.range.pos, entry.range.end - entry.range.pos, Diagnostics.An_AMD_module_cannot_have_multiple_name_assignments);
            }
            context.moduleName = entry.arguments.name;
          }
        } else {
          context.moduleName = entryOrList.arguments.name;
        }
        break;
      }
      case "ts-nocheck":
      case "ts-check": {
        forEach(toArray(entryOrList), (entry) => {
          if (!context.checkJsDirective || entry.range.pos > context.checkJsDirective.pos) {
            context.checkJsDirective = {
              enabled: key === "ts-check",
              end: entry.range.end,
              pos: entry.range.pos
            };
          }
        });
        break;
      }
      case "jsx":
      case "jsxfrag":
      case "jsximportsource":
      case "jsxruntime":
        return;
      // Accessed directly
      default:
        Debug.fail("Unhandled pragma kind");
    }
  });
}
var namedArgRegExCache = /* @__PURE__ */ new Map();
function getNamedArgRegEx(name) {
  if (namedArgRegExCache.has(name)) {
    return namedArgRegExCache.get(name);
  }
  const result = new RegExp(`(\\s${name}\\s*=\\s*)(?:(?:'([^']*)')|(?:"([^"]*)"))`, "im");
  namedArgRegExCache.set(name, result);
  return result;
}
var tripleSlashXMLCommentStartRegEx = /^\/\/\/\s*<(\S+)\s.*?\/>/m;
var singleLinePragmaRegEx = /^\/\/\/?\s*@([^\s:]+)((?:[^\S\r\n]|:).*)?$/m;
function extractPragmas(pragmas, range, text) {
  const tripleSlash = range.kind === 2 /* SingleLineCommentTrivia */ && tripleSlashXMLCommentStartRegEx.exec(text);
  if (tripleSlash) {
    const name = tripleSlash[1].toLowerCase();
    const pragma = commentPragmas[name];
    if (!pragma || !(pragma.kind & 1 /* TripleSlashXML */)) {
      return;
    }
    if (pragma.args) {
      const argument = {};
      for (const arg of pragma.args) {
        const matcher = getNamedArgRegEx(arg.name);
        const matchResult = matcher.exec(text);
        if (!matchResult && !arg.optional) {
          return;
        } else if (matchResult) {
          const value = matchResult[2] || matchResult[3];
          if (arg.captureSpan) {
            const startPos = range.pos + matchResult.index + matchResult[1].length + 1;
            argument[arg.name] = {
              value,
              pos: startPos,
              end: startPos + value.length
            };
          } else {
            argument[arg.name] = value;
          }
        }
      }
      pragmas.push({ name, args: { arguments: argument, range } });
    } else {
      pragmas.push({ name, args: { arguments: {}, range } });
    }
    return;
  }
  const singleLine = range.kind === 2 /* SingleLineCommentTrivia */ && singleLinePragmaRegEx.exec(text);
  if (singleLine) {
    return addPragmaForMatch(pragmas, range, 2 /* SingleLine */, singleLine);
  }
  if (range.kind === 3 /* MultiLineCommentTrivia */) {
    const multiLinePragmaRegEx = /@(\S+)(\s+(?:\S.*)?)?$/gm;
    let multiLineMatch;
    while (multiLineMatch = multiLinePragmaRegEx.exec(text)) {
      addPragmaForMatch(pragmas, range, 4 /* MultiLine */, multiLineMatch);
    }
  }
}
function addPragmaForMatch(pragmas, range, kind, match) {
  if (!match) return;
  const name = match[1].toLowerCase();
  const pragma = commentPragmas[name];
  if (!pragma || !(pragma.kind & kind)) {
    return;
  }
  const args = match[2];
  const argument = getNamedPragmaArguments(pragma, args);
  if (argument === "fail") return;
  pragmas.push({ name, args: { arguments: argument, range } });
  return;
}
function getNamedPragmaArguments(pragma, text) {
  if (!text) return {};
  if (!pragma.args) return {};
  const args = text.trim().split(/\s+/);
  const argMap = {};
  for (let i = 0; i < pragma.args.length; i++) {
    const argument = pragma.args[i];
    if (!args[i] && !argument.optional) {
      return "fail";
    }
    if (argument.captureSpan) {
      return Debug.fail("Capture spans not yet implemented for non-xml pragmas");
    }
    argMap[argument.name] = args[i];
  }
  return argMap;
}
function tagNamesAreEquivalent(lhs, rhs) {
  if (lhs.kind !== rhs.kind) {
    return false;
  }
  if (lhs.kind === 80 /* Identifier */) {
    return lhs.escapedText === rhs.escapedText;
  }
  if (lhs.kind === 110 /* ThisKeyword */) {
    return true;
  }
  if (lhs.kind === 296 /* JsxNamespacedName */) {
    return lhs.namespace.escapedText === rhs.namespace.escapedText && lhs.name.escapedText === rhs.name.escapedText;
  }
  return lhs.name.escapedText === rhs.name.escapedText && tagNamesAreEquivalent(lhs.expression, rhs.expression);
}
var targetOptionDeclaration = {
  name: "target",
  shortName: "t",
  type: new Map(Object.entries({
    es3: 0 /* ES3 */,
    es5: 1 /* ES5 */,
    es6: 2 /* ES2015 */,
    es2015: 2 /* ES2015 */,
    es2016: 3 /* ES2016 */,
    es2017: 4 /* ES2017 */,
    es2018: 5 /* ES2018 */,
    es2019: 6 /* ES2019 */,
    es2020: 7 /* ES2020 */,
    es2021: 8 /* ES2021 */,
    es2022: 9 /* ES2022 */,
    es2023: 10 /* ES2023 */,
    es2024: 11 /* ES2024 */,
    es2025: 12 /* ES2025 */,
    esnext: 99 /* ESNext */
  })),
  affectsSourceFile: true,
  affectsModuleResolution: true,
  affectsEmit: true,
  affectsBuildInfo: true,
  deprecatedKeys: /* @__PURE__ */ new Set(["es3", "es5"]),
  paramType: Diagnostics.VERSION,
  showInSimplifiedHelpView: true,
  category: Diagnostics.Language_and_Environment,
  description: Diagnostics.Set_the_JavaScript_language_version_for_emitted_JavaScript_and_include_compatible_library_declarations,
  defaultValueDescription: 12 /* LatestStandard */
};
function convertToJson(sourceFile, rootExpression, errors, returnValue, jsonConversionNotifier) {
  if (!rootExpression) {
    return returnValue ? {} : void 0;
  }
  return convertPropertyValueToJson(rootExpression, jsonConversionNotifier == null ? void 0 : jsonConversionNotifier.rootOptions);
  function convertObjectLiteralExpressionToJson(node, objectOption) {
    var _a;
    const result = returnValue ? {} : void 0;
    for (const element of node.properties) {
      if (element.kind !== 304 /* PropertyAssignment */) {
        errors.push(createDiagnosticForNodeInSourceFile(sourceFile, element, Diagnostics.Property_assignment_expected));
        continue;
      }
      if (element.questionToken) {
        errors.push(createDiagnosticForNodeInSourceFile(sourceFile, element.questionToken, Diagnostics.The_0_modifier_can_only_be_used_in_TypeScript_files, "?"));
      }
      if (!isDoubleQuotedString(element.name)) {
        errors.push(createDiagnosticForNodeInSourceFile(sourceFile, element.name, Diagnostics.String_literal_with_double_quotes_expected));
      }
      const textOfKey = isComputedNonLiteralName(element.name) ? void 0 : getTextOfPropertyName(element.name);
      const keyText = textOfKey && unescapeLeadingUnderscores(textOfKey);
      const option = keyText ? (_a = objectOption == null ? void 0 : objectOption.elementOptions) == null ? void 0 : _a.get(keyText) : void 0;
      const value = convertPropertyValueToJson(element.initializer, option);
      if (typeof keyText !== "undefined") {
        if (returnValue) {
          result[keyText] = value;
        }
        jsonConversionNotifier == null ? void 0 : jsonConversionNotifier.onPropertySet(keyText, value, element, objectOption, option);
      }
    }
    return result;
  }
  function convertArrayLiteralExpressionToJson(elements, elementOption) {
    if (!returnValue) {
      elements.forEach((element) => convertPropertyValueToJson(element, elementOption));
      return void 0;
    }
    return filter(elements.map((element) => convertPropertyValueToJson(element, elementOption)), (v) => v !== void 0);
  }
  function convertPropertyValueToJson(valueExpression, option) {
    switch (valueExpression.kind) {
      case 112 /* TrueKeyword */:
        return true;
      case 97 /* FalseKeyword */:
        return false;
      case 106 /* NullKeyword */:
        return null;
      // eslint-disable-line no-restricted-syntax
      case 11 /* StringLiteral */:
        if (!isDoubleQuotedString(valueExpression)) {
          errors.push(createDiagnosticForNodeInSourceFile(sourceFile, valueExpression, Diagnostics.String_literal_with_double_quotes_expected));
        }
        return valueExpression.text;
      case 9 /* NumericLiteral */:
        return Number(valueExpression.text);
      case 225 /* PrefixUnaryExpression */:
        if (valueExpression.operator !== 41 /* MinusToken */ || valueExpression.operand.kind !== 9 /* NumericLiteral */) {
          break;
        }
        return -Number(valueExpression.operand.text);
      case 211 /* ObjectLiteralExpression */:
        const objectLiteralExpression = valueExpression;
        return convertObjectLiteralExpressionToJson(objectLiteralExpression, option);
      case 210 /* ArrayLiteralExpression */:
        return convertArrayLiteralExpressionToJson(
          valueExpression.elements,
          option && option.element
        );
    }
    if (option) {
      errors.push(createDiagnosticForNodeInSourceFile(sourceFile, valueExpression, Diagnostics.Compiler_option_0_requires_a_value_of_type_1, option.name, getCompilerOptionValueTypeString(option)));
    } else {
      errors.push(createDiagnosticForNodeInSourceFile(sourceFile, valueExpression, Diagnostics.Property_value_can_only_be_string_literal_numeric_literal_true_false_null_object_literal_or_array_literal));
    }
    return void 0;
  }
  function isDoubleQuotedString(node) {
    return isStringLiteral(node) && isStringDoubleQuoted(node, sourceFile);
  }
}
function getCompilerOptionValueTypeString(option) {
  return option.type === "listOrElement" ? `${getCompilerOptionValueTypeString(option.element)} or Array` : option.type === "list" ? "Array" : isString(option.type) ? option.type : "string";
}
var nextNodeId = 1;
var TypeFacts = /* @__PURE__ */ ((TypeFacts3) => {
  TypeFacts3[TypeFacts3["None"] = 0] = "None";
  TypeFacts3[TypeFacts3["TypeofEQString"] = 1] = "TypeofEQString";
  TypeFacts3[TypeFacts3["TypeofEQNumber"] = 2] = "TypeofEQNumber";
  TypeFacts3[TypeFacts3["TypeofEQBigInt"] = 4] = "TypeofEQBigInt";
  TypeFacts3[TypeFacts3["TypeofEQBoolean"] = 8] = "TypeofEQBoolean";
  TypeFacts3[TypeFacts3["TypeofEQSymbol"] = 16] = "TypeofEQSymbol";
  TypeFacts3[TypeFacts3["TypeofEQObject"] = 32] = "TypeofEQObject";
  TypeFacts3[TypeFacts3["TypeofEQFunction"] = 64] = "TypeofEQFunction";
  TypeFacts3[TypeFacts3["TypeofEQHostObject"] = 128] = "TypeofEQHostObject";
  TypeFacts3[TypeFacts3["TypeofNEString"] = 256] = "TypeofNEString";
  TypeFacts3[TypeFacts3["TypeofNENumber"] = 512] = "TypeofNENumber";
  TypeFacts3[TypeFacts3["TypeofNEBigInt"] = 1024] = "TypeofNEBigInt";
  TypeFacts3[TypeFacts3["TypeofNEBoolean"] = 2048] = "TypeofNEBoolean";
  TypeFacts3[TypeFacts3["TypeofNESymbol"] = 4096] = "TypeofNESymbol";
  TypeFacts3[TypeFacts3["TypeofNEObject"] = 8192] = "TypeofNEObject";
  TypeFacts3[TypeFacts3["TypeofNEFunction"] = 16384] = "TypeofNEFunction";
  TypeFacts3[TypeFacts3["TypeofNEHostObject"] = 32768] = "TypeofNEHostObject";
  TypeFacts3[TypeFacts3["EQUndefined"] = 65536] = "EQUndefined";
  TypeFacts3[TypeFacts3["EQNull"] = 131072] = "EQNull";
  TypeFacts3[TypeFacts3["EQUndefinedOrNull"] = 262144] = "EQUndefinedOrNull";
  TypeFacts3[TypeFacts3["NEUndefined"] = 524288] = "NEUndefined";
  TypeFacts3[TypeFacts3["NENull"] = 1048576] = "NENull";
  TypeFacts3[TypeFacts3["NEUndefinedOrNull"] = 2097152] = "NEUndefinedOrNull";
  TypeFacts3[TypeFacts3["Truthy"] = 4194304] = "Truthy";
  TypeFacts3[TypeFacts3["Falsy"] = 8388608] = "Falsy";
  TypeFacts3[TypeFacts3["IsUndefined"] = 16777216] = "IsUndefined";
  TypeFacts3[TypeFacts3["IsNull"] = 33554432] = "IsNull";
  TypeFacts3[TypeFacts3["IsUndefinedOrNull"] = 50331648] = "IsUndefinedOrNull";
  TypeFacts3[TypeFacts3["All"] = 134217727] = "All";
  TypeFacts3[TypeFacts3["BaseStringStrictFacts"] = 3735041] = "BaseStringStrictFacts";
  TypeFacts3[TypeFacts3["BaseStringFacts"] = 12582401] = "BaseStringFacts";
  TypeFacts3[TypeFacts3["StringStrictFacts"] = 16317953] = "StringStrictFacts";
  TypeFacts3[TypeFacts3["StringFacts"] = 16776705] = "StringFacts";
  TypeFacts3[TypeFacts3["EmptyStringStrictFacts"] = 12123649] = "EmptyStringStrictFacts";
  TypeFacts3[TypeFacts3["EmptyStringFacts"] = 12582401 /* BaseStringFacts */] = "EmptyStringFacts";
  TypeFacts3[TypeFacts3["NonEmptyStringStrictFacts"] = 7929345] = "NonEmptyStringStrictFacts";
  TypeFacts3[TypeFacts3["NonEmptyStringFacts"] = 16776705] = "NonEmptyStringFacts";
  TypeFacts3[TypeFacts3["BaseNumberStrictFacts"] = 3734786] = "BaseNumberStrictFacts";
  TypeFacts3[TypeFacts3["BaseNumberFacts"] = 12582146] = "BaseNumberFacts";
  TypeFacts3[TypeFacts3["NumberStrictFacts"] = 16317698] = "NumberStrictFacts";
  TypeFacts3[TypeFacts3["NumberFacts"] = 16776450] = "NumberFacts";
  TypeFacts3[TypeFacts3["ZeroNumberStrictFacts"] = 12123394] = "ZeroNumberStrictFacts";
  TypeFacts3[TypeFacts3["ZeroNumberFacts"] = 12582146 /* BaseNumberFacts */] = "ZeroNumberFacts";
  TypeFacts3[TypeFacts3["NonZeroNumberStrictFacts"] = 7929090] = "NonZeroNumberStrictFacts";
  TypeFacts3[TypeFacts3["NonZeroNumberFacts"] = 16776450] = "NonZeroNumberFacts";
  TypeFacts3[TypeFacts3["BaseBigIntStrictFacts"] = 3734276] = "BaseBigIntStrictFacts";
  TypeFacts3[TypeFacts3["BaseBigIntFacts"] = 12581636] = "BaseBigIntFacts";
  TypeFacts3[TypeFacts3["BigIntStrictFacts"] = 16317188] = "BigIntStrictFacts";
  TypeFacts3[TypeFacts3["BigIntFacts"] = 16775940] = "BigIntFacts";
  TypeFacts3[TypeFacts3["ZeroBigIntStrictFacts"] = 12122884] = "ZeroBigIntStrictFacts";
  TypeFacts3[TypeFacts3["ZeroBigIntFacts"] = 12581636 /* BaseBigIntFacts */] = "ZeroBigIntFacts";
  TypeFacts3[TypeFacts3["NonZeroBigIntStrictFacts"] = 7928580] = "NonZeroBigIntStrictFacts";
  TypeFacts3[TypeFacts3["NonZeroBigIntFacts"] = 16775940] = "NonZeroBigIntFacts";
  TypeFacts3[TypeFacts3["BaseBooleanStrictFacts"] = 3733256] = "BaseBooleanStrictFacts";
  TypeFacts3[TypeFacts3["BaseBooleanFacts"] = 12580616] = "BaseBooleanFacts";
  TypeFacts3[TypeFacts3["BooleanStrictFacts"] = 16316168] = "BooleanStrictFacts";
  TypeFacts3[TypeFacts3["BooleanFacts"] = 16774920] = "BooleanFacts";
  TypeFacts3[TypeFacts3["FalseStrictFacts"] = 12121864] = "FalseStrictFacts";
  TypeFacts3[TypeFacts3["FalseFacts"] = 12580616 /* BaseBooleanFacts */] = "FalseFacts";
  TypeFacts3[TypeFacts3["TrueStrictFacts"] = 7927560] = "TrueStrictFacts";
  TypeFacts3[TypeFacts3["TrueFacts"] = 16774920] = "TrueFacts";
  TypeFacts3[TypeFacts3["SymbolStrictFacts"] = 7925520] = "SymbolStrictFacts";
  TypeFacts3[TypeFacts3["SymbolFacts"] = 16772880] = "SymbolFacts";
  TypeFacts3[TypeFacts3["ObjectStrictFacts"] = 7888800] = "ObjectStrictFacts";
  TypeFacts3[TypeFacts3["ObjectFacts"] = 16736160] = "ObjectFacts";
  TypeFacts3[TypeFacts3["FunctionStrictFacts"] = 7880640] = "FunctionStrictFacts";
  TypeFacts3[TypeFacts3["FunctionFacts"] = 16728e3] = "FunctionFacts";
  TypeFacts3[TypeFacts3["VoidFacts"] = 9830144] = "VoidFacts";
  TypeFacts3[TypeFacts3["UndefinedFacts"] = 26607360] = "UndefinedFacts";
  TypeFacts3[TypeFacts3["NullFacts"] = 42917664] = "NullFacts";
  TypeFacts3[TypeFacts3["EmptyObjectStrictFacts"] = 83427327] = "EmptyObjectStrictFacts";
  TypeFacts3[TypeFacts3["EmptyObjectFacts"] = 83886079] = "EmptyObjectFacts";
  TypeFacts3[TypeFacts3["UnknownFacts"] = 83886079] = "UnknownFacts";
  TypeFacts3[TypeFacts3["AllTypeofNE"] = 556800] = "AllTypeofNE";
  TypeFacts3[TypeFacts3["OrFactsMask"] = 8256] = "OrFactsMask";
  TypeFacts3[TypeFacts3["AndFactsMask"] = 134209471] = "AndFactsMask";
  return TypeFacts3;
})(TypeFacts || {});
var CheckMode = /* @__PURE__ */ ((CheckMode3) => {
  CheckMode3[CheckMode3["Normal"] = 0] = "Normal";
  CheckMode3[CheckMode3["Contextual"] = 1] = "Contextual";
  CheckMode3[CheckMode3["Inferential"] = 2] = "Inferential";
  CheckMode3[CheckMode3["SkipContextSensitive"] = 4] = "SkipContextSensitive";
  CheckMode3[CheckMode3["SkipGenericFunctions"] = 8] = "SkipGenericFunctions";
  CheckMode3[CheckMode3["IsForSignatureHelp"] = 16] = "IsForSignatureHelp";
  CheckMode3[CheckMode3["RestBindingElement"] = 32] = "RestBindingElement";
  CheckMode3[CheckMode3["TypeOnly"] = 64] = "TypeOnly";
  return CheckMode3;
})(CheckMode || {});
var SignatureCheckMode = /* @__PURE__ */ ((SignatureCheckMode3) => {
  SignatureCheckMode3[SignatureCheckMode3["None"] = 0] = "None";
  SignatureCheckMode3[SignatureCheckMode3["BivariantCallback"] = 1] = "BivariantCallback";
  SignatureCheckMode3[SignatureCheckMode3["StrictCallback"] = 2] = "StrictCallback";
  SignatureCheckMode3[SignatureCheckMode3["IgnoreReturnTypes"] = 4] = "IgnoreReturnTypes";
  SignatureCheckMode3[SignatureCheckMode3["StrictArity"] = 8] = "StrictArity";
  SignatureCheckMode3[SignatureCheckMode3["StrictTopSignature"] = 16] = "StrictTopSignature";
  SignatureCheckMode3[SignatureCheckMode3["Callback"] = 3] = "Callback";
  return SignatureCheckMode3;
})(SignatureCheckMode || {});
function getNodeId(node) {
  if (!node.id) {
    node.id = nextNodeId;
    nextNodeId++;
  }
  return node.id;
}
function visitNode(node, visitor, test, lift) {
  if (node === void 0) {
    return node;
  }
  const visited = visitor(node);
  let visitedNode;
  if (visited === void 0) {
    return void 0;
  } else if (isArray(visited)) {
    visitedNode = (lift || extractSingleNode)(visited);
  } else {
    visitedNode = visited;
  }
  Debug.assertNode(visitedNode, test);
  return visitedNode;
}
function extractSingleNode(nodes) {
  Debug.assert(nodes.length <= 1, "Too many nodes written to output.");
  return singleOrUndefined(nodes);
}
function flattenDiagnosticMessageText(diag2, newLine, indent3 = 0) {
  if (isString(diag2)) {
    return diag2;
  } else if (diag2 === void 0) {
    return "";
  }
  let result = "";
  if (indent3) {
    result += newLine;
    for (let i = 0; i < indent3; i++) {
      result += "  ";
    }
  }
  result += diag2.messageText;
  indent3++;
  if (diag2.next) {
    for (const kid of diag2.next) {
      result += flattenDiagnosticMessageText(kid, newLine, indent3);
    }
  }
  return result;
}
var scanner = createScanner(
  99 /* Latest */,
  /*skipTrivia*/
  true
);
function getNameFromPropertyName(name) {
  return name.kind === 168 /* ComputedPropertyName */ ? isStringOrNumericLiteralLike(name.expression) ? name.expression.text : void 0 : isPrivateIdentifier(name) ? idText(name) : getTextOfIdentifierOrLiteral(name);
}
function createNode(kind, pos, end, parent2) {
  const node = isNodeKind(kind) ? new NodeObject(kind, pos, end) : kind === 80 /* Identifier */ ? new IdentifierObject(80 /* Identifier */, pos, end) : kind === 81 /* PrivateIdentifier */ ? new PrivateIdentifierObject(81 /* PrivateIdentifier */, pos, end) : new TokenObject(kind, pos, end);
  node.parent = parent2;
  node.flags = parent2.flags & 101441536 /* ContextFlags */;
  return node;
}
var NodeObject = class {
  constructor(kind, pos, end) {
    this.pos = pos;
    this.end = end;
    this.kind = kind;
    this.id = 0;
    this.flags = 0 /* None */;
    this.modifierFlagsCache = 0 /* None */;
    this.transformFlags = 0 /* None */;
    this.parent = void 0;
    this.original = void 0;
    this.emitNode = void 0;
  }
  assertHasRealPosition(message) {
    Debug.assert(!positionIsSynthesized(this.pos) && !positionIsSynthesized(this.end), message || "Node must have a real position for this operation");
  }
  getSourceFile() {
    return getSourceFileOfNode(this);
  }
  getStart(sourceFile, includeJsDocComment) {
    this.assertHasRealPosition();
    return getTokenPosOfNode(this, sourceFile, includeJsDocComment);
  }
  getFullStart() {
    this.assertHasRealPosition();
    return this.pos;
  }
  getEnd() {
    this.assertHasRealPosition();
    return this.end;
  }
  getWidth(sourceFile) {
    this.assertHasRealPosition();
    return this.getEnd() - this.getStart(sourceFile);
  }
  getFullWidth() {
    this.assertHasRealPosition();
    return this.end - this.pos;
  }
  getLeadingTriviaWidth(sourceFile) {
    this.assertHasRealPosition();
    return this.getStart(sourceFile) - this.pos;
  }
  getFullText(sourceFile) {
    this.assertHasRealPosition();
    return (sourceFile || this.getSourceFile()).text.substring(this.pos, this.end);
  }
  getText(sourceFile) {
    this.assertHasRealPosition();
    if (!sourceFile) {
      sourceFile = this.getSourceFile();
    }
    return sourceFile.text.substring(this.getStart(sourceFile), this.getEnd());
  }
  getChildCount(sourceFile) {
    return this.getChildren(sourceFile).length;
  }
  getChildAt(index, sourceFile) {
    return this.getChildren(sourceFile)[index];
  }
  getChildren(sourceFile = getSourceFileOfNode(this)) {
    this.assertHasRealPosition("Node without a real position cannot be scanned and thus has no token nodes - use forEachChild and collect the result if that's fine");
    return getNodeChildren(this, sourceFile) ?? setNodeChildren(this, sourceFile, createChildren(this, sourceFile));
  }
  getFirstToken(sourceFile) {
    this.assertHasRealPosition();
    const children = this.getChildren(sourceFile);
    if (!children.length) {
      return void 0;
    }
    const child = find(children, (kid) => kid.kind < 310 /* FirstJSDocNode */ || kid.kind > 352 /* LastJSDocNode */);
    return child.kind < 167 /* FirstNode */ ? child : child.getFirstToken(sourceFile);
  }
  getLastToken(sourceFile) {
    this.assertHasRealPosition();
    const children = this.getChildren(sourceFile);
    const child = lastOrUndefined(children);
    if (!child) {
      return void 0;
    }
    return child.kind < 167 /* FirstNode */ ? child : child.getLastToken(sourceFile);
  }
  forEachChild(cbNode, cbNodeArray) {
    return forEachChild(this, cbNode, cbNodeArray);
  }
};
function createChildren(node, sourceFile) {
  const children = [];
  if (isJSDocCommentContainingNode(node)) {
    node.forEachChild((child) => {
      children.push(child);
    });
    return children;
  }
  scanner.setText((sourceFile || node.getSourceFile()).text);
  let pos = node.pos;
  const processNode = (child) => {
    addSyntheticNodes(children, pos, child.pos, node);
    children.push(child);
    pos = child.end;
  };
  const processNodes = (nodes) => {
    addSyntheticNodes(children, pos, nodes.pos, node);
    children.push(createSyntaxList(nodes, node));
    pos = nodes.end;
  };
  forEach(node.jsDoc, processNode);
  pos = node.pos;
  node.forEachChild(processNode, processNodes);
  addSyntheticNodes(children, pos, node.end, node);
  scanner.setText(void 0);
  return children;
}
function addSyntheticNodes(nodes, pos, end, parent2) {
  scanner.resetTokenState(pos);
  while (pos < end) {
    const token = scanner.scan();
    const textPos = scanner.getTokenEnd();
    if (textPos <= end) {
      if (token === 80 /* Identifier */) {
        if (hasTabstop(parent2)) {
          continue;
        }
        Debug.fail(`Did not expect ${Debug.formatSyntaxKind(parent2.kind)} to have an Identifier in its trivia`);
      }
      nodes.push(createNode(token, pos, textPos, parent2));
    }
    pos = textPos;
    if (token === 1 /* EndOfFileToken */) {
      break;
    }
  }
}
function createSyntaxList(nodes, parent2) {
  const list = createNode(353 /* SyntaxList */, nodes.pos, nodes.end, parent2);
  const children = [];
  let pos = nodes.pos;
  for (const node of nodes) {
    addSyntheticNodes(children, pos, node.pos, parent2);
    children.push(node);
    pos = node.end;
  }
  addSyntheticNodes(children, pos, nodes.end, parent2);
  list._children = children;
  return list;
}
var TokenOrIdentifierObject = class {
  constructor(kind, pos, end) {
    this.pos = pos;
    this.end = end;
    this.kind = kind;
    this.id = 0;
    this.flags = 0 /* None */;
    this.transformFlags = 0 /* None */;
    this.parent = void 0;
    this.emitNode = void 0;
  }
  getSourceFile() {
    return getSourceFileOfNode(this);
  }
  getStart(sourceFile, includeJsDocComment) {
    return getTokenPosOfNode(this, sourceFile, includeJsDocComment);
  }
  getFullStart() {
    return this.pos;
  }
  getEnd() {
    return this.end;
  }
  getWidth(sourceFile) {
    return this.getEnd() - this.getStart(sourceFile);
  }
  getFullWidth() {
    return this.end - this.pos;
  }
  getLeadingTriviaWidth(sourceFile) {
    return this.getStart(sourceFile) - this.pos;
  }
  getFullText(sourceFile) {
    return (sourceFile || this.getSourceFile()).text.substring(this.pos, this.end);
  }
  getText(sourceFile) {
    if (!sourceFile) {
      sourceFile = this.getSourceFile();
    }
    return sourceFile.text.substring(this.getStart(sourceFile), this.getEnd());
  }
  getChildCount() {
    return this.getChildren().length;
  }
  getChildAt(index) {
    return this.getChildren()[index];
  }
  getChildren() {
    return this.kind === 1 /* EndOfFileToken */ ? this.jsDoc || emptyArray : emptyArray;
  }
  getFirstToken() {
    return void 0;
  }
  getLastToken() {
    return void 0;
  }
  forEachChild() {
    return void 0;
  }
};
var TokenObject = class extends TokenOrIdentifierObject {
  constructor(kind, pos, end) {
    super(kind, pos, end);
  }
};
var IdentifierObject = class extends TokenOrIdentifierObject {
  constructor(kind, pos, end) {
    super(kind, pos, end);
  }
  get text() {
    return idText(this);
  }
};
var PrivateIdentifierObject = class extends TokenOrIdentifierObject {
  constructor(kind, pos, end) {
    super(kind, pos, end);
  }
  get text() {
    return idText(this);
  }
};
var SourceFileObject = class extends NodeObject {
  constructor(kind, pos, end) {
    super(kind, pos, end);
  }
  update(newText, textChangeRange) {
    return updateSourceFile(this, newText, textChangeRange);
  }
  getLineAndCharacterOfPosition(position) {
    return getLineAndCharacterOfPosition(this, position);
  }
  getLineStarts() {
    return getLineStarts(this);
  }
  getPositionOfLineAndCharacter(line, character, allowEdits) {
    return computePositionOfLineAndCharacter(getLineStarts(this), line, character, this.text, allowEdits);
  }
  getLineEndOfPosition(pos) {
    const { line } = this.getLineAndCharacterOfPosition(pos);
    const lineStarts = this.getLineStarts();
    let lastCharPos;
    if (line + 1 >= lineStarts.length) {
      lastCharPos = this.getEnd();
    }
    if (!lastCharPos) {
      lastCharPos = lineStarts[line + 1] - 1;
    }
    const fullText = this.getFullText();
    return fullText[lastCharPos] === "\n" && fullText[lastCharPos - 1] === "\r" ? lastCharPos - 1 : lastCharPos;
  }
  getNamedDeclarations() {
    if (!this.namedDeclarations) {
      this.namedDeclarations = this.computeNamedDeclarations();
    }
    return this.namedDeclarations;
  }
  computeNamedDeclarations() {
    const result = createMultiMap();
    this.forEachChild(visit);
    return result;
    function addDeclaration(declaration) {
      const name = getDeclarationName(declaration);
      if (name) {
        result.add(name, declaration);
      }
    }
    function getDeclarations(name) {
      let declarations = result.get(name);
      if (!declarations) {
        result.set(name, declarations = []);
      }
      return declarations;
    }
    function getDeclarationName(declaration) {
      const name = getNonAssignedNameOfDeclaration(declaration);
      return name && (isComputedPropertyName(name) && isPropertyAccessExpression(name.expression) ? name.expression.name.text : isPropertyName(name) ? getNameFromPropertyName(name) : void 0);
    }
    function visit(node) {
      switch (node.kind) {
        case 263 /* FunctionDeclaration */:
        case 219 /* FunctionExpression */:
        case 175 /* MethodDeclaration */:
        case 174 /* MethodSignature */:
          const functionDeclaration = node;
          const declarationName = getDeclarationName(functionDeclaration);
          if (declarationName) {
            const declarations = getDeclarations(declarationName);
            const lastDeclaration = lastOrUndefined(declarations);
            if (lastDeclaration && functionDeclaration.parent === lastDeclaration.parent && functionDeclaration.symbol === lastDeclaration.symbol) {
              if (functionDeclaration.body && !lastDeclaration.body) {
                declarations[declarations.length - 1] = functionDeclaration;
              }
            } else {
              declarations.push(functionDeclaration);
            }
          }
          forEachChild(node, visit);
          break;
        case 264 /* ClassDeclaration */:
        case 232 /* ClassExpression */:
        case 265 /* InterfaceDeclaration */:
        case 266 /* TypeAliasDeclaration */:
        case 267 /* EnumDeclaration */:
        case 268 /* ModuleDeclaration */:
        case 272 /* ImportEqualsDeclaration */:
        case 282 /* ExportSpecifier */:
        case 277 /* ImportSpecifier */:
        case 274 /* ImportClause */:
        case 275 /* NamespaceImport */:
        case 178 /* GetAccessor */:
        case 179 /* SetAccessor */:
        case 188 /* TypeLiteral */:
          addDeclaration(node);
          forEachChild(node, visit);
          break;
        case 170 /* Parameter */:
          if (!hasSyntacticModifier(node, 31 /* ParameterPropertyModifier */)) {
            break;
          }
        // falls through
        case 261 /* VariableDeclaration */:
        case 209 /* BindingElement */: {
          const decl = node;
          if (isBindingPattern(decl.name)) {
            forEachChild(decl.name, visit);
            break;
          }
          if (decl.initializer) {
            visit(decl.initializer);
          }
        }
        // falls through
        case 307 /* EnumMember */:
        case 173 /* PropertyDeclaration */:
        case 172 /* PropertySignature */:
          addDeclaration(node);
          break;
        case 279 /* ExportDeclaration */:
          const exportDeclaration = node;
          if (exportDeclaration.exportClause) {
            if (isNamedExports(exportDeclaration.exportClause)) {
              forEach(exportDeclaration.exportClause.elements, visit);
            } else {
              visit(exportDeclaration.exportClause.name);
            }
          }
          break;
        case 273 /* ImportDeclaration */:
          const importClause = node.importClause;
          if (importClause) {
            if (importClause.name) {
              addDeclaration(importClause.name);
            }
            if (importClause.namedBindings) {
              if (importClause.namedBindings.kind === 275 /* NamespaceImport */) {
                addDeclaration(importClause.namedBindings);
              } else {
                forEach(importClause.namedBindings.elements, visit);
              }
            }
          }
          break;
        case 227 /* BinaryExpression */:
          if (getAssignmentDeclarationKind(node) !== 0 /* None */) {
            addDeclaration(node);
          }
        // falls through
        default:
          forEachChild(node, visit);
      }
    }
  }
};
setObjectAllocator({
  getNodeConstructor: () => NodeObject,
  getTokenConstructor: () => TokenObject,
  getIdentifierConstructor: () => IdentifierObject,
  getPrivateIdentifierConstructor: () => PrivateIdentifierObject,
  getSourceFileConstructor: () => SourceFileObject,
});
module.exports = { JSDocParsingMode, LanguageVariant, NodeFlags, ScriptKind, ScriptTarget, SyntaxKind, TokenFlags, canHaveDecorators, canHaveModifiers, createScanner, createSourceFile, findAncestor, flattenDiagnosticMessageText, forEachChild, getDecorators, getModifiers, identifierToKeywordKind, isClassDeclaration, isClassLike, isDecorator, isExpressionStatement, isFunctionLike, isIdentifier, isInterfaceDeclaration, isJSDocSignature, isMethodDeclaration, isModuleDeclaration, isOptionalChain, isPropertyAccessExpression, isPropertyDeclaration, isQualifiedName, isStringLiteral, isToken, isTypeAliasDeclaration, isTypeNode, isVariableDeclarationList, isVariableStatement, skipTrivia, tokenToString, version, versionMajorMinor };
