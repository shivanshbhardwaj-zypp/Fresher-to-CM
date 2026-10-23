import { randomUUID } from "node:crypto";
import type { ClientSession, Db, Collection } from "mongodb";
import { COLLECTIONS } from "../db/mongo.js";

/**
 * Transactional outbox.
 *
 * Events are inserted in the same transaction as the business document they
 * describe. A separate worker delivers them, so an outage in the notification
 * channel never rejects or loses a user's submission.
 *
 * MongoDB note: this only holds on a replica set — a standalone server cannot
 * run multi-document transactions. `assertTransactionsSupported()` checks that
 * at boot.
 */

export type OutboxStatus = "pending" | "delivered" | "failed";

export interface OutboxEvent {
  id: string;
  eventType: string;
  payload: unknown;
  status: OutboxStatus;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string;
  createdAt: string;
  deliveredAt: string | null;
}

/** Payload is stored as a real subdocument, not a JSON string as in SQL. */
interface OutboxDoc {
  _id: string;
  eventType: string;
  payload: unknown;
  status: OutboxStatus;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string;
  createdAt: string;
  deliveredAt: string | null;
}

function toEvent(doc: OutboxDoc): OutboxEvent {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

/** Give up after this many tries and park the event as `failed` for a human. */
export const MAX_DELIVERY_ATTEMPTS = 6;

/** Exponential backoff with a ceiling: 1m, 2m, 4m, 8m, 16m, 30m. */
export function backoffMs(attempts: number): number {
  return Math.min(60_000 * 2 ** (attempts - 1), 30 * 60_000);
}

export class OutboxRepository {
  private readonly col: Collection<OutboxDoc>;

  constructor(db: Db) {
    this.col = db.collection<OutboxDoc>(COLLECTIONS.outboxEvents);
  }

  /** Must be called inside the caller's transaction session. */
  async enqueue(
    eventType: string,
    payload: unknown,
    now: string = new Date().toISOString(),
    session?: ClientSession,
  ): Promise<string> {
    const id = randomUUID();
    await this.col.insertOne(
      {
        _id: id,
        eventType,
        payload,
        status: "pending",
        attempts: 0,
        lastError: null,
        nextAttemptAt: now,
        createdAt: now,
        deliveredAt: null,
      },
      { session },
    );
    return id;
  }

  /** Pending events whose backoff has elapsed, oldest first. */
  async claimDue(limit: number, now: string = new Date().toISOString()): Promise<OutboxEvent[]> {
    const docs = await this.col
      .find({ status: "pending", nextAttemptAt: { $lte: now } })
      .sort({ nextAttemptAt: 1 })
      .limit(limit)
      .toArray();

    return docs.map(toEvent);
  }

  async markDelivered(id: string, now: string = new Date().toISOString()): Promise<void> {
    await this.col.updateOne(
      { _id: id },
      { $set: { status: "delivered", deliveredAt: now, lastError: null } },
    );
  }

  /**
   * Records a failed attempt and schedules the retry. Once attempts hit the
   * ceiling the event is parked as `failed` so it stops consuming worker time
   * and shows up in the admin stats.
   */
  async markAttemptFailed(
    id: string,
    attempts: number,
    error: string,
    now: Date = new Date(),
  ): Promise<void> {
    const nextAttempts = attempts + 1;
    const exhausted = nextAttempts >= MAX_DELIVERY_ATTEMPTS;
    const nextAttemptAt = new Date(now.getTime() + backoffMs(nextAttempts)).toISOString();

    await this.col.updateOne(
      { _id: id },
      {
        $set: {
          attempts: nextAttempts,
          lastError: error.slice(0, 1000),
          status: exhausted ? "failed" : "pending",
          nextAttemptAt,
        },
      },
    );
  }

  async countByStatus(): Promise<Record<string, number>> {
    const rows = await this.col
      .aggregate<{ _id: string; count: number }>([{ $group: { _id: "$status", count: { $sum: 1 } } }])
      .toArray();

    return Object.fromEntries(rows.map((row) => [row._id, row.count]));
  }
}
