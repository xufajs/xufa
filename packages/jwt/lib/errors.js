// The errors of verify(), as jsonwebtoken has them: JsonWebTokenError, and its kinds TokenExpiredError (expiredAt)
// and NotBeforeError (date).
class JsonWebTokenError extends Error {
  constructor(message, error) {
    super(message);
    this.name = 'JsonWebTokenError';
    if (error) this.inner = error;
  }
}

class TokenExpiredError extends JsonWebTokenError {
  constructor(message, expiredAt) {
    super(message);
    this.name = 'TokenExpiredError';
    this.expiredAt = expiredAt;
  }
}

class NotBeforeError extends JsonWebTokenError {
  constructor(message, date) {
    super(message);
    this.name = 'NotBeforeError';
    this.date = date;
  }
}

module.exports = { JsonWebTokenError, TokenExpiredError, NotBeforeError };
