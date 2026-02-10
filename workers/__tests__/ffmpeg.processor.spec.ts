import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, beforeEach, afterEach } from 'bun:test'
import { FFmpegProcessor } from '@workers/processors/ffmpeg.processor'
import type { VideoProcessorService } from '@workers/abstractions'

const fixturePath = join(import.meta.dir, 'fixtures', 'fake-video.mp4')
const hasVideoFixture = existsSync(fixturePath)

const hasFFmpeg = (() => {
  try {
    const proc = Bun.spawnSync(['which', 'ffmpeg'])
    return proc.exitCode === 0
  } catch {
    return false
  }
})()

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

  describe('extractFramesFromUrl', () => {
    it.skipIf(!hasVideoFixture || !hasFFmpeg)(
      'should return success Result with frames from url',
      async () => {
        await processor.setup()
        const result = await processor.extractFramesFromUrl(
          fixturePath,
          0,
          3,
          1,
        )

        expect(result.isSuccess).toBe(true)
        expect(result.value.count).toBeGreaterThanOrEqual(3)
        expect(existsSync(result.value.outputDir)).toBe(true)
      },
    )

    it.skipIf(!hasVideoFixture || !hasFFmpeg)(
      'should extract 6 frames with lower frameInterval',
      async () => {
        await processor.setup()
        const result = await processor.extractFramesFromUrl(
          fixturePath,
          0,
          3,
          0.5,
        )

        expect(result.isSuccess).toBe(true)
        expect(result.value.count).toBeGreaterThanOrEqual(6)
        expect(existsSync(result.value.outputDir)).toBe(true)
      },
    )

    it.skipIf(!hasFFmpeg)(
      'should return failure Result when input file does not exist',
      async () => {
        await processor.setup()
        const result = await processor.extractFramesFromUrl(
          '/non/existent/file.mp4',
          0,
          10,
          1,
        )

        expect(result.isFailure).toBe(true)
        expect(result.error.message).toContain('FFmpeg failed')
      },
    )

    it.skipIf(!hasFFmpeg)(
      'should return failure Result when input URL is invalid',
      async () => {
        await processor.setup()
        const result = await processor.extractFramesFromUrl(
          'not-a-valid-url',
          0,
          10,
          1,
        )

        expect(result.isFailure).toBe(true)
        expect(result.error.message).toContain('FFmpeg failed')
      },
    )
  })

  describe('uploadDir', () => {
    it('should return failure Result when directory does not exist', async () => {
      const result = await processor.uploadDir(
        '/non/existent/dir',
        'test-bucket',
        'prefix',
        '*.jpg',
      )

      expect(result.isFailure).toBe(true)
      expect(result.error.message).toContain('S3 upload failed')
    })
  })
})
