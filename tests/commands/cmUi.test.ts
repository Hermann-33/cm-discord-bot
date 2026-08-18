import assert from "node:assert/strict";
import test from "node:test";
import type { UserOverviewData } from "../../src/api/schemas";
import { buildUserPanel } from "../../src/commands/cmUi";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440002";
const DISCORD_USER_ID = "123456789012345682";
const CREATED_AT = "2026-08-10T00:00:00.000Z";

function overview(linked: boolean): UserOverviewData {
  return {
    identity: {
      userId: "550e8400-e29b-41d4-a716-446655440000",
      email: "user@example.com",
      createdAt: CREATED_AT,
      lastSignInAt: "2026-08-11T00:00:00.000Z",
      externalIdentities: linked ? [{
        provider: "discord",
        externalUserId: DISCORD_USER_ID,
        username: "customer",
        displayName: "Customer Name",
        linkedAt: "2026-08-09T00:00:00.000Z"
      }] : []
    },
    accountControl: {
      isBanned: false,
      banReason: null,
      bannedAt: null,
      unbannedAt: null,
      updatedAt: null
    },
    wallet: {
      balanceCents: 2500,
      currency: "USD",
      updatedAt: "2026-08-12T00:00:00.000Z"
    },
    aura: {
      availableAura: 500,
      pendingAura: 0,
      lifetimeEarnedAura: 1000,
      lifetimeRedeemedAura: 500,
      updatedAt: "2026-08-13T00:00:00.000Z"
    },
    counts: { orders: 0, licenses: 0, accountDeliveries: 0 },
    recentOrders: []
  };
}

test("User Operations shows linked Discord identity, share control, and absolute plus relative Discord timestamps", () => {
  const json = JSON.stringify(buildUserPanel(SESSION_ID, overview(true)).toJSON());
  const unix = Math.floor(Date.parse(CREATED_AT) / 1000);

  assert.equal(json.includes("Status: **Linked**"), true);
  assert.equal(json.includes(`<@${DISCORD_USER_ID}>`), true);
  assert.equal(json.includes("customer"), true);
  assert.equal(json.includes("Customer Name"), true);
  assert.equal(json.includes(`<t:${unix}:f>`), true);
  assert.equal(json.includes(`<t:${unix}:R>`), true);
  assert.equal(json.includes("Share to Chat"), true);
  assert.equal(json.includes(" UTC"), false);
});

test("User Operations clearly shows when Discord is not linked", () => {
  const json = JSON.stringify(buildUserPanel(SESSION_ID, overview(false)).toJSON());
  assert.equal(json.includes("Status: **Not linked**"), true);
  assert.equal(json.includes("Share to Chat"), true);
});
