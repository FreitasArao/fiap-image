import type { AbstractLoggerService } from '@core/libs/logging/abstract-logger'
import { CorrelationStore } from '@core/libs/context'
import type {
  MessageHandler,
  MessageContext,
  ParseResult,
} from '@core/messaging'
import {
  CompleteMultipartEventSchema,
  type CompleteMultipartEvent,
} from '@core/messaging/schemas'
import {
  createSQSConsumer,
  type AbstractSQSConsumer,
} from '@modules/messaging/sqs'
import { CompleteMultipartHandler } from './complete-multipart-handler'

export class CompleteMultipartMessageHandler
  implements MessageHandler<CompleteMultipartEvent>
{
  constructor(
    private readonly logger: AbstractLoggerService,
    private readonly completeMultipartHandler: CompleteMultipartHandler,
  ) {}

  parse(rawPayload: unknown): ParseResult<CompleteMultipartEvent> {
    const result = CompleteMultipartEventSchema.safeParse(rawPayload)
    if (!result.success) {
      return { success: false, error: result.error.message }
    }
    return { success: true, data: result.data }
  }

  async handle(
    event: CompleteMultipartEvent,
    context: MessageContext,
  ): Promise<void> {
    // Get correlationId from AsyncLocalStorage (set by consumer)
    // Fallback to message context for backwards compatibility
    const correlationId =
      CorrelationStore.correlationId ??
      context.metadata?.correlationId ??
      context.messageId ??
      ''

    // correlationId is automatically included in logs via Pino mixin
    this.logger.log('Handling S3 CompleteMultipartUpload event', { event })

    const result = await this.completeMultipartHandler.handle(
      event,
      correlationId,
    )

    if (result.isFailure) {
      this.logger.log('CompleteMultipartHandler returned failure', {
        error: result.error?.message,
      })
      return
    }

    this.logger.log('S3 CompleteMultipartUpload event handled successfully', {
      event,
    })
  }
}

export function createCompleteMultipartConsumer(
  logger: AbstractLoggerService,
  completeMultipartHandler: CompleteMultipartHandler,
  queueUrl?: string,
): AbstractSQSConsumer<CompleteMultipartEvent> {
  const messageHandler = new CompleteMultipartMessageHandler(
    logger,
    completeMultipartHandler,
  )

  return createSQSConsumer<CompleteMultipartEvent>(
    {
      queueUrl: queueUrl ?? process.env.COMPLETE_MULTIPART_QUEUE_URL ?? '',
      region: process.env.AWS_REGION ?? 'us-east-1',
    },
    logger,
    messageHandler,
  )
}

export { CompleteMultipartHandler } from './complete-multipart-handler'
export type { CompleteMultipartEvent } from '@core/messaging/schemas'
