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

type LeaderboardChannel = TextBasedChannel & {
  send(options: MessageCreateOptions): Promise<Message>;
  messages: {
    fetch(messageId: string): Promise<Message>;
  };
};

function isLeaderboardChannel(channel: unknown): channel is LeaderboardChannel {
  if (!channel || typeof channel !== "object") {
    return false;
  }

  const maybeChannel = channel as {
    isTextBased?: () => boolean;
    send?: unknown;
    messages?: { fetch?: unknown };
  };

  return (
    typeof maybeChannel.isTextBased === "function" &&
    maybeChannel.isTextBased() &&
    typeof maybeChannel.send === "function" &&
    typeof maybeChannel.messages?.fetch === "function"
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

export async function fetchLeaderboardMessage(
  channel: LeaderboardChannel,
  messageId: string
): Promise<Message> {
  return channel.messages.fetch(messageId);
}

export async function createLeaderboardMessage(
  channel: LeaderboardChannel,
  options: Omit<MessageCreateOptions, "allowedMentions">
): Promise<Message> {
  return channel.send({
    ...options,
    allowedMentions: safeAllowedMentions
  });
}

export async function editLeaderboardMessage(
  message: Message,
  options: Omit<MessageEditOptions, "allowedMentions">
): Promise<Message> {
  return message.edit({
    ...options,
    allowedMentions: safeAllowedMentions
  });
}
