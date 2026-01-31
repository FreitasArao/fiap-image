import { describe, it, expect } from 'bun:test'
import { NonRetryableError } from '../non-retryable.error'

describe('NonRetryableError', () => {
  describe('constructor', () => {
    it('should create error with message', () => {
      const error = new NonRetryableError('Test error message')

      expect(error.message).toBe('Test error message')
      expect(error.name).toBe('NonRetryableError')
    })

    it('should be instance of Error', () => {
      const error = new NonRetryableError('Test')

      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(NonRetryableError)
    })
  })

  describe('isNonRetryable', () => {
    it('should return true for NonRetryableError instance', () => {
      const error = new NonRetryableError('Test')

      expect(NonRetryableError.isNonRetryable(error)).toBe(true)
    })

    it('should return false for regular Error', () => {
      const error = new Error('Test')

      expect(NonRetryableError.isNonRetryable(error)).toBe(false)
    })

    it('should return false for null', () => {
      expect(NonRetryableError.isNonRetryable(null)).toBe(false)
    })

    it('should return false for undefined', () => {
      expect(NonRetryableError.isNonRetryable(undefined)).toBe(false)
    })

    it('should return false for string', () => {
      expect(NonRetryableError.isNonRetryable('error')).toBe(false)
    })

    it('should return false for object with similar properties', () => {
      const fakeError = { name: 'NonRetryableError', message: 'Test' }

      expect(NonRetryableError.isNonRetryable(fakeError)).toBe(false)
    })
  })
})
