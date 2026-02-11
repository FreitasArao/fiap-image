import { Consumer } from 'sqs-consumer'
import { SQSClient, type Message } from '@aws-sdk/client-sqs'
import type { AbstractLoggerService } from '@core/libs/logging/abstract-logger'
import {
  GenericEnvelopeSchema,
  type MessageContext,
  type MessageHandler,
  type EnvelopeMetadata,
} from '@core/messaging'
import { NonRetryableError } from '@core/errors/non-retryable.error'
import { CorrelationStore } from '@core/libs/context'

export interface SQSConsumerConfig {
  queueUrl: string
  region?: string
  batchSize?: number
  visibilityTimeout?: number
  waitTimeSeconds?: number
  pollingWaitTimeMs?: number
}

export abstract class AbstractSQSConsumer<TPayload> {
  private consumer: Consumer
  protected client: SQSClient
  protected config: Required<SQSConsumerConfig>

  constructor(
    config: SQSConsumerConfig,
    protected readonly logger: AbstractLoggerService,
    private readonly handler: MessageHandler<TPayload>,
  ) {
    this.config = {
      region: config.region ?? process.env.AWS_REGION ?? 'us-east-1',
      batchSize: config.batchSize ?? 10,
      visibilityTimeout: config.visibilityTimeout ?? 30,
      waitTimeSeconds: config.waitTimeSeconds ?? 20,
      pollingWaitTimeMs: config.pollingWaitTimeMs ?? 0,
      queueUrl: config.queueUrl,
    }

    const endpoint =
      process.env.AWS_ENDPOINT_URL ?? process.env.AWS_ENDPOINT ?? undefined
    this.client = new SQSClient({
      region: this.config.region,
      ...(endpoint && { endpoint }),
    })

    this.consumer = Consumer.create({
      queueUrl: this.config.queueUrl,
      sqs: this.client,
      batchSize: this.config.batchSize,
      visibilityTimeout: this.config.visibilityTimeout,
      waitTimeSeconds: this.config.waitTimeSeconds,
      pollingWaitTimeMs: this.config.pollingWaitTimeMs,
      handleMessage: async (message) => this.processMessage(message),
    })

    this.setupEventListeners()
  }

  private parseBody(body: string): {
    payload: unknown
    metadata: EnvelopeMetadata
  } {
    const parsed = JSON.parse(body)

    // Case 1: Direct envelope (from SQS publisher)
    const envelopeResult = GenericEnvelopeSchema.safeParse(parsed)
    if (envelopeResult.success) {
      return {
        payload: envelopeResult.data.payload,
        metadata: envelopeResult.data.metadata,
      }
    }

    // Case 2: EventBridge event with envelope in detail (EventBridge → SNS → SQS RawMessageDelivery)
    if (!parsed.detail || typeof parsed.detail !== 'object') {
      throw new Error(
        'Message is not in envelope format and has no EventBridge detail',
      )
    }

    const detailEnvelope = GenericEnvelopeSchema.safeParse(parsed.detail)
    if (detailEnvelope.success) {
      return {
        payload: { ...parsed, detail: detailEnvelope.data.payload },
        metadata: detailEnvelope.data.metadata,
      }
    }

    // Case 3: Raw EventBridge event (e.g. S3 → EventBridge → SQS)
    // The detail is not wrapped in an envelope; use the full event as payload
    // and synthesize metadata from EventBridge fields.
    return {
      payload: parsed,
      metadata: {
        messageId: parsed.id ?? crypto.randomUUID(),
        correlationId: parsed.id ?? crypto.randomUUID(),
        traceId: parsed.id ?? '',
        spanId: '',
        source: parsed.source ?? 'unknown',
        eventType: parsed['detail-type'] ?? 'unknown',
        version: parsed.version ?? '0',
        timestamp: parsed.time ?? new Date().toISOString(),
        retryCount: 0,
        maxRetries: 3,
      },
    }
  }

