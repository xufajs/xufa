'use strict';

// The output of the results: 'stylish' (ESLint's default: each file, then its problems in aligned columns, and a
// summary) and 'json'.

const COLORS = { red: 31, yellow: 33, dim: 2, bold: 1, underline: 4 };

function painter(enabled) {
  return (style, text) => (enabled ? `\u001b[${COLORS[style]}m${text}\u001b[0m` : text);
}

// (Heavy multiplication X, as ESLint marks its summary.)
const CROSS = String.fromCharCode(0x2716);

const plural = (word, n) => (n === 1 ? word : `${word}s`);

function stylish(results, { color = false } = {}) {
  const paint = painter(color);
  let output = '\n';
  let errors = 0;
  let warnings = 0;
  let fixableErrors = 0;
  let fixableWarnings = 0;
  let summaryColor = 'yellow';
  for (const result of results) {
    if (!result.messages.length) continue;
    errors += result.errorCount;
    warnings += result.warningCount;
    fixableErrors += result.fixableErrorCount;
    fixableWarnings += result.fixableWarningCount;
    const rows = result.messages.map((message) => {
      const fatal = message.fatal || message.severity === 2;
      if (fatal) summaryColor = 'red';
      return [
        '',
        `${message.line || 0}:${message.column || 0}`,
        fatal ? paint('red', 'error') : paint('yellow', 'warning'),
        message.message.replace(/([^ ])\.$/, '$1'),
        paint('dim', message.ruleId || ''),
      ];
    });
    output += `${paint('underline', result.filePath)}\n`;
    output += `${table(rows)}\n\n`;
  }
  const total = errors + warnings;
  if (total > 0) {
    output += paint(
      summaryColor,
      paint(
        'bold',
        `${CROSS} ${total} ${plural('problem', total)} (${errors} ${plural('error', errors)}, ${warnings} ${plural('warning', warnings)})\n`
      )
    );
    if (fixableErrors > 0 || fixableWarnings > 0) {
      output += paint(
        summaryColor,
        paint(
          'bold',
          `  ${fixableErrors} ${plural('error', fixableErrors)} and ${fixableWarnings} ${plural('warning', fixableWarnings)} potentially fixable with the \`--fix\` option.\n`
        )
      );
    }
  }
  return total > 0 ? output : '';
}

// The escape sequences of colors.
const ESCAPES = new RegExp(`${String.fromCharCode(27)}\\[\\d+m`, 'g');

// Rows of cells, aligned: the position to the right, the rest to the left (as text-table does for ESLint).
function table(rows) {
  const visible = (text) => text.replace(ESCAPES, '').length;
  const widths = [];
  for (const row of rows) row.forEach((cell, i) => (widths[i] = Math.max(widths[i] ?? 0, visible(cell))));
  return rows
    .map((row) =>
      row
        .map((cell, i) => {
          const pad = ' '.repeat(widths[i] - visible(cell));
          return i === 1 ? pad + cell : cell + pad;
        })
        .join('  ')
        .trimEnd()
    )
    .join('\n');
}

function json(results) {
  return JSON.stringify(
    results.map(({ source, ...result }) => ({
      ...result,
      messages: result.messages.map(({ fix, ...message }) => (fix ? { ...message, fix } : message)),
    }))
  );
}

module.exports = { stylish, json };
