import assert from "node:assert/strict";
import test from "node:test";
import type { Message } from "discord.js";
import { createSupportConversationState } from "../../src/ai/supportConversation";
import { SupportConversationStateStore } from "../../src/ai/supportStateStore";
import type { AppConfig } from "../../src/config/env";
import {
  AI_SUPPORT_UNAVAILABLE_MESSAGE,
  SupportAiMessageController,
  isSupportAiMessageEligible,
  type SupportAiService
} from "../../src/discord/supportAi";

function config(overrides: Partial<AppConfig["aiSupport"]> = {}): AppConfig {
  return {
    discordBotToken: "token",
    discordClientId: "100000000000000001",
    discordGuildId: "100000000000000002",
    discordLeaderboardChannelId: "100000000000000003",
    discordCommandChannelId: "100000000000000004",
    discordAuraCommandBlockedChannelId: "100000000000000005",
    botAdminUserIds: [],
    internalApi: {
      origin: "https://cheaters.market",
      clientId: "test",
      keyId: "test",
      hmacSecret: Buffer.alloc(32),
      timeoutMs: 5_000
    },
    aiSupport: {
      enabled: true,
      shadowEnabled: false,
      shadowPseudonymSecret: undefined,
      channelIds: ["200000000000000001"],
      categoryIds: ["300000000000000001"],
      ...overrides
    }
  };
}

type FakeOptions = {
  content?: string;
  bot?: boolean;
  guildId?: string | null;
  channelId?: string;
  userId?: string;
  parentId?: string | null;
  isThread?: boolean;
  threadCategoryId?: string | null;
  createdTimestamp?: number;
};

function fakeMessage(options: FakeOptions = {}): { message: Message; replies: Array<Record<string, unknown>> } {
  const replies: Array<Record<string, unknown>> = [];
  const isThread = options.isThread ?? false;
  const channel = {
    parentId: options.parentId ?? null,
    isThread: () => isThread,
    parent: isThread ? { parentId: options.threadCategoryId ?? null } : null
  };
  const message = {
    author: { bot: options.bot ?? false, id: options.userId ?? "400000000000000001" },
    guildId: options.guildId === undefined ? "100000000000000002" : options.guildId,
    channelId: options.channelId ?? "200000000000000001",
    content: options.content ?? "my order status",
    createdTimestamp: options.createdTimestamp ?? Date.now(),
    channel,
    reply: async (payload: Record<string, unknown>) => {
      replies.push(payload);
      return {};
    }
  } as unknown as Message;
  return { message, replies };
}

function service(handler?: SupportAiService["prepareTurn"]): SupportAiService {
  return {
    prepareTurn: handler ?? (async (_text, state) => ({
      state,
      action: { kind: "case", canonicalIds: ["case.test"], customerMessage: "safe reply" },
      planner: {
        accepted: true,
        decision: {
          observations: { explicitEntities: [], supportSurface: null, knownFacts: [], missingFacts: [] },
          nextAction: "answer_case",
          caseIds: ["case.test"],
          clarificationId: null,
          dynamicLookupIds: [],
          policyIds: [],
          confidence: 1,
          reasonCode: "test"
        },
        validationErrors: [],
        fallbackUsed: false,
        model: "test"
      }
    }))
  };
}

test("AI support is default-gate aware and ignores bot, wrong-guild, empty and unallowlisted messages", () => {
  const disabled = config({ enabled: false });
  assert.equal(isSupportAiMessageEligible(fakeMessage().message, disabled), false);
  assert.equal(isSupportAiMessageEligible(fakeMessage({ bot: true }).message, config()), false);
  assert.equal(isSupportAiMessageEligible(fakeMessage({ guildId: "999999999999999999" }).message, config()), false);
  assert.equal(isSupportAiMessageEligible(fakeMessage({ content: "   " }).message, config()), false);
  assert.equal(isSupportAiMessageEligible(fakeMessage({ channelId: "999999999999999998" }).message, config()), false);
});

test("AI support skips the reserved cm aura message command", () => {
  assert.equal(isSupportAiMessageEligible(fakeMessage({ content: " cm   aura " }).message, config()), false);
});

test("AI support accepts exact channels, allowlisted thread parents and allowlisted categories", () => {
  assert.equal(isSupportAiMessageEligible(fakeMessage().message, config()), true);
  assert.equal(isSupportAiMessageEligible(fakeMessage({
    channelId: "210000000000000001",
    parentId: "200000000000000001",
    isThread: true,
    threadCategoryId: "999999999999999999"
  }).message, config()), true);
  assert.equal(isSupportAiMessageEligible(fakeMessage({
    channelId: "220000000000000001",
    parentId: "999999999999999999",
    isThread: true,
    threadCategoryId: "300000000000000001"
  }).message, config()), true);
  assert.equal(isSupportAiMessageEligible(fakeMessage({
    channelId: "230000000000000001",
    parentId: "300000000000000001"
  }).message, config()), true);
});

