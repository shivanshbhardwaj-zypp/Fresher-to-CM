import { MongoClient, type Db as MongoDb, type ClientSession } from "mongodb";
import { config } from "../config.js";
import { logger } from "../logger.js";

/**
 * MongoDB connection and index setup.
 *
 * IMPORTANT: multi-document transactions require a replica set. Atlas clusters
 * are replica sets by default; a local standalone `mongod` is NOT and will
 * reject `withTransaction`, which would silently break the outbox guarantee.
 * `assertTransactionsSupported()` turns that into a loud startup failure rather
 * than a runtime surprise on the first submission.
 */

export interface MongoContext {
  client: MongoClient;
  db: MongoDb;
}

export const COLLECTIONS = {
  cmApplications: "cm_applications",
  outboxEvents: "outbox_events",
} as const;

export async function connectMongo(
  uri: string = config.MONGODB_URI,
  dbName: string = config.MONGODB_DB,
): Promise<MongoContext> {
  const client = new MongoClient(uri, {
    // Fail fast on a bad URI or a blocked IP rather than hanging the boot.
    serverSelectionTimeoutMS: 10_000,
    retryWrites: true,
  });

  await client.connect();
  return { client, db: client.db(dbName) };
}

/**
 * Creates the indexes the queries rely on. Mongo has no schema migrations, but
 * indexes still have to exist — this is the equivalent step, and it is
 * idempotent so it can safely run on every boot.
 */
export async function ensureIndexes(db: MongoDb): Promise<void> {
  const cmApplications = db.collection(COLLECTIONS.cmApplications);
  const outbox = db.collection(COLLECTIONS.outboxEvents);

  await Promise.all([
    // Admin list view: newest first, optionally filtered by status.
    cmApplications.createIndex({ createdAt: -1 }, { name: "cm_createdAt_desc" }),
    cmApplications.createIndex({ status: 1, createdAt: -1 }, { name: "cm_status_createdAt" }),
    // One application per person, enforced by the database rather than by a
    // read-then-write in the service — two concurrent submissions would both
    // pass that check, but only one can win a unique index.
    cmApplications.createIndex({ emailNormalized: 1 }, { name: "cm_email_unique", unique: true }),
    cmApplications.createIndex({ phoneNormalized: 1 }, { name: "cm_phone_unique", unique: true }),

    // The outbox worker's hot query.
    outbox.createIndex({ status: 1, nextAttemptAt: 1 }, { name: "outbox_pending" }),
  ]);
}

/**
 * Verifies the deployment can actually run transactions.
 *
 * A standalone mongod accepts writes happily but throws on `startTransaction`,
 * so without this check the app would look healthy until the first submission.
 */
export async function assertTransactionsSupported(client: MongoClient): Promise<void> {
  const hello = await client.db("admin").command({ hello: 1 });
  const isReplicaSet = Boolean(hello.setName);
  const isSharded = hello.msg === "isdbgrid";

  if (!isReplicaSet && !isSharded) {
    throw new Error(
      "MongoDB is running as a standalone server, which cannot do multi-document " +
        "transactions. An application and its outbox event must be written " +
        "atomically. Use a replica set — Atlas provides one by default, or start " +
        "a local mongod with --replSet and run rs.initiate().",
    );
  }

  logger.info({ replicaSet: hello.setName ?? "sharded" }, "mongodb transactions available");
}

/**
 * Runs `fn` inside a transaction. `withTransaction` handles retrying on the
 * transient errors the driver expects.
 */
export async function withTransaction<T>(
  client: MongoClient,
  fn: (session: ClientSession) => Promise<T>,
): Promise<T> {
  const session = client.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
