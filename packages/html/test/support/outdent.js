// outdent: a template literal without the indentation of its first line, nor its first and last line breaks.
function outdent(strings, ...values) {
  const text = strings.reduce((all, part, i) => all + part + (i < values.length ? values[i] : ''), '');
  const lines = text.replace(/^\n/, '').replace(/\n[ \t]*$/, '').split('\n');
  const indent = /^[ \t]*/.exec(lines[0])[0].length;
  return lines.map((line) => line.slice(Math.min(indent, /^[ \t]*/.exec(line)[0].length))).join('\n');
}

export { outdent };
export default outdent;
