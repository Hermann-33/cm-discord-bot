import { randomUUID } from "node:crypto";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
  MessageFlags,
  OverwriteType,
  PermissionFlagsBits,
  TextDisplayBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Client,
  type GuildBasedChannel,
  type Interaction,
  type Message,
  type PermissionOverwriteOptions,
  type TextChannel
} from "discord.js";
import type { InternalApiClient } from "../api/client";
import { isInternalApiError } from "../api/errors";
import type { SupportTicketAccess, SupportTicketVerifyData } from "../api/supportTickets";
import type { AppConfig } from "../config/env";
import { postTicketAccessOverrideAudit } from "./adminAudit";
import { authorizeAdminInteraction } from "./adminAuthorization";
import { safeAllowedMentions } from "./safeMessages";
import { logger } from "../logger";

export const TICKETY_SUPPORT_CATEGORY_ID = "1382569775988871330";
export const CM_ACCOUNT_SETTINGS_URL = "https://cheaters.market/dashboard?tab=settings";

const SUPPORT_TICKET_NAME = /^support-\d+$/i;
const RECHECK_PREFIX = "cm:ticket:recheck:";
const RECONCILE_PACE_MS = 2_100;
const OVERRIDE_REASON = "Manual support ticket access override.";

const GATED_PERMISSIONS = [
  ["SendMessages", PermissionFlagsBits.SendMessages],
  ["AddReactions", PermissionFlagsBits.AddReactions],
  ["UseApplicationCommands", PermissionFlagsBits.UseApplicationCommands],
  ["CreatePublicThreads", PermissionFlagsBits.CreatePublicThreads],
  ["CreatePrivateThreads", PermissionFlagsBits.CreatePrivateThreads],
  ["SendMessagesInThreads", PermissionFlagsBits.SendMessagesInThreads],
  ["AttachFiles", PermissionFlagsBits.AttachFiles],
  ["EmbedLinks", PermissionFlagsBits.EmbedLinks]
] as const;

type GatePermissionName = typeof GATED_PERMISSIONS[number][0];

export type TicketPermissionSnapshot = {
  allowMask: number;
  denyMask: number;
};

type RuntimeStatus =
  | "locked"
  | "verified"
  | "admin_override"
  | "verification_unavailable"
  | "access_unavailable";

type TicketRuntimeState = {
  channelId: string;
  creatorDiscordId: string;
  status: RuntimeStatus;
  verifiedUntilMs: number | null;
  snapshot?: TicketPermissionSnapshot;
  gateMessageId?: string;
};

type GateMessageKind = "unlinked" | "verification_unavailable" | "access_unavailable";

export type TicketLinkGateDependencies = {
  nowMs: () => number;
  idempotencyKey: () => string;
  sleep: (milliseconds: number) => Promise<void>;
  postOverrideAudit: typeof postTicketAccessOverrideAudit;
};

const productionDependencies: TicketLinkGateDependencies = {
  nowMs: Date.now,
  idempotencyKey: randomUUID,
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  postOverrideAudit: postTicketAccessOverrideAudit
};

function text(content: string): TextDisplayBuilder {
  return new TextDisplayBuilder().setContent(content);
}

function asGuildTextChannel(channel: unknown): TextChannel | null {
  if (!channel || typeof channel !== "object") return null;
  const candidate = channel as { type?: ChannelType };
  return candidate.type === ChannelType.GuildText ? channel as TextChannel : null;
}

export function isRecognizedSupportTicketChannel(channel: {
  guildId: string;
  type: ChannelType;
  parentId: string | null;
  name: string;
}, guildId: string): boolean {
  if (channel.guildId !== guildId || channel.type !== ChannelType.GuildText) return false;
  return channel.parentId === TICKETY_SUPPORT_CATEGORY_ID ||
    (channel.parentId === null && SUPPORT_TICKET_NAME.test(channel.name));
}

function isRecoveryCandidate(channel: TextChannel, guildId: string): boolean {
  return channel.guildId === guildId && SUPPORT_TICKET_NAME.test(channel.name);
}

function capturePermissionSnapshot(
  channel: TextChannel,
  creatorDiscordId: string
): TicketPermissionSnapshot {
  const overwrite = channel.permissionOverwrites.cache.get(creatorDiscordId);
  let allowMask = 0;
  let denyMask = 0;

  GATED_PERMISSIONS.forEach(([, permission], index) => {
    const bit = 1 << index;
    if (overwrite?.allow.has(permission)) allowMask |= bit;
    if (overwrite?.deny.has(permission)) denyMask |= bit;
  });

  return { allowMask, denyMask };
}

