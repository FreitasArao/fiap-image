import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  ChangeMessageVisibilityCommand,
  type Message,
} from '@aws-sdk/client-sqs'
import { AbstractQueueConsumer } from '@core/abstractions/messaging/queue-consumer.abstract'
import { AbstractLoggerService } from '@core/libs/logging/abstract-logger'

export abstract class AbstractSQSConsumer<
  TMessage,
> extends AbstractQueueConsumer<TMessage> {
  constructor(
    protected readonly logger: AbstractLoggerService,
    protected readonly sqsClient: SQSClient,
    protected readonly queueUrl: string,
  ) {
    super()
  }

  protected abstract parseMessage(message: Message): TMessage
  protected abstract handleMessage(message: TMessage): Promise<void>

  /**
   * Handle errors during message processing.
   * @returns 'retry' to requeue with backoff, 'discard' to delete message permanently
   */
  protected abstract onError(
    error: Error,
    message: TMessage | null,
    rawMessage?: Message,
  ): Promise<'retry' | 'discard'>

  async start(): Promise<void> {
    this.logger.log(`Starting SQS consumer for queue: ${this.maskQueueUrl()}`)

    for await (const { message, receiptHandle } of this.consume()) {
      try {
        await this.handleMessage(message)
        await this.ack(receiptHandle)
      } catch (error) {
        const action = await this.onError(
          error instanceof Error ? error : new Error(String(error)),
          message,
        )

        if (action === 'discard') {
          this.logger.warn('Discarding message due to non-retryable error')
          await this.ack(receiptHandle)
        } else {
          await this.nack(receiptHandle, 60) // Retry after 60 seconds
        }
      }
    }
  }

  async *consume(): AsyncGenerator<{
    message: TMessage
    receiptHandle: string
  }> {
    while (true) {
      try {
        const command = new ReceiveMessageCommand({
          QueueUrl: this.queueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 20,
          VisibilityTimeout: 30,
        })

        const response = await this.sqsClient.send(command)

        if (!response.Messages || response.Messages.length === 0) {
          continue
        }

        for (const message of response.Messages) {
          if (!message.Body || !message.ReceiptHandle) {
            continue
          }

          let parsedMessage: TMessage
          try {
            parsedMessage = this.parseMessage(message)
          } catch (rawError) {
            const error =
              rawError instanceof Error ? rawError : new Error(String(rawError))

            this.logger.error('Failed to parse SQS message', {
              error,
              messageId: message.MessageId,
            })
            await this.onError(error, null, message)
            // Parse errors are not retryable - discard the message
            await this.ack(message.ReceiptHandle)
            continue
          }

          yield { message: parsedMessage, receiptHandle: message.ReceiptHandle }
        }
      } catch (error) {
        this.logger.error('Error in SQS consume loop', { error })
        await new Promise((resolve) => setTimeout(resolve, 5000)) // Backoff on network error
      }
    }
  }

  async ack(receiptHandle: string): Promise<void> {
    const command = new DeleteMessageCommand({
      QueueUrl: this.queueUrl,
      ReceiptHandle: receiptHandle,
    })
    await this.sqsClient.send(command)
  }

  /**
   * Negative acknowledgment - message will be reprocessed after visibility timeout.
   * @param receiptHandle - Receipt handle from the message
   * @param visibilityTimeoutSeconds - Time before message becomes visible again (default: 60s)
   */
  async nack(
    receiptHandle: string,
    visibilityTimeoutSeconds: number = 60,
  ): Promise<void> {
    const command = new ChangeMessageVisibilityCommand({
      QueueUrl: this.queueUrl,
      ReceiptHandle: receiptHandle,
      VisibilityTimeout: visibilityTimeoutSeconds,
    })
    await this.sqsClient.send(command)
  }
}
