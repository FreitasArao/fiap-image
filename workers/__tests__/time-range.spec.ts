import { describe, expect, it } from 'bun:test'
import { calculateTimeRanges, getTotalSegments } from '../src/time-range'

describe('calculateTimeRanges', () => {
  it('should return empty array for zero duration', () => {
    const ranges = calculateTimeRanges(0, 10)
    expect(ranges).toEqual([])
  })

  it('should return empty array for negative duration', () => {
    const ranges = calculateTimeRanges(-10, 10)
    expect(ranges).toEqual([])
  })

  it('should return single range for duration less than segment', () => {
    const ranges = calculateTimeRanges(5, 10)
    expect(ranges).toEqual([
      { segmentNumber: 1, startTime: 0, endTime: 5 },
    ])
  })

  it('should return exact ranges for duration divisible by segment', () => {
    const ranges = calculateTimeRanges(30, 10)
    expect(ranges).toEqual([
      { segmentNumber: 1, startTime: 0, endTime: 10 },
      { segmentNumber: 2, startTime: 10, endTime: 20 },
      { segmentNumber: 3, startTime: 20, endTime: 30 },
    ])
  })

  it('should handle non-divisible duration correctly', () => {
    const ranges = calculateTimeRanges(25, 10)
    expect(ranges).toEqual([
      { segmentNumber: 1, startTime: 0, endTime: 10 },
      { segmentNumber: 2, startTime: 10, endTime: 20 },
      { segmentNumber: 3, startTime: 20, endTime: 25 },
    ])
  })

  it('should use default segment duration of 10', () => {
    const ranges = calculateTimeRanges(15)
    expect(ranges).toEqual([
      { segmentNumber: 1, startTime: 0, endTime: 10 },
      { segmentNumber: 2, startTime: 10, endTime: 15 },
    ])
  })

  it('should handle large duration', () => {
    const ranges = calculateTimeRanges(3600, 60)
    expect(ranges).toHaveLength(60)
    expect(ranges[0]).toEqual({ segmentNumber: 1, startTime: 0, endTime: 60 })
    expect(ranges[59]).toEqual({ segmentNumber: 60, startTime: 3540, endTime: 3600 })
  })
})

describe('getTotalSegments', () => {
  it('should return 0 for zero duration', () => {
    expect(getTotalSegments(0, 10)).toBe(0)
  })

  it('should return 0 for negative duration', () => {
    expect(getTotalSegments(-10, 10)).toBe(0)
  })

  it('should return 1 for duration less than segment', () => {
    expect(getTotalSegments(5, 10)).toBe(1)
  })

  it('should return exact count for divisible duration', () => {
    expect(getTotalSegments(30, 10)).toBe(3)
  })

  it('should round up for non-divisible duration', () => {
    expect(getTotalSegments(25, 10)).toBe(3)
  })

  it('should use default segment duration of 10', () => {
    expect(getTotalSegments(95)).toBe(10)
  })
})
