import { config } from "./config.js";
import { logger } from "./logger.js";
import { assertTransactionsSupported, connectMongo, ensureIndexes } from "./db/mongo.js";
import { createContainer } from "./container.js";
import { createApp } from "./app.js";

/**
 * Process entrypoint: connect, verify, wire, listen, and shut down cleanly.
 */
async function main(): Promise<void> {
  const { client, db } = await connectMongo();

  // Fail loudly at boot rather than on the first submission: without a replica
  // set the outbox transaction cannot run.
  await assertTransactionsSupported(client);

  // Mongo has no schema migrations, but the indexes the queries rely on still
  // have to exist. Idempotent, so it is safe on every boot.
  await ensureIndexes(db);

  const container = createContainer(client, db);
  const app = createApp(container);

  const server = app.listen(config.PORT, () => {
    logger.info(
      {
        port: config.PORT,
        env: config.NODE_ENV,
        database: config.MONGODB_DB,
        notifyChannel: config.NOTIFY_CHANNEL,
        trustProxy: config.TRUST_PROXY,
      },
      "bano zypp ke cm api listening",
    );
  });

  container.worker.start();

  /**
   * Stop accepting connections, finish in-flight work, then exit.
   * Without this a deploy can cut an active submission mid-transaction.
   */
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    void (async () => {
      if (shuttingDown) return;
      shuttingDown = true;
      logger.info({ signal }, "shutting down");

      server.close(() => logger.info("http server closed"));

      await container.worker.stop();
      await client.close();

      // Don't hang forever if a socket refuses to close.
      setTimeout(() => process.exit(0), 5_000).unref();
    })();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  process.on("unhandledRejection", (reason) => {
    logger.error({ err: reason }, "unhandled promise rejection");
  });
  process.on("uncaughtException", (error) => {
    // State is unknown after this point — log and let the supervisor restart.
    logger.fatal({ err: error }, "uncaught exception, exiting");
    process.exit(1);
  });
}

main().catch((error) => {
  logger.fatal({ err: error }, "failed to start");
  process.exit(1);
});
