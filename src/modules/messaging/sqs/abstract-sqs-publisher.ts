import {
  SQSClient,
  SendMessageCommand,
  SendMessageBatchCommand,
  type SendMessageBatchRequestEntry,
} from '@aws-sdk/client-sqs'
import { AbstractQueuePublisher } from '@core/abstractions/messaging/queue-publisher.abstract'
import type { AbstractLoggerService } from '@core/libs/logging/abstract-logger'
import { Result } from '@core/domain/result'
import {
  EnvelopeFactory,
  defaultEnvelopeFactory,
  type PublishOptions,
  type TracingProvider,
} from '@core/messaging'

export interface SQSPublisherConfig {
  queueUrl: string
  source?: string
  region?: string
}

export abstract class AbstractSQSPublisher<
  TPayload,
> extends AbstractQueuePublisher<TPayload> {
  protected readonly queueUrl: string
  private readonly sqsClient: SQSClient
  private readonly envelopeFactory: EnvelopeFactory
  private readonly source: string

  constructor(
    protected readonly logger: AbstractLoggerService,
    config: SQSPublisherConfig,
    envelopeFactory?: EnvelopeFactory,
    sqsClient?: SQSClient,
  ) {
    super()
    this.queueUrl = config.queueUrl
    this.source = config.source ?? 'fiapx.video'
    this.sqsClient =
      sqsClient ??
      new SQSClient({
        region: config.region ?? process.env.AWS_REGION ?? 'us-east-1',
        endpoint: process.env.AWS_ENDPOINT_URL,
      })
    this.envelopeFactory = envelopeFactory ?? defaultEnvelopeFactory
  }

  async publish(
    payload: TPayload,
    options: PublishOptions,
  ): Promise<Result<void, Error>> {
    if (!options.correlationId) {
      return Result.fail(new Error('correlationId is required'))
    }

    try {
      const envelope = this.envelopeFactory.createEnvelope(payload, {
        correlationId: options.correlationId,
        eventType: options.eventType,
        source: options.source ?? this.source,
        traceId: options.traceId,
        spanId: options.spanId,
      })

      this.logger.log('Publishing message to SQS', {
        event: 'sqs.message.publishing',
        resource: 'AbstractSQSPublisher',
        message: 'Publishing message to SQS',
        'sqs.queueUrl': this.maskQueueUrl(),
        'sqs.eventType': options.eventType,
      })

      const response = await this.sqsClient.send(
        new SendMessageCommand({
          QueueUrl: this.queueUrl,
          MessageBody: JSON.stringify(envelope),
        }),
      )

      this.logger.log('Message published', {
        event: 'sqs.message.published',
        resource: 'AbstractSQSPublisher',
        message: 'Message published to SQS',
        status: 'success',
        'sqs.queueUrl': this.maskQueueUrl(),
        'sqs.messageId': response.MessageId ?? envelope.metadata.messageId,
        'sqs.eventType': options.eventType,
      })

      return Result.ok(undefined)
    } catch (error) {
      this.logger.error('Failed to publish message', {
        event: 'sqs.message.publish_failed',
        resource: 'AbstractSQSPublisher',
        message: 'Failed to publish message to SQS',
        status: 'failure',
        error:
          error instanceof Error
            ? {
                message: error.message,
                kind: error.constructor.name,
                stack: error.stack,
              }
            : { message: String(error), kind: 'Error' },
        'sqs.queueUrl': this.maskQueueUrl(),
      })
      return Result.fail(
        error instanceof Error ? error : new Error(String(error)),
      )
    }
  }

  async publishBatch(
    payloads: TPayload[],
    options: PublishOptions,
  ): Promise<Result<void, Error>> {
    if (!options.correlationId) {
      return Result.fail(new Error('correlationId is required'))
    }

    if (payloads.length === 0) {
      return Result.ok(undefined)
    }

    try {
      const chunks = this.chunkArray(payloads, 10)

      for (const chunk of chunks) {
        const entries: SendMessageBatchRequestEntry[] = chunk.map(
          (payload, index) => {
            const envelope = this.envelopeFactory.createEnvelope(payload, {
              correlationId: options.correlationId,
              eventType: options.eventType,
              source: options.source ?? this.source,
              traceId: options.traceId,
              spanId: options.spanId,
            })

            return {
              Id: `${index}-${envelope.metadata.messageId}`,
              MessageBody: JSON.stringify(envelope),
            }
          },
        )

        const response = await this.sqsClient.send(
          new SendMessageBatchCommand({
            QueueUrl: this.queueUrl,
            Entries: entries,
          }),
        )

        if (response.Failed && response.Failed.length > 0) {
          this.logger.error('Batch publish partial failure', {
            event: 'sqs.message.publish_failed',
            resource: 'AbstractSQSPublisher',
            message: 'Batch publish partial failure',
            status: 'failure',
            error: {
              message: `Failed to publish ${response.Failed.length} messages`,
              kind: 'BatchPublishError',
            },
            'sqs.queueUrl': this.maskQueueUrl(),
            failedCount: response.Failed.length,
            failures: response.Failed,
          })
          return Result.fail(
            new Error(`Failed to publish ${response.Failed.length} messages`),
          )
        }
      }

      this.logger.log('Batch published', {
        event: 'sqs.message.published',
        resource: 'AbstractSQSPublisher',
        message: 'Batch published to SQS',
        status: 'success',
        'sqs.queueUrl': this.maskQueueUrl(),
        'sqs.eventType': options.eventType,
        count: payloads.length,
      })

      return Result.ok(undefined)
    } catch (error) {
      this.logger.error('Failed to publish batch', {
        event: 'sqs.message.publish_failed',
        resource: 'AbstractSQSPublisher',
        message: 'Failed to publish batch to SQS',
        status: 'failure',
        error:
          error instanceof Error
            ? {
                message: error.message,
                kind: error.constructor.name,
                stack: error.stack,
              }
            : { message: String(error), kind: 'Error' },
        'sqs.queueUrl': this.maskQueueUrl(),
      })
      return Result.fail(
        error instanceof Error ? error : new Error(String(error)),
      )
    }
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }
}

export function createSQSPublisher<TPayload>(
  config: SQSPublisherConfig,
  logger: AbstractLoggerService,
  tracingProvider?: TracingProvider,
): SQSPublisher<TPayload> {
  const envelopeFactory = tracingProvider
    ? new EnvelopeFactory(tracingProvider)
    : undefined
  return new SQSPublisher<TPayload>(logger, config, envelopeFactory)
}

class SQSPublisher<TPayload> extends AbstractSQSPublisher<TPayload> {}
