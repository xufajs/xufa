// Ported from sequelize (types/utils/validator-extras.d.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
/** The validators of validator.js that @xufa/sequelize has: (value, ...arguments) => whether it is valid. */
interface OrigValidator {
  isEmail(str: string, ...args: any[]): boolean;
  isURL(str: string, ...args: any[]): boolean;
  isJSON(str: string, ...args: any[]): boolean;
  isBoolean(str: string, ...args: any[]): boolean;
  isIP(str: string, ...args: any[]): boolean;
  isAlpha(str: string, ...args: any[]): boolean;
  isAlphanumeric(str: string, ...args: any[]): boolean;
  isNumeric(str: string, ...args: any[]): boolean;
  isInt(str: string, ...args: any[]): boolean;
  isFloat(str: string, ...args: any[]): boolean;
  isDecimal(str: string, ...args: any[]): boolean;
  isHexadecimal(str: string, ...args: any[]): boolean;
  isLowercase(str: string, ...args: any[]): boolean;
  isUppercase(str: string, ...args: any[]): boolean;
  isUUID(str: string, ...args: any[]): boolean;
  isDate(str: string, ...args: any[]): boolean;
  isCreditCard(str: string, ...args: any[]): boolean;
  isIn(str: string, values: unknown[]): boolean;
  isAfter(str: string, date?: string | Date): boolean;
  isBefore(str: string, date?: string | Date): boolean;
  equals(str: string, comparison: string): boolean;
  isNull(value: unknown): boolean;
  notNull(value: unknown): boolean;
  isArray(value: unknown): boolean;
  /** Adds a validator (by its name, to the validate options of attributes too). */
  extend(name: string, fn: (str: string, ...args: any[]) => boolean): this;
}

export interface Extensions {
  notEmpty(str: string): boolean;
  len(str: string, min: number, max: number): boolean;
  isUrl(str: string): boolean;
  isIPv6(str: string): boolean;
  isIPv4(str: string): boolean;
  notIn(str: string, values: string[]): boolean;
  regex(str: string, pattern: string, modifiers: string): boolean;
  notRegex(str: string, pattern: string, modifiers: string): boolean;
  min(str: string, val: number): boolean;
  max(str: string, val: number): boolean;
  not(str: string, pattern: string, modifiers: string): boolean;
  contains(str: string, elem: string[]): boolean;
  notContains(str: string, elem: string[]): boolean;
  is(str: string, pattern: string, modifiers: string): boolean;
}
export const extensions: Extensions;

export interface Validator extends OrigValidator, Extensions {
  contains(str: string, elem: string[]): boolean;
}
export const validator: Validator;

/** The validators of the attributes (Sequelize.Validator). */
export const Validator: Validator;
