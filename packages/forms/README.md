# @xufa/forms

Forms as Django's: fields that take what a body gives (texts, numbers, dates, choices, objects of a model, files), clean
it and say what is wrong with it; forms with their errors by field and their HTML; and forms of models of
[@xufa/orm](../orm) (`ModelForm`) whose fields come from the model and are checked by it (its validation, rules, unique
values and constraints). No dependencies.

Its documentation is in [docs/forms/](../../docs/forms/index.html). This file is the summary.

```sh
npm install @xufa/forms
```

```js
import { Form, ModelForm, fields, ValidationError } from '@xufa/forms';

class RenewBookForm extends Form {
  static fields = {
    renewalDate: fields.date({ help: 'Enter a date between now and 4 weeks (default 3).' }),
  };

  cleanRenewalDate(value) {
    if (value < today()) throw new ValidationError('Invalid date - renewal in past');
    return value;
  }
}

class BookForm extends ModelForm {
  static meta = { model: Book, fields: ['title', 'author', 'summary', 'isbn', 'genre'] };
}

const form = new BookForm({ instance: book, data: request.method === 'POST' ? request.body : null });
if (await form.isValid())
  await form.save(); // the object, then its many-to-many
else await form.prepare(); // the objects of its choices, before it is shown
reply.view('catalog/form', { form }); // {{{ form.asTable() }}}
```

- **Fields**: `string`, `text`, `email`, `url`, `password`, `hidden`, `integer`, `number`, `decimal`, `boolean`,
  `date`, `datetime`, `choice`, `multipleChoice`, `modelChoice`, `modelMultipleChoice`, `file`, `json`; each with
  `required`, `label`, `help`, `initial`, `disabled`, `validators`, `attrs` and `messages` (its own texts by the code
  of the error, Django's `error_messages`).
- **Days**: dates limited by `min` and `max` days, `'today'` or relative ones (`fields.date({ min: 'today', max:
'+4w' })`); `today()`, `addDays(n)`, `addMonths(n)` and `dateOf('+4w')` give `'YYYY-MM-DD'` texts.
- **Cleaning**: each field, then `clean<Name>(value)` of the form, then `clean(data)`; `errors` by field (`__all__` for
  the form), `addError()`, `cleanedData`.
- **HTML**: `asTable()`, `asP()`, `asUl()`, `asDiv()`, or field by field (`form.field(name)`: `labelTag()`, `widget()`,
  `errorsHtml()`, `helpHtml()`); values escaped.
- **ModelForm**: `meta.fields` / `exclude` / `labels` / `help` / `widgets`; the model's labels, help texts and choices;
  the model's checks and Django's `validate_unique` (unique fields and constraints, as `Lower('name')`, with their
  messages); `save({ commit })`.
- **Languages**: messages by key (`FORMS_MESSAGES`), translated by `i18n.translateForms(forms)` of
  [@xufa/i18n](../i18n).

## License

MIT
