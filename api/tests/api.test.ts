import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { connectMongo, ensureIndexes, assertTransactionsSupported } from "../src/db/mongo.js";
import { createContainer, type Container } from "../src/container.js";
import { createApp } from "../src/app.js";
import { CmApplicationService } from "../src/services/cmApplicationService.js";
import type { Notifier } from "../src/notifications/notifier.js";
import type { OutboxEvent } from "../src/repositories/outboxRepo.js";
import { canTransition, isWithinTargetExperience } from "../src/domain/cmApplication.js";
import { multiLine, singleLine } from "../src/domain/text.js";
import { normalizeEmail, normalizePhone } from "../src/domain/contact.js";

class SpyNotifier implements Notifier {
  delivered: OutboxEvent[] = [];
  async deliver(event: OutboxEvent): Promise<void> {
    this.delivered.push(event);
  }
}

const VALID_APPLICATION = {
  name: "Test Applicant",
  email: "cm.test@example.com",
  phone: "9876543210",
  city: "delhi",
  experience: "fresher",
  answer:
    "I ran my college fest logistics for two years and I like fixing queues. At a Zypp hub the first thing I would fix is the 7am battery counter: one person hands out every battery to forty riders, so I would stage swapped packs in numbered racks overnight.",
};

const ADMIN = { Authorization: "Bearer test-admin-token-0123456789" };
const ENDPOINT = "/api/cm-applications";

let container: Container;
let app: ReturnType<typeof createApp>;
let replSet: MongoMemoryReplSet;
let mongo: Awaited<ReturnType<typeof connectMongo>>;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  mongo = await connectMongo(replSet.getUri(), "bano_zypp_ke_cm_test");
  await assertTransactionsSupported(mongo.client);
  await ensureIndexes(mongo.db);
}, 120_000);

afterAll(async () => {
  await mongo?.client.close();
  await replSet?.stop();
});

beforeEach(async () => {
  await Promise.all((await mongo.db.collections()).map((c) => c.deleteMany({})));
  container = createContainer(mongo.client, mongo.db, new SpyNotifier());
  app = createApp(container);
});

describe("domain rules", () => {
  it("strips control, bidi and zero-width characters from a single-line field", () => {
    expect(singleLine("Ravi ‮ Kumar")).toBe("Ravi Kumar");
    expect(singleLine("  Ravi\nKumar  ")).toBe("Ravi Kumar");
    // Zero-width padding must not count towards a length check.
    expect(singleLine("a​​​").length).toBe(1);
  });

  it("keeps paragraph breaks in prose but collapses blank-line runs", () => {
    expect(multiLine("one\r\n\r\n\r\n\r\ntwo")).toBe("one\n\ntwo");
  });

  it("normalises contact details for duplicate detection", () => {
    expect(normalizePhone("+91 98765 43210")).toBe("9876543210");
    expect(normalizeEmail("  Ravi@Example.COM ")).toBe("ravi@example.com");
    // Gmail dot/plus folding is deliberately NOT applied.
    expect(normalizeEmail("r.a.v.i+zypp@example.com")).toBe("r.a.v.i+zypp@example.com");
  });

  it("flags experience outside the target band without rejecting it", () => {
    expect(isWithinTargetExperience("fresher")).toBe(true);
    expect(isWithinTargetExperience("over_2_years")).toBe(false);
  });

  it("blocks illegal status transitions", () => {
    expect(canTransition("new", "shortlisted")).toBe(true);
    expect(canTransition("selected", "new")).toBe(false);
    expect(canTransition("new", "selected")).toBe(false);
  });
});

