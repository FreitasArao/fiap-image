import {
  StorageConfig,
  StorageContext,
  StoragePathBuilder,
} from '@modules/video-processor/infra/services/storage/storage-path-builder'
import { describe, it, expect, beforeEach } from 'bun:test'

describe('StoragePathBuilder', () => {
  let builder: StoragePathBuilder
  const config: StorageConfig = {
    videoBucket: 'fiapx-video-parts',
    region: 'us-east-1',
  }

  beforeEach(() => {
    builder = new StoragePathBuilder(config)
  })

  describe('bucket', () => {
    it('should return configured bucket name', () => {
      expect(builder.bucket).toBe('fiapx-video-parts')
    })
  })

  describe('videoFile', () => {
    it('should build path for video file', () => {
      const path = builder.videoFile('video-123', 'video.mp4')

      expect(path.bucket).toBe('fiapx-video-parts')
      expect(path.key).toBe('video/video-123/file/video.mp4')
      expect(path.fullPath).toBe(
        'fiapx-video-parts/video/video-123/file/video.mp4',
      )
      expect(path.videoId).toBe('video-123')
      expect(path.context).toBe(StorageContext.VIDEO_FILE)
      expect(path.resourceId).toBe('video.mp4')
    })

    it('should handle videoId with special characters', () => {
      const path = builder.videoFile('019bf712-2a25-7001', 'video.mp4')

      expect(path.key).toBe('video/019bf712-2a25-7001/file/video.mp4')
    })
  })

  describe('videoPart', () => {
    it('should build path for video part segment', () => {
      const path = builder.videoPart('video-123', 'segment-0.mp4')

      expect(path.bucket).toBe('fiapx-video-parts')
      expect(path.key).toBe('video/video-123/parts/segment-0.mp4')
      expect(path.fullPath).toBe(
        'fiapx-video-parts/video/video-123/parts/segment-0.mp4',
      )
      expect(path.videoId).toBe('video-123')
      expect(path.context).toBe(StorageContext.VIDEO_PARTS)
      expect(path.resourceId).toBe('segment-0.mp4')
    })

    it('should build path for numbered segments', () => {
      const path = builder.videoPart('abc-123', 'segment_10.mp4')

      expect(path.key).toBe('video/abc-123/parts/segment_10.mp4')
    })
  })

  describe('videoPrint', () => {
    it('should build path for video print frame', () => {
      const path = builder.videoPrint('video-123', 'frame-0.jpg')

      expect(path.bucket).toBe('fiapx-video-parts')
      expect(path.key).toBe('video/video-123/prints/frame-0.jpg')
      expect(path.fullPath).toBe(
        'fiapx-video-parts/video/video-123/prints/frame-0.jpg',
      )
      expect(path.videoId).toBe('video-123')
      expect(path.context).toBe(StorageContext.VIDEO_PRINTS)
      expect(path.resourceId).toBe('frame-0.jpg')
    })

    it('should build path for numbered frames', () => {
      const path = builder.videoPrint('abc-123', 'frame_100.jpg')

      expect(path.key).toBe('video/abc-123/prints/frame_100.jpg')
    })
  })

  describe('parse', () => {
    it('should parse valid file path', () => {
      const result = builder.parse(
        'fiapx-video-parts/video/video-123/file/video.mp4',
      )

      expect(result).not.toBeNull()
      expect(result?.bucket).toBe('fiapx-video-parts')
      expect(result?.videoId).toBe('video-123')
      expect(result?.context).toBe(StorageContext.VIDEO_FILE)
      expect(result?.resourceId).toBe('video.mp4')
    })

    it('should parse valid parts path', () => {
      const result = builder.parse(
        'fiapx-video-parts/video/video-123/parts/segment-0.mp4',
      )

      expect(result).not.toBeNull()
      expect(result?.videoId).toBe('video-123')
      expect(result?.context).toBe(StorageContext.VIDEO_PARTS)
      expect(result?.resourceId).toBe('segment-0.mp4')
    })

    it('should parse valid prints path', () => {
      const result = builder.parse(
        'fiapx-video-parts/video/video-123/prints/frame-0.jpg',
      )

      expect(result).not.toBeNull()
      expect(result?.videoId).toBe('video-123')
      expect(result?.context).toBe(StorageContext.VIDEO_PRINTS)
      expect(result?.resourceId).toBe('frame-0.jpg')
    })

    it('should return null for path with insufficient segments', () => {
      const result = builder.parse('bucket/video')

      expect(result).toBeNull()
    })

    it('should return null for path without video prefix', () => {
      const result = builder.parse('bucket/other/video-123/file/video.mp4')

      expect(result).toBeNull()
    })

    it('should return null for invalid context', () => {
      const result = builder.parse('bucket/video/video-123/invalid/video.mp4')

      expect(result).toBeNull()
    })

    it('should handle resource with nested path', () => {
      const result = builder.parse(
        'bucket/video/video-123/file/subdir/video.mp4',
      )

      expect(result).not.toBeNull()
      expect(result?.resourceId).toBe('subdir/video.mp4')
    })
  })

  describe('extractVideoId', () => {
    it('should extract videoId from valid path', () => {
      const videoId = builder.extractVideoId(
        'bucket/video/abc-123/file/video.mp4',
      )

      expect(videoId).toBe('abc-123')
    })

    it('should return null for invalid path', () => {
      const videoId = builder.extractVideoId('invalid-path')

      expect(videoId).toBeNull()
    })
  })
})

describe('StorageContext', () => {
  it('should have correct values', () => {
    expect(StorageContext.VIDEO_FILE).toBe('file')
    expect(StorageContext.VIDEO_PARTS).toBe('parts')
    expect(StorageContext.VIDEO_PRINTS).toBe('prints')
  })
})
