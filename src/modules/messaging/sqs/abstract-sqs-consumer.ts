import { Consumer } from 'sqs-consumer'
import { SQSClient, type Message } from '@aws-sdk/client-sqs'
import type { AbstractLoggerService } from '@core/libs/logging/abstract-logger'
import {
  GenericEnvelopeSchema,
  type MessageContext,
  type MessageHandler,
  type EnvelopeMetadata,
} from '@core/messaging'

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

    this.client = new SQSClient({
      region: this.config.region,
      endpoint: process.env.AWS_ENDPOINT_URL,
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

  private parseBody(body: string): { payload: unknown; metadata: EnvelopeMetadata | null } {
    const parsed = JSON.parse(body)
    const envelopeResult = GenericEnvelopeSchema.safeParse(parsed)

    if (envelopeResult.success) {
      return {
        payload: envelopeResult.data.payload,
        metadata: envelopeResult.data.metadata,
      }
    }

    return { payload: parsed, metadata: null }
  }

  private async processMessage(message: Message): Promise<Message> {
    const body = message.Body ?? '{}'
    let context: MessageContext | null = null

    try {
      const { payload, metadata } = this.parseBody(body)

      context = {
        metadata,
        sqsMessage: message,
        messageId: message.MessageId,
      }

      this.logger.log('Processing message', {
        messageId: message.MessageId,
        correlationId: metadata?.correlationId,
        traceId: metadata?.traceId,
        eventType: metadata?.eventType,
        isEnvelope: metadata !== null,
      })

      const parseResult = this.handler.parse(payload)

      if (!parseResult.success) {
        throw new Error(`Payload validation failed: ${parseResult.error}`)
      }

      await this.handler.handle(parseResult.data, context)

      this.logger.log('Message processed', {
        messageId: message.MessageId,
        correlationId: metadata?.correlationId,
      })

      return message
    } catch (error) {
      this.logger.error('Error processing message', {
        error: error instanceof Error ? error.message : String(error),
        messageId: message.MessageId,
        correlationId: context?.metadata?.correlationId,
      })

      throw error
    }
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
