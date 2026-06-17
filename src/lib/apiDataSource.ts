import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import type { GlobalSession, Part, ReasoningPart, TextPart, ToolPart } from "@opencode-ai/sdk/v2";
import { extractMessageTokens, getDisplayModel, isAssistantMessage } from "./tokenHelpers";

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

interface SessionStats {
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
  status: ToolPart["state"]["status"];
  input: Record<string, unknown>;
  output: string;
  timeCreated: number;
}

// ── Type guards ─────────────────────────────────────────────────────

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

export function getTokenUsage(api: TuiPluginApi, sessionId?: string): RealTokenUsageEntry[] {
  if (!sessionId) return [];
  const messages = api.state.session.messages(sessionId);

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
    const tokens = extractMessageTokens(msg);
    const assistant = isAssistantMessage(msg);

    return {
      id: msg.id,
      sessionId: msg.sessionID,
      ...tokens,
      model: assistant ? msg.modelID : "unknown",
      provider: assistant ? msg.providerID : "unknown",
      displayModel: getDisplayModel(msg),
      timestamp: msg.time.created,
      role: msg.role,
      agent: msg.agent ?? "unknown",
      partTypes: partTypesMap.get(msg.id) ?? [],
    };
  });
}

// ── Message Parts ───────────────────────────────────────────────────

export function getMessageParts(api: TuiPluginApi, messageId: string): MessagePart[] {
  return api.state
    .part(messageId)
    .filter((part): part is TextPart | ReasoningPart => isTextPart(part) || isReasoningPart(part))
    .map((part) => ({
      type: part.type,
      text: part.text,
      time: part.time,
    }));
}

// ── Timeline ────────────────────────────────────────────────────────

export function getTimelineData(api: TuiPluginApi, sessionId?: string): TimelineEntry[] {
  if (!sessionId) return [];
  const entries: TimelineEntry[] = [];

  const messages = api.state.session.messages(sessionId);
  for (const msg of messages) {
    const tokens = extractMessageTokens(msg);
    const assistant = isAssistantMessage(msg);

    entries.push({
      id: msg.id,
      sessionId: msg.sessionID,
      type: "message",
      timestamp: msg.time.created,
      agent: msg.agent ?? "unknown",
      model: assistant ? msg.modelID : "unknown",
      provider: assistant ? msg.providerID : "unknown",
      displayModel: getDisplayModel(msg),
      role: msg.role,
      ...tokens,
    });

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

export function getToolCalls(api: TuiPluginApi, sessionId?: string): ToolCallEntry[] {
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

export function getToolCallCount(api: TuiPluginApi, sessionId?: string): number {
  if (!sessionId) return 0;
  let count = 0;
  for (const msg of api.state.session.messages(sessionId)) {
    for (const part of api.state.part(msg.id)) {
      if (isToolPart(part)) count++;
    }
  }
  return count;
}

export function getMessageCount(api: TuiPluginApi, sessionId?: string): number {
  if (!sessionId) return 0;
  return api.state.session.messages(sessionId).length;
}

export interface ToolUsageStat {
  toolName: string;
  count: number;
}

export function getToolUsageStats(api: TuiPluginApi, sessionId?: string): ToolUsageStat[] {
  const calls = getToolCalls(api, sessionId);
  const map = new Map<string, number>();
  for (const call of calls) {
    const name = call.toolName || "unknown";
    map.set(name, (map.get(name) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([toolName, count]) => ({ toolName, count }))
    .sort((a, b) => b.count - a.count);
}

// ── Agent Usage ─────────────────────────────────────────────────────

export interface AgentUsageStat {
  agentName: string;
  count: number;
}

export function getAgentUsageStats(api: TuiPluginApi, sessionId?: string): AgentUsageStat[] {
  if (!sessionId) return [];
  const map = new Map<string, number>();
  for (const msg of api.state.session.messages(sessionId)) {
    const agent = msg.agent ?? "unknown";
    map.set(agent, (map.get(agent) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([agentName, count]) => ({ agentName, count }))
    .sort((a, b) => b.count - a.count);
}
