import FindMyWay from '../index.js';

test('routes differing only by a static part between parameters are distinct', () => {
  expect.assertions(2)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/h5/:cityName-:poiName/hotels-c:cityId-r:poiId', () => 'r')
  findMyWay.on('GET', '/h5/:cityName-:poiName/hotels-c:cityId-a:poiId', () => 'a')

  expect(findMyWay.find('GET', '/h5/city-poi/hotels-cC1-rP1').handler()).toBe('r')
  expect(findMyWay.find('GET', '/h5/city-poi/hotels-cC1-aP1').handler()).toBe('a')
})

test('parameters separated by different static parts do not collide', () => {
  expect.assertions(2)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/foo/:a-:b', () => 'dash')
  findMyWay.on('GET', '/foo/:a.:b', () => 'dot')

  expect(findMyWay.find('GET', '/foo/x-y').handler()).toBe('dash')
  expect(findMyWay.find('GET', '/foo/x.y').handler()).toBe('dot')
})

test('params are still parsed when a node ends with a parameter', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/h5/:cityName-:poiName/hotels-c:cityId-r:poiId', () => {})

  expect(findMyWay.find('GET', '/h5/city-poi/hotels-cC1-rP1').params).toEqual({
    cityName: 'city',
    poiName: 'poi',
    cityId: 'C1',
    poiId: 'P1'
  })
})

test('findRoute distinguishes routes differing only by an interior static part', () => {
  expect.assertions(3)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/h5/:cityName-:poiName/hotels-c:cityId-r:poiId', () => 'r')
  findMyWay.on('GET', '/h5/:cityName-:poiName/hotels-c:cityId-a:poiId', () => 'a')

  expect(findMyWay.findRoute('GET', '/h5/:cityName-:poiName/hotels-c:cityId-r:poiId').handler()).toBe('r')
  expect(findMyWay.findRoute('GET', '/h5/:cityName-:poiName/hotels-c:cityId-a:poiId').handler()).toBe('a')
  expect(findMyWay.findRoute('GET', '/h5/:cityName-:poiName/hotels-c:cityId-z:poiId')).toBe(null)
})

test('duplicate routes ending with a parameter are still rejected', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/h5/hotels-c:cityId-r:poiId', () => {})

  expect(() => findMyWay.on('GET', '/h5/hotels-c:cityId-r:poiId', () => {})).toThrow(/already declared/)
})
