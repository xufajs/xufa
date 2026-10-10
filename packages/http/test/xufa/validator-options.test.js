// Options of @xufa/schema itself for the validator of the routes (ajv.validatorOptions): here foldMessages, which
// writes the messages known when compiling as one text. The answers are the same as without it.
import xufa from '../../index.js';

const schema = {
  body: {
    type: 'object',
    properties: {
      customer: {
        type: 'object',
        properties: { email: { type: 'string' }, name: { type: 'string', minLength: 1 } },
        required: ['email', 'name'],
      },
      lines: { type: 'array', items: { type: 'object', properties: { qty: { type: 'integer', minimum: 1 } } } },
    },
    required: ['customer'],
  },
};

async function answer(options, payload) {
  const app = xufa(options);
  app.post('/orders', { schema }, async (request) => request.body);
  const response = await app.inject({ method: 'POST', url: '/orders', payload });
  await app.close();
  return { status: response.statusCode, body: response.json() };
}

describe('ajv.validatorOptions', () => {
  it('foldMessages: the same answers, valid and invalid, first error or all of them', async () => {
    const payloads = [
      { customer: { email: 'a@b.c', name: 'Ada' }, lines: [{ qty: 2 }] },
      { customer: { name: '' }, lines: [{ qty: 0 }] },
      {},
    ];
    for (const allErrors of [false, true]) {
      for (const payload of payloads) {
        const plain = await answer({ ajv: { customOptions: { allErrors } } }, payload);
        const folded = await answer(
          { ajv: { customOptions: { allErrors }, validatorOptions: { foldMessages: true } } },
          payload
        );
        expect(folded).toEqual(plain);
      }
    }
    expect((await answer({ ajv: { validatorOptions: { foldMessages: true } } }, payloads[1])).body.message).toBe(
      "body/customer must have required property 'email'"
    );
  });

  it('the option validation is the same as ajv.validatorOptions', async () => {
    const payload = { customer: { name: '' } };
    expect(await answer({ validation: { foldMessages: true } }, payload)).toEqual(
      await answer({ ajv: { validatorOptions: { foldMessages: true } } }, payload)
    );
  });

  it('an option the validator does not take is an error when the route compiles', async () => {
    const app = xufa({ ajv: { validatorOptions: { foldMessages: 'yes' } } });
    app.post('/orders', { schema }, async () => ({}));
    await expect(app.ready()).rejects.toThrow(/foldMessages/);
  });
});
