import assert from "node:assert/strict";
import test from "node:test";
import {
  ChannelType,
  Collection,
  MessageFlags,
  OverwriteType,
  PermissionFlagsBits,
  PermissionsBitField,
  type Client,
  type Interaction,
  type Message,
  type MessageCreateOptions
} from "discord.js";
import type { InternalApiClient } from "../../src/api/client";
import { InternalApiClientError } from "../../src/api/errors";
import type {
  SupportTicketAccess,
  SupportTicketAccessReadData,
  SupportTicketOverrideData,
  SupportTicketVerifyData
} from "../../src/api/supportTickets";
import type { AppConfig } from "../../src/config/env";
import {
  CM_ACCOUNT_SETTINGS_URL,
  isRecognizedSupportTicketChannel,
  TicketLinkGateController,
  TICKETY_SUPPORT_CATEGORY_ID,
  type TicketLinkGateDependencies
} from "../../src/discord/ticketLinkGate";

const GUILD_ID = "123456789012345672";
const CHANNEL_ID = "1545695443160137789";
const CREATOR_ID = "123456789012345682";
const STAFF_ID = "123456789012345683";
const ADMIN_ID = "123456789012345681";
const BOT_ID = "123456789012345690";
const AUDIT_CHANNEL_ID = "123456789012345699";
const NOW = Date.parse("2026-09-08T00:00:00.000Z");
const IDEMPOTENCY_KEY = "11111111-1111-4111-8111-111111111111";

const config = {
  discordGuildId: GUILD_ID,
  botAdminUserIds: [ADMIN_ID],
  botAuditLogChannelId: AUDIT_CHANNEL_ID
} as unknown as AppConfig;

const GATED = [
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.AddReactions,
  PermissionFlagsBits.UseApplicationCommands,
  PermissionFlagsBits.CreatePublicThreads,
  PermissionFlagsBits.CreatePrivateThreads,
  PermissionFlagsBits.SendMessagesInThreads,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.EmbedLinks
];

function ticketAccess(
  state: "locked" | "verified" | "admin_override",
  overrides: Partial<SupportTicketAccess> = {}
): SupportTicketAccess {
  const base = {
    channelId: CHANNEL_ID,
    creatorDiscordId: CREATOR_ID,
    createdAt: "2026-09-08T00:00:00.000Z",
    updatedAt: "2026-09-08T00:00:00.000Z"
  };
  if (state === "locked") {
    return {
      ...base,
      state,
      verifiedAt: null,
      verifiedUntil: null,
      overrideAdminId: null,
      overrideAt: null,
      ...overrides
    } as SupportTicketAccess;
  }
  if (state === "verified") {
    return {
      ...base,
      state,
      verifiedAt: "2026-09-08T00:00:00.000Z",
      verifiedUntil: "2026-09-08T08:00:00.000Z",
      overrideAdminId: null,
      overrideAt: null,
      ...overrides
    } as SupportTicketAccess;
  }
  return {
    ...base,
    state,
    verifiedAt: null,
    verifiedUntil: null,
    overrideAdminId: ADMIN_ID,
    overrideAt: "2026-09-08T00:00:00.000Z",
    ...overrides
  } as SupportTicketAccess;
}

type FakeOverwrite = {
  id: string;
  type: OverwriteType;
  allow: PermissionsBitField;
  deny: PermissionsBitField;
};

function applyOverwriteOption(
  overwrite: FakeOverwrite,
  permission: bigint,
  value: boolean | null | undefined
): void {
  if (value === undefined) return;
  if (value === true) {
    overwrite.allow.add(permission);
    overwrite.deny.remove(permission);
  } else if (value === false) {
    overwrite.deny.add(permission);
    overwrite.allow.remove(permission);
  } else {
    overwrite.allow.remove(permission);
    overwrite.deny.remove(permission);
  }
}

