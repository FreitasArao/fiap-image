import { describe, expect, it } from 'bun:test'
import { DurationVO } from '@modules/video-processor/domain/value-objects/duration.vo'

describe('DurationVO', () => {
  describe('fromMilliseconds', () => {
    it('should create from positive milliseconds', () => {
      const duration = DurationVO.fromMilliseconds(120000)
      expect(duration.milliseconds).toBe(120000)
    })

    it('should throw error for zero milliseconds', () => {
      expect(() => DurationVO.fromMilliseconds(0)).toThrow(
        'Duration must be greater than 0 milliseconds',
      )
    })

    it('should throw error for negative milliseconds', () => {
      expect(() => DurationVO.fromMilliseconds(-1000)).toThrow(
        'Duration must be greater than 0 milliseconds',
      )
    })
  })

  describe('fromSeconds', () => {
    it('should create from positive seconds and convert to milliseconds', () => {
      const duration = DurationVO.fromSeconds(120)
      expect(duration.milliseconds).toBe(120000)
    })

    it('should throw error for zero seconds', () => {
      expect(() => DurationVO.fromSeconds(0)).toThrow(
        'Duration must be greater than 0 seconds',
      )
    })

    it('should throw error for negative seconds', () => {
      expect(() => DurationVO.fromSeconds(-10)).toThrow(
        'Duration must be greater than 0 seconds',
      )
    })

    it('should handle decimal seconds', () => {
      const duration = DurationVO.fromSeconds(1.5)
      expect(duration.milliseconds).toBe(1500)
    })
  })

  describe('getters', () => {
    it('should return correct milliseconds', () => {
      const duration = DurationVO.fromMilliseconds(120000)
      expect(duration.milliseconds).toBe(120000)
    })

    it('should return correct seconds', () => {
      const duration = DurationVO.fromMilliseconds(120000)
      expect(duration.seconds).toBe(120)
    })

    it('should return correct minutes', () => {
      const duration = DurationVO.fromMilliseconds(120000)
      expect(duration.minutes).toBe(2)
    })

    it('should handle sub-second precision', () => {
      const duration = DurationVO.fromMilliseconds(1500)
      expect(duration.seconds).toBe(1.5)
      expect(duration.minutes).toBe(0.025)
    })
  })

  describe('equals', () => {
    it('should return true for equal durations', () => {
      const duration1 = DurationVO.fromMilliseconds(120000)
      const duration2 = DurationVO.fromMilliseconds(120000)
      expect(duration1.equals(duration2)).toBe(true)
    })

    it('should return false for different durations', () => {
      const duration1 = DurationVO.fromMilliseconds(120000)
      const duration2 = DurationVO.fromMilliseconds(60000)
      expect(duration1.equals(duration2)).toBe(false)
    })

    it('should return true for same duration created differently', () => {
      const duration1 = DurationVO.fromMilliseconds(120000)
      const duration2 = DurationVO.fromSeconds(120)
      expect(duration1.equals(duration2)).toBe(true)
    })
  })

  describe('toString', () => {
    it('should return formatted string', () => {
      const duration = DurationVO.fromMilliseconds(120000)
      expect(duration.toString()).toBe('120000ms (120s)')
    })

    it('should handle decimal seconds in string', () => {
      const duration = DurationVO.fromMilliseconds(1500)
      expect(duration.toString()).toBe('1500ms (1.5s)')
    })
  })

  describe('value property', () => {
    it('should return milliseconds via value getter', () => {
      const duration = DurationVO.fromMilliseconds(120000)
      expect(duration.value).toBe(120000)
    })
  })

  describe('real-world scenarios', () => {
    it('should handle 2 minute video', () => {
      const duration = DurationVO.fromMilliseconds(120000)
      expect(duration.minutes).toBe(2)
      expect(duration.seconds).toBe(120)
    })

    it('should handle 1 hour video', () => {
      const duration = DurationVO.fromMilliseconds(3600000)
      expect(duration.minutes).toBe(60)
      expect(duration.seconds).toBe(3600)
    })

    it('should handle short 30 second clip', () => {
      const duration = DurationVO.fromSeconds(30)
      expect(duration.milliseconds).toBe(30000)
    })
  })
})
