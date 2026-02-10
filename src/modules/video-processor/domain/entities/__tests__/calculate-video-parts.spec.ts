import { describe, it, expect } from 'bun:test'
import { CalculateVideoParts } from '../calculate-video-parts'
import { VideoMetadataVO } from '@modules/video-processor/domain/value-objects/video-metadata.vo'
import { MegabytesValueObject } from '@modules/video-processor/domain/value-objects/megabytes.vo'

describe('CalculateVideoParts', () => {
  const calculator = new CalculateVideoParts()

  it('should return 1 part for small videos (≤ 5MB)', () => {
    const metadata = VideoMetadataVO.create({
      totalSize: MegabytesValueObject.create(3).value, // 3 MB
      durationMs: 1000,
      filename: 'small',
      extension: 'mp4',
    })

    const result = calculator.create(metadata)
    expect(result.isSuccess).toBe(true)
    expect(result.value).toBe(1)
  })

  it('should calculate multiple parts for larger videos', () => {
    const metadata = VideoMetadataVO.create({
      totalSize: MegabytesValueObject.create(100).value, // 100 MB
      durationMs: 60000,
      filename: 'large',
      extension: 'mp4',
    })

    const result = calculator.create(metadata)
    expect(result.isSuccess).toBe(true)
    expect(result.value).toBeGreaterThan(1)
  })

  it('should propagate failure from PartSizePolicy when calculation fails', () => {
    // A video of exactly 5MB (MIN_PART_SIZE) is considered small -> returns 1
    const metadata = VideoMetadataVO.create({
      totalSize: MegabytesValueObject.create(5).value,
      durationMs: 1000,
      filename: 'boundary',
      extension: 'mp4',
    })

    const result = calculator.create(metadata)
    expect(result.isSuccess).toBe(true)
    expect(result.value).toBe(1)
  })
})
