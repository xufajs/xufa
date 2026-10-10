// A name that identifies someone (a user name, an email), as one key: Unicode NFKC (full-width letters, ligatures,
// compatibility characters as the plain ones: "ＡＤＭＩＮ" and "ﬁle" are "admin" and "file") and lower case. The
// lockout counts the failures of a name by it; an app stores and finds its users by it too, so that the names a person
// cannot tell apart are one account (letters of other scripts that look the same, as Cyrillic "а", are not changed).
function normalizeIdentifier(value) {
  return String(value).normalize('NFKC').toLowerCase();
}

export { normalizeIdentifier };
