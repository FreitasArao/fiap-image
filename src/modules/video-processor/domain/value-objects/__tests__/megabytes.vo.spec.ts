import { MegabytesValueObject } from '@modules/video-processor/domain/value-objects/megabytes.vo'
import { describe, expect, it } from 'bun:test'

describe('MegabytesValueObject', () => {
  it('should be able to create a megabytes value object', () => {
    const megabytes = MegabytesValueObject.create(1)
    expect(megabytes.value).toEqual(1048576)
  })
})
