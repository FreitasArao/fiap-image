import { DataSource } from "@core/libs/database/datasource";
import { BaseElysia } from "@core/libs/elysia";
import { logger } from "@modules/logging";
import { StatusMap } from "elysia";

const datasource = DataSource.getInstance(logger);

export const healthRouter = BaseElysia.create().get("/", async ({ set }) => {
  const database = await datasource.isConnected();
  if (database.isFailure) {
    set.status = StatusMap["Service Unavailable"];
    return { status: "error", timestamp: new Date() };
  }
  return { status: "ok", timestamp: new Date(), database: database.value };
});
