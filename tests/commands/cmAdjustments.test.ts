import assert from "node:assert/strict";
import test from "node:test";
import type { ButtonInteraction } from "discord.js";
import type { InternalApiClient } from "../../src/api/client";
import type { AuraAdjustmentData, UserOverviewData } from "../../src/api/schemas";
import { confirmAdjustment, type AdjustmentDependencies } from "../../src/commands/cmAdjustments";
import type { CmAdminSession } from "../../src/commands/cmSessions";
import type { AppConfig } from "../../src/config/env";

const USER_ID = "550e8400-e29b-41d4-a716-446655440001";
const SESSION_ID = "550e8400-e29b-41d4-a716-446655440002";
const IDEMPOTENCY_ID = "550e8400-e29b-41d4-a716-446655440003";
const TX_ID = "550e8400-e29b-41d4-a716-446655440004";
const AUDIT_ID = "550e8400-e29b-41d4-a716-446655440005";
const ADMIN_ID = "123456789012345681";

function overview(availableAura: number): UserOverviewData {
  return {
    identity: {
      userId: USER_ID,
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
    wallet: {
      balanceCents: 2500,
      currency: "USD",
      updatedAt: "2026-08-10T00:00:00.000Z"
    },
    aura: {
      availableAura,
      pendingAura: 0,
      lifetimeEarnedAura: 1000,
      lifetimeRedeemedAura: 500,
      updatedAt: "2026-08-10T00:00:00.000Z"
    },
    counts: { orders: 0, licenses: 0, accountDeliveries: 0 },
    recentOrders: []
  };
}

function session(): CmAdminSession {
  return {
    id: SESSION_ID,
    operatorId: ADMIN_ID,
    overview: overview(500),
    adjustmentProposal: {
      kind: "aura",
      targetUserId: USER_ID,
      deltaAura: 250,
      reason: "Support correction",
      beforeAvailableAura: 500,
      projectedAvailableAura: 750,
      operator: { provider: "discord", externalUserId: ADMIN_ID },
      idempotencyKey: IDEMPOTENCY_ID,
      expiresAtMs: 2_000
    },
    shareView: { kind: "adjustment-preview" },
    createdAtMs: 0,
    touchedAtMs: 0
  };
}

function fakeButton() {
  const updates: unknown[] = [];
  const edits: unknown[] = [];
  const fake = {
    user: { id: ADMIN_ID },
    client: {},
    replied: false,
    deferred: false,
    update: async (payload: unknown) => { updates.push(payload); },
    deferUpdate: async () => { fake.deferred = true; },
    editReply: async (payload: unknown) => { edits.push(payload); },
    followUp: async () => undefined,
    reply: async () => undefined
  };
  return { interaction: fake as unknown as ButtonInteraction, updates, edits };
}

const config = {
  botAuditLogChannelId: "123456789012345699"
} as unknown as AppConfig;

const dependencies = {
  nowMs: () => 1_000,
  idempotencyKey: () => IDEMPOTENCY_ID,
  postAdjustmentAudit: async () => undefined
} as AdjustmentDependencies;

test("Aura confirmation fails closed before backend access when audit channel is missing", async () => {
  const state = session();
  let backendCalls = 0;
  const api = {
    fetchUserOverview: async () => { backendCalls += 1; return overview(500); },
    executeAuraAdjustment: async () => { backendCalls += 1; throw new Error("must not execute"); }
  } as unknown as InternalApiClient;
  const interaction = fakeButton();
  const configWithoutAudit = {} as AppConfig;

  await confirmAdjustment(interaction.interaction, state, api, configWithoutAudit, dependencies);
  assert.equal(backendCalls, 0);
  assert.equal(interaction.updates.length, 1);
  assert.notEqual(state.adjustmentProposal, undefined);
});

test("Aura confirmation fails closed if fresh balance changed", async () => {
  const state = session();
  let executeCalls = 0;
  const api = {
    fetchUserOverview: async () => overview(501),
    executeAuraAdjustment: async () => { executeCalls += 1; throw new Error("must not execute"); }
  } as unknown as InternalApiClient;
  const interaction = fakeButton();

  await confirmAdjustment(interaction.interaction, state, api, config, dependencies);
  assert.equal(executeCalls, 0);
  assert.equal(state.adjustmentProposal, undefined);
  assert.equal(interaction.edits.length, 1);
});

test("Aura confirmation executes exact proposal, posts concise audit input, and exposes shareable success", async () => {
  const state = session();
  let overviewCalls = 0;
  let executedInput: unknown;
  let auditInput: unknown;
  const result: AuraAdjustmentData = {
    userId: USER_ID,
    deltaAura: 250,
    availableAura: 750,
    pendingAura: 0,
    lifetimeEarnedAura: 1000,
    lifetimeRedeemedAura: 500,
    transactionId: TX_ID,
    auditEventId: AUDIT_ID,
    createdAt: "2026-08-10T00:00:00.000Z",
    idempotentReplay: false
  };
  const api = {
    fetchUserOverview: async () => {
      overviewCalls += 1;
      return overview(overviewCalls === 1 ? 500 : 750);
    },
    executeAuraAdjustment: async (input: unknown) => {
      executedInput = input;
      return result;
    }
  } as unknown as InternalApiClient;
  const auditDependencies = {
    ...dependencies,
    postAdjustmentAudit: async (input: unknown) => { auditInput = input; }
  } as unknown as AdjustmentDependencies;
  const interaction = fakeButton();

  await confirmAdjustment(interaction.interaction, state, api, config, auditDependencies);
  assert.deepEqual(executedInput, {
    selector: { kind: "user_id", value: USER_ID },
    deltaAura: 250,
    reason: "Support correction",
    idempotencyKey: IDEMPOTENCY_ID,
    operator: { provider: "discord", externalUserId: ADMIN_ID }
  });
  const audit = auditInput as {
    accountEmail?: string;
    completedAt: string;
    delta: number;
    resultValue: number;
  };
  assert.equal(audit.accountEmail, "user@example.com");
  assert.equal(audit.completedAt, result.createdAt);
  assert.equal(audit.delta, 250);
  assert.equal(audit.resultValue, 750);
  assert.equal(state.adjustmentProposal, undefined);
  assert.equal(state.overview.aura?.availableAura, 750);
  assert.deepEqual(state.shareView, {
    kind: "adjustment-success",
    adjustmentKind: "aura",
    data: result
  });
  assert.equal(interaction.edits.length, 1);
});
