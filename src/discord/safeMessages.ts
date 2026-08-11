import type {
  Client,
  Message,
  MessageCreateOptions,
  MessageEditOptions,
  MessageMentionOptions,
  TextBasedChannel
} from "discord.js";

export const safeAllowedMentions: MessageMentionOptions = {
  parse: [],
  users: [],
  roles: [],
  repliedUser: false
};

export type LeaderboardChannel = TextBasedChannel & {
  send(options: MessageCreateOptions): Promise<Message>;
  messages: {
    fetch(messageId: string): Promise<Message>;
  };
};

function isLeaderboardChannel(channel: unknown): channel is LeaderboardChannel {
  if (!channel || typeof channel !== "object") return false;

  const candidate = channel as {
    isTextBased?: () => boolean;
    send?: unknown;
    messages?: { fetch?: unknown };
  };

  return (
    typeof candidate.isTextBased === "function" &&
    candidate.isTextBased() &&
    typeof candidate.send === "function" &&
    typeof candidate.messages?.fetch === "function"
  );
}

export async function fetchLeaderboardChannel(
  client: Client,
  channelId: string
): Promise<LeaderboardChannel> {
  const channel = await client.channels.fetch(channelId);
  if (!isLeaderboardChannel(channel)) {
    throw new Error("Configured leaderboard channel is not text-sendable");
  }
  return channel;
}

export async function createLeaderboardMessage(
  channel: LeaderboardChannel,
  options: Omit<MessageCreateOptions, "allowedMentions">
): Promise<Message> {
  return channel.send({ ...options, allowedMentions: safeAllowedMentions });
}

export async function editLeaderboardMessage(
  channel: LeaderboardChannel,
  messageId: string,
  options: Omit<MessageEditOptions, "allowedMentions">
): Promise<Message> {
  const message = await channel.messages.fetch(messageId);
  return message.edit({ ...options, allowedMentions: safeAllowedMentions });
}
