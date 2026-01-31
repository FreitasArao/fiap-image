import { describe, expect, it } from 'bun:test'
import { calculateTimeRanges, getTotalSegments } from '@workers/time-range'

describe('OrchestratorWorker', () => {
  describe('range calculation for orchestration', () => {
    it('should calculate correct ranges for 100s video', () => {
      const duration = 100
      const segmentDuration = 10
      const ranges = calculateTimeRanges(duration, segmentDuration)
      const total = getTotalSegments(duration, segmentDuration)

      expect(total).toBe(10)
      expect(ranges).toHaveLength(10)

      expect(ranges[0]).toEqual({
        segmentNumber: 1,
        startTime: 0,
        endTime: 10,
      })

      expect(ranges[9]).toEqual({
        segmentNumber: 10,
        startTime: 90,
        endTime: 100,
      })
    })

    it('should handle video shorter than segment duration', () => {
      const duration = 5
      const ranges = calculateTimeRanges(duration, 10)
      const total = getTotalSegments(duration, 10)

      expect(total).toBe(1)
      expect(ranges).toHaveLength(1)
      expect(ranges[0]).toEqual({
        segmentNumber: 1,
        startTime: 0,
        endTime: 5,
      })
    })

    it.each([
      { duration: 95, segmentDuration: 10, expected: 10 },
      { duration: 300, segmentDuration: 30, expected: 10 },
      { duration: 60, segmentDuration: 60, expected: 1 },
      { duration: 61, segmentDuration: 60, expected: 2 },
    ])('should generate correct message count for fan-out', ({
      duration,
      segmentDuration,
      expected,
    }) => {
      const total = getTotalSegments(duration, segmentDuration)
      expect(total).toBe(expected)
    })
  })
})
