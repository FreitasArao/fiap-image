export interface TimeRange {
  segmentNumber: number
  /** Start time in seconds (for FFmpeg) */
  startTime: number
  /** End time in seconds (for FFmpeg) */
  endTime: number
}

/**
 * Calculates time ranges for video segmentation.
 *
 * @param durationMs - Total video duration in milliseconds
 * @param segmentDurationMs - Duration of each segment in milliseconds (default: 10000ms = 10s)
 * @returns Array of time ranges with start/end times in seconds (for FFmpeg compatibility)
 *
 * @example
 * // 2 minute video with 10 second segments
 * const ranges = calculateTimeRanges(120000, 10000)
 * // Returns 12 segments: [{segmentNumber: 1, startTime: 0, endTime: 10}, ...]
 */
export function calculateTimeRanges(
  durationMs: number,
  segmentDurationMs = 10000,
): TimeRange[] {
  if (durationMs <= 0) {
    return []
  }

  const totalSegments = Math.ceil(durationMs / segmentDurationMs)
  const ranges: TimeRange[] = []

  for (let i = 0; i < totalSegments; i++) {
    const startMs = i * segmentDurationMs
    const endMs = Math.min((i + 1) * segmentDurationMs, durationMs)

    ranges.push({
      segmentNumber: i + 1,
      startTime: startMs / 1000, // Convert to seconds for FFmpeg
      endTime: endMs / 1000, // Convert to seconds for FFmpeg
    })
  }

  return ranges
}

/**
 * Gets the total number of segments for a video.
 *
 * @param durationMs - Total video duration in milliseconds
 * @param segmentDurationMs - Duration of each segment in milliseconds (default: 10000ms = 10s)
 * @returns Total number of segments
 */
export function getTotalSegments(
  durationMs: number,
  segmentDurationMs = 10000,
): number {
  if (durationMs <= 0) {
    return 0
  }
  return Math.ceil(durationMs / segmentDurationMs)
}
