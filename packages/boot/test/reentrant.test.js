import boot from '../index.js';

test('one level', (testDone) => {
  expect.assertions(13)

  const app = boot()
  let firstLoaded = false
  let secondLoaded = false
  let thirdLoaded = false

  app.use(first)
  app.use(third)

  function first (s, opts, done) {
    expect(firstLoaded).toBe(false)
    expect(secondLoaded).toBe(false)
    expect(thirdLoaded).toBe(false)
    firstLoaded = true
    s.use(second)
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
    expect(firstLoaded).toBeTruthy()
    expect(secondLoaded).toBeTruthy()
    expect(thirdLoaded).toBe(false)
    thirdLoaded = true
    done()
  }

  app.on('start', () => {
    expect(firstLoaded).toBeTruthy()
    expect(secondLoaded).toBeTruthy()
    expect(thirdLoaded).toBeTruthy()
    expect('booted').toBeTruthy()
    testDone()
  })
})

test('multiple reentrant plugin loading', (testDone) => {
  expect.assertions(31)

  const app = boot()
  let firstLoaded = false
  let secondLoaded = false
  let thirdLoaded = false
  let fourthLoaded = false
  let fifthLoaded = false

  app.use(first)
  app.use(fifth)

  function first (s, opts, done) {
    expect(firstLoaded).toBe(false)
    expect(secondLoaded).toBe(false)
    expect(thirdLoaded).toBe(false)
    expect(fourthLoaded).toBe(false)
    expect(fifthLoaded).toBe(false)
    firstLoaded = true
    s.use(second)
    done()
  }

  function second (s, opts, done) {
    expect(firstLoaded).toBeTruthy()
    expect(secondLoaded).toBe(false)
    expect(thirdLoaded).toBe(false)
    expect(fourthLoaded).toBe(false)
    expect(fifthLoaded).toBe(false)
    secondLoaded = true
    s.use(third)
    s.use(fourth)
    done()
  }

  function third (s, opts, done) {
    expect(firstLoaded).toBeTruthy()
    expect(secondLoaded).toBeTruthy()
    expect(thirdLoaded).toBe(false)
    expect(fourthLoaded).toBe(false)
    expect(fifthLoaded).toBe(false)
    thirdLoaded = true
    done()
  }

  function fourth (s, opts, done) {
    expect(firstLoaded).toBeTruthy()
    expect(secondLoaded).toBeTruthy()
    expect(thirdLoaded).toBeTruthy()
    expect(fourthLoaded).toBe(false)
    expect(fifthLoaded).toBe(false)
    fourthLoaded = true
    done()
  }

  function fifth (s, opts, done) {
    expect(firstLoaded).toBeTruthy()
    expect(secondLoaded).toBeTruthy()
    expect(thirdLoaded).toBeTruthy()
    expect(fourthLoaded).toBeTruthy()
    expect(fifthLoaded).toBe(false)
    fifthLoaded = true
    done()
  }

  app.on('start', () => {
    expect(firstLoaded).toBeTruthy()
    expect(secondLoaded).toBeTruthy()
    expect(thirdLoaded).toBeTruthy()
    expect(fourthLoaded).toBeTruthy()
    expect(fifthLoaded).toBeTruthy()
    expect('booted').toBeTruthy()
    testDone()
  })
})
