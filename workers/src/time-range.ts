export interface TimeRange {
  segmentNumber: number
  startTime: number
  endTime: number
}

export function calculateTimeRanges(
  duration: number,
  segmentDuration = 10
): TimeRange[] {
  if (duration <= 0) {
    return []
  }

  const totalSegments = Math.ceil(duration / segmentDuration)
  const ranges: TimeRange[] = []

  for (let i = 0; i < totalSegments; i++) {
    ranges.push({
      segmentNumber: i + 1,
      startTime: i * segmentDuration,
      endTime: Math.min((i + 1) * segmentDuration, duration),
    })
  }

  return ranges
}

export function getTotalSegments(duration: number, segmentDuration = 10): number {
  if (duration <= 0) {
    return 0
  }
  return Math.ceil(duration / segmentDuration)
}
