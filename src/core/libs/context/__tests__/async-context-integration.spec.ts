import { describe, it, expect } from 'bun:test'
import { CorrelationStore } from '../async-context'

describe('CorrelationStore Integration', () => {
  describe('context access patterns', () => {
    it('should provide correlation context to any code reading from CorrelationStore', () => {
      // Simulate a logger or service that reads from CorrelationStore
      const getContextForLog = () => ({
        correlationId: CorrelationStore.correlationId,
        traceId: CorrelationStore.traceId,
      })

      // Without context
      const withoutContext = getContextForLog()
      expect(withoutContext.correlationId).toBeUndefined()
      expect(withoutContext.traceId).toBeUndefined()

      // With context
      CorrelationStore.run(
        { correlationId: 'integration-test-123', traceId: 'trace-456' },
        () => {
          const withContext = getContextForLog()
          expect(withContext.correlationId).toBe('integration-test-123')
          expect(withContext.traceId).toBe('trace-456')
        },
      )
    })

    it('should work with factory functions that capture context', () => {
      // Simulate a mixin function like Pino uses
      const mixin = () => {
        const ctx = CorrelationStore.getStore()
        return {
          correlationId: ctx?.correlationId,
          traceId: ctx?.traceId,
          spanId: ctx?.spanId,
        }
      }

      // Without context
      expect(mixin().correlationId).toBeUndefined()

      // With context - mixin should capture it
      CorrelationStore.run(
        { correlationId: 'mixin-test', traceId: 'trace-mixin' },
        () => {
          const mixinResult = mixin()
          expect(mixinResult.correlationId).toBe('mixin-test')
          expect(mixinResult.traceId).toBe('trace-mixin')
        },
      )
    })
  })

  describe('with async message processing simulation', () => {
    it('should maintain context through simulated message handler', async () => {
      const capturedCorrelationIds: (string | undefined)[] = []

      // Simulate a message handler that accesses CorrelationStore
      const simulatedHandler = async () => {
        capturedCorrelationIds.push(CorrelationStore.correlationId)

        // Simulate async database call
        await new Promise((resolve) => setTimeout(resolve, 5))
        capturedCorrelationIds.push(CorrelationStore.correlationId)

        // Simulate async service call
        await simulateServiceCall()
        capturedCorrelationIds.push(CorrelationStore.correlationId)
      }

      const simulateServiceCall = async () => {
        await new Promise((resolve) => setTimeout(resolve, 5))
        capturedCorrelationIds.push(CorrelationStore.correlationId)
      }

      // Simulate consumer wrapping the handler
      await CorrelationStore.run({ correlationId: 'message-123' }, async () => {
        await simulatedHandler()
      })

      // All captured IDs should be the same
      expect(capturedCorrelationIds).toEqual([
        'message-123',
        'message-123',
        'message-123',
        'message-123',
      ])
    })

    it('should isolate contexts between concurrent message processing', async () => {
      const results: {
        messageId: string
        correlationId: string | undefined
      }[] = []

      const processMessage = async (
        messageId: string,
        correlationId: string,
      ) => {
        return CorrelationStore.run({ correlationId }, async () => {
          // Simulate varying processing times
          await new Promise((resolve) =>
            setTimeout(resolve, Math.random() * 20),
          )

          results.push({
            messageId,
            correlationId: CorrelationStore.correlationId,
          })
        })
      }

      // Process multiple messages concurrently
      await Promise.all([
        processMessage('msg-1', 'corr-1'),
        processMessage('msg-2', 'corr-2'),
        processMessage('msg-3', 'corr-3'),
      ])

      // Each message should have its own correlationId
      const msg1 = results.find((r) => r.messageId === 'msg-1')
      const msg2 = results.find((r) => r.messageId === 'msg-2')
      const msg3 = results.find((r) => r.messageId === 'msg-3')

      expect(msg1?.correlationId).toBe('corr-1')
      expect(msg2?.correlationId).toBe('corr-2')
      expect(msg3?.correlationId).toBe('corr-3')
    })
  })
})
