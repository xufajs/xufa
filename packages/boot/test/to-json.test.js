'use strict'


const boot = require('..')

test('to json', (end) => {
  expect.assertions(20)
  const app = boot()
  app
    .use(one)
    .use(two)
    .use(three)

  app.on('preReady', function show () {
    const json = app.toJSON()
    expect(json.id).toBe('root')
    expect(json.label).toBe('root')
    expect(json.start.toString()).toMatch(/\d+/)
    expect(Array.isArray(json.nodes)).toBeTruthy()
    expect(json.nodes.length).toBe(3)
  })

  function one (s, opts, done) {
    const json = app.toJSON()
    expect(json.nodes.length).toBe(1)
    expect(json.nodes[0].label).toBe('one')
    expect(json.nodes[0].start.toString()).toMatch(/\d+/)
    expect(json.nodes[0].id.toString()).toMatch(/.+/)
    expect(json.nodes[0].parent).toBe('root')
    done()
  }
  function two (s, opts, done) {
    const json = app.toJSON()
    expect(json.nodes.length).toBe(2)
    expect(json.nodes[1].label).toBe('two')
    expect(json.nodes[1].start.toString()).toMatch(/\d+/)
    expect(json.nodes[1].id.toString()).toMatch(/.+/)
    expect(json.nodes[1].parent).toBe('root')
    done()
  }
  function three (s, opts, done) {
    const json = app.toJSON()
    expect(json.nodes.length).toBe(3)
    expect(json.nodes[2].label).toBe('three')
    expect(json.nodes[2].start.toString()).toMatch(/\d+/)
    expect(json.nodes[2].id.toString()).toMatch(/.+/)
    expect(json.nodes[2].parent).toBe('root')
    done()
    end()
  }
})

test('to json multi-level hierarchy', (done) => {
  expect.assertions(38)
  const server = { name: 'asd', count: 0 }
  const app = boot(server)

  app.on('preReady', function show () {
    const json = app.toJSON()
    expect(json.id).toBe('root')
    expect(json.label).toBe('root')
    expect(json.start.toString()).toMatch(/\d+/)
    expect(json.stop.toString()).toMatch(/\d+/)
    expect(json.diff.toString()).toMatch(/\d+/)
    expect(Array.isArray(json.nodes)).toBeTruthy()
    expect(json.nodes.length).toBe(1)

    expect(json.nodes[0].parent).toBe('root')
    expect(json.nodes[0].label).toBe('first')
    expect(json.nodes[0].start.toString()).toMatch(/\d+/)
    expect(json.nodes[0].stop.toString()).toMatch(/\d+/)
    expect(json.nodes[0].diff.toString()).toMatch(/\d+/)
    expect(json.nodes[0].id.toString()).toMatch(/.+/)
    expect(json.nodes[0].nodes.length).toBe(2)

    expect(json.nodes[0].nodes[0].parent).toBe('first')
    expect(json.nodes[0].nodes[0].label).toBe('second')
    expect(json.nodes[0].nodes[0].start.toString()).toMatch(/\d+/)
    expect(json.nodes[0].nodes[0].stop.toString()).toMatch(/\d+/)
    expect(json.nodes[0].nodes[0].diff.toString()).toMatch(/\d+/)
    expect(json.nodes[0].nodes[0].id.toString()).toMatch(/.+/)
    expect(json.nodes[0].nodes[0].nodes.length).toBe(0)

    expect(json.nodes[0].nodes[1].parent).toBe('first')
    expect(json.nodes[0].nodes[1].label).toBe('third')
    expect(json.nodes[0].nodes[1].start.toString()).toMatch(/\d+/)
    expect(json.nodes[0].nodes[1].stop.toString()).toMatch(/\d+/)
    expect(json.nodes[0].nodes[1].diff.toString()).toMatch(/\d+/)
    expect(json.nodes[0].nodes[1].id.toString()).toMatch(/.+/)
    expect(json.nodes[0].nodes[1].nodes.length).toBe(1)

    expect(json.nodes[0].nodes[1].nodes[0].parent).toBe('third')
    expect(json.nodes[0].nodes[1].nodes[0].label).toBe('fourth')
    expect(json.nodes[0].nodes[1].nodes[0].start.toString()).toMatch(/\d+/)
    expect(json.nodes[0].nodes[1].nodes[0].stop.toString()).toMatch(/\d+/)
    expect(json.nodes[0].nodes[1].nodes[0].diff.toString()).toMatch(/\d+/)
    expect(json.nodes[0].nodes[1].nodes[0].id.toString()).toMatch(/.+/)
    expect(json.nodes[0].nodes[1].nodes[0].nodes.length).toBe(0)
  })

  app.override = function (s) {
    const res = Object.create(s)
    res.count = res.count + 1
    res.name = 'qwe'
    return res
  }

  app.use(function first (s1, opts, cb) {
    s1.use(second)
    s1.use(third)
    cb()

    function second (s2, opts, cb) {
      expect(s2.count).toBe(2)
      cb()
    }

    function third (s3, opts, cb) {
      s3.use(fourth)
      expect(s3.count).toBe(2)
      cb()
    }

    function fourth (s4, opts, cb) {
      expect(s4.count).toBe(3)
      cb()
      done()
    }
  })
})
