import { logger } from "../logger.js";
import type { Notifier } from "../notifications/notifier.js";
import type { OutboxRepository } from "../repositories/outboxRepo.js";

export interface OutboxWorkerOptions {
  /** How often to look for due events. */
  intervalMs?: number;
  /** Events processed per tick, bounding the work done in one pass. */
  batchSize?: number;
}

/**
 * Drains the transactional outbox.
 *
 * Runs in-process on a timer: this service has a single writer and low volume,
 * so a separate queue broker would be infrastructure without a payoff.
 *
 * ponytail: in-process timer + DB polling. Move to a real queue (BullMQ/SQS)
 * only if delivery volume outgrows one process.
 */
export class OutboxWorker {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private draining = false;

  constructor(
    private readonly outbox: OutboxRepository,
    private readonly notifier: Notifier,
    private readonly options: OutboxWorkerOptions = {},
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;

    const interval = this.options.intervalMs ?? 5_000;
    this.timer = setInterval(() => {
      void this.tick();
    }, interval);

    // Don't hold the process open purely for this timer.
    this.timer.unref?.();
    logger.info({ intervalMs: interval }, "outbox worker started");
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;

    // Let an in-flight tick finish so we don't cut a delivery mid-flight.
    while (this.draining) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    logger.info("outbox worker stopped");
  }

  /**
   * Processes one batch of due events. Exposed so tests can drive delivery
   * deterministically instead of waiting on the timer.
   */
  async tick(): Promise<{ delivered: number; failed: number }> {
    if (this.draining) return { delivered: 0, failed: 0 };
    this.draining = true;

    const result = { delivered: 0, failed: 0 };

    try {
      const events = await this.outbox.claimDue(this.options.batchSize ?? 20);

      for (const event of events) {
        try {
          await this.notifier.deliver(event);
          await this.outbox.markDelivered(event.id);
          result.delivered += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await this.outbox.markAttemptFailed(event.id, event.attempts, message);
          result.failed += 1;
          logger.warn(
            { eventId: event.id, attempts: event.attempts + 1, err: message },
            "outbox delivery attempt failed",
          );
        }
      }
    } catch (error) {
      // A failure to read the queue must not kill the timer.
      logger.error({ err: error }, "outbox worker tick failed");
    } finally {
      this.draining = false;
    }

    return result;
  }
}
