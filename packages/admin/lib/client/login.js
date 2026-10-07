/* global document, location */
// The login page of the admin: the user and password (and the code of an authenticator app, when the server asks for
// it), sent to login with the header of the admin and the CSRF token of the session. Messages are textContent.
(function () {
  'use strict';

  var form = document.getElementById('login');
  var message = document.getElementById('message');
  var codeField = document.getElementById('code-field');
  var code = document.getElementById('code');
  var button = form.querySelector('button');
  var csrf = document.querySelector('meta[name="csrf-token"]').getAttribute('content');

  function say(text) {
    message.textContent = text;
    message.hidden = !text;
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    say('');
    button.disabled = true;
    var body = {
      username: form.username.value,
      password: form.password.value,
      code: codeField.hidden ? undefined : code.value,
    };
    fetch('login', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-xufa-admin': '1',
        'x-csrf-token': csrf,
      },
      body: JSON.stringify(body),
    })
      .then(function (response) {
        return response.json().then(function (data) {
          return { ok: response.ok, data: data };
        });
      })
      .then(function (res) {
        button.disabled = false;
        if (res.ok) {
          location.href = './';
          return;
        }
        if (res.data.code) {
          // The password was right: the code of the authenticator app is asked for.
          codeField.hidden = false;
          code.focus();
        }
        say(res.data.error || 'Could not log in');
      })
      .catch(function () {
        button.disabled = false;
        say('Could not reach the server');
      });
  });
})();
