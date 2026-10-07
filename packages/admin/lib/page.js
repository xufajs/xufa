'use strict';

// The pages of the admin: one HTML document with its style and script inline (lib/client), read once; and the login
// page (with login): its form, and the CSRF token of the session.
const fs = require('node:fs');
const path = require('node:path');

let parts = null;

const escape = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function read() {
  if (parts === null) {
    const file = (name) => fs.readFileSync(path.join(__dirname, 'client', name), 'utf8');
    parts = {
      css: file('admin.css'),
      js: file('admin.js').replace(/<\/script/gi, '<\\/script'),
      login: file('login.js').replace(/<\/script/gi, '<\\/script'),
    };
  }
  return parts;
}

function head(title, extra = '') {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<link rel="icon" href="data:,">${extra}
<title>${escape(title)}</title>
<style>${read().css}</style>
</head>`;
}

function page(title) {
  return `${head(title)}
<body>
<div id="app"></div>
<div class="toast" role="status" aria-live="polite"></div>
<script>${read().js}</script>
</body>
</html>
`;
}

function loginPage(title, csrf) {
  return `${head(`Log in · ${title}`, `\n<meta name="csrf-token" content="${escape(csrf || '')}">`)}
<body>
<main class="login">
<form id="login" class="card" novalidate>
<h1>${escape(title)}</h1>
<div class="field"><label for="username">User</label><input id="username" name="username" autocomplete="username" autofocus required></div>
<div class="field"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required></div>
<div class="field" id="code-field" hidden><label for="code">Code of your authenticator app</label><input id="code" name="code" inputmode="numeric" autocomplete="one-time-code"></div>
<div class="all-errors" id="message" role="alert" hidden></div>
<button class="primary" type="submit">Log in</button>
</form>
</main>
<script>${read().login}</script>
</body>
</html>
`;
}

module.exports = { page, loginPage };
