import boot from '../index.js';

test('calling done twice does not throw error', (testDone) => {
  expect.assertions(2)

  const app = boot()

  app
    .use(twiceDone)
    .ready((err) => {
      expect(err).toBeFalsy()
      testDone()
    })

  function twiceDone (s, opts, done) {
    done()
    done()
    expect('did not throw').toBeTruthy()
  }
})
