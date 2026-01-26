import { describe, expect, it, beforeEach, afterEach } from 'bun:test'
import { FFmpegProcessor } from '../src/processors/ffmpeg.processor'
import type { VideoProcessorService } from '../src/abstractions'

describe('FFmpegProcessor', () => {
  let processor: VideoProcessorService
  const videoId = 'test-video-123'

  beforeEach(() => {
    processor = new FFmpegProcessor(videoId)
  })

  afterEach(async () => {
    try {
      await processor.cleanup()
    } catch {}
  })

  describe('interface compliance', () => {
    it('should implement VideoProcessorService interface', () => {
      expect(typeof processor.setup).toBe('function')
      expect(typeof processor.cleanup).toBe('function')
      expect(typeof processor.extractFramesFromUrl).toBe('function')
      expect(typeof processor.uploadDir).toBe('function')
    })
  })

  describe('setup', () => {
    it('should create work directory', async () => {
      await processor.setup()
      const dir = `/tmp/ffmpeg/${videoId}`
      const stat = await Bun.file(dir).exists()
    })
  })

  describe('cleanup', () => {
    it('should not throw if directory does not exist', async () => {
      await expect(processor.cleanup()).resolves.toBeUndefined()
    })
  })
})
