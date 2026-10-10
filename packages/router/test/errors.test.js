import FindMyWay from '../index.js';

test('Method should be a string', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  try {
    findMyWay.on(0, '/test', () => {})
    expect.fail('method shoukd be a string')
  } catch (e) {
    expect(e.message).toBe('Method should be a string')
  }
})

test('Method should be a string [ignoreTrailingSlash=true]', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({ ignoreTrailingSlash: true })

  try {
    findMyWay.on(0, '/test', () => {})
    expect.fail('method shoukd be a string')
  } catch (e) {
    expect(e.message).toBe('Method should be a string')
  }
})

test('Method should be a string [ignoreDuplicateSlashes=true]', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({ ignoreDuplicateSlashes: true })

  try {
    findMyWay.on(0, '/test', () => {})
    expect.fail('method shoukd be a string')
  } catch (e) {
    expect(e.message).toBe('Method should be a string')
  }
})

test('Method should be a string (array)', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  try {
    findMyWay.on(['GET', 0], '/test', () => {})
    expect.fail('method shoukd be a string')
  } catch (e) {
    expect(e.message).toBe('Method should be a string')
  }
})

test('Method should be a string (array) [ignoreTrailingSlash=true]', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({ ignoreTrailingSlash: true })

  try {
    findMyWay.on(['GET', 0], '/test', () => {})
    expect.fail('method shoukd be a string')
  } catch (e) {
    expect(e.message).toBe('Method should be a string')
  }
})

test('Method should be a string (array) [ignoreDuplicateSlashes=true]', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({ ignoreDuplicateSlashes: true })

  try {
    findMyWay.on(['GET', 0], '/test', () => {})
    expect.fail('method shoukd be a string')
  } catch (e) {
    expect(e.message).toBe('Method should be a string')
  }
})

test('Path should be a string', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  try {
    findMyWay.on('GET', 0, () => {})
    expect.fail('path should be a string')
  } catch (e) {
    expect(e.message).toBe('Path should be a string')
  }
})

test('Path should be a string [ignoreTrailingSlash=true]', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({ ignoreTrailingSlash: true })

  try {
    findMyWay.on('GET', 0, () => {})
    expect.fail('path should be a string')
  } catch (e) {
    expect(e.message).toBe('Path should be a string')
  }
})

test('Path should be a string [ignoreDuplicateSlashes=true]', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({ ignoreDuplicateSlashes: true })

  try {
    findMyWay.on('GET', 0, () => {})
    expect.fail('path should be a string')
  } catch (e) {
    expect(e.message).toBe('Path should be a string')
  }
})

test('The path could not be empty', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  try {
    findMyWay.on('GET', '', () => {})
    expect.fail('The path could not be empty')
  } catch (e) {
    expect(e.message).toBe('The path could not be empty')
  }
})

test('The path could not be empty [ignoreTrailingSlash=true]', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({ ignoreTrailingSlash: true })

  try {
    findMyWay.on('GET', '', () => {})
    expect.fail('The path could not be empty')
  } catch (e) {
    expect(e.message).toBe('The path could not be empty')
  }
})

test('The path could not be empty [ignoreDuplicateSlashes=true]', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({ ignoreDuplicateSlashes: true })

  try {
    findMyWay.on('GET', '', () => {})
    expect.fail('The path could not be empty')
  } catch (e) {
    expect(e.message).toBe('The path could not be empty')
  }
})

test('The first character of a path should be `/` or `*`', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  try {
    findMyWay.on('GET', 'a', () => {})
    expect.fail('The first character of a path should be `/` or `*`')
  } catch (e) {
    expect(e.message).toBe('The first character of a path should be `/` or `*`')
  }
})

test('The first character of a path should be `/` or `*` [ignoreTrailingSlash=true]', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({ ignoreTrailingSlash: true })

  try {
    findMyWay.on('GET', 'a', () => {})
    expect.fail('The first character of a path should be `/` or `*`')
  } catch (e) {
    expect(e.message).toBe('The first character of a path should be `/` or `*`')
  }
})

test('The first character of a path should be `/` or `*` [ignoreDuplicateSlashes=true]', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({ ignoreDuplicateSlashes: true })

  try {
    findMyWay.on('GET', 'a', () => {})
    expect.fail('The first character of a path should be `/` or `*`')
  } catch (e) {
    expect(e.message).toBe('The first character of a path should be `/` or `*`')
  }
})

test('Handler should be a function', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  try {
    findMyWay.on('GET', '/test', 0)
    expect.fail('handler should be a function')
  } catch (e) {
    expect(e.message).toBe('Handler should be a function')
  }
})

