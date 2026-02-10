import { BaseError } from '@core/errors/base.error'
import { describe, it, expect } from 'bun:test'

class TestError extends BaseError {
  readonly code = 'TEST_ERROR'
  constructor(message: string) {
    super(message)
    this.name = 'TestError'
  }
}

describe('BaseError', () => {
  it('should be able to create a base error', () => {
    const baseError = new TestError('test')
    expect(baseError.toJSON()).toEqual({
      code: 'TEST_ERROR',
      message: 'test',
      name: 'TestError',
      stack: baseError.stack,
    })
  })
})
