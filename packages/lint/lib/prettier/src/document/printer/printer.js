import { convertEndOfLineOptionToCharacter } from '../../common/end-of-line.js';
import getStringWidth from '../../utilities/get-string-width.js';
import {
  DOC_TYPE_ALIGN,
  DOC_TYPE_ARRAY,
  DOC_TYPE_BREAK_PARENT,
  DOC_TYPE_CURSOR,
  DOC_TYPE_FILL,
  DOC_TYPE_GROUP,
  DOC_TYPE_IF_BREAK,
  DOC_TYPE_INDENT,
  DOC_TYPE_INDENT_IF_BREAK,
  DOC_TYPE_LABEL,
  DOC_TYPE_LINE,
  DOC_TYPE_LINE_SUFFIX,
  DOC_TYPE_LINE_SUFFIX_BOUNDARY,
  DOC_TYPE_STRING,
  DOC_TYPE_TRIM,
  hardlineWithoutBreakParent,
  indent as indentDoc,
} from '../builders/index.js';
import { getDocType, propagateBreaks } from '../utilities/index.js';
import InvalidDocError from '../utilities/invalid-doc-error.js';
import { makeAlign, makeIndent, ROOT_INDENT } from './indent.js';
import PrintResult from './print-result.js';

/**
@import {EndOfLineOption} from "../../common/end-of-line.js";
@import {Doc} from "../builders/index.js";
@import {Indent, IndentOptions} from "./indent.js";
@typedef {typeof MODE_BREAK | typeof MODE_FLAT} Mode
@typedef {{ indent: Indent, doc: any, mode: Mode }} Command
@typedef {Record<symbol, Mode>} GroupModeMap
*/

/** @type {unique symbol} */
const MODE_BREAK = Symbol('MODE_BREAK');
/** @type {unique symbol} */
const MODE_FLAT = Symbol('MODE_FLAT');

const DOC_FILL_PRINTED_LENGTH = Symbol('DOC_FILL_PRINTED_LENGTH');

/**
 * Whether `nextDoc` (in `nextMode`) fits, and the rest of its line: the commands after it, the first `restCount` of
 * `restModes` and `restDocs` (the printer's stack, as arrays).
 * @param {Mode} nextMode
 * @param {any} nextDoc
 * @param {Mode[]} restModes
 * @param {any[]} restDocs
 * @param {number} restCount
 * @param {number} remainingWidth
 * @param {boolean} hasLineSuffix
 * @param {GroupModeMap} groupModeMap
 * @param {boolean} [mustBeFlat]
 * @returns {boolean}
 */
// @xufa/lint: the stacks of fits(), kept between its calls (it never calls itself): it made two arrays, and grew
// them, at each of its calls.
const fitsModes = [];
const fitsDocs = [];

// How many tabs and spaces a text ends with, and whether it is only those.
function trailingIndentation(text) {
  let index = text.length;
  while (index > 0) {
    const code = text.charCodeAt(index - 1);
    if (code !== 32 && code !== 9) {
      break;
    }
    index--;
  }
  return text.length - index;
}

