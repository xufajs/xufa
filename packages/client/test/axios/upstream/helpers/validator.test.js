// Ported from axios's tests/unit/helpers/validator.test.js (MIT License) by tools/port-axios/port.js: do not edit, change the tool.
import { describe, it, expect } from '@xufa/test';
import { AxiosError } from '../../support/internals.js';
import { validator } from '../../support/internals.js';

describe('validator::assertOptions', () => {
  it('should throw only if unknown an option was passed', () => {
    let error;
    try {
      validator.assertOptions(
        {
          x: true,
        },
        {
          y: validator.validators.boolean,
        }
      );
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(AxiosError);
    expect(error.message).toBe('Unknown option x');
    expect(error.code).toBe(AxiosError.ERR_BAD_OPTION);

    expect(() => {
      validator.assertOptions(
        {
          x: true,
        },
        {
          x: validator.validators.boolean,
          y: validator.validators.boolean,
        }
      );
    }).not.toThrow(new Error('Unknown option x'));
  });

  it("should throw TypeError only if option type doesn't match", () => {
    let error;
    try {
      validator.assertOptions(
        {
          x: 123,
        },
        {
          x: validator.validators.boolean,
        }
      );
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(AxiosError);
    expect(error.message).toBe('option x must be a boolean');
    expect(error.code).toBe(AxiosError.ERR_BAD_OPTION_VALUE);

    expect(() => {
      validator.assertOptions(
        {
          x: true,
        },
        {
          x: validator.validators.boolean,
          y: validator.validators.boolean,
        }
      );
    }).not.toThrow();
  });
});
