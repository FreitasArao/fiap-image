import { Consumer } from 'sqs-consumer'
import { SQSClient, type Message } from '@aws-sdk/client-sqs'
import { AbstractLoggerService } from '@core/libs/logging/abstract-logger'

interface BaseConsumerConfig {
  queueUrl: string
  region?: string
  batchSize?: number
  visibilityTimeout?: number
  waitTimeSeconds?: number
  pollingWaitTimeMs?: number
}

export abstract class AbstractSQSConsumer<T> {
  private consumer: Consumer
  protected client: SQSClient
  protected config: Required<BaseConsumerConfig>

  constructor(
    config: BaseConsumerConfig,
    protected readonly logger: AbstractLoggerService,
  ) {
    this.config = {
      region: config.region || process.env.AWS_REGION || 'us-east-1',
      batchSize: config.batchSize || 10,
      visibilityTimeout: config.visibilityTimeout || 30,
      waitTimeSeconds: config.waitTimeSeconds || 20,
      pollingWaitTimeMs: config.pollingWaitTimeMs || 0,
      queueUrl: config.queueUrl,
    }

    this.client = new SQSClient({ region: this.config.region })

    this.consumer = Consumer.create({
      queueUrl: this.config.queueUrl,
      sqs: this.client,
      batchSize: this.config.batchSize,
      visibilityTimeout: this.config.visibilityTimeout,
      waitTimeSeconds: this.config.waitTimeSeconds,
      pollingWaitTimeMs: this.config.pollingWaitTimeMs,
      handleMessage: async (message) => {
        return await this.processMessage(message)
      },
    })

    this.setupEventListeners()
  }

  protected abstract parseMessage(body: string): T | null
  protected abstract handleMessage(payload: T, message: Message): Promise<void>

  protected async onError(
    error: Error,
    message: Message,
    payload?: T,
  ): Promise<void> {
    this.logger.error('Error processing message:', {
      error: error.message,
      messageId: message.MessageId,
      payload,
    })
  }

  protected async onStart(): Promise<void> {
    this.logger.log(`Starting consumer for ${this.config.queueUrl}`)
  }

  protected async onStop(): Promise<void> {
    this.logger.log(`Consumer stopped for ${this.config.queueUrl}`)
  }

  private async processMessage(message: Message): Promise<Message> {
    let payload: T | null = null

    try {
      payload = this.parseMessage(message.Body || '{}')

      if (payload === null) {
        throw new Error('Invalid message format')
      }

      await this.handleMessage(payload, message)

      return message
    } catch (error) {
      await this.onError(
        error instanceof Error ? error : new Error(String(error)),
        message,
        payload || undefined,
      )

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

    this.consumer.on('started', async () => {
      await this.onStart()
    })

    this.consumer.on('stopped', async () => {
      await this.onStop()
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
