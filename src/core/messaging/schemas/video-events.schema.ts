import { z } from 'zod'

export const VideoEventDetailSchema = z.object({
  videoId: z.string().min(1),
  videoPath: z.string().optional(),
  duration: z.number().positive().optional(),
  userEmail: z.string().email().optional(),
  videoName: z.string().optional(),
})

export const VideoEventSchema = z.object({
  detail: VideoEventDetailSchema,
})

export type VideoEventDetail = z.infer<typeof VideoEventDetailSchema>
export type VideoEvent = z.infer<typeof VideoEventSchema>

export const SegmentEventDetailSchema = z.object({
  videoId: z.string().min(1),
  presignedUrl: z.string().url(),
  segmentNumber: z.number().int().positive(),
  totalSegments: z.number().int().positive(),
  startTime: z.number().min(0),
  endTime: z.number().positive(),
  userEmail: z.string().email().optional(),
  videoName: z.string().optional(),
})

export const SegmentEventSchema = z.object({
  detail: SegmentEventDetailSchema,
})

export type SegmentEventDetail = z.infer<typeof SegmentEventDetailSchema>
export type SegmentEvent = z.infer<typeof SegmentEventSchema>

export const SegmentMessageSchema = z.object({
  videoId: z.string().min(1),
  presignedUrl: z.string().url(),
  segmentNumber: z.number().int().positive(),
  totalSegments: z.number().int().positive(),
  startTime: z.number().min(0),
  endTime: z.number().positive(),
  userEmail: z.string().email().optional(),
  videoName: z.string().optional(),
})

export type SegmentMessage = z.infer<typeof SegmentMessageSchema>

export const CompleteMultipartEventDetailSchema = z.object({
  bucket: z.object({
    name: z.string().min(1),
  }),
  object: z.object({
    key: z.string().min(1),
  }),
  reason: z.string().min(1),
})

export const CompleteMultipartEventSchema = z.object({
  detail: CompleteMultipartEventDetailSchema,
})

export type CompleteMultipartEventDetail = z.infer<
  typeof CompleteMultipartEventDetailSchema
>
export type CompleteMultipartEvent = z.infer<typeof CompleteMultipartEventSchema>

export const VIDEO_EVENT_TYPES = {
  ORCHESTRATOR_TRIGGERED: 'video.orchestrator.triggered',
  SEGMENT_PRINT: 'video.segment.print',
  MULTIPART_COMPLETE: 'video.multipart.complete',
  STATUS_CHANGED: 'video.status.changed',
} as const