function snapshotPermissionValue(
  snapshot: TicketPermissionSnapshot,
  index: number
): boolean | null {
  const bit = 1 << index;
  if ((snapshot.allowMask & bit) !== 0) return true;
  if ((snapshot.denyMask & bit) !== 0) return false;
  return null;
}

function defaultTicketyParticipantSnapshot(): TicketPermissionSnapshot {
  return {
    allowMask: (1 << GATED_PERMISSIONS.length) - 1,
    denyMask: 0
  };
}

function restoreOptions(snapshot?: TicketPermissionSnapshot): PermissionOverwriteOptions {
  const options: Partial<Record<GatePermissionName, boolean | null>> = {};

  GATED_PERMISSIONS.forEach(([name], index) => {
    // If the durable Discord-side snapshot is unavailable, restore Tickety's
    // default participant behavior for the gated permissions only. The current
    // CM server uses Tickety's default participant permissions.
    options[name] = snapshot ? snapshotPermissionValue(snapshot, index) : true;
  });

  return options as PermissionOverwriteOptions;
}

const LOCK_OPTIONS = Object.fromEntries(
  GATED_PERMISSIONS.map(([name]) => [name, false])
) as PermissionOverwriteOptions;

function hasGateDeny(channel: TextChannel, creatorDiscordId: string): boolean {
  const overwrite = channel.permissionOverwrites.cache.get(creatorDiscordId);
  return GATED_PERMISSIONS.every(([, permission]) => overwrite?.deny.has(permission) === true);
}

function encodeSnapshot(snapshot: TicketPermissionSnapshot): [string, string] {
  return [snapshot.allowMask.toString(36), snapshot.denyMask.toString(36)];
}

function parseMask(value: string): number | null {
  if (!/^[0-9a-z]+$/i.test(value)) return null;
  const parsed = Number.parseInt(value, 36);
  const maxMask = (1 << GATED_PERMISSIONS.length) - 1;
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= maxMask ? parsed : null;
}

function buildRecheckCustomId(
  channelId: string,
  creatorDiscordId: string,
  snapshot: TicketPermissionSnapshot
): string {
  const [allow, deny] = encodeSnapshot(snapshot);
  return `${RECHECK_PREFIX}${channelId}:${creatorDiscordId}:${allow}:${deny}`;
}

function parseRecheckCustomId(customId: string): {
  channelId: string;
  creatorDiscordId: string;
  snapshot: TicketPermissionSnapshot;
} | null {
  if (!customId.startsWith(RECHECK_PREFIX)) return null;
  const parts = customId.slice(RECHECK_PREFIX.length).split(":");
  if (parts.length !== 4) return null;
  const [channelId, creatorDiscordId, allowValue, denyValue] = parts;
  if (!channelId || !creatorDiscordId || !/^\d{5,32}$/.test(channelId) || !/^\d{5,32}$/.test(creatorDiscordId)) {
    return null;
  }
  const allowMask = parseMask(allowValue ?? "");
  const denyMask = parseMask(denyValue ?? "");
  if (allowMask === null || denyMask === null || (allowMask & denyMask) !== 0) return null;
  return { channelId, creatorDiscordId, snapshot: { allowMask, denyMask } };
}

function collectCustomIds(value: unknown, output: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectCustomIds(item, output));
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (typeof record.custom_id === "string") output.push(record.custom_id);
  if (typeof record.customId === "string") output.push(record.customId);
  Object.values(record).forEach((item) => collectCustomIds(item, output));
}

