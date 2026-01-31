import { describe, it, expect } from 'bun:test'
import {
  VideoEventSchema,
  SegmentMessageSchema,
  CompleteMultipartEventSchema,
  VideoStatusChangedEventSchema,
} from '../index'

describe('VideoEventSchema', () => {
  const validEvent = {
    detail: {
      videoId: 'video-123',
      videoPath: 'bucket/video/video-123/file/video.mp4',
      duration: 120000,
      userEmail: 'user@example.com',
      videoName: 'test-video.mp4',
    },
  }

  describe('valid payloads', () => {
    it('should accept valid event with all fields', () => {
      const result = VideoEventSchema.safeParse(validEvent)
      expect(result.success).toBe(true)
    })

    it('should accept event with only required fields', () => {
      const result = VideoEventSchema.safeParse({
        detail: { videoId: 'video-123' },
      })
      expect(result.success).toBe(true)
    })
  })

  describe('invalid payloads', () => {
    it('should reject empty videoId', () => {
      const result = VideoEventSchema.safeParse({
        detail: { videoId: '' },
      })
      expect(result.success).toBe(false)
    })

    it('should reject missing detail', () => {
      const result = VideoEventSchema.safeParse({})
      expect(result.success).toBe(false)
    })

    it('should reject negative duration', () => {
      const result = VideoEventSchema.safeParse({
        detail: { videoId: 'video-123', duration: -100 },
      })
      expect(result.success).toBe(false)
    })

    it('should reject invalid email format', () => {
      const result = VideoEventSchema.safeParse({
        detail: { videoId: 'video-123', userEmail: 'not-an-email' },
      })
      expect(result.success).toBe(false)
    })
  })
})

describe('SegmentMessageSchema', () => {
  const validMessage = {
    videoId: 'video-123',
    presignedUrl: 'https://s3.amazonaws.com/bucket/key',
    segmentNumber: 1,
    totalSegments: 10,
    startTime: 0,
    endTime: 10,
  }

  describe('valid payloads', () => {
    it('should accept valid message with all required fields', () => {
      const result = SegmentMessageSchema.safeParse(validMessage)
      expect(result.success).toBe(true)
    })

    it('should accept message with optional userEmail', () => {
      const result = SegmentMessageSchema.safeParse({
        ...validMessage,
        userEmail: 'user@example.com',
      })
      expect(result.success).toBe(true)
    })

    it('should accept message with optional videoName', () => {
      const result = SegmentMessageSchema.safeParse({
        ...validMessage,
        videoName: 'my-video.mp4',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('invalid payloads', () => {
    const invalidCases = [
      ['empty videoId', { ...validMessage, videoId: '' }],
      ['invalid presignedUrl', { ...validMessage, presignedUrl: 'not-a-url' }],
      ['zero segmentNumber', { ...validMessage, segmentNumber: 0 }],
      ['negative segmentNumber', { ...validMessage, segmentNumber: -1 }],
      ['zero totalSegments', { ...validMessage, totalSegments: 0 }],
      ['negative startTime', { ...validMessage, startTime: -1 }],
      ['zero endTime', { ...validMessage, endTime: 0 }],
      ['negative endTime', { ...validMessage, endTime: -1 }],
      ['invalid userEmail', { ...validMessage, userEmail: 'not-email' }],
    ] as const

    for (const [name, payload] of invalidCases) {
      it(`should reject ${name}`, () => {
        const result = SegmentMessageSchema.safeParse(payload)
        expect(result.success).toBe(false)
      })
    }

    it('should reject missing required fields', () => {
      const result = SegmentMessageSchema.safeParse({ videoId: 'video-123' })
      expect(result.success).toBe(false)
    })
  })
})

describe('CompleteMultipartEventSchema', () => {
  const validEvent = {
    detail: {
      bucket: { name: 'my-bucket' },
      object: { key: 'video/123/file/video.mp4' },
      reason: 'CompleteMultipartUpload',
    },
  }

  describe('valid payloads', () => {
    it('should accept valid event', () => {
      const result = CompleteMultipartEventSchema.safeParse(validEvent)
      expect(result.success).toBe(true)
    })
  })

  describe('invalid payloads', () => {
    it('should reject empty bucket name', () => {
      const result = CompleteMultipartEventSchema.safeParse({
        detail: {
          bucket: { name: '' },
          object: { key: 'key' },
          reason: 'reason',
        },
      })
      expect(result.success).toBe(false)
    })

    it('should reject empty object key', () => {
      const result = CompleteMultipartEventSchema.safeParse({
        detail: {
          bucket: { name: 'bucket' },
          object: { key: '' },
          reason: 'reason',
        },
      })
      expect(result.success).toBe(false)
    })

    it('should reject empty reason', () => {
      const result = CompleteMultipartEventSchema.safeParse({
        detail: {
          bucket: { name: 'bucket' },
          object: { key: 'key' },
          reason: '',
        },
      })
      expect(result.success).toBe(false)
    })
  })
})

describe('VideoStatusChangedEventSchema', () => {
  const validEvent = {
    videoId: 'video-123',
    status: 'COMPLETED',
    correlationId: 'corr-123',
  }

  describe('valid payloads', () => {
    it('should accept valid event with required fields', () => {
      const result = VideoStatusChangedEventSchema.safeParse(validEvent)
      expect(result.success).toBe(true)
    })

    for (const status of ['UPLOADED', 'PROCESSING', 'COMPLETED', 'FAILED']) {
      it(`should accept status ${status}`, () => {
        const result = VideoStatusChangedEventSchema.safeParse({
          ...validEvent,
          status,
        })
        expect(result.success).toBe(true)
      })
    }

    it('should accept event with all optional fields', () => {
      const result = VideoStatusChangedEventSchema.safeParse({
        ...validEvent,
        timestamp: '2024-01-15T10:30:00.000Z',
        userEmail: 'user@example.com',
        videoName: 'video.mp4',
        videoPath: 'bucket/path',
        duration: 120000,
        downloadUrl: 'https://example.com/download',
        errorReason: 'Some error',
        traceId: 'trace-123',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('invalid payloads', () => {
    it('should reject empty videoId', () => {
      const result = VideoStatusChangedEventSchema.safeParse({
        ...validEvent,
        videoId: '',
      })
      expect(result.success).toBe(false)
    })

    it('should reject empty correlationId', () => {
      const result = VideoStatusChangedEventSchema.safeParse({
        ...validEvent,
        correlationId: '',
      })
      expect(result.success).toBe(false)
    })

    it('should reject invalid status', () => {
      const result = VideoStatusChangedEventSchema.safeParse({
        ...validEvent,
        status: 'INVALID_STATUS',
      })
      expect(result.success).toBe(false)
    })

    it('should reject invalid email format', () => {
      const result = VideoStatusChangedEventSchema.safeParse({
        ...validEvent,
        userEmail: 'not-email',
      })
      expect(result.success).toBe(false)
    })

    it('should reject invalid downloadUrl', () => {
      const result = VideoStatusChangedEventSchema.safeParse({
        ...validEvent,
        downloadUrl: 'not-a-url',
      })
      expect(result.success).toBe(false)
    })

    it('should reject negative duration', () => {
      const result = VideoStatusChangedEventSchema.safeParse({
        ...validEvent,
        duration: -100,
      })
      expect(result.success).toBe(false)
    })
  })
})
