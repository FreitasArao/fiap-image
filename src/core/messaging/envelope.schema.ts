import { z } from 'zod'

export const EnvelopeMetadataSchema = z.object({
  messageId: z.string().uuid(),
  correlationId: z.string().min(1),
  traceId: z.string().min(1),
  spanId: z.string().min(1),
  source: z.string().min(1),
  eventType: z.string().min(1),
  version: z.string().min(1),
  timestamp: z.string().datetime(),
  retryCount: z.number().int().min(0),
  maxRetries: z.number().int().min(0),
})

export const GenericEnvelopeSchema = z.object({
  metadata: EnvelopeMetadataSchema,
  payload: z.unknown(),
})

export type EnvelopeMetadataType = z.infer<typeof EnvelopeMetadataSchema>