function fakeChannel(options: {
  parentId?: string | null;
  name?: string;
  memberIds?: string[];
} = {}) {
  const {
    parentId = TICKETY_SUPPORT_CATEGORY_ID,
    name = "support-1234",
    memberIds = [CREATOR_ID]
  } = options;
  const overwrites = new Collection<string, FakeOverwrite>();

  for (const memberId of memberIds) {
    overwrites.set(memberId, {
      id: memberId,
      type: OverwriteType.Member,
      allow: new PermissionsBitField(GATED),
      deny: new PermissionsBitField()
    });
  }

  const messages = new Collection<string, Message>();
  const sends: MessageCreateOptions[] = [];
  let messageCounter = 0;

  const channel: any = {
    id: CHANNEL_ID,
    guildId: GUILD_ID,
    type: ChannelType.GuildText,
    parentId,
    name,
    guild: {
      members: {
        fetch: async (id: string) => ({
          id,
          user: { id, bot: id === BOT_ID }
        })
      }
    },
    permissionOverwrites: {
      cache: overwrites,
      edit: async (id: string, optionsValue: Record<string, boolean | null | undefined>) => {
        let overwrite = overwrites.get(id);
        if (!overwrite) {
          overwrite = {
            id,
            type: OverwriteType.Member,
            allow: new PermissionsBitField(),
            deny: new PermissionsBitField()
          };
          overwrites.set(id, overwrite);
        }
        const byName = new Map<string, bigint>([
          ["SendMessages", PermissionFlagsBits.SendMessages],
          ["AddReactions", PermissionFlagsBits.AddReactions],
          ["UseApplicationCommands", PermissionFlagsBits.UseApplicationCommands],
          ["CreatePublicThreads", PermissionFlagsBits.CreatePublicThreads],
          ["CreatePrivateThreads", PermissionFlagsBits.CreatePrivateThreads],
          ["SendMessagesInThreads", PermissionFlagsBits.SendMessagesInThreads],
          ["AttachFiles", PermissionFlagsBits.AttachFiles],
          ["EmbedLinks", PermissionFlagsBits.EmbedLinks]
        ]);
        for (const [nameKey, permission] of byName) {
          applyOverwriteOption(overwrite, permission, optionsValue[nameKey]);
        }
        return overwrite;
      }
    },
    messages: {
      fetch: async (value: string | { limit: number }) => {
        if (typeof value === "string") {
          const message = messages.get(value);
          if (!message) throw new Error("missing message");
          return message;
        }
        return messages;
      }
    },
    send: async (payload: MessageCreateOptions) => {
      sends.push(payload);
      messageCounter += 1;
      const id = `gate-${messageCounter}`;
      const message: any = {
        id,
        author: { id: BOT_ID, bot: true },
        components: payload.components ?? [],
        delete: async () => { messages.delete(id); }
      };
      messages.set(id, message as Message);
      return message as Message;
    }
  };

  return { channel, overwrites, messages, sends };
}

function fakeClient() {
  return {
    user: { id: BOT_ID },
    guilds: {
      fetch: async () => { throw new Error("not used"); }
    }
  } as unknown as Client;
}

function dependencies(overrides: Partial<TicketLinkGateDependencies> = {}) {
  const audits: unknown[] = [];
  const deps: TicketLinkGateDependencies = {
    nowMs: () => NOW,
    idempotencyKey: () => IDEMPOTENCY_KEY,
    sleep: async () => undefined,
    postOverrideAudit: async (input) => { audits.push(input); },
    ...overrides
  };
  return { deps, audits };
}

function fakeMessage(channel: any, userId: string) {
  let deleted = false;
  const message = {
    author: { id: userId, bot: false },
    guildId: GUILD_ID,
    channelId: channel.id,
    channel,
    content: "customer message",
    delete: async () => { deleted = true; }
  } as unknown as Message;
  return {
    message,
    wasDeleted: () => deleted
  };
}

function customIdsFromPayload(payload: MessageCreateOptions): string[] {
  const output: string[] = [];
  function walk(value: unknown): void {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (typeof record.custom_id === "string") output.push(record.custom_id);
    Object.values(record).forEach(walk);
  }
  walk(payload.components?.map((component: any) => component.toJSON()));
  return output;
}

