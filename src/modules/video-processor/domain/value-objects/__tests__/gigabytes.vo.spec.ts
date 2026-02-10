import { GigabytesValueObject } from '@modules/video-processor/domain/value-objects/gigabytes.vo'
import { describe, expect, it } from 'bun:test'

describe('GigabytesValueObject', () => {
  it('should be able to create a gigabytes value object', () => {
    const gigabytes = GigabytesValueObject.create(1)
    expect(gigabytes.value).toEqual(1073741824)
  })
})
