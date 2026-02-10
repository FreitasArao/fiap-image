import { DurationVO } from '@modules/video-processor/domain/value-objects/duration.vo'
import { VideoMetadataVO } from '@modules/video-processor/domain/value-objects/video-metadata.vo'
import { describe, expect, it } from 'bun:test'

describe('VideoMetadataVO', () => {
  it('should be able to create a video metadata value object', () => {
    const videoMetadata = VideoMetadataVO.create({
      totalSize: 1000,
      durationMs: DurationVO.fromMilliseconds(1000).milliseconds,
      filename: 'test',
      extension: 'mp4',
    })
    expect(videoMetadata.value.totalSize).toBe(1000)
    expect(videoMetadata.value.duration.milliseconds).toBe(1000)
    expect(videoMetadata.value.filename).toBe('test')
    expect(videoMetadata.value.extension).toBe('mp4')
  })
})
