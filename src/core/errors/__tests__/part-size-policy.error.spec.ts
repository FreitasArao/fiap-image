import { PartSizePolicyError } from '@core/errors/part-size-policy.error'
import { describe, it, expect } from 'bun:test'

describe('PartSizePolicyError', () => {
  it('should be able to create a part size policy error', () => {
    const partSizePolicyError = new PartSizePolicyError('test')
    expect(partSizePolicyError.toJSON()).toEqual({
      code: 'PART_SIZE_POLICY_ERROR',
      message: 'test',
      name: 'PartSizePolicyError',
      stack: partSizePolicyError.stack,
    })
  })
})
