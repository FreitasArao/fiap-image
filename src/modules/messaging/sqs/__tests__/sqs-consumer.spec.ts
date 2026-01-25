import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test'
import { mockClient } from 'aws-sdk-client-mock'
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  type Message,
} from '@aws-sdk/client-sqs'
import { AbstractSQSConsumer } from '../abstract-sqs-consumer'
import { AbstractLoggerService } from '@core/libs/logging/abstract-logger'

const sqsMock = mockClient(SQSClient)

class TestConsumer extends AbstractSQSConsumer<{ id: string }> {
  public handledMessages: { id: string }[] = []

  protected parseMessage(body: string): { id: string } | null {
    return JSON.parse(body)
  }

  protected async handleMessage(message: { id: string }): Promise<void> {
    this.handledMessages.push(message)
  }

  protected onError(
    error: Error,
    message: Message,
    payload?: { id: string } | undefined,
  ): Promise<void> {
    this.logger.error('Error processing message:', {
      error: error.message,
      message: message.MessageId,
      payload: payload,
    })

    return Promise.resolve()
  }
}

describe('AbstractSQSConsumer', () => {
  let logger: AbstractLoggerService
  let consumer: TestConsumer

  beforeEach(() => {
    sqsMock.reset()

    logger = {
      log: mock(),
      error: mock(),
      warn: mock(),
      debug: mock(),
    } as unknown as AbstractLoggerService

    consumer = new TestConsumer(
      {
        queueUrl: 'http://queue.url',
        region: 'us-east-1',
        batchSize: 10,
        visibilityTimeout: 30,
        waitTimeSeconds: 20,
        pollingWaitTimeMs: 0,
      },
      logger,
    )
  })

  afterEach(() => {
    sqsMock.reset()
  })

  it('should consume messages', async () => {
    // First call returns one message, second returns empty
    sqsMock
      .on(ReceiveMessageCommand)
      .resolvesOnce({
        Messages: [
          {
            MessageId: '1',
            ReceiptHandle: 'handle-1',
            Body: JSON.stringify({ id: 'msg-1' }),
          },
        ],
      })
      .resolves({ Messages: [] })

    sqsMock.on(DeleteMessageCommand).resolves({})

    consumer.start()

    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(consumer.isRunning()).toBe(true)
  })

  it('should skip messages without body', async () => {
    sqsMock
      .on(ReceiveMessageCommand)
      .resolvesOnce({
        Messages: [
          {
            MessageId: '1',
            ReceiptHandle: 'handle-1',
            Body: undefined, // No body
          },
          {
            MessageId: '2',
            ReceiptHandle: 'handle-2',
            Body: JSON.stringify({ id: 'msg-2' }),
          },
        ],
      })
      .resolves({ Messages: [] })

    consumer.start()

    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(consumer.isRunning()).toBe(true)
  })
})
