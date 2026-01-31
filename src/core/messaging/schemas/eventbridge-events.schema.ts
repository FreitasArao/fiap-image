import { z } from 'zod'

export const VideoStatusEnum = z.enum([
  'UPLOADED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
])

export const VideoStatusChangedEventSchema = z.object({
  videoId: z.string().min(1),
  status: VideoStatusEnum,
  correlationId: z.string().min(1),
  timestamp: z.string().datetime().optional(),
  userEmail: z.string().email().optional(),
  videoName: z.string().optional(),
  videoPath: z.string().optional(),
  duration: z.number().positive().optional(),
  downloadUrl: z.string().url().optional(),
  errorReason: z.string().optional(),
  traceId: z.string().optional(),
})

export type VideoStatusChangedEventPayload = z.infer<
  typeof VideoStatusChangedEventSchema
>