function payloadText(payload: MessageCreateOptions): string {
  const chunks: string[] = [];
  function walk(value: unknown): void {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (typeof record.content === "string") chunks.push(record.content);
    if (typeof record.url === "string") chunks.push(record.url);
    Object.values(record).forEach(walk);
  }
  walk(payload.components?.map((component: any) => component.toJSON()));
  return chunks.join("\n");
}

function fakeButtonInteraction(channel: any, customId: string, userId = CREATOR_ID) {
  const replies: unknown[] = [];
  const edits: unknown[] = [];
  let deferred = false;
  const gateMessage = [...(channel.messages as any).fetch ? [] : []];
  const message = [...(channel as any).__messages ?? []][0];
  const interaction: any = {
    customId,
    guildId: GUILD_ID,
    channelId: channel.id,
    channel,
    user: { id: userId },
    message: null,
    isButton: () => true,
    isChatInputCommand: () => false,
    reply: async (payload: unknown) => { replies.push(payload); },
    deferReply: async () => { deferred = true; },
    editReply: async (payload: unknown) => { edits.push(payload); }
  };
  return { interaction, replies, edits, wasDeferred: () => deferred, setMessage: (value: Message) => { interaction.message = value; } };
}

function fakeTicketAllowInteraction(channel: any, userId = ADMIN_ID) {
  const replies: unknown[] = [];
  const edits: unknown[] = [];
  let deferred = false;
  const interaction: any = {
    guildId: GUILD_ID,
    channelId: channel.id,
    channel,
    user: { id: userId },
    client: fakeClient(),
    commandName: "cm",
    options: {
      getSubcommand: () => "ticket-allow"
    },
    isButton: () => false,
    isChatInputCommand: () => true,
    reply: async (payload: unknown) => { replies.push(payload); },
    deferReply: async () => { deferred = true; },
    editReply: async (payload: unknown) => { edits.push(payload); }
  };
  return { interaction: interaction as Interaction, replies, edits, wasDeferred: () => deferred };
}

test("recognizes configured Tickety category and only numeric uncategorized support channels", () => {
  assert.equal(isRecognizedSupportTicketChannel({
    guildId: GUILD_ID,
    type: ChannelType.GuildText,
    parentId: TICKETY_SUPPORT_CATEGORY_ID,
    name: "anything"
  }, GUILD_ID), true);
  assert.equal(isRecognizedSupportTicketChannel({
    guildId: GUILD_ID,
    type: ChannelType.GuildText,
    parentId: null,
    name: "support-8632"
  }, GUILD_ID), true);
  assert.equal(isRecognizedSupportTicketChannel({
    guildId: GUILD_ID,
    type: ChannelType.GuildText,
    parentId: null,
    name: "support-chat"
  }, GUILD_ID), false);
  assert.equal(isRecognizedSupportTicketChannel({
    guildId: GUILD_ID,
    type: ChannelType.GuildText,
    parentId: "999999999999999999",
    name: "support-8632"
  }, GUILD_ID), false);
});

test("linked ticket initializes fail-closed then restores the creator without posting a gate", async () => {
  const { channel, overwrites, sends } = fakeChannel();
  let verifyCalls = 0;
  const api = {
    readSupportTicketAccess: async () => ({ ticketAccess: null, accessGranted: false }),
    verifySupportTicketAccess: async () => {
      verifyCalls += 1;
      return {
        linked: true,
        accessGranted: true,
        ticketAccess: ticketAccess("verified")
      } satisfies SupportTicketVerifyData;
    }
  } as unknown as InternalApiClient;
  const { deps } = dependencies();
  const controller = new TicketLinkGateController(config, fakeClient(), api, deps);

  await controller.handleChannelCreate(channel);

  assert.equal(verifyCalls, 1);
  assert.equal(sends.length, 0);
  const overwrite = overwrites.get(CREATOR_ID)!;
  assert.equal(overwrite.allow.has(PermissionFlagsBits.SendMessages), true);
  assert.equal(overwrite.deny.has(PermissionFlagsBits.SendMessages), false);
});