function gatePayload(
  channelId: string,
  creatorDiscordId: string,
  snapshot: TicketPermissionSnapshot,
  kind: GateMessageKind
) {
  const title = kind === "unlinked"
    ? "# Link your Cheater's Market account"
    : kind === "verification_unavailable"
      ? "# CM account verification unavailable"
      : "# CM ticket access unavailable";
  const body = kind === "unlinked"
    ? [
        "Your Discord account isn't linked to a Cheater's Market account. You must link it before continuing with support.",
        "",
        "1. Open Cheater's Market Account Settings.",
        "2. If you're not signed in, sign in to your CM account first.",
        "3. Reopen **Settings** and select **Connect Discord**.",
        "4. Authorize the Discord account you're currently using.",
        "5. Return here and press **Check Again**."
      ].join("\n")
    : kind === "verification_unavailable"
      ? [
          "CM couldn't verify your account link right now, so this ticket is temporarily read-only.",
          "",
          "If you still need to link Discord, open CM Settings. Otherwise wait briefly and press **Check Again**.",
          "A service error is not treated as proof that your account is unlinked."
        ].join("\n")
      : [
          "CM verified your account, but Discord ticket access could not be restored right now.",
          "",
          "Your ticket remains temporarily read-only. Wait briefly and press **Check Again**.",
          "This does not mean your CM account is unlinked."
        ].join("\n");

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel("Open CM Settings")
      .setStyle(ButtonStyle.Link)
      .setURL(CM_ACCOUNT_SETTINGS_URL),
    new ButtonBuilder()
      .setCustomId(buildRecheckCustomId(channelId, creatorDiscordId, snapshot))
      .setLabel("Check Again")
      .setStyle(ButtonStyle.Primary)
  );

  return {
    components: [
      new ContainerBuilder()
        .addTextDisplayComponents(text(title))
        .addTextDisplayComponents(text(body))
        .addActionRowComponents(row)
    ],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: safeAllowedMentions
  } as const;
}

function runtimeFromAccess(
  access: SupportTicketAccess,
  snapshot?: TicketPermissionSnapshot,
  gateMessageId?: string
): TicketRuntimeState {
  return {
    channelId: access.channelId,
    creatorDiscordId: access.creatorDiscordId,
    status: access.state,
    verifiedUntilMs: access.state === "verified" ? Date.parse(access.verifiedUntil) : null,
    snapshot,
    gateMessageId
  };
}

export async function resolveTicketCreator(
  channel: TextChannel,
  botUserId?: string
): Promise<string | null> {
  const memberOverwriteIds = [...channel.permissionOverwrites.cache.values()]
    .filter((overwrite) => overwrite.type === OverwriteType.Member)
    .map((overwrite) => overwrite.id)
    .filter((id) => id !== botUserId);

  const candidates: string[] = [];
  for (const memberId of memberOverwriteIds) {
    try {
      const member = await channel.guild.members.fetch(memberId);
      if (!member.user.bot) candidates.push(memberId);
    } catch {
      // A stale overwrite is not creator evidence.
    }
  }

  return candidates.length === 1 ? candidates[0]! : null;
}

