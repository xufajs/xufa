// @xufa/forms: the forms of a site, as django.forms: fields that take what a body gives and clean it, forms with their
// errors and HTML, and forms of models of @xufa/orm (ModelForm).
import {
  fields,
  Field,
  StringField,
  TextField,
  EmailField,
  UrlField,
  NumberField,
  BooleanField,
  DateField,
  ChoiceField,
  MultipleChoiceField,
  ModelChoiceField,
  ModelMultipleChoiceField,
  FileField,
  JsonField,
  ValidationError,
} from './lib/fields.js';
import { Form, BoundField, humanize } from './lib/form.js';
import { ModelForm, formFieldOf, modelFormOf } from './lib/model-form.js';
import * as messages from './lib/messages.js';
import { today, addDays, addMonths, dateOf } from './lib/dates.js';

export const FORMS_MESSAGES = messages.MESSAGES;
export const formsMessage = messages.message;
export const setTranslator = messages.setTranslator;

export {
  Form,
  ModelForm,
  BoundField,
  fields,
  Field,
  StringField,
  TextField,
  EmailField,
  UrlField,
  NumberField,
  BooleanField,
  DateField,
  ChoiceField,
  MultipleChoiceField,
  ModelChoiceField,
  ModelMultipleChoiceField,
  FileField,
  JsonField,
  ValidationError,
  formFieldOf,
  modelFormOf,
  humanize,
  today,
  addDays,
  addMonths,
  dateOf,
};
