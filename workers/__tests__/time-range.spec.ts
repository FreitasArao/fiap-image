import { describe, expect, it } from 'bun:test'
import { calculateTimeRanges, getTotalSegments } from '@workers/time-range'

/**
 * Time range tests use milliseconds for input (duration, segmentDuration)
 * but expect seconds in the output (startTime, endTime) for FFmpeg compatibility.
 */
describe('calculateTimeRanges', () => {
  it('should return empty array for zero duration', () => {
    const ranges = calculateTimeRanges(0, 10000)
    expect(ranges).toEqual([])
  })

  it('should return empty array for negative duration', () => {
    const ranges = calculateTimeRanges(-10000, 10000)
    expect(ranges).toEqual([])
  })

  it('should return single range for duration less than segment (output in seconds)', () => {
    // 5 seconds (5000ms) with 10 second segments (10000ms)
    const ranges = calculateTimeRanges(5000, 10000)
    expect(ranges).toEqual([{ segmentNumber: 1, startTime: 0, endTime: 5 }])
  })

  it('should return exact ranges for duration divisible by segment (output in seconds)', () => {
    // 30 seconds (30000ms) with 10 second segments (10000ms)
    const ranges = calculateTimeRanges(30000, 10000)
    expect(ranges).toEqual([
      { segmentNumber: 1, startTime: 0, endTime: 10 },
      { segmentNumber: 2, startTime: 10, endTime: 20 },
      { segmentNumber: 3, startTime: 20, endTime: 30 },
    ])
  })

  it('should handle non-divisible duration correctly (output in seconds)', () => {
    // 25 seconds (25000ms) with 10 second segments (10000ms)
    const ranges = calculateTimeRanges(25000, 10000)
    expect(ranges).toEqual([
      { segmentNumber: 1, startTime: 0, endTime: 10 },
      { segmentNumber: 2, startTime: 10, endTime: 20 },
      { segmentNumber: 3, startTime: 20, endTime: 25 },
    ])
  })

  it('should use default segment duration of 10000ms (10s)', () => {
    // 15 seconds (15000ms) with default 10 second segments
    const ranges = calculateTimeRanges(15000)
    expect(ranges).toEqual([
      { segmentNumber: 1, startTime: 0, endTime: 10 },
      { segmentNumber: 2, startTime: 10, endTime: 15 },
    ])
  })

  it('should handle large duration (1 hour video)', () => {
    // 1 hour (3600000ms) with 60 second segments (60000ms)
    const ranges = calculateTimeRanges(3600000, 60000)
    expect(ranges).toHaveLength(60)
    expect(ranges[0]).toEqual({ segmentNumber: 1, startTime: 0, endTime: 60 })
    expect(ranges[59]).toEqual({
      segmentNumber: 60,
      startTime: 3540,
      endTime: 3600,
    })
  })

  it('should handle sub-second precision', () => {
    // 2.5 seconds (2500ms) with 1 second segments (1000ms)
    const ranges = calculateTimeRanges(2500, 1000)
    expect(ranges).toEqual([
      { segmentNumber: 1, startTime: 0, endTime: 1 },
      { segmentNumber: 2, startTime: 1, endTime: 2 },
      { segmentNumber: 3, startTime: 2, endTime: 2.5 },
    ])
  })
})

describe('getTotalSegments', () => {
  it('should return 0 for zero duration', () => {
    expect(getTotalSegments(0, 10000)).toBe(0)
  })

  it('should return 0 for negative duration', () => {
    expect(getTotalSegments(-10000, 10000)).toBe(0)
  })

  it('should return 1 for duration less than segment', () => {
    // 5 seconds (5000ms) with 10 second segments (10000ms)
    expect(getTotalSegments(5000, 10000)).toBe(1)
  })

  it('should return exact count for divisible duration', () => {
    // 30 seconds (30000ms) with 10 second segments (10000ms)
    expect(getTotalSegments(30000, 10000)).toBe(3)
  })

  it('should round up for non-divisible duration', () => {
    // 25 seconds (25000ms) with 10 second segments (10000ms)
    expect(getTotalSegments(25000, 10000)).toBe(3)
  })

  it('should use default segment duration of 10000ms (10s)', () => {
    // 95 seconds (95000ms) with default 10 second segments
    expect(getTotalSegments(95000)).toBe(10)
  })

  it('should handle 2 minute video with 10 second segments', () => {
    // 2 minutes (120000ms) with 10 second segments (10000ms)
    expect(getTotalSegments(120000, 10000)).toBe(12)
  })
})