test("message controller persists bounded state per customer and uses safe mentions", async () => {
  const seenFamilies: string[][] = [];
  const controller = new SupportAiMessageController(
    config(),
    service(async (_text, state) => {
      seenFamilies.push([...state.candidateFamilyIds]);
      return {
        state: createSupportConversationState({ ...state, candidateFamilyIds: ["commerce.order"] }),
        action: { kind: "case", canonicalIds: ["case.order.status"], customerMessage: "Current order path." },
        planner: {
          accepted: true,
          decision: {
            observations: { explicitEntities: [], supportSurface: null, knownFacts: [], missingFacts: [] },
            nextAction: "answer_case", caseIds: ["case.order.status"], clarificationId: null,
            dynamicLookupIds: [], policyIds: [], confidence: 1, reasonCode: "test"
          },
          validationErrors: [], fallbackUsed: false, model: "test"
        }
      };
    }),
    new SupportConversationStateStore()
  );
  const first = fakeMessage();
  const second = fakeMessage({ content: "still pending" });

  assert.equal(await controller.handle(first.message), true);
  assert.equal(await controller.handle(second.message), true);
  assert.deepEqual(seenFamilies, [[], ["commerce.order"]]);
  assert.equal(first.replies.length, 1);
  assert.deepEqual((first.replies[0].allowedMentions as { parse: unknown[] }).parse, []);
});

test("message controller fails closed without leaking exception text to customer or logs", async () => {
  const controller = new SupportAiMessageController(
    config(),
    service(async () => {
      throw new Error("provider secret internal failure detail");
    })
  );
  const fake = fakeMessage();
  const originalConsoleError = console.error;
  const logs: string[] = [];
  console.error = (...values: unknown[]) => {
    logs.push(values.map(String).join(" "));
  };

  try {
    assert.equal(await controller.handle(fake.message), true);
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(fake.replies.length, 1);
  assert.equal(fake.replies[0].content, AI_SUPPORT_UNAVAILABLE_MESSAGE);
  assert.equal(String(fake.replies[0].content).includes("provider secret"), false);
  assert.equal(logs.some((line) => line.includes("provider secret internal failure detail")), false);
  assert.equal(logs.some((line) => line.includes('"errorName":"Error"')), true);
});

test("shadow enabled with customer AI disabled processes eligible messages without replying", async () => {
  const recorded: unknown[] = [];
  const controller = new SupportAiMessageController(
    config({ enabled: false, shadowEnabled: true, shadowCohortDir: ".local/test" }),
    service(),
    new SupportConversationStateStore(),
    {
      accepts: () => true,
      record: async (input) => { recorded.push(input); return null; }
    }
  );
  const fake = fakeMessage();
  assert.equal(await controller.handle(fake.message), true);
  assert.equal(fake.replies.length, 0);
  assert.equal(recorded.length, 1);
});

test("visible AI takes precedence over shadow and processes a message once", async () => {
  let records = 0;
  let preparations = 0;
  const controller = new SupportAiMessageController(
    config({ enabled: true, shadowEnabled: true, shadowCohortDir: ".local/test" }),
    service(async (_text, state) => {
      preparations += 1;
      return {
        state,
        action: { kind: "case", canonicalIds: ["case.test"], customerMessage: "visible" },
        planner: {
          accepted: true, fallbackUsed: false, model: "test", validationErrors: [],
          decision: {
            observations: { explicitEntities: [], supportSurface: null, knownFacts: [], missingFacts: [] },
            nextAction: "answer_case", caseIds: ["case.test"], clarificationId: null,
            dynamicLookupIds: [], policyIds: [], confidence: 1, reasonCode: "test"
          }
        }
      };
    }),
    new SupportConversationStateStore(),
    { accepts: () => true, record: async () => { records += 1; return null; } }
  );
  const fake = fakeMessage();
  assert.equal(await controller.handle(fake.message), true);
  assert.equal(preparations, 1);
  assert.equal(fake.replies.length, 1);
  assert.equal(records, 0);
});

test("pre-start shadow messages are rejected before planner processing", async () => {
  let preparations = 0;
  const controller = new SupportAiMessageController(
    config({ enabled: false, shadowEnabled: true, shadowCohortDir: ".local/test" }),
    service(async (_text, state) => { preparations += 1; return service().prepareTurn(_text, state); }),
    new SupportConversationStateStore(),
    { accepts: () => false, record: async () => null }
  );
  const fake = fakeMessage({ createdTimestamp: Date.parse("2026-08-25T00:00:00.000Z") });
  assert.equal(await controller.handle(fake.message), false);
  assert.equal(preparations, 0);
  assert.equal(fake.replies.length, 0);
});

test("shadow writer failure never replies or exposes the writer error body", async () => {
  const controller = new SupportAiMessageController(
    config({ enabled: false, shadowEnabled: true, shadowCohortDir: ".local/test" }),
    service(),
    new SupportConversationStateStore(),
    { accepts: () => true, record: async () => { throw new Error("raw provider body secret"); } }
  );
  const fake = fakeMessage();
  const originalConsoleError = console.error;
  const logs: string[] = [];
  console.error = (...values: unknown[]) => { logs.push(values.map(String).join(" ")); };
  try {
    assert.equal(await controller.handle(fake.message), true);
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(fake.replies.length, 0);
  assert.equal(logs.some((line) => line.includes("raw provider body secret")), false);
  assert.equal(logs.some((line) => line.includes("AI support shadow record failure")), true);
});

test("shadow planner failure is recorded safely and never replies", async () => {
  const failures: unknown[] = [];
  const controller = new SupportAiMessageController(
    config({ enabled: false, shadowEnabled: true, shadowCohortDir: ".local/test" }),
    service(async () => { throw new Error("provider secret internal body"); }),
    new SupportConversationStateStore(),
    { accepts: () => true, record: async (input) => { failures.push(input); return null; } }
  );
  const fake = fakeMessage();
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    assert.equal(await controller.handle(fake.message), true);
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(fake.replies.length, 0);
  assert.equal(failures.length, 1);
  assert.equal((failures[0] as { failureCode: string }).failureCode, "Error");
});
