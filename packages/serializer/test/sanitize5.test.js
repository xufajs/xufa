import build from '../index.js';

test('sanitize 5', () => {
  const payload = '(throw "pwoned")'

  expect(() => {
    build({
      patternProperties: {
        '*': { type: `*/${payload}){//` }
      }
    })
  }).toThrow(expect.objectContaining({ message: 'schema is invalid: data/patternProperties must match format "regex"' }))
})