  /** Convert milliseconds to nanoseconds (Datadog standard) */
  private msToNs(ms: number): number {
    return Math.round(ms * 1_000_000)
  }

  private async processMessage(message: Message): Promise<Message | undefined> {
    const body = message.Body ?? '{}'
    const { payload, metadata } = this.parseBody(body)

    // Extract correlation context from envelope metadata
    const correlationContext = {
      correlationId: metadata.correlationId ?? message.MessageId ?? '',
      traceId: metadata.traceId,
      spanId: metadata.spanId,
    }

    // Wrap entire message processing in correlation context
    // This allows all downstream code to access correlation data automatically
    return CorrelationStore.run(correlationContext, async () => {
      const context: MessageContext = {
        metadata,
        messageId: message.MessageId,
      }

      const startTime = performance.now()

      try {
        this.logger.log('message.processing.start', {
          messageId: message.MessageId,
          eventType: metadata.eventType,
          queueUrl: this.config.queueUrl,
          component: 'sqs-consumer',
        })

        const parseResult = this.handler.parse(payload)

        if (parseResult.isFailure) {
          this.logger.warn('message.processing.end', {
            error: parseResult.error.message,
            messageId: message.MessageId,
            eventType: metadata.eventType,
            status: 'validation_failed',
            duration: this.msToNs(performance.now() - startTime),
            component: 'sqs-consumer',
          })
          // Non-retryable: remove from queue
          return message
        }

        const handleResult = await this.handler.handle(
          parseResult.value,
          context,
        )

        if (handleResult.isFailure) {
          // Use type guard to properly extract error
          const handlerError: Error = handleResult.error
          const errorMessage = handlerError.message

          if (NonRetryableError.isNonRetryable(handlerError)) {
            this.logger.warn('message.processing.end', {
              error: errorMessage,
              messageId: message.MessageId,
              eventType: metadata.eventType,
              status: 'non_retryable',
              duration: this.msToNs(performance.now() - startTime),
              component: 'sqs-consumer',
            })
            return message
          }

          this.logger.error('message.processing.end', {
            error: errorMessage,
            messageId: message.MessageId,
            eventType: metadata.eventType,
            status: 'error',
            duration: this.msToNs(performance.now() - startTime),
            component: 'sqs-consumer',
          })

          throw handlerError
        }

        this.logger.log('message.processing.end', {
          messageId: message.MessageId,
          eventType: metadata.eventType,
          status: 'success',
          duration: this.msToNs(performance.now() - startTime),
          component: 'sqs-consumer',
        })

        return message
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error)

        this.logger.error('message.processing.end', {
          error: errorMessage,
          messageId: message.MessageId,
          eventType: metadata.eventType,
          status: 'error',
          duration: this.msToNs(performance.now() - startTime),
          component: 'sqs-consumer',
        })

        throw error
      }
    })
  }

  private setupEventListeners(): void {
    this.consumer.on('error', (err) => {
      this.logger.error('Consumer error:', err)
    })

    this.consumer.on('processing_error', (err) => {
      this.logger.error('Processing error:', err)
    })

    this.consumer.on('timeout_error', (err) => {
      this.logger.error('Timeout error:', err)
    })

    this.consumer.on('started', () => {
      this.logger.log(`Consumer started for ${this.config.queueUrl}`)
    })

    this.consumer.on('stopped', () => {
      this.logger.log(`Consumer stopped for ${this.config.queueUrl}`)
    })
  }

  start(): void {
    this.consumer.start()
  }

  stop(): void {
    this.consumer.stop()
  }

  isRunning(): boolean {
    return this.consumer.status.isRunning
  }
}

export function createSQSConsumer<TPayload>(
  config: SQSConsumerConfig,
  logger: AbstractLoggerService,
  handler: MessageHandler<TPayload>,
): SQSConsumer<TPayload> {
  return new SQSConsumer(config, logger, handler)
}

class SQSConsumer<TPayload> extends AbstractSQSConsumer<TPayload> {}
