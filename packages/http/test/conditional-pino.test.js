'use strict'

// Whether an instance loads @xufa/logger, in a process of its own: the modules of the library are ES modules, which
// the test files of a run share, so one that made a logger before would have loaded it already.
const { execFileSync } = require('node:child_process')
const path = require('node:path')

function loadsLogger (options) {
  const script = `
    const fastify = require(${JSON.stringify(path.join(__dirname, '..'))})
    fastify(${options})
    process.stdout.write(String(require.cache[require.resolve('@xufa/logger')] !== undefined))
  `
  return execFileSync(process.execPath, ['-e', script], { cwd: path.join(__dirname, '..'), encoding: 'utf8' }) === 'true'
}

test("pino is not require'd if logger is not passed", () => {
  expect(loadsLogger('')).toBe(false)
})

test("pino is require'd if logger is passed", () => {
  expect(loadsLogger('{ logger: true }')).toBe(true)
})

test("pino is require'd if loggerInstance is passed", () => {
  const loggerInstance = `{
    fatal: () => {}, error: () => {}, warn: () => {}, info: () => {}, debug: () => {}, trace: () => {},
    child () { return this }
  }`
  expect(loadsLogger(`{ loggerInstance: ${loggerInstance} }`)).toBe(true)
})
