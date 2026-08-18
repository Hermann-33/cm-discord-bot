import assert from "node:assert/strict";
import test from "node:test";
import { MessageFlags, type Client, type MessageCreateOptions } from "discord.js";
import { postAdjustmentAudit, postRefundAudit } from "../../src/discord/adminAudit";
import { escapeDiscordText } from "../../src/discord/presentation";
import { safeAllowedMentions } from "../../src/discord/safeMessages";

const ADMIN_ID = "123456789012345681";
const CUSTOMER_DISCORD_ID = "123456789012345682";
const COMPLETED_AT = "2026-08-10T00:00:00.000Z";

function fakeClient() {
  const sends: MessageCreateOptions[] = [];
  const channel = {
    isTextBased: () => true,
    send: async (payload: MessageCreateOptions) => {
      sends.push(payload);
      return {};
    }
  };
  const client = {
    channels: {
      fetch: async () => channel
    }
  } as unknown as Client;
  return { client, sends };
}

function payloadText(payload: MessageCreateOptions): string {
  const component = payload.components?.[0] as { toJSON(): unknown };
  return JSON.stringify(component.toJSON());
}

test("refund audit uses concise Components V2 layout with customer, result, operator, and Discord timestamps", async () => {
  const { client, sends } = fakeClient();
  const orderRef = "CM-TEST";
  const accountEmail = "user@example.com";
  await postRefundAudit({
    client,
    channelId: "123456789012345699",
    operatorId: ADMIN_ID,
    orderRef,
    accountEmail,
    customerDiscordUserId: CUSTOMER_DISCORD_ID,
    reason: "Customer requested refund @everyone",
    walletCreditCents: 1250,
    currency: "USD",
    completedAt: COMPLETED_AT,
    idempotentReplay: false
  });

  assert.equal(sends.length, 1);
  assert.equal(sends[0]?.flags, MessageFlags.IsComponentsV2);
  assert.deepEqual(sends[0]?.allowedMentions, safeAllowedMentions);
  const json = payloadText(sends[0]!);
  const unix = Math.floor(Date.parse(COMPLETED_AT) / 1000);
  assert.equal(json.includes("CM Audit · Refund"), true);
  assert.equal(json.includes(escapeDiscordText(orderRef)), true);
  assert.equal(json.includes(escapeDiscordText(accountEmail)), true);
  assert.equal(json.includes(`<@${CUSTOMER_DISCORD_ID}>`), true);
  assert.equal(json.includes(`<@${ADMIN_ID}>`), true);
  assert.equal(json.includes("USD 12.50"), true);
  assert.equal(json.includes(`<t:${unix}:f>`), true);
  assert.equal(json.includes(`<t:${unix}:R>`), true);
  assert.equal(json.includes("Backend audit"), false);
  assert.equal(json.includes("Transaction"), false);
  assert.equal(json.includes("Idempotent replay"), false);
  assert.equal(json.includes("@everyone"), false);
  assert.equal(json.includes(escapeDiscordText("Customer requested refund @everyone")), true);
});

test("adjustment audit keeps only useful balance-change information and flags a replay only when relevant", async () => {
  const { client, sends } = fakeClient();
  await postAdjustmentAudit({
    client,
    channelId: "123456789012345699",
    operatorId: ADMIN_ID,
    accountEmail: "user@example.com",
    customerDiscordUserId: CUSTOMER_DISCORD_ID,
    kind: "wallet",
    delta: 500,
    resultValue: 3000,
    currency: "USD",
    reason: "Support correction",
    completedAt: COMPLETED_AT,
    idempotentReplay: true
  });

  const json = payloadText(sends[0]!);
  assert.equal(json.includes("CM Audit · Wallet Adjustment"), true);
  assert.equal(json.includes("USD +5.00"), true);
  assert.equal(json.includes("USD 30.00"), true);
  assert.equal(json.includes("idempotent replay"), true);
  assert.equal(json.includes("auditEventId"), false);
  assert.equal(json.includes("transactionId"), false);
});
