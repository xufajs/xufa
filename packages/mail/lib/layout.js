// The layout of the emails: a column of 600 px at most, centered, in tables and inline styles (what email clients
// read), with the name of the app above, the body, and a footer. Templates of @xufa/template: {{{ body }}} is the
// HTML of the email, and app (name, url), footer and the data of the email are there too. Light colors work in the
// dark modes of the clients (they invert them).
const LAYOUT = `<!doctype html>
<html lang="{{ lang || 'en' }}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>{{ subject }}</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;-webkit-text-size-adjust:100%;">
{{#if preheader}}<div style="display:none;max-height:0;overflow:hidden;opacity:0;">{{ preheader }}</div>{{/if}}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f5f7;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
{{#if app.name}}<tr><td style="padding:0 0 20px;font:600 18px/1.3 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2533;">{{#if app.url}}<a href="{{ app.url }}" style="color:#1f2533;text-decoration:none;">{{ app.name }}</a>{{else}}{{ app.name }}{{/if}}</td></tr>{{/if}}
<tr><td style="background:#ffffff;border:1px solid #e3e6ec;border-radius:8px;padding:32px;font:15px/1.6 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2533;">
{{{ body }}}
</td></tr>
{{#if footer}}<tr><td style="padding:20px 8px 0;font:12px/1.5 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#6b7385;text-align:center;">{{ footer }}</td></tr>{{/if}}
</table>
</td></tr>
</table>
</body>
</html>
`;

// A button for the body of an email: a link that looks like a button in every client.
const BUTTON = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;"><tr><td style="border-radius:6px;background:{{ color || '#4f46e5' }};"><a href="{{ url }}" style="display:inline-block;padding:12px 22px;font:600 15px/1 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#ffffff;text-decoration:none;border-radius:6px;">{{ text }}</a></td></tr></table>`;

export { LAYOUT, BUTTON };
