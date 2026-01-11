import { opentelemetry } from '@elysiajs/opentelemetry'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'

export const telemetry = opentelemetry({
  instrumentations: [],
  spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter())],
})
