// Forms: fields that clean what a body gives, the errors of each field and of the form, and the HTML.
import { Form, fields, ValidationError, FORMS_MESSAGES, setTranslator, formsMessage } from '../index.js';
import * as indexModule from '../index.js';

const today = () => new Date().toISOString().slice(0, 10);

class RenewBookForm extends Form {
  static fields = {
    renewalDate: fields.date({ help: 'Enter a date between now and 4 weeks (default 3).' }),
  };

  cleanRenewalDate(value) {
    if (value < today()) throw new ValidationError('Invalid date - renewal in past');
    return value;
  }
}

class ContactForm extends Form {
  static fields = {
    name: fields.string({ maxLength: 20, label: 'Your name' }),
    email: fields.email(),
    age: fields.integer({ required: false, min: 18 }),
    price: fields.decimal({ required: false, maxDigits: 5, decimalPlaces: 2 }),
    topics: fields.multipleChoice({ choices: { books: 'Books', films: 'Films' }, required: false }),
    kind: fields.choice({ choices: [['q', 'Question'], ['c', 'Complaint']], widget: 'radio' }),
    agree: fields.boolean(),
    token: fields.hidden({ required: false }),
    password: fields.password({ required: false }),
    data: fields.json({ required: false }),
  };

  clean(data) {
    if (data.kind === 'c' && !data.age) throw new ValidationError('A complaint needs your age');
    return data;
  }
}

describe('Form', () => {
  it('a field cleaned, and clean<Name>() of the form (Django renew_book form)', async () => {
    const past = new RenewBookForm({ data: { renewal_date: 'x', renewalDate: '2000-01-01' } });
    expect(await past.isValid()).toBe(false);
    expect(past.errors).toEqual({ renewalDate: ['Invalid date - renewal in past'] });
    const ok = new RenewBookForm({ data: { renewalDate: today() } });
    expect([await ok.isValid(), ok.cleanedData]).toEqual([true, { renewalDate: today() }]);
    const missing = new RenewBookForm({ data: {} });
    expect([await missing.isValid(), missing.errors]).toEqual([false, { renewalDate: ['This field is required.'] }]);
    expect((await new RenewBookForm({ data: { renewalDate: '2026-02-30' } }).isValid())).toBe(false);
    // A form not sent is not valid, and has no errors.
    const unbound = new RenewBookForm({ initial: { renewalDate: '2030-01-01' } });
    expect([unbound.isBound, await unbound.isValid(), unbound.errors]).toEqual([false, false, {}]);
    expect(unbound.field('renewalDate').label).toBe('Renewal date');
    expect(unbound.field('renewalDate').help).toBe('Enter a date between now and 4 weeks (default 3).');
  });

  it('every kind of field: texts, emails, numbers, decimals, choices, checkboxes, JSON; clean() of the form', async () => {
    const form = new ContactForm({
      data: {
        name: '  Ada  ',
        email: 'ada@example.com',
        age: '36',
        price: '12.50',
        topics: ['books', 'films'],
        kind: 'q',
        agree: 'on',
        data: '{"a":1}',
      },
    });
    expect(await form.isValid()).toBe(true);
    expect(form.cleanedData).toEqual({
      name: 'Ada',
      email: 'ada@example.com',
      age: 36,
      price: '12.50',
      topics: ['books', 'films'],
      kind: 'q',
      agree: true,
      token: null,
      password: null,
      data: { a: 1 },
    });
    const wrong = new ContactForm({
      data: { name: 'x'.repeat(21), email: 'nope', age: '7.5', price: '1234.567', topics: 'music', kind: 'c', data: '{' },
    });
    expect(await wrong.isValid()).toBe(false);
    expect(wrong.errors).toEqual({
      name: ['Ensure this value has at most 20 characters (it has 21).'],
      email: ['Enter a valid email address.'],
      age: ['Enter a whole number.'],
      price: ['Ensure that there are no more than 2 decimal places.'],
      topics: ['Select a valid choice. music is not one of the available choices.'],
      agree: ['This field is required.'],
      data: ['Enter a valid JSON.'],
      __all__: ['A complaint needs your age'],
    });
    expect(wrong.nonFieldErrors()).toEqual(['A complaint needs your age']);
    const young = new ContactForm({ data: { name: 'a', email: 'a@b.co', age: '3', kind: 'q', agree: '1' } });
    await young.isValid();
    expect(young.errors.age).toEqual(['Ensure this value is greater than or equal to 18.']);
  });

  it('HTML: as a table, paragraphs, items and divs; errors, help, ids, values kept, hidden fields, prefixes', async () => {
    const form = new ContactForm({
      data: { 'contact-name': 'Ada <b>', 'contact-email': 'nope', 'contact-kind': 'q', 'contact-password': 'secret' },
      prefix: 'contact',
    });
    await form.isValid();
    const table = form.asTable();
    expect(table).toContain('<tr><th><label for="id_contact-name">Your name:</label></th><td><input type="text" name="contact-name" value="Ada &lt;b&gt;"');
    expect(table).toContain('<ul class="errorlist"><li>Enter a valid email address.</li></ul><input type="email" name="contact-email" value="nope"');
    expect(table).toContain('aria-invalid="true"');
    expect(table).toContain('<input type="radio" name="contact-kind" value="q" id="id_contact-kind_0" checked required>');
    expect(table).toContain('<input type="hidden" name="contact-token" value="" id="id_contact-token">');
    // A password is not written back.
    expect(table).toContain('<input type="password" name="contact-password" value=""');
    expect(table).toContain('<select name="contact-topics" multiple id="id_contact-topics"><option value="books">Books</option>');
    expect(form.asP()).toContain('<p><label for="id_contact-age">Age:</label> <input type="number" name="contact-age" value="" min="18" id="id_contact-age"></p>');
    expect(form.asUl()).toMatch(/^<li><label for="id_contact-name">Your name:<\/label> <input/);
    expect(form.asDiv()).toContain('<div><label for="id_contact-name">Your name:</label>');
    expect(String(form)).toBe(form.asDiv());
    const renew = new RenewBookForm({ initial: { renewalDate: '2030-01-01' } });
    expect(renew.field('renewalDate').widget()).toBe(
      '<input type="date" name="renewalDate" value="2030-01-01" id="id_renewalDate" aria-describedby="id_renewalDate_helptext" required>'
    );
    expect(renew.field('renewalDate').helpHtml()).toBe('<span class="helptext" id="id_renewalDate_helptext">Enter a date between now and 4 weeks (default 3).</span>');
    expect([...renew.boundFields].map((field) => field.name)).toEqual(['renewalDate']);
  });

  it('files of a multipart form: size and types; fields of the parents; disabled fields keep their initial value', async () => {
    class Upload extends Form {
      static fields = { cover: fields.file({ maxSize: 10, accept: ['image/*'] }), title: fields.string({ disabled: true, initial: 'Fixed' }) };
    }
    class Bigger extends Upload {
      static fields = { notes: fields.text({ required: false }), title: null };
    }
    const file = (size, contentType) => ({ filename: 'a', contentType, size, data: Buffer.alloc(size) });
    const ok = new Upload({ data: { cover: file(5, 'image/png'), title: 'changed' } });
    expect([await ok.isValid(), ok.cleanedData.cover.size, ok.cleanedData.title]).toEqual([true, 5, 'Fixed']);
    const big = new Upload({ data: { cover: file(11, 'image/png') } });
    await big.isValid();
    expect(big.errors.cover).toEqual(['Ensure this file has at most 10 bytes (it has 11).']);
    const type = new Upload({ data: { cover: file(1, 'text/plain') } });
    await type.isValid();
    expect(type.errors.cover).toEqual(['This type of file is not accepted (text/plain).']);
    expect(Object.keys(new Bigger().fields)).toEqual(['cover', 'notes']);
    expect(new Upload().field('cover').widget()).toBe('<input type="file" name="cover" accept="image/*" id="id_cover" required>');
    expect(() => {
      class Wrong extends Form {
        static fields = { a: 'text' };
      }
      return new Wrong();
    }).toThrow('is not a field of @xufa/forms');
  });

  it('messages by key, translated by a translator', () => {
    expect(FORMS_MESSAGES.required).toBe('This field is required.');
    setTranslator((key, params, english) => (key === 'forms.required' ? 'Obligatorio.' : english));
    expect(formsMessage('required')).toBe('Obligatorio.');
    setTranslator(null);
    expect(formsMessage('required')).toBe('This field is required.');
  });
});

