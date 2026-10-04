// Ported from sequelize (types/instance-validator.d.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import { Hookable } from './model';

export interface ValidationOptions extends Hookable {
  /**
   * An array of strings. All properties that are in this array will not be validated
   */
  skip?: string[];
  /**
   * An array of strings. Only the properties that are in this array will be validated
   */
  fields?: string[];
}
