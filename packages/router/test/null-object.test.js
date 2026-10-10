import { NullObject } from '../index.js';

test('NullObject', () => {
  expect.assertions(2)
  const nullObject = new NullObject()
  expect(nullObject instanceof NullObject).toBeTruthy()
  expect(typeof nullObject === 'object').toBeTruthy()
})

test('has no methods from generic Object class', () => {
  function getAllPropertyNames (obj) {
    const props = []

    do {
      Object.getOwnPropertyNames(obj).forEach(function (prop) {
        if (props.indexOf(prop) === -1) {
          props.push(prop)
        }
      })
    } while (obj = Object.getPrototypeOf(obj)) // eslint-disable-line

    return props
  }
  const propertyNames = getAllPropertyNames({})
  expect.assertions(propertyNames.length + 1)

  const nullObject = new NullObject()

  for (const propertyName of propertyNames) {
    expect(propertyName in nullObject).toBeFalsy()
  }
  expect(getAllPropertyNames(nullObject).length).toBe(0)
})
