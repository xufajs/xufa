// Ported from dotenv's tests/test-decrypt.js (BSD-2-Clause License) by tools/port-dotenv/port.js: do not edit, change the tool.
const FIXTURES = require('path').relative(process.cwd(), require('path').join(__dirname, 'tests'));
const t = require('../support/tap.js')

const dotenv = require('../../../dotenv.js')

t.test('can decrypt', ct => {
  ct.plan(1)

  const encrypted = 's7NYXa809k/bVSPwIAmJhPJmEGTtU0hG58hOZy7I0ix6y5HP8LsHBsZCYC/gw5DDFy5DgOcyd18R'
  const keyStr = 'ddcaa26504cd70a6fef9801901c3981538563a1767c297cb8416e8a38c62fe00'

  const result = dotenv.decrypt(encrypted, keyStr)

  ct.equal(result, '# development@v6\nALPHA="zeta"')
})