describe(`POST ${ENDPOINT}`, () => {
  it("accepts a valid application and enqueues a notification", async () => {
    const res = await request(app).post(ENDPOINT).send(VALID_APPLICATION);

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeTruthy();
    expect(res.body.data.status).toBe("new");
    expect(res.headers["x-request-id"]).toBeTruthy();
    expect(await container.outbox.countByStatus()).toEqual({ pending: 1 });
  });

  it("keeps PII out of the outbox payload", async () => {
    await request(app).post(ENDPOINT).send(VALID_APPLICATION);
    await container.worker.tick();

    const serialised = JSON.stringify((container.notifier as SpyNotifier).delivered[0].payload);
    expect(serialised).not.toContain(VALID_APPLICATION.email);
    expect(serialised).not.toContain(VALID_APPLICATION.phone);
    expect(serialised).not.toContain(VALID_APPLICATION.name);
  });

  it("rejects invalid contact details with per-field messages", async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .send({ ...VALID_APPLICATION, email: "not-an-email", phone: "12345" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(res.body.error.details.email).toBeDefined();
    expect(res.body.error.details.phone).toBeDefined();
  });

  it("rejects a throwaway answer to the question that decides shortlists", async () => {
    const res = await request(app).post(ENDPOINT).send({ ...VALID_APPLICATION, answer: "everything" });

    expect(res.status).toBe(400);
    expect(res.body.error.details.answer).toBeDefined();
    expect(await container.applications.list({ limit: 10 })).toHaveLength(0);
  });

  it("rejects an unknown experience value", async () => {
    const res = await request(app).post(ENDPOINT).send({ ...VALID_APPLICATION, experience: "mba" });

    expect(res.status).toBe(400);
    expect(res.body.error.details.experience).toBeDefined();
  });

  it("rejects a city outside the ones Zypp operates in", async () => {
    const res = await request(app).post(ENDPOINT).send({ ...VALID_APPLICATION, city: "Kolkata" });

    expect(res.status).toBe(400);
    expect(res.body.error.details.city).toBeDefined();
  });

  it("rejects a javascript: link", async () => {
    const res = await request(app)
      .post(ENDPOINT)
      // Dangerous if an admin UI ever rendered it as a clickable link.
      .send({ ...VALID_APPLICATION, link: "javascript:alert(1)" });

    expect(res.status).toBe(400);
    expect(res.body.error.details.link).toBeDefined();
  });

  it("refuses a body carrying fields the client has no business setting", async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .send({ ...VALID_APPLICATION, status: "selected", reviewNotes: "hire me", sourceIp: "1.2.3.4" });

    // strictObject rejects unknown keys outright rather than silently dropping
    // them, so privilege escalation by mass assignment fails loudly.
    expect(res.status).toBe(400);
    expect(await container.applications.list({ limit: 10 })).toHaveLength(0);
  });

  it("rejects a Mongo operator object where a string is required", async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .send({ ...VALID_APPLICATION, email: { $ne: null } });

    expect(res.status).toBe(400);
    expect(res.body.error.details.email).toBeDefined();
  });

  it("stores a name with control and bidi characters stripped", async () => {
    await request(app)
      .post(ENDPOINT)
      .send({ ...VALID_APPLICATION, name: "Ravi‮  Kumar" });

    const [stored] = await container.applications.list({ limit: 1 });
    expect(stored.name).toBe("Ravi Kumar");
  });

  it("stores NULL rather than an empty string when no link is given", async () => {
    await request(app).post(ENDPOINT).send({ ...VALID_APPLICATION, link: "" });

    const [stored] = await container.applications.list({ limit: 1 });
    expect(stored.linkUrl).toBeNull();
  });

  it("accepts a bot submission without storing it", async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .send({ ...VALID_APPLICATION, company: "SEO Services Ltd" });

    // The same shape a real applicant gets, so the bot learns nothing…
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeTruthy();
    // …but nothing was written.
    expect(await container.applications.list({ limit: 10 })).toHaveLength(0);
    expect(await container.outbox.countByStatus()).toEqual({});
  });

  it("treats a double-tapped submit as the same application", async () => {
    const first = await request(app).post(ENDPOINT).send(VALID_APPLICATION);
    const second = await request(app).post(ENDPOINT).send(VALID_APPLICATION);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(await container.applications.list({ limit: 10 })).toHaveLength(1);
  });

  it("refuses a second application from the same person later on", async () => {
    await request(app).post(ENDPOINT).send(VALID_APPLICATION);

    // Past the dedupe window a repeat is a genuine duplicate. The clock is
    // injected rather than the test sleeping for ten minutes.
    const later = new CmApplicationService(
      mongo.client,
      container.applications,
      container.outbox,
      () => new Date(Date.now() + 11 * 60 * 1000),
    );

    await expect(
      later.submit(
        { ...VALID_APPLICATION, city: "delhi" as const, experience: "fresher" as const },
        { sourceIp: null, userAgent: null },
      ),
    ).rejects.toMatchObject({ code: "ALREADY_APPLIED", status: 409 });

    expect(await container.applications.list({ limit: 10 })).toHaveLength(1);
  });

  it("catches a duplicate that differs only by email casing", async () => {
    await request(app).post(ENDPOINT).send(VALID_APPLICATION);
    const res = await request(app)
      .post(ENDPOINT)
      .send({ ...VALID_APPLICATION, email: "CM.TEST@Example.com", phone: "9000000001" });

    expect(res.status).toBe(200);
    expect(await container.applications.list({ limit: 10 })).toHaveLength(1);
  });

  it("catches a duplicate phone submitted under a different email", async () => {
    await request(app).post(ENDPOINT).send(VALID_APPLICATION);
    const res = await request(app)
      .post(ENDPOINT)
      .send({ ...VALID_APPLICATION, email: "second.address@example.com" });

    expect(res.status).toBe(200);
    expect(await container.applications.list({ limit: 10 })).toHaveLength(1);
  });
});

describe("admin API", () => {
  it("rejects unauthenticated access", async () => {
    const res = await request(app).get("/api/admin/applications");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects a token of the right length but the wrong value", async () => {
    const res = await request(app)
      .get("/api/admin/applications")
      .set("Authorization", "Bearer test-admin-token-0123456780");

    expect(res.status).toBe(401);
  });

  it("lists applications with a resolved experience label", async () => {
    await request(app).post(ENDPOINT).send(VALID_APPLICATION);

    const res = await request(app).get("/api/admin/applications").set(ADMIN);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].experienceLabel).toBe("Fresher — 0 years");
    expect(res.body.data[0].withinTargetExperience).toBe(true);
  });

  it("moves an application through the funnel and blocks illegal jumps", async () => {
    const created = await request(app).post(ENDPOINT).send(VALID_APPLICATION);
    const id = created.body.data.id;
    const patch = (status: string) =>
      request(app).patch(`/api/admin/applications/${id}/status`).set(ADMIN).send({ status });

    expect((await patch("shortlisted")).status).toBe(200);
    // shortlisted -> selected is not reachable; interviewing comes first.
    expect((await patch("selected")).status).toBe(409);
    expect((await patch("interviewing")).status).toBe(200);
    expect((await patch("selected")).status).toBe(200);

    // selected is terminal.
    const reopened = await patch("shortlisted");
    expect(reopened.status).toBe(409);
    expect(reopened.body.error.code).toBe("INVALID_TRANSITION");
  });

  it("returns 404 for an unknown application id", async () => {
    const res = await request(app)
      .get("/api/admin/applications/00000000-0000-4000-8000-000000000000")
      .set(ADMIN);

    expect(res.status).toBe(404);
  });
});