function fits(
  nextMode,
  nextDoc,
  restModes,
  restDocs,
  restCount,
  remainingWidth,
  hasLineSuffix,
  groupModeMap,
  mustBeFlat
) {
  if (remainingWidth === Number.POSITIVE_INFINITY) {
    return true;
  }

  let restCommandsIndex = restCount;
  let hasPendingSpace = false;
  // The commands, as their modes and docs (two arrays: no object made for each).
  const modes = fitsModes;
  const docs = fitsDocs;
  modes.length = 0;
  docs.length = 0;
  modes.push(nextMode);
  docs.push(nextDoc);
  // @xufa/lint: how many tabs and spaces the text measured so far ends with, what `trim` takes back (prettier kept
  // the text itself for it, a string made for every string measured).
  let trailing = 0;
  while (remainingWidth >= 0) {
    if (docs.length === 0) {
      if (restCommandsIndex === 0) {
        return true;
      }
      restCommandsIndex--;
      modes.push(restModes[restCommandsIndex]);
      docs.push(restDocs[restCommandsIndex]);

      continue;
    }

    const mode = modes.pop();
    const doc = docs.pop();
    const docType = getDocType(doc);
    switch (docType) {
      case DOC_TYPE_STRING:
        if (doc) {
          if (hasPendingSpace) {
            trailing += 1;
            remainingWidth -= 1;
            hasPendingSpace = false;
          }

          const indentation = trailingIndentation(doc);
          trailing = indentation === doc.length ? trailing + indentation : indentation;
          remainingWidth -= getStringWidth(doc);
        }
        break;

      case DOC_TYPE_ARRAY:
      case DOC_TYPE_FILL: {
        const parts = docType === DOC_TYPE_ARRAY ? doc : doc.parts;
        const end = doc[DOC_FILL_PRINTED_LENGTH] ?? 0;
        for (let index = parts.length - 1; index >= end; index--) {
          modes.push(mode);
          docs.push(parts[index]);
        }
        break;
      }

      case DOC_TYPE_INDENT:
      case DOC_TYPE_ALIGN:
      case DOC_TYPE_INDENT_IF_BREAK:
      case DOC_TYPE_LABEL:
        modes.push(mode);
        docs.push(doc.contents);
        break;

      case DOC_TYPE_TRIM: {
        remainingWidth += trailing;
        trailing = 0;
        break;
      }

      case DOC_TYPE_GROUP: {
        if (mustBeFlat && doc.break) {
          return false;
        }
        const groupMode = doc.break ? MODE_BREAK : mode;
        // The most expanded state takes up the least space on the current line.
        const contents = doc.expandedStates && groupMode === MODE_BREAK ? doc.expandedStates.at(-1) : doc.contents;
        modes.push(groupMode);
        docs.push(contents);
        break;
      }

      case DOC_TYPE_IF_BREAK: {
        const groupMode = doc.groupId ? groupModeMap[doc.groupId] || MODE_FLAT : mode;
        const contents = groupMode === MODE_BREAK ? doc.breakContents : doc.flatContents;
        if (contents) {
          modes.push(mode);
          docs.push(contents);
        }
        break;
      }

      case DOC_TYPE_LINE:
        if (mode === MODE_BREAK || doc.hard) {
          return true;
        }
        if (!doc.soft) {
          hasPendingSpace = true;
        }
        break;

      case DOC_TYPE_LINE_SUFFIX:
        hasLineSuffix = true;
        break;

      case DOC_TYPE_LINE_SUFFIX_BOUNDARY:
        if (hasLineSuffix) {
          return false;
        }
        break;
    }
  }
  return false;
}