test('Method is not an http method.', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  try {
    findMyWay.on('GETT', '/test', () => {})
    expect.fail('method is not a valid http method')
  } catch (e) {
    expect(e.message).toBe('Method \'GETT\' is not an http method.')
  }
})

test('Method is not an http method. (array)', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  try {
    findMyWay.on(['POST', 'GETT'], '/test', () => {})
    expect.fail('method is not a valid http method')
  } catch (e) {
    expect(e.message).toBe('Method \'GETT\' is not an http method.')
  }
})

test('The default route must be a function', () => {
  expect.assertions(1)
  try {
    FindMyWay({
      defaultRoute: '/404'
    })
    expect.fail('default route must be a function')
  } catch (e) {
    expect(e.message).toBe('The default route must be a function')
  }
})

test('Method already declared', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/test', () => {})
  try {
    findMyWay.on('GET', '/test', () => {})
    expect.fail('method already declared')
  } catch (e) {
    expect(e.message).toBe('Method \'GET\' already declared for route \'/test\' with constraints \'{}\'')
  }
})

test('Method already declared if * is used', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/*', () => {})
  try {
    findMyWay.on('GET', '*', () => {})
    expect.fail('should throw error')
  } catch (e) {
    expect(e.message).toBe('Method \'GET\' already declared for route \'/*\' with constraints \'{}\'')
  }
})

test('Method already declared if /* is used', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '*', () => {})
  try {
    findMyWay.on('GET', '/*', () => {})
    expect.fail('should throw error')
  } catch (e) {
    expect(e.message).toBe('Method \'GET\' already declared for route \'/*\' with constraints \'{}\'')
  }
})

describe('Method already declared [ignoreTrailingSlash=true]', () => {
  test('without trailing slash', () => {
    expect.assertions(2)
    const findMyWay = FindMyWay({ ignoreTrailingSlash: true })

    findMyWay.on('GET', '/test', () => {})

    try {
      findMyWay.on('GET', '/test', () => {})
      expect.fail('method already declared')
    } catch (e) {
      expect(e.message).toBe('Method \'GET\' already declared for route \'/test\' with constraints \'{}\'')
    }

    try {
      findMyWay.on('GET', '/test/', () => {})
      expect.fail('method already declared')
    } catch (e) {
      expect(e.message).toBe('Method \'GET\' already declared for route \'/test\' with constraints \'{}\'')
    }
  })

  test('with trailing slash', () => {
    expect.assertions(2)
    const findMyWay = FindMyWay({ ignoreTrailingSlash: true })

    findMyWay.on('GET', '/test/', () => {})

    try {
      findMyWay.on('GET', '/test', () => {})
      expect.fail('method already declared')
    } catch (e) {
      expect(e.message).toBe('Method \'GET\' already declared for route \'/test\' with constraints \'{}\'')
    }

    try {
      findMyWay.on('GET', '/test/', () => {})
      expect.fail('method already declared')
    } catch (e) {
      expect(e.message).toBe('Method \'GET\' already declared for route \'/test\' with constraints \'{}\'')
    }
  })
})

describe('Method already declared [ignoreDuplicateSlashes=true]', () => {
  test('without duplicate slashes', () => {
    expect.assertions(2)
    const findMyWay = FindMyWay({ ignoreDuplicateSlashes: true })

    findMyWay.on('GET', '/test', () => {})

    try {
      findMyWay.on('GET', '/test', () => {})
      expect.fail('method already declared')
    } catch (e) {
      expect(e.message).toBe('Method \'GET\' already declared for route \'/test\' with constraints \'{}\'')
    }

    try {
      findMyWay.on('GET', '//test', () => {})
      expect.fail('method already declared')
    } catch (e) {
      expect(e.message).toBe('Method \'GET\' already declared for route \'/test\' with constraints \'{}\'')
    }
  })

  test('with duplicate slashes', () => {
    expect.assertions(2)
    const findMyWay = FindMyWay({ ignoreDuplicateSlashes: true })

    findMyWay.on('GET', '//test', () => {})

    try {
      findMyWay.on('GET', '/test', () => {})
      expect.fail('method already declared')
    } catch (e) {
      expect(e.message).toBe('Method \'GET\' already declared for route \'/test\' with constraints \'{}\'')
    }

    try {
      findMyWay.on('GET', '//test', () => {})
      expect.fail('method already declared')
    } catch (e) {
      expect(e.message).toBe('Method \'GET\' already declared for route \'/test\' with constraints \'{}\'')
    }
  })
})

test('Method already declared nested route', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/test', () => {})
  findMyWay.on('GET', '/test/hello', () => {})
  findMyWay.on('GET', '/test/world', () => {})

  try {
    findMyWay.on('GET', '/test/hello', () => {})
    expect.fail('method already delcared in nested route')
  } catch (e) {
    expect(e.message).toBe('Method \'GET\' already declared for route \'/test/hello\' with constraints \'{}\'')
  }
})

describe('Method already declared nested route [ignoreTrailingSlash=true]', () => {
  test('without trailing slash', () => {
    expect.assertions(2)
    const findMyWay = FindMyWay({ ignoreTrailingSlash: true })

    findMyWay.on('GET', '/test', () => {})
    findMyWay.on('GET', '/test/hello', () => {})
    findMyWay.on('GET', '/test/world', () => {})

    try {
      findMyWay.on('GET', '/test/hello', () => {})
      expect.fail('method already declared')
    } catch (e) {
      expect(e.message).toBe('Method \'GET\' already declared for route \'/test/hello\' with constraints \'{}\'')
    }

    try {
      findMyWay.on('GET', '/test/hello/', () => {})
      expect.fail('method already declared')
    } catch (e) {
      expect(e.message).toBe('Method \'GET\' already declared for route \'/test/hello\' with constraints \'{}\'')
    }
  })

  test('Method already declared with constraints', () => {
    expect.assertions(1)
    const findMyWay = FindMyWay()

    findMyWay.on('GET', '/test', { constraints: { host: 'fastify.io' } }, () => {})
    try {
      findMyWay.on('GET', '/test', { constraints: { host: 'fastify.io' } }, () => {})
      expect.fail('method already declared')
    } catch (e) {
      expect(e.message).toBe('Method \'GET\' already declared for route \'/test\' with constraints \'{"host":"fastify.io"}\'')
    }
  })

  test('with trailing slash', () => {
    expect.assertions(2)
    const findMyWay = FindMyWay({ ignoreTrailingSlash: true })

    findMyWay.on('GET', '/test/', () => {})
    findMyWay.on('GET', '/test/hello/', () => {})
    findMyWay.on('GET', '/test/world/', () => {})

    try {
      findMyWay.on('GET', '/test/hello', () => {})
      expect.fail('method already declared')
    } catch (e) {
      expect(e.message).toBe('Method \'GET\' already declared for route \'/test/hello\' with constraints \'{}\'')
    }

    try {
      findMyWay.on('GET', '/test/hello/', () => {})
      expect.fail('method already declared')
    } catch (e) {
      expect(e.message).toBe('Method \'GET\' already declared for route \'/test/hello\' with constraints \'{}\'')
    }
  })
})

describe('Method already declared nested route [ignoreDuplicateSlashes=true]', () => {
  test('without duplicate slashes', () => {
    expect.assertions(2)
    const findMyWay = FindMyWay({ ignoreDuplicateSlashes: true })

    findMyWay.on('GET', '/test', () => {})
    findMyWay.on('GET', '/test/hello', () => {})
    findMyWay.on('GET', '/test/world', () => {})

    try {
      findMyWay.on('GET', '/test/hello', () => {})
      expect.fail('method already declared')
    } catch (e) {
      expect(e.message).toBe('Method \'GET\' already declared for route \'/test/hello\' with constraints \'{}\'')
    }

    try {
      findMyWay.on('GET', '/test//hello', () => {})
      expect.fail('method already declared')
    } catch (e) {
      expect(e.message).toBe('Method \'GET\' already declared for route \'/test/hello\' with constraints \'{}\'')
    }
  })

  test('with duplicate slashes', () => {
    expect.assertions(2)
    const findMyWay = FindMyWay({ ignoreDuplicateSlashes: true })

    findMyWay.on('GET', '/test/', () => {})
    findMyWay.on('GET', '/test//hello', () => {})
    findMyWay.on('GET', '/test//world', () => {})

    try {
      findMyWay.on('GET', '/test/hello', () => {})
      expect.fail('method already declared')
    } catch (e) {
      expect(e.message).toBe('Method \'GET\' already declared for route \'/test/hello\' with constraints \'{}\'')
    }

    try {
      findMyWay.on('GET', '/test//hello', () => {})
      expect.fail('method already declared')
    } catch (e) {
      expect(e.message).toBe('Method \'GET\' already declared for route \'/test/hello\' with constraints \'{}\'')
    }
  })
})
