import type { Message } from "discord.js";
import { isAuraCommand } from "../commands/aura";
import type { AppConfig } from "../config/env";
import { extractSupportLookupContext } from "../ai/supportLookup";
import type { SupportConversationService } from "../ai/supportConversation";
import {
  SupportConversationStateStore,
  type SupportConversationKey
} from "../ai/supportStateStore";
import { logger } from "../logger";
import { safeAllowedMentions } from "./safeMessages";

export const AI_SUPPORT_UNAVAILABLE_MESSAGE =
  "Automated support is unavailable right now. A staff member can continue this support request.";

const MAX_CUSTOMER_REPLY_LENGTH = 1900;

type ParentAwareChannel = {
  parentId?: string | null;
  parent?: { parentId?: string | null } | null;
  isThread?: () => boolean;
};

export type SupportAiService = Pick<SupportConversationService, "prepareTurn">;

function surfaceIds(message: Message): {
  channelId: string;
  parentChannelId: string | null;
  categoryId: string | null;
} {
  const channel = message.channel as unknown as ParentAwareChannel;
  const isThread = channel.isThread?.() === true;
  return {
    channelId: message.channelId,
    parentChannelId: isThread && typeof channel.parentId === "string" ? channel.parentId : null,
    categoryId: isThread
      ? typeof channel.parent?.parentId === "string" ? channel.parent.parentId : null
      : typeof channel.parentId === "string" ? channel.parentId : null
  };
}

function safeErrorName(error: unknown): string {
  if (!(error instanceof Error)) return "UnknownError";
  return error.name.replace(/[^A-Za-z0-9_.-]/gu, "").slice(0, 64) || "Error";
}

export function isSupportAiMessageEligible(message: Message, config: AppConfig): boolean {
  if (!config.aiSupport.enabled) return false;
  if (message.author.bot) return false;
  if (message.guildId !== config.discordGuildId) return false;
  if (isAuraCommand(message.content)) return false;
  if (!message.content.trim()) return false;

  const surface = surfaceIds(message);
  const channelAllowed = config.aiSupport.channelIds.includes(surface.channelId) ||
    Boolean(surface.parentChannelId && config.aiSupport.channelIds.includes(surface.parentChannelId));
  const categoryAllowed = Boolean(surface.categoryId && config.aiSupport.categoryIds.includes(surface.categoryId));
  return channelAllowed || categoryAllowed;
}

function conversationKey(message: Message): SupportConversationKey {
  return {
    guildId: message.guildId!,
    channelId: message.channelId,
    userId: message.author.id
  };
}

function customerReply(value: string): string {
  const cleaned = value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, " ")
    .trim();
  return (cleaned || AI_SUPPORT_UNAVAILABLE_MESSAGE).slice(0, MAX_CUSTOMER_REPLY_LENGTH);
}

async function replySafely(message: Message, content: string): Promise<void> {
  await message.reply({ content: customerReply(content), allowedMentions: safeAllowedMentions });
}

export class SupportAiMessageController {
  constructor(
    private readonly config: AppConfig,
    private readonly service: SupportAiService,
    private readonly store = new SupportConversationStateStore()
  ) {}

  async handle(message: Message): Promise<boolean> {
    if (!isSupportAiMessageEligible(message, this.config)) return false;

    const key = conversationKey(message);
    const state = this.store.getOrCreate(key);
    const lookupContext = extractSupportLookupContext(message.content, message.author.id);

    try {
      const result = await this.service.prepareTurn(message.content, state, lookupContext);
      this.store.set(key, result.state);
      await replySafely(message, result.action.customerMessage);
      return true;
    } catch (error) {
      logger.error("AI support failure", { errorName: safeErrorName(error) });
      try {
        await replySafely(message, AI_SUPPORT_UNAVAILABLE_MESSAGE);
      } catch (replyError) {
        logger.error("AI support reply failure", { errorName: safeErrorName(replyError) });
      }
      return true;
    }
  }
}
