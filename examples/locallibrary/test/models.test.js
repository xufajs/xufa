// catalog/tests/test_models.py: the fields of Author, its text and its address.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { useTestApp } from 'xufa/testing';
import { Author } from '../catalog/models.js';
import { humanize } from 'xufa/forms';

useTestApp();

let author;
beforeEach(async () => {
  author = await Author.objects.create({ firstName: 'Big', lastName: 'Bob' });
});

const field = (name) => Author.meta.fields.find((item) => item.name === name);

// Django's verbose_name: the label of the field, or one made of its name.
const labelOfField = (name) => (field(name).label || humanize(name)).toLowerCase();
test('first name label', () => assert.equal(labelOfField('firstName'), 'first name'));
test('last name label', () => assert.equal(labelOfField('lastName'), 'last name'));
test('date of birth label', () => assert.equal(labelOfField('dateOfBirth'), 'date of birth'));
test('date of death label', () => assert.equal(labelOfField('dateOfDeath'), 'died'));

test('first name max length', () => assert.equal(field('firstName').maxLength, 100));
test('last name max length', () => assert.equal(field('lastName').maxLength, 100));

test('object name is last name, comma, first name', async () => {
  const found = await Author.objects.get({ pk: author.pk });
  assert.equal(String(found), `${found.lastName}, ${found.firstName}`);
});

test('absolute url', async () => {
  const found = await Author.objects.get({ pk: author.pk });
  assert.equal(found.absoluteUrl, `/catalog/author/${author.pk}`);
});
