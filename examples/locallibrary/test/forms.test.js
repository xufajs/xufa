// catalog/tests/test_forms.py: the renewal date of RenewBookForm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RenewBookForm } from '../catalog/forms.js';
import { addDays as inDays } from 'xufa/forms';

const formOf = (date) => new RenewBookForm({ data: { renewalDate: date } });
const valid = (date) => formOf(date).isValid();

test('renew form: the label and help text of the field', () => {
  const field = new RenewBookForm().field('renewalDate');
  assert.equal(field.label.toLowerCase(), 'renewal date');
  assert.equal(field.help, 'Enter a date between now and 4 weeks (default 3).');
});
test('renew form: a date in the past is not valid', async () => assert.equal(await valid(inDays(-1)), false));
test('renew form: a date more than 4 weeks ahead is not valid', async () =>
  assert.equal(await valid(inDays(29)), false));
test('renew form: today is valid', async () => assert.equal(await valid(inDays(0)), true));
test('renew form: 4 weeks ahead is valid', async () => assert.equal(await valid(inDays(28)), true));
test('renew form: the errors say why', async () => {
  const errorsOf = async (date) => {
    const form = formOf(date);
    await form.isValid();
    return form.errors;
  };
  assert.deepEqual(await errorsOf(inDays(-7)), { renewalDate: ['Invalid date - renewal in past'] });
  assert.deepEqual(await errorsOf(''), { renewalDate: ['This field is required.'] });
  assert.deepEqual(await errorsOf('soon'), { renewalDate: ['Enter a valid date.'] });
});
