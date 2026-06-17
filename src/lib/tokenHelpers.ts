import type { AssistantMessage, Message } from "@opencode-ai/sdk/v2";

export interface MessageTokenSummary {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: number;
}

export function isAssistantMessage(msg: Message): msg is AssistantMessage {
  return msg.role === "assistant";
}

export function extractMessageTokens(msg: Message): MessageTokenSummary {
  if (isAssistantMessage(msg)) {
    return {
      inputTokens: msg.tokens?.input ?? 0,
      outputTokens: msg.tokens?.output ?? 0,
      reasoningTokens: msg.tokens?.reasoning ?? 0,
      cacheRead: msg.tokens?.cache?.read ?? 0,
      cacheWrite: msg.tokens?.cache?.write ?? 0,
      totalTokens: msg.tokens?.total ?? 0,
      cost: msg.cost ?? 0,
    };
  }

  return {
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: 0,
  };
}

export function getDisplayModel(msg: Message): string {
  if (isAssistantMessage(msg) && msg.providerID && msg.modelID) {
    return `${msg.providerID}/${msg.modelID}`;
  }
  return "User Prompt";
}
