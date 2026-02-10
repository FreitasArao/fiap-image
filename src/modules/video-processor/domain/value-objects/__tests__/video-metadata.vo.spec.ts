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

  it('should return the filename via getter', () => {
    const vo = VideoMetadataVO.create({
      totalSize: 500,
      durationMs: 2000,
      filename: 'my-video',
      extension: 'avi',
    })
    expect(vo.filename).toBe('my-video')
  })

  it('should return the extension via getter', () => {
    const vo = VideoMetadataVO.create({
      totalSize: 500,
      durationMs: 2000,
      filename: 'my-video',
      extension: 'mkv',
    })
    expect(vo.extension).toBe('mkv')
  })

  it('should return the full filename with extension', () => {
    const vo = VideoMetadataVO.create({
      totalSize: 500,
      durationMs: 2000,
      filename: 'my-video',
      extension: 'mp4',
    })
    expect(vo.fullFilename).toBe('my-video.mp4')
  })

  it('should return duration in milliseconds via durationMs getter', () => {
    const vo = VideoMetadataVO.create({
      totalSize: 500,
      durationMs: 3500,
      filename: 'clip',
      extension: 'mp4',
    })
    expect(vo.durationMs).toBe(3500)
  })

  it('should return duration in seconds via durationSeconds getter', () => {
    const vo = VideoMetadataVO.create({
      totalSize: 500,
      durationMs: 5000,
      filename: 'clip',
      extension: 'mp4',
    })
    expect(vo.durationSeconds).toBe(5)
  })
})
