import { errorCodes } from '../../index.js'


test('errorCodes in ESM', async () => {
  // test a custom fastify error using errorCodes with ESM
  const customError = errorCodes.XUFA_ERR_VALIDATION('custom error message')
  expect(typeof customError !== 'undefined').toBeTruthy()
  expect(customError instanceof errorCodes.XUFA_ERR_VALIDATION).toBeTruthy()
  expect(customError.message).toBe('custom error message')
})
