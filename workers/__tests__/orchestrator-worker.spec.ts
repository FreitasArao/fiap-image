import { describe, expect, it } from 'bun:test'
import { calculateTimeRanges, getTotalSegments } from '@workers/time-range'

/**
 * OrchestratorWorker tests.
 * All durations are now in milliseconds.
 * Output startTime/endTime are in seconds for FFmpeg compatibility.
 */
describe('OrchestratorWorker', () => {
  describe('range calculation for orchestration (milliseconds input)', () => {
    it('should calculate correct ranges for 100s video (100000ms)', () => {
      const durationMs = 100000 // 100 seconds
      const segmentDurationMs = 10000 // 10 seconds
      const ranges = calculateTimeRanges(durationMs, segmentDurationMs)
      const total = getTotalSegments(durationMs, segmentDurationMs)

      expect(total).toBe(10)
      expect(ranges).toHaveLength(10)

      // Output is in seconds for FFmpeg
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
      const durationMs = 5000 // 5 seconds
      const segmentDurationMs = 10000 // 10 seconds
      const ranges = calculateTimeRanges(durationMs, segmentDurationMs)
      const total = getTotalSegments(durationMs, segmentDurationMs)

      expect(total).toBe(1)
      expect(ranges).toHaveLength(1)
      expect(ranges[0]).toEqual({
        segmentNumber: 1,
        startTime: 0,
        endTime: 5,
      })
    })

    it.each([
      { durationMs: 95000, segmentDurationMs: 10000, expected: 10 }, // 95s / 10s
      { durationMs: 300000, segmentDurationMs: 30000, expected: 10 }, // 5min / 30s
      { durationMs: 60000, segmentDurationMs: 60000, expected: 1 }, // 1min / 1min
      { durationMs: 61000, segmentDurationMs: 60000, expected: 2 }, // 61s / 1min
      { durationMs: 120000, segmentDurationMs: 10000, expected: 12 }, // 2min / 10s
    ])(
      'should generate correct message count for fan-out ($durationMs ms / $segmentDurationMs ms = $expected segments)',
      ({ durationMs, segmentDurationMs, expected }) => {
        const total = getTotalSegments(durationMs, segmentDurationMs)
        expect(total).toBe(expected)
      },
    )
  })
})