/**
@param {Doc} doc
@param {{
  printWidth: number,
  endOfLine: EndOfLineOption,
} & IndentOptions} options
@returns
*/
function printDocToString(doc, options) {
  /** @type GroupModeMap */
  const groupModeMap = Object.create(null);

  const width = options.printWidth;
  const newLine = convertEndOfLineOptionToCharacter(options.endOfLine);
  let position = 0;
  // The commands are a stack, as three arrays (their indents, modes and docs: no object made for each): a loop over
  // it instead of recursive calls of `print`.
  /** @type Indent[] */
  const indents = [ROOT_INDENT];
  /** @type Mode[] */
  const modes = [MODE_BREAK];
  const docs = [doc];
  const push = (indent, mode, doc) => {
    indents.push(indent);
    modes.push(mode);
    docs.push(doc);
  };
  let shouldRemeasure = false;
  /** @type Command[] */
  const lineSuffix = [];
  const pushLineSuffix = () => {
    for (let index = lineSuffix.length - 1; index >= 0; index--) {
      const command = lineSuffix[index];
      push(command.indent, command.mode, command.doc);
    }
    lineSuffix.length = 0;
  };

  const result = new PrintResult();

  propagateBreaks(doc);

  while (docs.length > 0) {
    const indent = indents.pop();
    const mode = modes.pop();
    const doc = docs.pop();
    switch (getDocType(doc)) {
      case DOC_TYPE_STRING: {
        const formatted = newLine !== '\n' ? doc.replaceAll('\n', newLine) : doc;
        // Plugins may print single string, should skip measure the width
        if (formatted) {
          result.write(formatted);
          if (docs.length > 0) {
            position += getStringWidth(formatted);
          }
        }
        break;
      }

      case DOC_TYPE_ARRAY:
        for (let index = doc.length - 1; index >= 0; index--) {
          push(indent, mode, doc[index]);
        }
        break;

      case DOC_TYPE_CURSOR:
        result.markPosition();
        break;

      case DOC_TYPE_INDENT:
        push(makeIndent(indent, options), mode, doc.contents);
        break;

      case DOC_TYPE_ALIGN:
        push(makeAlign(indent, doc.n, options), mode, doc.contents);
        break;

      case DOC_TYPE_TRIM:
        position -= result.trim();
        break;

      case DOC_TYPE_GROUP: {
        let groupMode;
        let contents = doc.contents;
        if (mode === MODE_FLAT && !shouldRemeasure) {
          groupMode = doc.break ? MODE_BREAK : MODE_FLAT;
        } else {
          shouldRemeasure = false;
          const remainingWidth = width - position;
          const hasLineSuffix = lineSuffix.length > 0;
          const count = docs.length;
          if (
            !doc.break &&
            fits(MODE_FLAT, contents, modes, docs, count, remainingWidth, hasLineSuffix, groupModeMap)
          ) {
            groupMode = MODE_FLAT;
          } else if (!doc.expandedStates) {
            groupMode = MODE_BREAK;
          } else {
            const states = doc.expandedStates;
            groupMode = MODE_BREAK;
            contents = states.at(-1);
            if (!doc.break) {
              // Expanded states are a rare case where a document
              // can manually provide multiple representations of
              // itself. It provides an array of documents
              // going from the least expanded (most flattened)
              // representation first to the most expanded. If a
              // group has these, we need to manually go through
              // these states and find the first one that fits.
              for (let index = 1; index < states.length - 1; index++) {
                if (fits(MODE_FLAT, states[index], modes, docs, count, remainingWidth, hasLineSuffix, groupModeMap)) {
                  groupMode = MODE_FLAT;
                  contents = states[index];
                  break;
                }
              }
            }
          }
        }

        push(indent, groupMode, contents);

        if (doc.id) {
          groupModeMap[doc.id] = groupMode;
        }

        break;
      }
      // Fills each line with as much code as possible before moving to a new
      // line with the same indentation.
      //
      // Expects doc.parts to be an array of alternating content and
      // whitespace. The whitespace contains the linebreaks.
      //
      // For example:
      //   ["I", line, "love", line, "monkeys"]
      // or
      //   [{ type: group, ... }, softline, { type: group, ... }]
      //
      // It uses this parts structure to handle three main layout cases:
      // * The first two content items fit on the same line without
      //   breaking
      //   -> output the first content item and the whitespace "flat".
      // * Only the first content item fits on the line without breaking
      //   -> output the first content item "flat" and the whitespace with
      //   "break".
      // * Neither content item fits on the line without breaking
      //   -> output the first content item and the whitespace with "break".
      case DOC_TYPE_FILL: {
        const remainingWidth = width - position;

        const offset = doc[DOC_FILL_PRINTED_LENGTH] ?? 0;
        const { parts } = doc;
        const length = parts.length - offset;
        if (length === 0) {
          break;
        }

        const content = parts[offset + 0];
        const whitespace = parts[offset + 1];
        const contentFits = fits(
          MODE_FLAT,
          content,
          modes,
          docs,
          0,
          remainingWidth,
          lineSuffix.length > 0,
          groupModeMap,
          true
        );

        if (length === 1) {
          push(indent, contentFits ? MODE_FLAT : MODE_BREAK, content);
          break;
        }

        if (length === 2) {
          const contentMode = contentFits ? MODE_FLAT : MODE_BREAK;
          push(indent, contentMode, whitespace);
          push(indent, contentMode, content);
          break;
        }

        const secondContent = parts[offset + 2];

        const firstAndSecondContentFits = fits(
          MODE_FLAT,
          [content, whitespace, secondContent],
          modes,
          docs,
          0,
          remainingWidth,
          lineSuffix.length > 0,
          groupModeMap,
          true
        );

        push(indent, mode, { ...doc, [DOC_FILL_PRINTED_LENGTH]: offset + 2 });

        if (firstAndSecondContentFits) {
          push(indent, MODE_FLAT, whitespace);
          push(indent, MODE_FLAT, content);
        } else if (contentFits) {
          push(indent, MODE_BREAK, whitespace);
          push(indent, MODE_FLAT, content);
        } else {
          push(indent, MODE_BREAK, whitespace);
          push(indent, MODE_BREAK, content);
        }
        break;
      }
      case DOC_TYPE_IF_BREAK:
      case DOC_TYPE_INDENT_IF_BREAK: {
        const groupMode = doc.groupId ? groupModeMap[doc.groupId] : mode;
        if (groupMode === MODE_BREAK) {
          const breakContents =
            doc.type === DOC_TYPE_IF_BREAK ? doc.breakContents : doc.negate ? doc.contents : indentDoc(doc.contents);
          if (breakContents) {
            push(indent, mode, breakContents);
          }
        }
        if (groupMode === MODE_FLAT) {
          const flatContents =
            doc.type === DOC_TYPE_IF_BREAK ? doc.flatContents : doc.negate ? indentDoc(doc.contents) : doc.contents;
          if (flatContents) {
            push(indent, mode, flatContents);
          }
        }

        break;
      }
      case DOC_TYPE_LINE_SUFFIX:
        lineSuffix.push({ indent, mode, doc: doc.contents });
        break;

      case DOC_TYPE_LINE_SUFFIX_BOUNDARY:
        if (lineSuffix.length > 0) {
          push(indent, mode, hardlineWithoutBreakParent);
        }
        break;

      case DOC_TYPE_LINE:
        switch (mode) {
          case MODE_FLAT:
            if (!doc.hard) {
              if (!doc.soft) {
                result.write(' ');
                position += 1;
              }

              break;
            }

            // This line was forced into the output even if we
            // were in flattened mode, so we need to tell the next
            // group that no matter what, it needs to remeasure
            // because the previous measurement didn't accurately
            // capture the entire expression (this is necessary
            // for nested groups)
            shouldRemeasure = true;

          // fallthrough

          case MODE_BREAK:
            if (lineSuffix.length > 0) {
              // (The line again, after the line suffixes: they print first.)
              push(indent, mode, doc);
              pushLineSuffix();
              break;
            }

            if (doc.literal) {
              result.write(newLine);
              position = 0;
              if (indent.root) {
                if (indent.root.value) {
                  result.write(indent.root.value);
                }
                position = indent.root.length;
              }
            } else {
              result.trim();
              result.write(newLine + indent.value);
              position = indent.length;
            }
            break;
        }
        break;

      case DOC_TYPE_LABEL:
        push(indent, mode, doc.contents);
        break;

      case DOC_TYPE_BREAK_PARENT:
        // No op
        break;

      default:
        throw new InvalidDocError(doc);
    }

    // Flush remaining line-suffix contents at the end of the document, in case
    // there is no new line after the line-suffix.
    if (docs.length === 0 && lineSuffix.length > 0) {
      pushLineSuffix();
    }
  }

  const { text: formatted, positions: cursorPositions } = result.finish();

  if (cursorPositions.length !== 2) {
    // If the doc contained ONE cursor command,
    // instead of the expected zero or two. If the doc being printed was
    // returned by printAstToDoc, then the only ways this can have happened
    // are if:
    // 1. a plugin added a cursor command itself, or
    // 2. one (but not both) of options.nodeAfterCursor and
    //    options.nodeAfterCursor pointed to a node within a subtree of the
    //    AST that the printer plugin used in printAstToDoc simply omits from
    //    the doc, or that it prints without recursively calling mainPrint,
    //    with the consequence that the logic for adding a cursor command in
    //    callPluginPrintFunction was never called for that node.
    // These are both weird scenarios that should be considered a bug if they
    // ever occur with one of Prettier's built-in plugins. If a third-party
    // plugin was used when printing the AST to a doc, the possibility of
    // reaching this scenario MIGHT be reasonable to consider a bug in the
    // plugin. However, we try to at least not crash if this ever happens;
    // instead we simply give up on returning a cursorNodeStart or
    // cursorNodeText.
    //
    // coreFormat has logic specifically to handle this scenario - where it
    // is supposed to preserve the cursor position but the printer gives it
    // no information about where the nodes around the cursor ended up -
    // although that logic is unavoidably slower (and has more potential to
    // return a perverse result) than the happy path where we help out
    // coreFormat by returning a cursorNodeStart and cursorNodeText here.
    return { formatted };
  }

  const [cursorNodeStart, cursorNodeEnd] = cursorPositions;
  return {
    formatted,
    cursorNodeStart,
    cursorNodeText: formatted.slice(cursorNodeStart, cursorNodeEnd),
  };
}

export { printDocToString };
