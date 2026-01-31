import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test'
import { mockClient } from 'aws-sdk-client-mock'
import {
  SQSClient,
  SendMessageCommand,
  SendMessageBatchCommand,
} from '@aws-sdk/client-sqs'
import { createSQSPublisher } from '../abstract-sqs-publisher'
import { TracingProviderStub } from '@core/messaging/__tests__/tracing-provider.stub'
import { EnvelopeFactory } from '@core/messaging'
import type { AbstractLoggerService } from '@core/libs/logging/abstract-logger'

const sqsMock = mockClient(SQSClient)

describe('AbstractSQSPublisher', () => {
  let logger: AbstractLoggerService

  beforeEach(() => {
    sqsMock.reset()
    logger = {
      log: mock(),
      error: mock(),
    } as unknown as AbstractLoggerService
  })

  afterEach(() => {
    sqsMock.reset()
  })

  it('should publish message with envelope successfully', async () => {
    sqsMock.on(SendMessageCommand).resolves({
      MessageId: 'msg-id-123',
    })

    const publisher = createSQSPublisher<{ id: string }>(
      { queueUrl: 'http://queue.url', source: 'test-source' },
      logger,
    )

    const result = await publisher.publish(
      { id: 'msg-1' },
      { eventType: 'test.event', correlationId: 'corr-123' },
    )

    expect(result.isSuccess).toBe(true)

    const calls = sqsMock.commandCalls(SendMessageCommand)
    expect(calls.length).toBe(1)

    const body = JSON.parse(calls[0].args[0].input.MessageBody as string)
    expect(body.metadata).toBeDefined()
    expect(body.metadata.correlationId).toBe('corr-123')
    expect(body.metadata.eventType).toBe('test.event')
    expect(body.metadata.source).toBe('test-source')
    expect(body.payload).toEqual({ id: 'msg-1' })
  })

  it('should fail when correlationId is missing', async () => {
    const publisher = createSQSPublisher<{ id: string }>(
      { queueUrl: 'http://queue.url' },
      logger,
    )

    const result = await publisher.publish(
      { id: 'msg-1' },
      { eventType: 'test.event', correlationId: '' },
    )

    expect(result.isFailure).toBe(true)
    expect(result.error?.message).toContain('correlationId is required')
  })

  it('should use traceId/spanId from TracingProvider', async () => {
    sqsMock.on(SendMessageCommand).resolves({})

    const tracingProvider = TracingProviderStub.withContext(
      'trace-from-provider',
      'span-from-provider',
    )

    const publisher = createSQSPublisher<{ id: string }>(
      { queueUrl: 'http://queue.url' },
      logger,
      tracingProvider,
    )

    await publisher.publish(
      { id: 'msg-1' },
      { eventType: 'test.event', correlationId: 'corr-123' },
    )

    const calls = sqsMock.commandCalls(SendMessageCommand)
    const body = JSON.parse(calls[0].args[0].input.MessageBody as string)

    expect(body.metadata.traceId).toBe('trace-from-provider')
    expect(body.metadata.spanId).toBe('span-from-provider')
  })

  it('should publish batch messages with envelopes', async () => {
    sqsMock.on(SendMessageBatchCommand).resolves({
      Successful: [{ Id: '0', MessageId: 'msg-0' }],
      Failed: [],
    })

    const publisher = createSQSPublisher<{ id: string }>(
      { queueUrl: 'http://queue.url' },
      logger,
    )

    const messages = [{ id: 'msg-1' }, { id: 'msg-2' }]
    const result = await publisher.publishBatch(messages, {
      eventType: 'test.batch.event',
      correlationId: 'batch-corr-123',
    })

    expect(result.isSuccess).toBe(true)

    const calls = sqsMock.commandCalls(SendMessageBatchCommand)
    expect(calls.length).toBe(1)
    expect(calls[0].args[0].input.Entries?.length).toBe(2)
  })

  it('should chunk batch messages when exceeding 10', async () => {
    sqsMock.on(SendMessageBatchCommand).resolves({
      Successful: [],
      Failed: [],
    })

    const publisher = createSQSPublisher<{ id: string }>(
      { queueUrl: 'http://queue.url' },
      logger,
    )

    const messages = Array.from({ length: 15 }, (_, i) => ({ id: `msg-${i}` }))
    const result = await publisher.publishBatch(messages, {
      eventType: 'test.event',
      correlationId: 'corr-123',
    })

    expect(result.isSuccess).toBe(true)

    const calls = sqsMock.commandCalls(SendMessageBatchCommand)
    expect(calls.length).toBe(2)
    expect(calls[0].args[0].input.Entries?.length).toBe(10)
    expect(calls[1].args[0].input.Entries?.length).toBe(5)
  })

  it('should return failure when batch has failed messages', async () => {
    sqsMock.on(SendMessageBatchCommand).resolves({
      Successful: [],
      Failed: [
        { Id: '0', SenderFault: true, Code: 'Error', Message: 'Failed' },
      ],
    })

    const publisher = createSQSPublisher<{ id: string }>(
      { queueUrl: 'http://queue.url' },
      logger,
    )

    const result = await publisher.publishBatch([{ id: 'msg-1' }], {
      eventType: 'test.event',
      correlationId: 'corr-123',
    })

    expect(result.isFailure).toBe(true)
    expect(result.error?.message).toContain('Failed to publish 1 messages')
  })

  it('should return success for empty batch', async () => {
    const publisher = createSQSPublisher<{ id: string }>(
      { queueUrl: 'http://queue.url' },
      logger,
    )

    const result = await publisher.publishBatch([], {
      eventType: 'test.event',
      correlationId: 'corr-123',
    })

    expect(result.isSuccess).toBe(true)
    expect(sqsMock.commandCalls(SendMessageBatchCommand).length).toBe(0)
  })
})
