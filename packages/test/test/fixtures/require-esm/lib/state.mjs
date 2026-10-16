// A module with state: what each test file marks. A fresh copy for each file sees only that file's marks.
export const seen = [];

export default function mark(name) {
  seen.push(name);
  return seen;
}
