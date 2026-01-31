import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, beforeEach, afterEach } from 'bun:test'
import { FFmpegProcessor } from '@workers/processors/ffmpeg.processor'
import type { VideoProcessorService } from '@workers/abstractions'

const fixturePath = join(import.meta.dir, 'fixtures', 'fake-video.mp4')
const hasVideoFixture = existsSync(fixturePath)

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
      expect(existsSync(dir)).toBe(true)
    })
  })

  describe('cleanup', () => {
    it('should not throw if directory does not exist', async () => {
      await expect(processor.cleanup()).resolves.toBeUndefined()
    })
  })

  describe('extractFrames', () => {
    it.skipIf(!hasVideoFixture)(
      'should extract at least 3 frames from url',
      async () => {
        await processor.setup()
        const result = await processor.extractFramesFromUrl(
          fixturePath,
          0,
          3,
          1,
        )
        expect(result.count).toBeGreaterThanOrEqual(3)
        expect(existsSync(result.outputDir)).toBe(true)
      },
    )

    it.skipIf(!hasVideoFixture)(
      'should extract 6 frames with lower frameInterval',
      async () => {
        await processor.setup()
        const result = await processor.extractFramesFromUrl(
          fixturePath,
          0,
          3,
          0.5,
        )
        expect(result.count).toBeGreaterThanOrEqual(6)
        expect(existsSync(result.outputDir)).toBe(true)
      },
    )
  })
})
