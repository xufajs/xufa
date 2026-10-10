import FindMyWay from '../index.js';

test('Double colon and parametric children', () => {
  expect.assertions(2)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/::articles', () => {})
  findMyWay.on('GET', '/:article_name', () => {})

  expect(findMyWay.find('GET', '/:articles').params).toEqual({})
  expect(findMyWay.find('GET', '/articles_param').params).toEqual({ article_name: 'articles_param' })
})

test('Double colon and parametric children', () => {
  expect.assertions(2)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/::test::foo/:param/::articles', () => {})
  findMyWay.on('GET', '/::test::foo/:param/:article_name', () => {})

  expect(findMyWay.find('GET', '/:test:foo/param_value1/:articles').params).toEqual({ param: 'param_value1' })
  expect(findMyWay.find('GET', '/:test:foo/param_value2/articles_param').params).toEqual({ param: 'param_value2', article_name: 'articles_param' })
})
