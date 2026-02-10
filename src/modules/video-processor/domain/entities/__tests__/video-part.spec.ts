import { describe, it, expect } from 'bun:test'
import { VideoPart } from '../video-part'
import { ThirdPartyIntegration } from '../third-party-integration.vo'
import { UniqueEntityID } from '@core/domain/value-objects/unique-entity-id.vo'
import { PartStatusVO } from '@modules/video-processor/domain/value-objects/part-status.vo'

function makeDefaultParams() {
  return {
    videoId: UniqueEntityID.create(),
    partNumber: 1,
    size: 1024,
    integration: ThirdPartyIntegration.create(),
    url: 'https://s3.example.com/part-1',
  }
}

describe('VideoPart', () => {
  describe('create()', () => {
    it('should create a video part with pending status by default', () => {
      const part = VideoPart.create(makeDefaultParams())

      expect(part).toBeDefined()
      expect(part.status.value).toBe('pending')
      expect(part.partNumber).toBe(1)
      expect(part.size).toBe(1024)
      expect(part.url).toBe('https://s3.example.com/part-1')
      expect(part.thirdPartyVideoPartId).toBe('')
      expect(part.etag).toBeUndefined()
      expect(part.uploadedAt).toBeUndefined()
    })
  })

  describe('createFromDatabase()', () => {
    it('should recreate a part with all persisted fields', () => {
      const uploadedAt = new Date('2025-01-01')
      const part = VideoPart.createFromDatabase({
        ...makeDefaultParams(),
        thirdPartyVideoPartId: 'ext-part-id-1',
        etag: '"abc123"',
        uploadedAt,
        status: PartStatusVO.create('uploaded'),
      })

      expect(part.thirdPartyVideoPartId).toBe('ext-part-id-1')
      expect(part.etag).toBe('"abc123"')
      expect(part.uploadedAt).toEqual(uploadedAt)
      expect(part.status.value).toBe('uploaded')
    })
  })

  describe('isPending()', () => {
    it('should return true when status is pending', () => {
      const part = VideoPart.create(makeDefaultParams())
      expect(part.isPending()).toBe(true)
    })

    it('should return false when status is not pending', () => {
      const part = VideoPart.create(makeDefaultParams())
      part.markAsUploaded('"etag"')
      expect(part.isPending()).toBe(false)
    })
  })

  describe('isUploaded()', () => {
    it('should return true when status is uploaded and etag is defined', () => {
      const part = VideoPart.create(makeDefaultParams())
      part.markAsUploaded('"etag"')
      expect(part.isUploaded()).toBe(true)
    })

    it('should return false when status is pending', () => {
      const part = VideoPart.create(makeDefaultParams())
      expect(part.isUploaded()).toBe(false)
    })
  })

  describe('markAsUploaded()', () => {
    it('should transition status to uploaded and set etag and uploadedAt', () => {
      const part = VideoPart.create(makeDefaultParams())

      const result = part.markAsUploaded('"etag-value"')

      expect(result).toBe(part)
      expect(part.status.value).toBe('uploaded')
      expect(part.etag).toBe('"etag-value"')
      expect(part.uploadedAt).toBeInstanceOf(Date)
    })
  })

  describe('markAsFailed()', () => {
    it('should transition status to failed', () => {
      const part = VideoPart.create(makeDefaultParams())

      const result = part.markAsFailed()

      expect(result).toBe(part)
      expect(part.status.value).toBe('failed')
    })
  })

  describe('addExternalPartId()', () => {
    it('should create a new VideoPart with the given external id preserving other fields', () => {
      const original = VideoPart.create(makeDefaultParams())
      const updated = VideoPart.addExternalPartId(original, 'external-id-42')

      expect(updated.thirdPartyVideoPartId).toBe('external-id-42')
      expect(updated.partNumber).toBe(original.partNumber)
      expect(updated.size).toBe(original.size)
      expect(updated.url).toBe(original.url)
    })
  })

  describe('assignUrl()', () => {
    it('should create a new VideoPart with the given url preserving other fields', () => {
      const original = VideoPart.create(makeDefaultParams())
      const updated = VideoPart.assignUrl(original, 'https://new-url.com/part')

      expect(updated.url).toBe('https://new-url.com/part')
      expect(updated.partNumber).toBe(original.partNumber)
      expect(updated.size).toBe(original.size)
    })
  })
})
