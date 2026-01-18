import {
  SQSClient,
  SendMessageCommand,
  SendMessageBatchCommand,
  type SendMessageBatchRequestEntry,
} from '@aws-sdk/client-sqs'
import { AbstractQueuePublisher } from '@core/abstractions/messaging/queue-publisher.abstract'
import { AbstractLoggerService } from '@core/libs/logging/abstract-logger'
import { Result } from '@core/domain/result'

export abstract class AbstractSQSPublisher<
  TMessage,
> extends AbstractQueuePublisher<TMessage> {
  constructor(
    protected readonly logger: AbstractLoggerService,
    protected readonly sqsClient: SQSClient,
    protected readonly queueUrl: string,
  ) {
    super()
  }

  protected abstract serializeMessage(message: TMessage): string

  async publish(message: TMessage): Promise<Result<void, Error>> {
    try {
      const body = this.serializeMessage(message)
      const command = new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: body,
      })

      await this.sqsClient.send(command)
      return Result.ok(undefined)
    } catch (error) {
      this.logger.error('Failed to publish message to SQS', {
        error,
        queue: this.maskQueueUrl(),
      })
      return Result.fail(
        error instanceof Error ? error : new Error(String(error)),
      )
    }
  }

  async publishBatch(messages: TMessage[]): Promise<Result<void, Error>> {
    try {
      if (messages.length === 0) return Result.ok(undefined)

      // SQS batch limit is 10. We need to chunk if larger.
      const chunks = this.chunkArray(messages, 10)

      for (const chunk of chunks) {
        const entries: SendMessageBatchRequestEntry[] = chunk.map(
          (msg, index) => ({
            Id: index.toString(), // ID within batch
            MessageBody: this.serializeMessage(msg),
          }),
        )

        const command = new SendMessageBatchCommand({
          QueueUrl: this.queueUrl,
          Entries: entries,
        })

        const response = await this.sqsClient.send(command)

        if (response.Failed && response.Failed.length > 0) {
          this.logger.error('Some messages failed to publish in batch', {
            failedCount: response.Failed.length,
            failures: response.Failed,
          })
          // Partial failure scenario.
          // For now, we return failure if ANY fail.
          return Result.fail(
            new Error(
              `Failed to publish ${response.Failed.length} messages in batch`,
            ),
          )
        }
      }

      return Result.ok(undefined)
    } catch (error) {
      this.logger.error('Failed to publish batch messages to SQS', {
        error,
        queue: this.maskQueueUrl(),
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