export class TicketLinkGateController {
  private readonly states = new Map<string, TicketRuntimeState>();
  private readonly channelTasks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly config: AppConfig,
    private readonly client: Client,
    private readonly api: InternalApiClient,
    private readonly dependencies: TicketLinkGateDependencies = productionDependencies
  ) {}

  private async exclusive<T>(channelId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.channelTasks.get(channelId) ?? Promise.resolve();
    let next!: Promise<T>;
    next = previous
      .catch(() => undefined)
      .then(operation)
      .finally(() => {
        if (this.channelTasks.get(channelId) === next) this.channelTasks.delete(channelId);
      });
    this.channelTasks.set(channelId, next);
    return next;
  }

  private async ensureLocked(channel: TextChannel, creatorDiscordId: string): Promise<void> {
    if (hasGateDeny(channel, creatorDiscordId)) return;
    await channel.permissionOverwrites.edit(
      creatorDiscordId,
      LOCK_OPTIONS,
      { reason: "CM account-link verification gate" }
    );
  }

  private async findGateMessage(channel: TextChannel, creatorDiscordId: string): Promise<{
    message: Message;
    snapshot: TicketPermissionSnapshot;
  } | null> {
    try {
      const messages = await channel.messages.fetch({ limit: 100 });
      for (const message of messages.values()) {
        if (message.author.id !== this.client.user?.id) continue;
        const customIds: string[] = [];
        collectCustomIds(message.components.map((component) => component.toJSON()), customIds);
        for (const customId of customIds) {
          const parsed = parseRecheckCustomId(customId);
          if (
            parsed &&
            parsed.channelId === channel.id &&
            parsed.creatorDiscordId === creatorDiscordId
          ) {
            return { message, snapshot: parsed.snapshot };
          }
        }
      }
    } catch {
      // Recovery falls back to the known Tickety participant permission shape.
    }
    return null;
  }

  private async deleteGateMessage(
    channel: TextChannel,
    state: TicketRuntimeState
  ): Promise<void> {
    try {
      if (state.gateMessageId) {
        const message = await channel.messages.fetch(state.gateMessageId);
        await message.delete();
        return;
      }
      const existing = await this.findGateMessage(channel, state.creatorDiscordId);
      if (existing) await existing.message.delete();
    } catch {
      // A missing/deleted notice must not block permission restoration.
    }
  }

  private async restoreCreatorAccess(
    channel: TextChannel,
    state: TicketRuntimeState
  ): Promise<void> {
    let snapshot = state.snapshot;
    if (!snapshot) {
      const gate = await this.findGateMessage(channel, state.creatorDiscordId);
      if (gate) {
        snapshot = gate.snapshot;
        state.snapshot = gate.snapshot;
        state.gateMessageId = gate.message.id;
      }
    }

    if (!snapshot) {
      logger.warn("ticket gate permission snapshot unavailable; using Tickety defaults", {
        channelId: channel.id
      });
    }

    await channel.permissionOverwrites.edit(
      state.creatorDiscordId,
      restoreOptions(snapshot),
      { reason: "CM account-link gate released" }
    );
    await this.deleteGateMessage(channel, state);
  }

  private async sendGateMessage(
    channel: TextChannel,
    state: TicketRuntimeState,
    kind: GateMessageKind
  ): Promise<void> {
    const snapshot = state.snapshot ?? capturePermissionSnapshot(channel, state.creatorDiscordId);
    state.snapshot = snapshot;
    const message = await channel.send(
      gatePayload(channel.id, state.creatorDiscordId, snapshot, kind)
    );
    state.gateMessageId = message.id;
  }

  private async trySendGateMessage(
    channel: TextChannel,
    state: TicketRuntimeState,
    kind: GateMessageKind
  ): Promise<void> {
    try {
      await this.sendGateMessage(channel, state, kind);
    } catch {
      logger.error("ticket gate notice delivery failed", {
        channelId: channel.id,
        kind
      });
    }
  }

  private async markAccessUnavailable(
    channel: TextChannel,
    state: TicketRuntimeState
  ): Promise<void> {
    state.status = "access_unavailable";
    state.verifiedUntilMs = null;
    this.states.set(channel.id, state);
    try {
      await this.ensureLocked(channel, state.creatorDiscordId);
    } catch {
      logger.error("ticket gate fail-closed permission update failed", {
        channelId: channel.id
      });
    }
    await this.trySendGateMessage(channel, state, "access_unavailable");
  }

  private async lockForFailure(
    channel: TextChannel,
    creatorDiscordId: string,
    snapshot: TicketPermissionSnapshot,
    triggerMessage?: Message
  ): Promise<void> {
    const state: TicketRuntimeState = {
      channelId: channel.id,
      creatorDiscordId,
      status: "verification_unavailable",
      verifiedUntilMs: null,
      snapshot
    };
    this.states.set(channel.id, state);
    await this.ensureLocked(channel, creatorDiscordId);
    if (triggerMessage) {
      try {
        await triggerMessage.delete();
      } catch {
        logger.warn("ticket gate could not delete blocked creator message", { channelId: channel.id });
      }
    }
    await this.trySendGateMessage(channel, state, "verification_unavailable");
  }

  private async applyPersistedState(
    channel: TextChannel,
    access: SupportTicketAccess
  ): Promise<TicketRuntimeState> {
    const gate = access.state === "locked" || access.state === "admin_override"
      ? await this.findGateMessage(channel, access.creatorDiscordId)
      : null;
    const state = runtimeFromAccess(access, gate?.snapshot, gate?.message.id);
    this.states.set(channel.id, state);

    if (state.status === "locked") {
      await this.ensureLocked(channel, state.creatorDiscordId);
      if (!gate) {
        state.snapshot = defaultTicketyParticipantSnapshot();
        await this.trySendGateMessage(channel, state, "unlinked");
      }
      return state;
    }

    if (state.status === "admin_override") {
      await this.restoreCreatorAccess(channel, state);
      return state;
    }

    if (
      state.status === "verified" &&
      state.verifiedUntilMs !== null &&
      state.verifiedUntilMs > this.dependencies.nowMs()
    ) {
      // If a crash occurred after successful verification but before Discord
      // permissions were restored, recover that half-completed transition.
      const existingGate = await this.findGateMessage(channel, state.creatorDiscordId);
      if (existingGate) {
        state.snapshot = existingGate.snapshot;
        state.gateMessageId = existingGate.message.id;
        try {
          await this.restoreCreatorAccess(channel, state);
        } catch {
          logger.error("ticket gate recovery could not restore verified access", {
            channelId: channel.id
          });
          await this.markAccessUnavailable(channel, state);
        }
      }
    }

    // Expired verified leases are intentionally not locked by a timer or by
    // startup reconciliation. The first creator/customer message after expiry
    // performs the fresh verification.
    return state;
  }

  private async verifyAndApply(
    channel: TextChannel,
    creatorDiscordId: string,
    snapshot: TicketPermissionSnapshot,
    triggerMessage?: Message
  ): Promise<boolean> {
    let verification: SupportTicketVerifyData;
    try {
      verification = await this.api.verifySupportTicketAccess(
        channel.id,
        creatorDiscordId
      );
    } catch (error) {
      logger.warn("ticket account-link verification failed", {
        channelId: channel.id,
        code: isInternalApiError(error) ? error.code : "UNKNOWN"
      });
      await this.lockForFailure(channel, creatorDiscordId, snapshot, triggerMessage);
      return true;
    }

    const state = runtimeFromAccess(verification.ticketAccess, snapshot);
    this.states.set(channel.id, state);

    if (verification.accessGranted) {
      try {
        await this.restoreCreatorAccess(channel, state);
        return false;
      } catch {
        logger.error("ticket gate could not restore verified creator access", {
          channelId: channel.id
        });
        await this.markAccessUnavailable(channel, state);
        return true;
      }
    }

    await this.ensureLocked(channel, creatorDiscordId);
    if (triggerMessage) {
      try {
        await triggerMessage.delete();
      } catch {
        logger.warn("ticket gate could not delete unverified creator message", {
          channelId: channel.id
        });
      }
    }
    await this.trySendGateMessage(channel, state, "unlinked");
    return true;
  }

  private async initializeNewTicket(
    channel: TextChannel,
    creatorDiscordId: string,
    triggerMessage?: Message
  ): Promise<boolean> {
    const snapshot = capturePermissionSnapshot(channel, creatorDiscordId);
    await this.ensureLocked(channel, creatorDiscordId);
    return this.verifyAndApply(channel, creatorDiscordId, snapshot, triggerMessage);
  }

  private async hydrateOrInitialize(
    channel: TextChannel,
    creatorDiscordId: string,
    triggerMessage?: Message,
    renewExpired = Boolean(triggerMessage)
  ): Promise<boolean> {
    try {
      const persisted = await this.api.readSupportTicketAccess(channel.id);
      if (persisted.ticketAccess) {
        const state = await this.applyPersistedState(channel, persisted.ticketAccess);
        if (state.creatorDiscordId !== creatorDiscordId) {
          await this.ensureLocked(channel, creatorDiscordId);
          if (triggerMessage) {
            try { await triggerMessage.delete(); } catch {}
          }
          logger.warn("ticket creator mismatch during gate hydration", { channelId: channel.id });
          return true;
        }

        if (state.status === "locked" ||
          state.status === "verification_unavailable" ||
          state.status === "access_unavailable") {
          await this.ensureLocked(channel, creatorDiscordId);
          if (triggerMessage) {
            try { await triggerMessage.delete(); } catch {}
          }
          return true;
        }

        if (
          state.status === "verified" &&
          (state.verifiedUntilMs === null || state.verifiedUntilMs <= this.dependencies.nowMs())
        ) {
          if (!renewExpired) return false;
          const snapshot = capturePermissionSnapshot(channel, creatorDiscordId);
          return this.verifyAndApply(channel, creatorDiscordId, snapshot, triggerMessage);
        }

        return false;
      }
    } catch (error) {
      logger.warn("ticket access recovery read failed", {
        channelId: channel.id,
        code: isInternalApiError(error) ? error.code : "UNKNOWN"
      });
      const snapshot = capturePermissionSnapshot(channel, creatorDiscordId);
      await this.lockForFailure(channel, creatorDiscordId, snapshot, triggerMessage);
      return true;
    }

    return this.initializeNewTicket(channel, creatorDiscordId, triggerMessage);
  }

  async handleChannelCreate(channel: GuildBasedChannel): Promise<void> {
    const textChannel = asGuildTextChannel(channel);
    if (!textChannel || !isRecognizedSupportTicketChannel(textChannel, this.config.discordGuildId)) {
      return;
    }

    await this.exclusive(textChannel.id, async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const creatorDiscordId = await resolveTicketCreator(textChannel, this.client.user?.id);
        if (creatorDiscordId) {
          // ChannelCreate means this Discord channel ID is new. Lock before
          // the freshness check so an unlinked creator cannot race the API
          // round-trip with an early ticket message.
          await this.initializeNewTicket(textChannel, creatorDiscordId);
          return;
        }
        if (attempt < 4) await this.dependencies.sleep(500 * (attempt + 1));
      }
      logger.warn("ticket creator resolution failed on channel creation", {
        channelId: textChannel.id
      });
    });
  }

  async handleChannelUpdate(channel: unknown): Promise<void> {
    const textChannel = asGuildTextChannel(channel);
    if (!textChannel || textChannel.guildId !== this.config.discordGuildId) return;

    await this.exclusive(textChannel.id, async () => {
      const state = this.states.get(textChannel.id);
      if (state) {
        if (state.status === "locked" ||
          state.status === "verification_unavailable" ||
          state.status === "access_unavailable") {
          await this.ensureLocked(textChannel, state.creatorDiscordId);
        }
        return;
      }

      if (!isRecognizedSupportTicketChannel(textChannel, this.config.discordGuildId)) return;
      const creatorDiscordId = await resolveTicketCreator(textChannel, this.client.user?.id);
      if (!creatorDiscordId) return;
      await this.hydrateOrInitialize(textChannel, creatorDiscordId);
    });
  }

  handleChannelDelete(channelId: string): void {
    this.states.delete(channelId);
    this.channelTasks.delete(channelId);
  }

  async handleMessage(message: Message): Promise<boolean> {
    if (message.author.bot || message.guildId !== this.config.discordGuildId) return false;
    const channel = asGuildTextChannel(message.channel);
    if (!channel) return false;

    return this.exclusive(channel.id, async () => {
      let state = this.states.get(channel.id);

      if (!state) {
        if (!isRecognizedSupportTicketChannel(channel, this.config.discordGuildId)) return false;
        const creatorDiscordId = await resolveTicketCreator(channel, this.client.user?.id);
        if (!creatorDiscordId || message.author.id !== creatorDiscordId) return false;
        return this.hydrateOrInitialize(channel, creatorDiscordId, message);
      }

      if (message.author.id !== state.creatorDiscordId) return false;
      if (state.status === "admin_override") return false;

      if (
        state.status === "verified" &&
        state.verifiedUntilMs !== null &&
        state.verifiedUntilMs > this.dependencies.nowMs()
      ) {
        return false;
      }

      if (state.status === "locked" ||
          state.status === "verification_unavailable" ||
          state.status === "access_unavailable") {
        await this.ensureLocked(channel, state.creatorDiscordId);
        try {
          await message.delete();
        } catch {
          logger.warn("ticket gate could not delete locked creator message", {
            channelId: channel.id
          });
        }
        return true;
      }

      // Only creator/customer activity reaches this branch. Staff/admin/bot
      // messages never renew an expired verification lease.
      const snapshot = capturePermissionSnapshot(channel, state.creatorDiscordId);
      return this.verifyAndApply(channel, state.creatorDiscordId, snapshot, message);
    });
  }

  private async handleRecheck(interaction: ButtonInteraction): Promise<void> {
    const parsed = parseRecheckCustomId(interaction.customId);
    if (
      !parsed ||
      interaction.guildId !== this.config.discordGuildId ||
      interaction.channelId !== parsed.channelId ||
      interaction.user.id !== parsed.creatorDiscordId
    ) {
      await interaction.reply({
        content: "This account-link check is not available to you.",
        flags: MessageFlags.Ephemeral,
        allowedMentions: safeAllowedMentions
      });
      return;
    }

    const channel = asGuildTextChannel(interaction.channel);
    if (!channel) {
      await interaction.reply({
        content: "This account-link check is no longer attached to a support ticket.",
        flags: MessageFlags.Ephemeral,
        allowedMentions: safeAllowedMentions
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    await this.exclusive(channel.id, async () => {
      try {
        const verification = await this.api.verifySupportTicketAccess(
          channel.id,
          parsed.creatorDiscordId
        );
        const state = runtimeFromAccess(
          verification.ticketAccess,
          parsed.snapshot,
          interaction.message.id
        );
        this.states.set(channel.id, state);

        if (!verification.accessGranted) {
          await this.ensureLocked(channel, parsed.creatorDiscordId);
          await interaction.editReply({
            content: "Your Discord account is still not linked to a Cheater's Market account. Link it in CM Settings, then press **Check Again**.",
            allowedMentions: safeAllowedMentions
          });
          return;
        }

        await this.restoreCreatorAccess(channel, state);
        await interaction.editReply({
          content: "CM account verification succeeded. You can continue with this support ticket.",
          allowedMentions: safeAllowedMentions
        });
      } catch (error) {
        logger.warn("ticket recheck failed", {
          channelId: channel.id,
          code: isInternalApiError(error) ? error.code : "UNKNOWN"
        });
        await this.ensureLocked(channel, parsed.creatorDiscordId);
        await interaction.editReply({
          content: isInternalApiError(error, "TICKET_CREATOR_MISMATCH")
            ? "This ticket's stored creator does not match the current verification request. Staff must review the ticket."
            : "CM account verification is temporarily unavailable. Your ticket remains read-only; try **Check Again** shortly.",
          allowedMentions: safeAllowedMentions
        });
      }
    });
  }

  private async resolveOverrideCreator(channel: TextChannel): Promise<{
    creatorDiscordId: string;
    persisted?: SupportTicketAccess;
  } | null> {
    const runtime = this.states.get(channel.id);
    if (runtime) return { creatorDiscordId: runtime.creatorDiscordId };

    try {
      const persisted = await this.api.readSupportTicketAccess(channel.id);
      if (persisted.ticketAccess) {
        await this.applyPersistedState(channel, persisted.ticketAccess);
        return {
          creatorDiscordId: persisted.ticketAccess.creatorDiscordId,
          persisted: persisted.ticketAccess
        };
      }
    } catch (error) {
      logger.warn("ticket override recovery read failed", {
        channelId: channel.id,
        code: isInternalApiError(error) ? error.code : "UNKNOWN"
      });
      throw error;
    }

    if (!isRecognizedSupportTicketChannel(channel, this.config.discordGuildId)) return null;
    const creatorDiscordId = await resolveTicketCreator(channel, this.client.user?.id);
    return creatorDiscordId ? { creatorDiscordId } : null;
  }

  private async handleTicketAllow(interaction: ChatInputCommandInteraction): Promise<void> {
    const authorization = authorizeAdminInteraction(interaction, this.config);
    if (!authorization.ok) {
      await interaction.reply({
        content: authorization.message,
        flags: MessageFlags.Ephemeral,
        allowedMentions: safeAllowedMentions
      });
      return;
    }

    const channel = asGuildTextChannel(interaction.channel);
    if (!channel) {
      await interaction.reply({
        content: "Run this command inside a CM support ticket.",
        flags: MessageFlags.Ephemeral,
        allowedMentions: safeAllowedMentions
      });
      return;
    }

    if (!this.config.botAuditLogChannelId) {
      await interaction.reply({
        content: "The CM audit channel is not configured, so a ticket override cannot be applied.",
        flags: MessageFlags.Ephemeral,
        allowedMentions: safeAllowedMentions
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    await this.exclusive(channel.id, async () => {
      try {
        const target = await this.resolveOverrideCreator(channel);
        if (!target) {
          await interaction.editReply({
            content: "This channel is not a recognized CM support ticket, or its creator cannot be resolved safely.",
            allowedMentions: safeAllowedMentions
          });
          return;
        }

        const override = await this.api.overrideSupportTicketAccess({
          channelId: channel.id,
          creatorDiscordId: target.creatorDiscordId,
          adminDiscordId: interaction.user.id,
          reason: OVERRIDE_REASON,
          idempotencyKey: this.dependencies.idempotencyKey()
        });

        const existing = this.states.get(channel.id);
        const gate = existing?.snapshot
          ? null
          : await this.findGateMessage(channel, target.creatorDiscordId);
        const state = runtimeFromAccess(
          override.ticketAccess,
          existing?.snapshot ?? gate?.snapshot,
          existing?.gateMessageId ?? gate?.message.id
        );
        this.states.set(channel.id, state);
        await this.restoreCreatorAccess(channel, state);

        let auditDelivered = true;
        try {
          await this.dependencies.postOverrideAudit({
            client: interaction.client,
            channelId: this.config.botAuditLogChannelId!,
            operatorId: interaction.user.id,
            ticketChannelId: channel.id,
            ticketChannelName: channel.name,
            creatorDiscordId: target.creatorDiscordId,
            completedAt: override.ticketAccess.overrideAt!,
            idempotentReplay: override.idempotentReplay
          });
        } catch {
          auditDelivered = false;
          logger.error("ticket override Discord audit delivery failed", {
            channelId: channel.id
          });
        }

        await interaction.editReply({
          content: [
            "Support override applied.",
            "",
            `User: <@${target.creatorDiscordId}>`,
            `Ticket: ${channel.name}`,
            "Access: Manually allowed",
            ...(auditDelivered ? [] : ["Audit: Backend recorded; Discord audit delivery failed"])
          ].join("\n"),
          allowedMentions: safeAllowedMentions
        });
      } catch (error) {
        logger.warn("ticket override failed", {
          channelId: channel.id,
          code: isInternalApiError(error) ? error.code : "UNKNOWN"
        });
        await interaction.editReply({
          content: isInternalApiError(error, "TICKET_CREATOR_MISMATCH")
            ? "CM rejected this override because the stored ticket creator does not match. No Discord permissions were changed."
            : "The ticket override could not be completed.",
          allowedMentions: safeAllowedMentions
        });
      }
    });
  }

  async handleInteraction(interaction: Interaction): Promise<boolean> {
    if (interaction.isButton() && interaction.customId.startsWith(RECHECK_PREFIX)) {
      await this.handleRecheck(interaction);
      return true;
    }

    if (
      interaction.isChatInputCommand() &&
      interaction.commandName === "cm" &&
      interaction.options.getSubcommand(false) === "ticket-allow"
    ) {
      await this.handleTicketAllow(interaction);
      return true;
    }

    return false;
  }

  async reconcileExistingTickets(): Promise<void> {
    let guild;
    try {
      guild = await this.client.guilds.fetch(this.config.discordGuildId);
    } catch {
      logger.error("ticket gate could not fetch configured guild");
      return;
    }

    let channels;
    try {
      channels = await guild.channels.fetch();
    } catch {
      logger.error("ticket gate could not fetch guild channels");
      return;
    }

    const candidates = [...channels.values()]
      .map((channel) => asGuildTextChannel(channel))
      .filter((channel): channel is TextChannel => Boolean(
        channel && isRecoveryCandidate(channel, this.config.discordGuildId)
      ));

    for (let index = 0; index < candidates.length; index += 1) {
      const channel = candidates[index]!;
      await this.exclusive(channel.id, async () => {
        try {
          const persisted = await this.api.readSupportTicketAccess(channel.id);
          if (persisted.ticketAccess) {
            await this.applyPersistedState(channel, persisted.ticketAccess);
            return;
          }

          if (!isRecognizedSupportTicketChannel(channel, this.config.discordGuildId)) return;
          const creatorDiscordId = await resolveTicketCreator(channel, this.client.user?.id);
          if (!creatorDiscordId) {
            logger.warn("ticket creator resolution ambiguous during startup recovery", {
              channelId: channel.id
            });
            return;
          }
          await this.initializeNewTicket(channel, creatorDiscordId);
        } catch (error) {
          logger.warn("ticket startup recovery failed", {
            channelId: channel.id,
            code: isInternalApiError(error) ? error.code : "UNKNOWN"
          });

          if (isRecognizedSupportTicketChannel(channel, this.config.discordGuildId)) {
            const creatorDiscordId = await resolveTicketCreator(channel, this.client.user?.id);
            if (creatorDiscordId) {
              const snapshot = capturePermissionSnapshot(channel, creatorDiscordId);
              try {
                await this.lockForFailure(channel, creatorDiscordId, snapshot);
              } catch {
                logger.error("ticket startup fail-closed lock failed", { channelId: channel.id });
              }
            }
          }
        }
      });

      if (index < candidates.length - 1) {
        await this.dependencies.sleep(RECONCILE_PACE_MS);
      }
    }

    logger.info("ticket gate startup reconciliation complete", {
      candidates: candidates.length,
      tracked: this.states.size
    });
  }
}
