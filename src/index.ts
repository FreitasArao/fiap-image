import { AbstractLoggerService } from "@core/libs/logging/abstract-logger";
import { PinoLoggerService } from "@core/libs/logging/pino-logger";
import { fromTypes, openapi } from '@elysiajs/openapi';
import { opentelemetry } from '@elysiajs/opentelemetry';
import { context } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { Elysia } from "elysia";

const loggerLibrary: AbstractLoggerService = new PinoLoggerService({
  suppressConsole: false,
}, context.active(), )

const app = new Elysia()
    .use(opentelemetry({
      instrumentations: [],
      spanProcessors: [

				new BatchSpanProcessor(
					new OTLPTraceExporter()
				)
			]
    }))
    .use(openapi({
      references: fromTypes(
        process.env.NODE_ENV === 'production'
             		? 'dist/index.d.ts'
               		: 'src/index.ts'
      )
    }))
    .get("/", ({ request }) => {
      const logger = loggerLibrary.withContext('HelloWorldController')
      logger.log('Hello World')
      return 'Hello World'
    }).listen(3010);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