describe('days and the limits of dates', () => {
  const forms = indexModule;

  it('today(), addDays(), addMonths() and dateOf(): days as texts, in the time of the machine', () => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    expect(forms.today()).toBe(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
    expect(forms.addDays(1, '2026-02-28')).toBe('2026-03-01');
    expect(forms.addDays(-1, '2026-01-01')).toBe('2025-12-31');
    expect(forms.addMonths(1, '2026-01-31')).toBe('2026-02-28');
    expect(forms.dateOf('+4w')).toBe(forms.addDays(28));
    expect(forms.dateOf('-1d')).toBe(forms.addDays(-1));
    expect(forms.dateOf('+1y')).toBe(forms.addMonths(12));
    expect(forms.dateOf('2026-05-01')).toBe('2026-05-01');
    expect(forms.dateOf(() => 'today')).toBe(forms.today());
    expect(() => forms.dateOf('soon')).toThrow("A day is YYYY-MM-DD, 'today', '+4w'");
  });

  it('min and max of a date: today or relative, read when it is asked, in the input; messages of the field', async () => {
    class Renew extends Form {
      static fields = {
        renewalDate: fields.date({
          min: 'today',
          max: '+4w',
          messages: { min: 'Invalid date - renewal in past', max: 'Invalid date - renewal more than 4 weeks ahead' },
        }),
      };
    }
    const errorsOf = async (renewalDate) => {
      const form = new Renew({ data: { renewalDate } });
      await form.isValid();
      return form.errors;
    };
    expect(await errorsOf(forms.addDays(-1))).toEqual({ renewalDate: ['Invalid date - renewal in past'] });
    expect(await errorsOf(forms.addDays(29))).toEqual({
      renewalDate: ['Invalid date - renewal more than 4 weeks ahead'],
    });
    expect(await errorsOf(forms.today())).toEqual({});
    expect(await errorsOf(forms.addDays(28))).toEqual({});
    // Other codes keep theirs; required has its own too.
    expect(await errorsOf('nope')).toEqual({ renewalDate: ['Enter a valid date.'] });
    const html = new Renew().asP();
    expect(html).toContain(`min="${forms.today()}"`);
    expect(html).toContain(`max="${forms.addDays(28)}"`);
    class Named extends Form {
      static fields = { name: fields.string({ messages: { required: 'Give a name.' } }) };
    }
    const named = new Named({ data: {} });
    await named.isValid();
    expect(named.errors).toEqual({ name: ['Give a name.'] });
  });
});
