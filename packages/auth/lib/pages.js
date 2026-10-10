// The pages of the accounts, as Django's django.contrib.auth.urls: log in and out, change the password, and reset a
// forgotten one with a link by email; HTML forms (of @xufa/forms) over the accounts of this package (registered
// before), at Django's addresses and with their names:
//
//   login/                      login                    registration/login
//   logout/ (POST)              logout                   registration/logged_out
//   password_change/            password_change          registration/password_change_form
//   password_change/done/       password_change_done     registration/password_change_done
//   password_reset/             password_reset           registration/password_reset_form
//   password_reset/done/        password_reset_done      registration/password_reset_done
//   reset/:token/               password_reset_confirm   registration/password_reset_confirm
//   reset/done/                 password_reset_complete  registration/password_reset_complete
//
// With `views` (a folder of the views of @xufa/template: 'registration'), each page renders the app's template of
// that name, with Django's context (form, next, validlink); without, pages of its own.
//
//   app.register(auth.accounts, { ..., loginBy: 'username', loginUrl: '/accounts/login/' });
//   app.register(auth.pages, { prefix: '/accounts', views: 'registration', siteUrl: 'https://library.example' });
import { CredentialError } from './credentials.js';
import { message } from './messages.js';
import * as formsModule from '@xufa/forms';

const escape = (value) =>
  String(value === undefined || value === null ? '' : value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
  );

// An address of this site to go after the login (next): a path, not another site (//other.example).
const safeNext = (next) => (typeof next === 'string' && /^\/(?![/\\])/.test(next) ? next : null);

// The forms of the pages (Django's AuthenticationForm, PasswordChangeForm, PasswordResetForm, SetPasswordForm).
function formsOf(accounts) {
  const { Form, fields, ValidationError } = formsModule;
  const byUsername = accounts.loginBy === 'username';
  const newPasswords = {
    newPassword1: fields.password({ label: 'New password', attrs: { autocomplete: 'new-password' } }),
    newPassword2: fields.password({ label: 'New password confirmation', attrs: { autocomplete: 'new-password' } }),
  };
  const same = (data) => {
    if (data.newPassword1 && data.newPassword2 && data.newPassword1 !== data.newPassword2) {
      throw Object.assign(new ValidationError(message('passwordsDiffer')), { field: 'newPassword2' });
    }
    return data;
  };

  // The labels of the fields, in the language of the request (each form has its own copies of its fields).
  const LABELS = {
    username: 'labelUsername',
    email: 'labelEmail',
    password: 'labelPassword',
    code: 'labelCode',
    oldPassword: 'labelOldPassword',
    newPassword1: 'labelNewPassword',
    newPassword2: 'labelNewPassword2',
  };
  class PageForm extends Form {
    constructor(options) {
      super(options);
      for (const [name, key] of Object.entries(LABELS)) if (this.fields[name]) this.fields[name].label = message(key);
    }
  }

  class AuthenticationForm extends PageForm {
    static fields = {
      ...(byUsername
        ? { username: fields.string({ maxLength: 254, attrs: { autofocus: true, autocomplete: 'username' } }) }
        : { email: fields.email({ attrs: { autofocus: true, autocomplete: 'email' } }) }),
      password: fields.password({ strip: false, attrs: { autocomplete: 'current-password' } }),
      // The code of an authenticator app (or a recovery code), asked for once the password is right.
      code: fields.string({ required: false, label: 'Code', attrs: { autocomplete: 'one-time-code' } }),
    };

    // The user of the login (accounts.authenticate), or the message of why not, for the whole form.
    async clean(data) {
      if (Object.keys(this.errors).length) return data;
      try {
        this.user = await accounts.authenticate(data, this.request);
      } catch (err) {
        if (!(err instanceof CredentialError) && !(err.statusCode >= 400 && err.statusCode < 500)) throw err;
        if (err.needsCode) this.needsCode = true;
        throw new ValidationError(err.message);
      }
      return data;
    }
  }

  class PasswordChangeForm extends PageForm {
    static fields = {
      oldPassword: fields.password({
        label: 'Old password',
        strip: false,
        attrs: { autofocus: true, autocomplete: 'current-password' },
      }),
      ...newPasswords,
    };

    clean(data) {
      return same(data);
    }
  }

  class PasswordResetForm extends PageForm {
    static fields = { email: fields.email({ attrs: { autocomplete: 'email' } }) };
  }

  class SetPasswordForm extends PageForm {
    static fields = newPasswords;

    clean(data) {
      return same(data);
    }
  }

  return { AuthenticationForm, PasswordChangeForm, PasswordResetForm, SetPasswordForm };
}

