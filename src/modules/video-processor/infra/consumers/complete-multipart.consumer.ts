import type { AbstractLoggerService } from '@core/libs/logging/abstract-logger'
import type { MessageHandler, MessageContext } from '@core/messaging'
import {
  CompleteMultipartEventSchema,
  type CompleteMultipartEvent,
} from '@core/messaging/schemas'
import {
  createSQSConsumer,
  type AbstractSQSConsumer,
} from '@modules/messaging/sqs'
import { CompleteMultipartHandler } from './complete-multipart-handler'
import { Result } from '@core/domain/result'

export class CompleteMultipartMessageHandler
  implements MessageHandler<CompleteMultipartEvent>
{
  constructor(
    private readonly logger: AbstractLoggerService,
    private readonly completeMultipartHandler: CompleteMultipartHandler,
  ) {}

  parse(rawPayload: unknown): Result<CompleteMultipartEvent, Error> {
    const result = CompleteMultipartEventSchema.safeParse(rawPayload)
    if (!result.success) {
      return Result.fail(new Error(result.error.message))
    }
    return Result.ok(result.data)
  }

  async handle(
    event: CompleteMultipartEvent,
    _context: MessageContext,
  ): Promise<Result<void, Error>> {
    // correlationId is automatically propagated via CorrelationStore (set by AbstractSQSConsumer)
    // and automatically included in all logs via Pino mixin - no manual passing needed
    this.logger.log('Handling S3 CompleteMultipartUpload event', { event })

    const result = await this.completeMultipartHandler.handle(event)

    if (result.isFailure) {
      this.logger.log('CompleteMultipartHandler returned failure', {
        error: result.error?.message,
      })
      return Result.fail(result.error)
    }

    this.logger.log('S3 CompleteMultipartUpload event handled successfully')

    return Result.ok()
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