test("unlinked ticket is locked and receives the link/recheck panel", async () => {
  const { channel, overwrites, sends } = fakeChannel();
  const api = {
    readSupportTicketAccess: async () => ({ ticketAccess: null, accessGranted: false }),
    verifySupportTicketAccess: async () => ({
      linked: false,
      accessGranted: false,
      ticketAccess: ticketAccess("locked")
    } satisfies SupportTicketVerifyData)
  } as unknown as InternalApiClient;
  const { deps } = dependencies();
  const controller = new TicketLinkGateController(config, fakeClient(), api, deps);

  await controller.handleChannelCreate(channel);

  assert.equal(sends.length, 1);
  assert.equal(sends[0]?.flags, MessageFlags.IsComponentsV2);
  assert.equal(payloadText(sends[0]!).includes("isn't linked"), true);
  assert.equal(payloadText(sends[0]!).includes(CM_ACCOUNT_SETTINGS_URL), true);
  assert.equal(customIdsFromPayload(sends[0]!).some((id) => id.startsWith("cm:ticket:recheck:")), true);
  assert.equal(overwrites.get(CREATOR_ID)!.deny.has(PermissionFlagsBits.SendMessages), true);
});

test("verification outage fails closed without claiming the creator is unlinked", async () => {
  const { channel, sends } = fakeChannel();
  const api = {
    readSupportTicketAccess: async () => ({ ticketAccess: null, accessGranted: false }),
    verifySupportTicketAccess: async () => {
      throw new InternalApiClientError("DEPENDENCY_UNAVAILABLE", 503);
    }
  } as unknown as InternalApiClient;
  const { deps } = dependencies();
  const controller = new TicketLinkGateController(config, fakeClient(), api, deps);

  await controller.handleChannelCreate(channel);

  const content = payloadText(sends[0]!);
  assert.equal(content.includes("verification unavailable"), true);
  assert.equal(content.includes("isn't linked"), false);
});

test("active verified lease makes creator and staff messages without another CM verification call", async () => {
  const { channel } = fakeChannel();
  let verifyCalls = 0;
  const api = {
    readSupportTicketAccess: async () => ({
      ticketAccess: ticketAccess("verified"),
      accessGranted: true
    } satisfies SupportTicketAccessReadData),
    verifySupportTicketAccess: async () => {
      verifyCalls += 1;
      throw new Error("must not be called");
    }
  } as unknown as InternalApiClient;
  const { deps } = dependencies();
  const controller = new TicketLinkGateController(config, fakeClient(), api, deps);

  await controller.handleChannelUpdate(channel);
  const customer = fakeMessage(channel, CREATOR_ID);
  const staff = fakeMessage(channel, STAFF_ID);
  assert.equal(await controller.handleMessage(customer.message), false);
  assert.equal(await controller.handleMessage(staff.message), false);
  assert.equal(verifyCalls, 0);
});

test("expired verified lease ignores staff activity and rechecks exactly once on creator activity", async () => {
  const { channel } = fakeChannel();
  let verifyCalls = 0;
  const expired = ticketAccess("verified", {
    verifiedAt: "2026-09-07T08:00:00.000Z",
    verifiedUntil: "2026-09-07T16:00:00.000Z"
  });
  const renewed = ticketAccess("verified", {
    verifiedAt: "2026-09-08T00:00:00.000Z",
    verifiedUntil: "2026-09-08T08:00:00.000Z"
  });
  const api = {
    readSupportTicketAccess: async () => ({
      ticketAccess: expired,
      accessGranted: false
    } satisfies SupportTicketAccessReadData),
    verifySupportTicketAccess: async () => {
      verifyCalls += 1;
      return {
        linked: true,
        accessGranted: true,
        ticketAccess: renewed
      } satisfies SupportTicketVerifyData;
    }
  } as unknown as InternalApiClient;
  const { deps } = dependencies();
  const controller = new TicketLinkGateController(config, fakeClient(), api, deps);

  await controller.handleChannelUpdate(channel);
  assert.equal(await controller.handleMessage(fakeMessage(channel, STAFF_ID).message), false);
  assert.equal(verifyCalls, 0);
  assert.equal(await controller.handleMessage(fakeMessage(channel, CREATOR_ID).message), false);
  assert.equal(verifyCalls, 1);
  assert.equal(await controller.handleMessage(fakeMessage(channel, CREATOR_ID).message), false);
  assert.equal(verifyCalls, 1);
});

