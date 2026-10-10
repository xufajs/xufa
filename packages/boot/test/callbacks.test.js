import boot from '../index.js';

test('reentrant', (testCompleted) => {
  expect.assertions(7)

  const app = boot()
  let firstLoaded = false
  let secondLoaded = false

  app
    .use(first)
    .after(() => {
      expect(firstLoaded).toBeTruthy()
      expect(secondLoaded).toBeTruthy()
      expect(true).toBeTruthy()
      testCompleted()
    })

  function first (s, opts, done) {
    expect(firstLoaded).toBe(false)
    expect(secondLoaded).toBe(false)
    firstLoaded = true
    s.use(second)
    done()
  }

  function second (s, opts, done) {
    expect(firstLoaded).toBeTruthy()
    expect(secondLoaded).toBe(false)
    secondLoaded = true
    done()
  }
})

test('reentrant with callbacks deferred', (testCompleted) => {
  expect.assertions(11)

  const app = boot()
  let firstLoaded = false
  let secondLoaded = false
  let thirdLoaded = false

  app.use(first)

  function first (s, opts, done) {
    expect(firstLoaded).toBe(false)
    expect(secondLoaded).toBe(false)
    expect(thirdLoaded).toBe(false)
    firstLoaded = true
    s.use(second)
    setTimeout(() => {
      try {
        s.use(third)
      } catch (err) {
        expect(err.message).toBe('Root plugin has already booted')
      }
      testCompleted()
    }, 500)
    done()
  }

  function second (s, opts, done) {
    expect(firstLoaded).toBeTruthy()
    expect(secondLoaded).toBe(false)
    expect(thirdLoaded).toBe(false)
    secondLoaded = true
    done()
  }

  function third (s, opts, done) {
    thirdLoaded = true
    done()
  }

  app.on('start', () => {
    expect(firstLoaded).toBeTruthy()
    expect(secondLoaded).toBeTruthy()
    expect(thirdLoaded).toBe(false)
    expect(true).toBeTruthy()
  })
})

test('multiple loading time', (testCompleted) => {
  expect.assertions(1)
  const app = boot()

  function a (instance, opts, done) {
    (opts.use || []).forEach(_ => { instance.use(_, { use: opts.subUse || [] }) })
    setTimeout(done, 10)
  }
  const pointer = a

  function b (instance, opts, done) {
    (opts.use || []).forEach(_ => { instance.use(_, { use: opts.subUse || [] }) })
    setTimeout(done, 20)
  }

  function c (instance, opts, done) {
    (opts.use || []).forEach(_ => { instance.use(_, { use: opts.subUse || [] }) })
    setTimeout(done, 30)
  }

  app
    .use(function a (instance, opts, done) {
      instance.use(pointer, { use: [b], subUse: [c] })
        .use(b)
      setTimeout(done, 0)
    })
    .after(() => {
      expect(true).toBeTruthy()
      testCompleted()
    })
})
