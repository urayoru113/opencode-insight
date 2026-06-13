import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import type {
  AssistantMessage,
  GlobalSession,
  Message,
  Part,
  ReasoningPart,
  TextPart,
  ToolPart,
} from "@opencode-ai/sdk/v2";

// ── Re-export interfaces for backward compatibility ───────────────────

export interface TimelineEntry {
  id: string;
  sessionId: string;
  type: "message" | "tool";
  timestamp: number;
  // Message fields
  agent?: string;
  model?: string;
  provider?: string;
  displayModel: string;
  role?: string;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
  cost?: number;
  // Tool fields
  toolName?: string;
  callId?: string;
  status?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: string;
  // Common
  messageId?: string;
}

export interface MessagePart {
  type: string;
  text: string;
  time?: { start: number; end?: number };
}

export interface RealTokenUsageEntry {
  id: string;
  sessionId: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: number;
  model: string;
  provider: string;
  timestamp: number;
  role: string;
  agent: string;
  partTypes: string[];
}

export interface AccumulatedTokens {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
  cost: number;
}

export interface SessionStats {
  id: string;
  title: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: number;
}

export interface ToolCallEntry {
  id: string;
  messageId: string;
  sessionId: string;
  toolName: string;
  callId: string;
  status: "completed" | "running" | "error" | string;
  input: Record<string, unknown>;
  output: string;
  timeCreated: number;
}

// ── Type guards ─────────────────────────────────────────────────────

function isAssistantMessage(msg: Message): msg is AssistantMessage {
  return msg.role === "assistant";
}

function isTextPart(part: Part): part is TextPart {
  return part.type === "text";
}

function isReasoningPart(part: Part): part is ReasoningPart {
  return part.type === "reasoning";
}

function isToolPart(part: Part): part is ToolPart {
  return part.type === "tool";
}

// ── Token Usage ─────────────────────────────────────────────────────

export async function getTokenUsage(api: TuiPluginApi, sessionId?: string): Promise<RealTokenUsageEntry[]> {
  if (!sessionId) return [];
  const messages = api.state.session.messages(sessionId);

  // Fetch part types for all messages
  const partTypesMap = new Map<string, string[]>();
  for (const msg of messages) {
    const parts = api.state.part(msg.id);
    const types = new Set<string>();
    for (const part of parts) {
      types.add(part.type);
    }
    partTypesMap.set(msg.id, Array.from(types));
  }

  return messages.map((msg) => {
    const tokens = isAssistantMessage(msg)
      ? {
          inputTokens: msg.tokens?.input ?? 0,
          outputTokens: msg.tokens?.output ?? 0,
          reasoningTokens: msg.tokens?.reasoning ?? 0,
          cacheRead: msg.tokens?.cache?.read ?? 0,
          cacheWrite: msg.tokens?.cache?.write ?? 0,
          totalTokens: msg.tokens?.total ?? 0,
          cost: msg.cost ?? 0,
        }
      : {
          inputTokens: 0,
          outputTokens: 0,
          reasoningTokens: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: 0,
        };

    return {
      id: msg.id,
      sessionId: msg.sessionID,
      ...tokens,
      model: isAssistantMessage(msg) ? msg.modelID : (msg.model?.modelID ?? "unknown"),
      provider: isAssistantMessage(msg) ? msg.providerID : (msg.model?.providerID ?? "unknown"),
      displayModel: isAssistantMessage(msg)
        ? `${msg.providerID}/${msg.modelID}`
        : msg.model
          ? `${msg.model.providerID}/${msg.model.modelID}`
          : "unknown",
      timestamp: msg.time.created,
      role: msg.role,
      agent: msg.agent ?? "unknown",
      partTypes: partTypesMap.get(msg.id) ?? [],
    };
  });
}

// ── Message Parts ───────────────────────────────────────────────────

export async function getMessageParts(api: TuiPluginApi, messageId: string): Promise<MessagePart[]> {
  const parts = api.state.part(messageId);
  return parts
    .filter((part): part is TextPart | ReasoningPart => isTextPart(part) || isReasoningPart(part))
    .map((part) => ({
      type: part.type,
      text: part.text,
      time: part.time,
    }));
}

// ── Timeline ────────────────────────────────────────────────────────

