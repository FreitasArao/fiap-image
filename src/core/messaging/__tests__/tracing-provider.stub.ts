import type { TracingProvider, TracingContext } from '../tracing-provider'

/**
 * Test stub for TracingProvider.
 * Allows setting a fixed tracing context for tests.
 */
export class TracingProviderStub implements TracingProvider {
  private context: TracingContext | null = null

  setContext(context: TracingContext | null): void {
    this.context = context
  }

  getActiveContext(): TracingContext | null {
    return this.context
  }

  /**
   * Creates a stub with a preset context.
   */
  static withContext(traceId: string, spanId: string): TracingProviderStub {
    const stub = new TracingProviderStub()
    stub.setContext({ traceId, spanId })
    return stub
  }

  /**
   * Creates a stub with no active context (null).
   */
  static noContext(): TracingProviderStub {
    return new TracingProviderStub()
  }
}
