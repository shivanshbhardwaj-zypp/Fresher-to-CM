import type { MongoClient, Db } from "mongodb";
import { CmApplicationRepository } from "./repositories/cmApplicationRepo.js";
import { OutboxRepository } from "./repositories/outboxRepo.js";
import { CmApplicationService } from "./services/cmApplicationService.js";
import { createNotifier, type Notifier } from "./notifications/notifier.js";
import { OutboxWorker } from "./workers/outboxWorker.js";

/**
 * Composition root.
 *
 * Everything is constructed here and passed down, so nothing below imports a
 * singleton — which is what lets the tests hand the whole graph an in-memory
 * MongoDB and a spy notifier without touching a single module under test.
 */
export interface Container {
  client: MongoClient;
  db: Db;
  applications: CmApplicationRepository;
  outbox: OutboxRepository;
  service: CmApplicationService;
  notifier: Notifier;
  worker: OutboxWorker;
}

export function createContainer(client: MongoClient, db: Db, notifierOverride?: Notifier): Container {
  const applications = new CmApplicationRepository(db);
  const outbox = new OutboxRepository(db);

  // The override exists for tests; production always builds from config.
  const notifier = notifierOverride ?? createNotifier();

  const service = new CmApplicationService(client, applications, outbox);
  const worker = new OutboxWorker(outbox, notifier);

  return { client, db, applications, outbox, service, notifier, worker };
}
