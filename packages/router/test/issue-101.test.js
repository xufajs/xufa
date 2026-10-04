'use strict'


const FindMyWay = require('../')

test('Falling back for node\'s parametric brother', () => {
  expect.assertions(3)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/:namespace/:type/:id', () => {})
  findMyWay.on('GET', '/:namespace/jobs/:name/run', () => {})

  expect(findMyWay.find('GET', '/test_namespace/test_type/test_id').params).toEqual({ namespace: 'test_namespace', type: 'test_type', id: 'test_id' })

  expect(findMyWay.find('GET', '/test_namespace/jobss/test_id').params).toEqual({ namespace: 'test_namespace', type: 'jobss', id: 'test_id' })

  expect(findMyWay.find('GET', '/test_namespace/jobs/test_id').params).toEqual({ namespace: 'test_namespace', type: 'jobs', id: 'test_id' })
})
