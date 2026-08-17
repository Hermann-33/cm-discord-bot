import assert from "node:assert/strict";
import test from "node:test";
import type { UserOverviewData } from "../../src/api/schemas";
import { CmSessionStore } from "../../src/commands/cmSessions";

const overview = {
  identity: {
    userId: "550e8400-e29b-41d4-a716-446655440000",
    email: "user@example.com",
    createdAt: "2026-08-10T00:00:00.000Z",
    lastSignInAt: null,
    externalIdentities: []
  },
  accountControl: {
    isBanned: false,
    banReason: null,
    bannedAt: null,
    unbannedAt: null,
    updatedAt: null
  },
  wallet: null,
  aura: null,
  counts: { orders: 0, licenses: 0, accountDeliveries: 0 },
  recentOrders: []
} satisfies UserOverviewData;

test("sessions are bound to the invoking operator", () => {
  let now = 100;
  const store = new CmSessionStore(1_000, 10, {
    nowMs: () => now,
    id: () => "session-id"
  });
  const session = store.create("admin-1", overview);
  assert.equal(store.get(session.id, "admin-1")?.overview.identity.email, "user@example.com");
  assert.equal(store.get(session.id, "admin-2"), null);
  now += 1;
});

test("sessions expire after inactivity", () => {
  let now = 100;
  const store = new CmSessionStore(50, 10, {
    nowMs: () => now,
    id: () => "session-id"
  });
  const session = store.create("admin-1", overview);
  now = 151;
  assert.equal(store.get(session.id, "admin-1"), null);
});