// The pages of its own (without views): plain HTML, each a title and its body, in the language of the request.
const text = (key) => escape(message(key));
const OWN = {
  login: ({ form, next, csrf }) => [
    message('pageLogIn'),
    `<form method="post">${csrf}
${
  form.nonFieldErrors().length
    ? `<ul class="errorlist">${form
        .nonFieldErrors()
        .map((item) => `<li>${escape(item)}</li>`)
        .join('')}</ul>`
    : ''
}
${form.boundFields
  .filter((field) => field.name !== 'code' || form.needsCode)
  .map((field) => `<p>${field.labelTag()} ${field.widget()} ${field.errorsHtml()}</p>`)
  .join('\n')}
<input type="hidden" name="next" value="${escape(next || '')}"><p><button type="submit">${text('pageLogIn')}</button></p></form>`,
  ],
  logged_out: ({ urls }) => [
    message('pageLoggedOut'),
    `<p>${text('pageLoggedOutText')}</p><p><a href="${escape(urls.login)}">${text('pageLogInAgain')}</a></p>`,
  ],
  password_change_form: ({ form, csrf }) => [
    message('pagePasswordChange'),
    formHtml(form, csrf, message('pageChangePassword')),
  ],
  password_change_done: () => [message('pagePasswordChanged'), `<p>${text('pagePasswordChangedText')}</p>`],
  password_reset_form: ({ form, csrf }) => [
    message('pagePasswordReset'),
    `<p>${text('pagePasswordResetText')}</p>${formHtml(form, csrf, message('pageResetPassword'))}`,
  ],
  password_reset_done: () => [
    message('pageResetSent'),
    `<p>${text('pageResetSentText')}</p><p>${text('pageResetSentHint')}</p>`,
  ],
  password_reset_confirm: ({ form, csrf, validlink }) =>
    validlink
      ? [
          message('pageNewPassword'),
          `<p>${text('pageNewPasswordText')}</p>${formHtml(form, csrf, message('pageChangePassword'))}`,
        ]
      : [message('pageResetFailed'), `<p>${text('pageResetFailedText')}</p>`],
  password_reset_complete: ({ urls }) => [
    message('pageResetComplete'),
    `<p>${text('pageResetCompleteText')}</p><p><a href="${escape(urls.login)}">${text('pageLogIn')}</a></p>`,
  ],
};

function formHtml(form, csrf, button) {
  return `<form method="post">${csrf}${form.asP()}<p><button type="submit">${escape(button)}</button></p></form>`;
}

function document(title, body, lang = 'en') {
  return `<!doctype html>
<html lang="${escape(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;margin:0;background:#f6f7f9;color:#1d2330}main{max-width:26rem;margin:3rem auto;padding:2rem;background:#fff;border-radius:12px;box-shadow:0 1px 4px #0002}input:not([type=hidden]){display:block;width:100%;box-sizing:border-box;padding:.5rem;margin:.25rem 0 .5rem;border:1px solid #c5cad3;border-radius:6px;font:inherit}button{padding:.55rem 1rem;border:0;border-radius:6px;background:#2f5bd3;color:#fff;font:inherit;cursor:pointer}.errorlist{color:#b42318;padding-left:1.2rem}.helptext{color:#5b6475;font-size:.9em}@media (prefers-color-scheme:dark){body{background:#14171d;color:#e6e8ec}main{background:#1d2129}input:not([type=hidden]){background:#14171d;color:inherit;border-color:#3a404c}}</style>
</head><body><main><h1>${escape(title)}</h1>
${body}
</main></body></html>`;
}

