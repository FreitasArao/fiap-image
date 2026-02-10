import { describe, it, expect } from 'bun:test'
import { PartSizePolicy } from '../part-size-policy'
import { MegabytesValueObject } from '@modules/video-processor/domain/value-objects/megabytes.vo'
import { GigabytesValueObject } from '@modules/video-processor/domain/value-objects/gigabytes.vo'

describe('PartSizePolicy', () => {
  describe('isSmallVideo()', () => {
    it('should return true for videos smaller than MIN_PART_SIZE', () => {
      const smallSize = MegabytesValueObject.create(3).value // 3 MB
      expect(PartSizePolicy.isSmallVideo(smallSize)).toBe(true)
    })

    it('should return true for videos equal to MIN_PART_SIZE', () => {
      expect(PartSizePolicy.isSmallVideo(PartSizePolicy.MIN_PART_SIZE)).toBe(
        true,
      )
    })

    it('should return false for videos larger than MIN_PART_SIZE', () => {
      const largeSize = MegabytesValueObject.create(50).value
      expect(PartSizePolicy.isSmallVideo(largeSize)).toBe(false)
    })
  })

  describe('calculate()', () => {
    it('should calculate valid part size and number of parts for normal video', () => {
      const videoSize = MegabytesValueObject.create(100).value // 100 MB
      const result = PartSizePolicy.calculate(videoSize)

      expect(result.isSuccess).toBe(true)
      expect(result.value.partSize).toBeGreaterThanOrEqual(
        PartSizePolicy.MIN_PART_SIZE,
      )
      expect(result.value.numberOfParts).toBeGreaterThan(0)
    })

    it('should use SAFE_PART_SIZE as minimum when calculated part is smaller', () => {
      const videoSize = MegabytesValueObject.create(50).value // 50 MB
      const result = PartSizePolicy.calculate(videoSize)

      expect(result.isSuccess).toBe(true)
      expect(result.value.partSize).toBeGreaterThanOrEqual(
        PartSizePolicy.SAFE_PART_SIZE,
      )
    })

    it('should fail when calculated part size exceeds MAX_PART_SIZE', () => {
      // To exceed 5 GB per part, we need a very large file divided by max parts
      // PARTS_LIMIT = 10_000, MAX_PART_SIZE = 5GB
      // If file > PARTS_LIMIT * MAX_PART_SIZE, part size > 5GB
      const hugeSize = GigabytesValueObject.create(60_000).value
      const result = PartSizePolicy.calculate(hugeSize)

      expect(result.isFailure).toBe(true)
      expect(result.error.message).toContain('Part size is too large')
    })

    it('should handle video that results in exactly the parts limit', () => {
      const partSize = PartSizePolicy.SAFE_PART_SIZE
      const videoSize = partSize * PartSizePolicy.PARTS_LIMIT
      const result = PartSizePolicy.calculate(videoSize)

      expect(result.isSuccess).toBe(true)
    })
  })

  describe('numberOfPartsIsLargeThanPageSize()', () => {
    it('should return true when parts exceed MAX_NUMBER_OF_PARTS', () => {
      expect(
        PartSizePolicy.numberOfPartsIsLargeThanPageSize(
          PartSizePolicy.MAX_NUMBER_OF_PARTS + 1,
        ),
      ).toBe(true)
    })

    it('should return false when parts are within MAX_NUMBER_OF_PARTS', () => {
      expect(
        PartSizePolicy.numberOfPartsIsLargeThanPageSize(
          PartSizePolicy.MAX_NUMBER_OF_PARTS,
        ),
      ).toBe(false)
    })

    it('should return false for zero parts', () => {
      expect(PartSizePolicy.numberOfPartsIsLargeThanPageSize(0)).toBe(false)
    })
  })
})
