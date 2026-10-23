import { config } from "../config.js";
import { logger } from "../logger.js";
import type { OutboxEvent } from "../repositories/outboxRepo.js";

/**
 * Delivers outbox events to whatever notification channel is configured.
 *
 * A notifier either resolves (delivered) or throws (retry). It must never
 * swallow a failure, otherwise the worker would mark an undelivered event as
 * delivered.
 */
export interface Notifier {
  deliver(event: OutboxEvent): Promise<void>;
}

/** Default channel. Records the event so nothing is lost before a real channel is wired. */
export class LogNotifier implements Notifier {
  async deliver(event: OutboxEvent): Promise<void> {
    logger.info(
      { eventId: event.id, eventType: event.eventType, payload: event.payload },
      "outbox event delivered to log channel",
    );
  }
}

/** Posts the event to an external URL (Slack, Zapier, a CRM ingest endpoint, …). */
export class WebhookNotifier implements Notifier {
  constructor(
    private readonly url: string,
    private readonly timeoutMs = 10_000,
  ) {}

  async deliver(event: OutboxEvent): Promise<void> {
    // Without a deadline a hung endpoint would stall the worker indefinitely.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: event.id,
          eventType: event.eventType,
          occurredAt: event.createdAt,
          data: event.payload,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Webhook responded ${response.status}`);
      }
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Fans one event out to several channels.
 *
 * If any channel throws, the whole delivery is treated as failed so the outbox
 * retries it. Channels must therefore be idempotent: a retry re-delivers to
 * every channel, including the ones that already succeeded.
 */
export class CompositeNotifier implements Notifier {
  constructor(private readonly channels: Notifier[]) {}

  /**
   * Every channel is attempted on every call, even if an earlier one throws:
   * a sequential await-in-a-loop would stop at the first failure, so a
   * broken channel could block a healthy, unrelated one from ever being
   * tried for as long as the broken one keeps failing.
   */
  async deliver(event: OutboxEvent): Promise<void> {
    const results = await Promise.allSettled(this.channels.map((channel) => channel.deliver(event)));
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");

    if (failures.length > 0) {
      const reasons = failures.map((f) => (f.reason instanceof Error ? f.reason.message : String(f.reason)));
      throw new Error(`${failures.length}/${results.length} notifier channels failed: ${reasons.join("; ")}`);
    }
  }
}

/**
 * Builds the notifier stack from `NOTIFY_CHANNEL` (comma-separated).
 *
 * `extra` is for channels that need a dependency the config cannot supply — a
 * repository, an API client — and so have to be constructed in `container.ts`.
 */
export function createNotifier(extra: Notifier[] = []): Notifier {
  const channels: Notifier[] = [];

  for (const name of config.notifyChannels) {
    if (name === "webhook") channels.push(new WebhookNotifier(config.NOTIFY_WEBHOOK_URL!));
    else if (name === "log") channels.push(new LogNotifier());
  }

  channels.push(...extra);

  // Never return an empty notifier: an event that went nowhere would still be
  // marked delivered, and no one would have been told.
  if (channels.length === 0) return new LogNotifier();
  return channels.length === 1 ? channels[0] : new CompositeNotifier(channels);
}