function pagesPlugin(app, options, done) {
  const accounts = app.accounts;
  if (!accounts || typeof accounts.authenticate !== 'function') {
    done(new Error('auth.pages needs auth.accounts, registered before it'));
    return;
  }
  const {
    prefix = '/accounts',
    views = null,
    loginRedirectUrl = '/',
    logoutRedirectUrl = null,
    siteUrl = null,
    names = true,
  } = options;
  const base = prefix.replace(/\/$/, '');
  const forms = formsOf(accounts);
  const PATHS = {
    login: '/login/',
    logout: '/logout/',
    password_change: '/password_change/',
    password_change_done: '/password_change/done/',
    password_reset: '/password_reset/',
    password_reset_done: '/password_reset/done/',
    password_reset_confirm: '/reset/:token/',
    password_reset_complete: '/reset/done/',
  };
  const urls = Object.fromEntries(Object.entries(PATHS).map(([name, path]) => [name, `${base}${path}`]));
  const route = (name, method, handler, extra = {}) =>
    app.route({ method, url: urls[name], ...(names ? { name } : {}), handler, ...extra });

  // A page: the app's template (views), or one of its own.
  function render(request, reply, page, context = {}) {
    if (views) return reply.view(`${views}/${page}`, { ...context, urls });
    const token =
      request.session && typeof request.session.csrfToken === 'function' ? request.session.csrfToken() : null;
    const csrf = token ? `<input type="hidden" name="_csrf" value="${escape(token)}">` : '';
    const [title, body] = OWN[page]({ ...context, csrf, urls });
    return reply.type('text/html; charset=utf-8').send(document(title, body, request.locale || 'en'));
  }
  const bodyOf = (request) =>
    request.method === 'POST' && request.body && typeof request.body === 'object' ? request.body : null;

  // Log in: the form, then to next (or loginRedirectUrl).
  route('login', ['GET', 'POST'], async (request, reply) => {
    const body = bodyOf(request);
    const next = safeNext(body ? body.next : request.query && request.query.next);
    const form = new forms.AuthenticationForm({ data: body });
    form.request = request;
    if (await form.isValid()) {
      await accounts.logIn(request, form.user);
      return reply.redirect(next || loginRedirectUrl);
    }
    return render(request, reply, 'login', { form, next });
  });

  // Log out (POST, as Django's since 5.0): the page that says so, or logoutRedirectUrl.
  route('logout', 'POST', async (request, reply) => {
    await accounts.logOut(request);
    if (logoutRedirectUrl) return reply.redirect(logoutRedirectUrl);
    return render(request, reply, 'logged_out');
  });

  // Change the password: the one now, the new one twice.
  route(
    'password_change',
    ['GET', 'POST'],
    async (request, reply) => {
      const form = new forms.PasswordChangeForm({ data: bodyOf(request) });
      if (await form.isValid()) {
        try {
          await accounts.changePassword(request, {
            current: form.cleanedData.oldPassword,
            password: form.cleanedData.newPassword1,
          });
          return reply.redirect(urls.password_change_done);
        } catch (err) {
          if (!err.errors) throw err;
          if (err.errors.current) form.addError('oldPassword', err.errors.current);
          else if (err.errors.password) form.addError('newPassword2', err.errors.password);
          else form.addError(null, err.message);
        }
      }
      return render(request, reply, 'password_change_form', { form });
    },
    { preHandler: accounts.loginRequired }
  );
  route('password_change_done', 'GET', async (request, reply) => render(request, reply, 'password_change_done'), {
    preHandler: accounts.loginRequired,
  });

  // A link to reset the password, by email (the same answer whether there is such an account or not); its address is
  // that of the confirm page, on siteUrl (or the host of the request).
  route('password_reset', ['GET', 'POST'], async (request, reply) => {
    const form = new forms.PasswordResetForm({ data: bodyOf(request) });
    if (await form.isValid()) {
      const site = (siteUrl || `${request.protocol}://${request.host}`).replace(/\/$/, '');
      try {
        await accounts.requestReset(form.cleanedData.email, request, {
          link: (token) => `${site}${urls.password_reset_confirm.replace(':token', encodeURIComponent(token))}`,
        });
        return reply.redirect(urls.password_reset_done);
      } catch (err) {
        if (!(err.statusCode >= 400 && err.statusCode < 500)) throw err;
        form.addError(err.errors && err.errors.email ? 'email' : null, (err.errors && err.errors.email) || err.message);
      }
    }
    return render(request, reply, 'password_reset_form', { form });
  });
  route('password_reset_done', 'GET', async (request, reply) => render(request, reply, 'password_reset_done'));

  // The link of the email: the new password twice, while the link is good (validlink).
  route('password_reset_confirm', ['GET', 'POST'], async (request, reply) => {
    const { token } = request.params;
    const validlink = Boolean(await accounts.checkResetToken(token, request));
    const form = new forms.SetPasswordForm({ data: validlink ? bodyOf(request) : null });
    if (await form.isValid()) {
      try {
        await accounts.resetPassword(token, form.cleanedData.newPassword1, request);
        return reply.redirect(urls.password_reset_complete);
      } catch (err) {
        if (!err.errors) throw err;
        if (err.errors.password) form.addError('newPassword2', err.errors.password);
        else form.addError(null, err.errors.token || err.message);
      }
    }
    return render(request, reply, 'password_reset_confirm', { form, validlink });
  });
  route('password_reset_complete', 'GET', async (request, reply) => render(request, reply, 'password_reset_complete'));

  app.decorate('accountPages', { urls, forms });
  done();
}

pagesPlugin[Symbol.for('skip-override')] = true;
pagesPlugin[Symbol.for('fastify.display-name')] = '@xufa/auth pages';

export { pagesPlugin, formsOf, safeNext };