export async function getTimelineData(api: TuiPluginApi, sessionId?: string): Promise<TimelineEntry[]> {
  if (!sessionId) return [];
  const entries: TimelineEntry[] = [];

  const messages = api.state.session.messages(sessionId);
  for (const msg of messages) {
    const msgTokens = isAssistantMessage(msg)
      ? {
          inputTokens: msg.tokens?.input ?? 0,
          outputTokens: msg.tokens?.output ?? 0,
          reasoningTokens: msg.tokens?.reasoning ?? 0,
          cacheRead: msg.tokens?.cache?.read ?? 0,
          cacheWrite: msg.tokens?.cache?.write ?? 0,
          totalTokens: msg.tokens?.total ?? 0,
          cost: msg.cost ?? 0,
        }
      : {
          inputTokens: 0,
          outputTokens: 0,
          reasoningTokens: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: 0,
        };

    entries.push({
      id: msg.id,
      sessionId: msg.sessionID,
      type: "message",
      timestamp: msg.time.created,
      agent: msg.agent ?? "unknown",
      model: isAssistantMessage(msg) ? msg.modelID : (msg.model?.modelID ?? "unknown"),
      provider: isAssistantMessage(msg) ? msg.providerID : (msg.model?.providerID ?? "unknown"),
      displayModel:
        isAssistantMessage(msg) && msg.providerID && msg.modelID ? `${msg.providerID}/${msg.modelID}` : "User Prompt",
      role: msg.role,
      ...msgTokens,
    });

    // Fetch tool parts for this message
    const parts = api.state.part(msg.id);
    for (const part of parts) {
      if (isToolPart(part)) {
        const state = part.state;
        entries.push({
          id: part.id,
          sessionId: part.sessionID,
          displayModel: "",
          type: "tool",
          timestamp: msg.time.created,
          messageId: part.messageID,
          toolName: part.tool,
          callId: part.callID,
          status: state.status,
          toolInput: state.status !== "pending" ? state.input : {},
          toolOutput: state.status === "completed" ? state.output : state.status === "error" ? state.error : "",
        });
      }
    }
  }

  // Sort by timestamp descending (newest first)
  entries.sort((a, b) => b.timestamp - a.timestamp);
  return entries;
}

// ── All Session Stats ───────────────────────────────────────────────

export async function getAllSessionStats(api: TuiPluginApi): Promise<SessionStats[]> {
  const result = await api.client.experimental.session.list({ limit: 50 });
  const sessions: GlobalSession[] = (result.data as GlobalSession[]) ?? [];

  return sessions.map((session) => {
    const tokens = session.tokens ?? {
      input: 0,
      output: 0,
      reasoning: 0,
      cache: { read: 0, write: 0 },
    };
    return {
      id: session.id,
      title: session.title || "Untitled",
      model: session.model?.id || "unknown",
      inputTokens: tokens.input ?? 0,
      outputTokens: tokens.output ?? 0,
      reasoningTokens: tokens.reasoning ?? 0,
      cacheRead: tokens.cache?.read ?? 0,
      cacheWrite: tokens.cache?.write ?? 0,
      totalTokens: (tokens.input ?? 0) + (tokens.output ?? 0) + (tokens.reasoning ?? 0),
      cost: session.cost ?? 0,
    };
  });
}

// ── Accumulated Tokens ──────────────────────────────────────────────

export async function getAccumulatedTokenUsage(api: TuiPluginApi): Promise<AccumulatedTokens> {
  const sessions = await getAllSessionStats(api);
  return sessions.reduce(
    (acc, s) => ({
      input: acc.input + s.inputTokens,
      output: acc.output + s.outputTokens,
      reasoning: acc.reasoning + s.reasoningTokens,
      cacheRead: acc.cacheRead + s.cacheRead,
      cacheWrite: acc.cacheWrite + s.cacheWrite,
      total: acc.total + s.totalTokens,
      cost: acc.cost + s.cost,
    }),
    {
      input: 0,
      output: 0,
      reasoning: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
      cost: 0,
    } as AccumulatedTokens,
  );
}

// ── Tool Calls ──────────────────────────────────────────────────────

export async function getToolCalls(api: TuiPluginApi, sessionId?: string): Promise<ToolCallEntry[]> {
  if (!sessionId) return [];
  const messages = api.state.session.messages(sessionId);
  const entries: ToolCallEntry[] = [];

  for (const msg of messages) {
    const parts = api.state.part(msg.id);
    for (const part of parts) {
      if (isToolPart(part)) {
        const state = part.state;
        entries.push({
          id: part.id,
          messageId: part.messageID,
          sessionId: part.sessionID,
          toolName: part.tool,
          callId: part.callID,
          status: state.status,
          input: state.status !== "pending" ? state.input : {},
          output: state.status === "completed" ? state.output : state.status === "error" ? state.error : "",
          timeCreated: msg.time.created,
        });
      }
    }
  }

  return entries;
}

export async function getToolCallCount(api: TuiPluginApi, sessionId?: string): Promise<number> {
  const calls = await getToolCalls(api, sessionId);
  return calls.length;
}

// ── Current Session ID ──────────────────────────────────────────────
// The plugin receives session_id from the slot props, so this is
// mostly a no-op for backward compatibility.
export async function getCurrentSessionId(): Promise<string | null> {
  return null;
}

// ── Connection Test ─────────────────────────────────────────────────
export async function testConnection(): Promise<boolean> {
  return true;
}
