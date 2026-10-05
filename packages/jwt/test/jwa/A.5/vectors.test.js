/**
 * https://tools.ietf.org/html/rfc7515#appendix-A.5
 */

const fs = require('fs');
const path = require('path');

const test = require('../../shims/tape').test;

const jwa = require('../../../lib/jwa');

const input = fs.readFileSync(path.join(__dirname, 'input.txt'));

const algo = jwa('none');

test('A.5', function (t) {
	t.plan(2);

	t.equal(algo.sign(input), '');
	t.ok(algo.verify(input, ''));
})