test("expired creator message is deleted and creator locked when fresh verification is unlinked", async () => {
  const { channel, overwrites, sends } = fakeChannel();
  const expired = ticketAccess("verified", {
    verifiedAt: "2026-09-07T08:00:00.000Z",
    verifiedUntil: "2026-09-07T16:00:00.000Z"
  });
  let verifyCalls = 0;
  const api = {
    readSupportTicketAccess: async () => ({
      ticketAccess: expired,
      accessGranted: false
    } satisfies SupportTicketAccessReadData),
    verifySupportTicketAccess: async () => {
      verifyCalls += 1;
      return {
        linked: false,
        accessGranted: false,
        ticketAccess: ticketAccess("locked")
      } satisfies SupportTicketVerifyData;
    }
  } as unknown as InternalApiClient;
  const { deps } = dependencies();
  const controller = new TicketLinkGateController(config, fakeClient(), api, deps);

  await controller.handleChannelUpdate(channel);
  const customer = fakeMessage(channel, CREATOR_ID);
  assert.equal(await controller.handleMessage(customer.message), true);
  assert.equal(customer.wasDeleted(), true);
  assert.equal(verifyCalls, 1);
  assert.equal(overwrites.get(CREATOR_ID)!.deny.has(PermissionFlagsBits.SendMessages), true);
  assert.equal(sends.length, 1);
});

test("Check Again verifies only the encoded ticket creator and restores access when linked", async () => {
  const { channel, overwrites, messages, sends } = fakeChannel();
  let linked = false;
  const api = {
    readSupportTicketAccess: async () => ({ ticketAccess: null, accessGranted: false }),
    verifySupportTicketAccess: async () => linked
      ? {
          linked: true,
          accessGranted: true,
          ticketAccess: ticketAccess("verified")
        }
      : {
          linked: false,
          accessGranted: false,
          ticketAccess: ticketAccess("locked")
        }
  } as unknown as InternalApiClient;
  const { deps } = dependencies();
  const controller = new TicketLinkGateController(config, fakeClient(), api, deps);

  await controller.handleChannelCreate(channel);
  const customId = customIdsFromPayload(sends[0]!).find((id) => id.startsWith("cm:ticket:recheck:"))!;
  const gateMessage = [...messages.values()][0]!;
  linked = true;

  const button = fakeButtonInteraction(channel, customId);
  button.setMessage(gateMessage);
  assert.equal(await controller.handleInteraction(button.interaction as unknown as Interaction), true);
  assert.equal(button.wasDeferred(), true);
  assert.equal(JSON.stringify(button.edits[0]).includes("verification succeeded"), true);
  assert.equal(overwrites.get(CREATOR_ID)!.allow.has(PermissionFlagsBits.SendMessages), true);
  assert.equal(overwrites.get(CREATOR_ID)!.deny.has(PermissionFlagsBits.SendMessages), false);
  assert.equal(messages.size, 0);
});

test("Check Again rejects a different Discord user before calling CM", async () => {
  const { channel, messages, sends } = fakeChannel();
  let verifyCalls = 0;
  const api = {
    readSupportTicketAccess: async () => ({ ticketAccess: null, accessGranted: false }),
    verifySupportTicketAccess: async () => {
      verifyCalls += 1;
      return {
        linked: false,
        accessGranted: false,
        ticketAccess: ticketAccess("locked")
      };
    }
  } as unknown as InternalApiClient;
  const { deps } = dependencies();
  const controller = new TicketLinkGateController(config, fakeClient(), api, deps);

  await controller.handleChannelCreate(channel);
  verifyCalls = 0;
  const customId = customIdsFromPayload(sends[0]!).find((id) => id.startsWith("cm:ticket:recheck:"))!;
  const button = fakeButtonInteraction(channel, customId, STAFF_ID);
  button.setMessage([...messages.values()][0]!);
  assert.equal(await controller.handleInteraction(button.interaction as unknown as Interaction), true);
  assert.equal(verifyCalls, 0);
  assert.equal((button.replies[0] as { flags: number }).flags, MessageFlags.Ephemeral);
});

