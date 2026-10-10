// The errors of the driver. MongoServerError is a reply with ok: 0 or with write errors: its code is the code of the
// server (11000 for duplicate keys) and codeName its name.

class MongoError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'MongoError';
    // Labels of the server (TransientTransactionError...), or of the driver for errors of the network.
    this.errorLabels = [];
  }

  hasErrorLabel(label) {
    return this.errorLabels.includes(label);
  }
}

class MongoNetworkError extends MongoError {
  constructor(message, options) {
    super(message, options);
    this.name = 'MongoNetworkError';
  }
}

class MongoServerError extends MongoError {
  constructor(reply) {
    const writeError = reply.writeErrors && reply.writeErrors[0];
    const concernError = reply.writeConcernError;
    const source = writeError || concernError || reply;
    super(source.errmsg || 'Unknown server error');
    this.name = 'MongoServerError';
    this.code = source.code;
    this.codeName = source.codeName || reply.codeName;
    this.errorLabels = reply.errorLabels || [];
    this.reply = reply;
    if (writeError) this.writeErrors = reply.writeErrors;
  }
}

export { MongoError, MongoNetworkError, MongoServerError };
