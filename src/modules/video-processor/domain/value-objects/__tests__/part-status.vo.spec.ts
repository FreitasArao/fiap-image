import { PartStatusVO } from '@modules/video-processor/domain/value-objects/part-status.vo'
import { describe, expect, it } from 'bun:test'

describe('PartStatusVO', () => {
  it('should be able to create a part status value object', () => {
    const partStatus = PartStatusVO.create('pending')
    expect(partStatus.value).toBe('pending')
  })

  it('should be able to create a part status value object from a string', () => {
    const partStatus = PartStatusVO.create('pending')
    expect(partStatus.value).toBe('pending')
  })
})