test("Tickety permission rewrite is re-locked while durable state is locked", async () => {
  const { channel, overwrites } = fakeChannel();
  const api = {
    readSupportTicketAccess: async () => ({
      ticketAccess: ticketAccess("locked"),
      accessGranted: false
    } satisfies SupportTicketAccessReadData)
  } as unknown as InternalApiClient;
  const { deps } = dependencies();
  const controller = new TicketLinkGateController(config, fakeClient(), api, deps);

  await controller.handleChannelUpdate(channel);
  const overwrite = overwrites.get(CREATOR_ID)!;
  overwrite.deny = new PermissionsBitField();
  overwrite.allow = new PermissionsBitField(GATED);

  await controller.handleChannelUpdate(channel);
  assert.equal(overwrite.deny.has(PermissionFlagsBits.SendMessages), true);
});

test("authorized /cm ticket-allow persists override, unlocks creator, and audits it", async () => {
  const { channel, overwrites } = fakeChannel();
  let overrideInput: unknown;
  const api = {
    readSupportTicketAccess: async () => ({
      ticketAccess: ticketAccess("locked"),
      accessGranted: false
    } satisfies SupportTicketAccessReadData),
    overrideSupportTicketAccess: async (input: unknown) => {
      overrideInput = input;
      return {
        ticketAccess: ticketAccess("admin_override"),
        idempotentReplay: false
      } satisfies SupportTicketOverrideData;
    }
  } as unknown as InternalApiClient;
  const { deps, audits } = dependencies();
  const controller = new TicketLinkGateController(config, fakeClient(), api, deps);
  const command = fakeTicketAllowInteraction(channel);

  assert.equal(await controller.handleInteraction(command.interaction), true);
  assert.deepEqual(overrideInput, {
    channelId: CHANNEL_ID,
    creatorDiscordId: CREATOR_ID,
    adminDiscordId: ADMIN_ID,
    reason: "Manual support ticket access override.",
    idempotencyKey: IDEMPOTENCY_KEY
  });
  assert.equal(audits.length, 1);
  assert.equal(overwrites.get(CREATOR_ID)!.allow.has(PermissionFlagsBits.SendMessages), true);
  assert.equal(JSON.stringify(command.edits[0]).includes("Manually allowed"), true);
});

test("unauthorized ticket override is rejected before read or mutation", async () => {
  const { channel } = fakeChannel();
  let calls = 0;
  const api = {
    readSupportTicketAccess: async () => { calls += 1; throw new Error("must not run"); },
    overrideSupportTicketAccess: async () => { calls += 1; throw new Error("must not run"); }
  } as unknown as InternalApiClient;
  const { deps } = dependencies();
  const controller = new TicketLinkGateController(config, fakeClient(), api, deps);
  const command = fakeTicketAllowInteraction(channel, STAFF_ID);

  assert.equal(await controller.handleInteraction(command.interaction), true);
  assert.equal(calls, 0);
  assert.equal((command.replies[0] as { flags: number }).flags, MessageFlags.Ephemeral);
});

test("non-ticket channel without durable state cannot receive an admin override", async () => {
  const { channel } = fakeChannel({ parentId: "999999999999999999", name: "general" });
  let overrideCalls = 0;
  const api = {
    readSupportTicketAccess: async () => ({ ticketAccess: null, accessGranted: false }),
    overrideSupportTicketAccess: async () => { overrideCalls += 1; throw new Error("must not run"); }
  } as unknown as InternalApiClient;
  const { deps } = dependencies();
  const controller = new TicketLinkGateController(config, fakeClient(), api, deps);
  const command = fakeTicketAllowInteraction(channel);

  assert.equal(await controller.handleInteraction(command.interaction), true);
  assert.equal(overrideCalls, 0);
  assert.equal(JSON.stringify(command.edits[0]).includes("not a recognized CM support ticket"), true);
});
