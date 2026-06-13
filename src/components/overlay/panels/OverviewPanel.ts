import { BoxRenderable, TextRenderable } from "@opentui/core";
import type { CliRenderer } from "@opentui/core";
import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import {
  getTokenUsage,
  getToolCallCount,
  type AccumulatedTokens,
  type RealTokenUsageEntry,
} from "../../../lib/apiDataSource";
import type { TimelinePanel } from "./TimelinePanel";

function getModelColor(api: TuiPluginApi, name: string): string {
  const t = api.theme.current;
  const palette = [t.primary, t.secondary, t.accent, t.success, t.warning, t.error, t.info, t.textMuted];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return palette[hash % palette.length].toString();
}

export class OverviewPanel {
  constructor(
    private renderer: CliRenderer,
    private api: TuiPluginApi,
    private sessionId: string,
  ) {}

  async render(
    contentArea: BoxRenderable,
    accumulatedTokens: AccumulatedTokens,
    timelinePanel: TimelinePanel,
  ): Promise<void> {
    const acc = accumulatedTokens;
    const hasRealData = acc.total > 0;

    // ── Fetch per-model data ──────────────────────────────────────────
    let modelEntries: Array<{ name: string; totalTokens: number; cost: number; count: number }> = [];
    let toolCount = 0;
    try {
      const tokenUsage = await getTokenUsage(this.api, this.sessionId);
      modelEntries = this.buildModelMap(tokenUsage);
      toolCount = await getToolCallCount(this.api, this.sessionId);
    } catch {
      // Gracefully degrade — keep existing accumulated data
    }

    // ── Metric Cards (2 rows × 3 columns) ─────────────────────────────
    const cards = this.buildCards(acc, hasRealData, timelinePanel, toolCount);

    const cardsWrapper = new BoxRenderable(this.renderer, {
      flexDirection: "column",
      marginTop: 1,
      marginLeft: 3,
      marginRight: 3,
    });
    contentArea.add(cardsWrapper);

    // 2 rows of 3 cards each
    const row1 = new BoxRenderable(this.renderer, {
      flexDirection: "row",
      height: 6,
      marginBottom: 1,
    });
    const row2 = new BoxRenderable(this.renderer, {
      flexDirection: "row",
      height: 6,
    });
    cardsWrapper.add(row1);
    cardsWrapper.add(row2);

    cards.slice(0, 3).forEach((card, idx) => this.renderCard(row1, card, idx, 3));
    cards.slice(3, 6).forEach((card, idx) => this.renderCard(row2, card, idx, 3));

    // // ── Token Distribution Bar ────────────────────────────────────────
    // this.renderSectionHeader(contentArea, "Token Distribution");
    // this.renderDistributionBar(contentArea, acc);

    // ── Model Usage ───────────────────────────────────────────────────
    if (modelEntries.length > 0) {
      this.renderSectionHeader(contentArea, "Model Usage");
      this.renderModelUsage(contentArea, modelEntries, acc.total);
    }

    // ── Cache Efficiency ──────────────────────────────────────────────
    this.renderSectionHeader(contentArea, "Cache Efficiency");
    this.renderCacheEfficiency(contentArea, acc);

    // ── Tool Call Stats ───────────────────────────────────────────────
    this.renderSectionHeader(contentArea, "Tool Calls");
    this.renderToolStats(contentArea, toolCount);
  }

  // ── Cards ───────────────────────────────────────────────────────────

  private buildCards(
    acc: AccumulatedTokens,
    hasRealData: boolean,
    timelinePanel: TimelinePanel,
    toolCount: number,
  ): Array<{ icon: string; title: string; value: string; subtitle: string; color: import("@opentui/core").RGBA }> {
    const cacheInputRate =
      acc.input + acc.cacheRead > 0 ? ((acc.cacheRead / (acc.input + acc.cacheRead)) * 100).toFixed(1) : "0";

    return [
      {
        icon: "🪙",
        title: "Total Tokens",
        value: hasRealData ? this.fmtNum(acc.total) : "0",
        subtitle: `${this.fmtNum(acc.input)} in / ${this.fmtNum(acc.output)} out`,
        color: this.api.theme.current.accent,
      },
      {
        icon: "💰",
        title: "Cost",
        value: hasRealData ? `$${this.fmtNum(acc.cost)}` : "$0",
        subtitle: "USD",
        color: this.api.theme.current.success,
      },
      {
        icon: "📥",
        title: "Input",
        value: hasRealData ? this.fmtNum(acc.input) : "0",
        subtitle: `${this.fmtNum(acc.cacheRead)} cached (${cacheInputRate}%)`,
        color: this.api.theme.current.info,
      },
      {
        icon: "📤",
        title: "Output",
        value: hasRealData ? this.fmtNum(acc.output) : "0",
        subtitle: `${this.fmtNum(acc.cacheWrite)} cached`,
        color: this.api.theme.current.warning,
      },
      {
        icon: "🧠",
        title: "Reasoning",
        value: hasRealData ? this.fmtNum(acc.reasoning) : "0",
        subtitle: `${((acc.total > 0 ? acc.reasoning / acc.total : 0) * 100).toFixed(1)}% of total`,
        color: this.api.theme.current.accent,
      },
      {
        icon: "🔧",
        title: "Tool Calls",
        value: toolCount > 0 ? this.fmtNum(toolCount) : "0",
        subtitle: `${timelinePanel.getCount()} timeline entries`,
        color: this.api.theme.current.secondary,
      },
    ];
  }

  private renderCard(
    row: BoxRenderable,
    card: { icon: string; title: string; value: string; subtitle: string; color: import("@opentui/core").RGBA },
    idx: number,
    total: number,
  ): void {
    const cardBox = new BoxRenderable(this.renderer, {
      flexDirection: "column",
      flexGrow: 1,
      marginRight: idx < total - 1 ? 1 : 0,
      border: true,
      borderColor: this.api.theme.current.borderSubtle,
      backgroundColor: this.api.theme.current.backgroundPanel,
    });

    // Icon + title in one line
    const header = new TextRenderable(this.renderer, {
      content: `${card.icon} ${card.title}`,
      fg: card.color,
      marginTop: 1,
      marginLeft: 1,
      marginRight: 1,
    });
    cardBox.add(header);

    // Value (large)
    const valueText = new TextRenderable(this.renderer, {
      content: card.value,
      fg: this.api.theme.current.text,
      marginTop: 1,
      marginLeft: 1,
      marginRight: 1,
    });
    cardBox.add(valueText);

    // Subtitle
    const subtitleText = new TextRenderable(this.renderer, {
      content: card.subtitle,
      fg: this.api.theme.current.textMuted,
      marginTop: 1,
      marginLeft: 1,
      marginRight: 1,
      marginBottom: 1,
    });
    cardBox.add(subtitleText);

    cardBox.focusable = true;
    row.add(cardBox);
  }

  // ── Section Header ──────────────────────────────────────────────────

  private renderSectionHeader(parent: BoxRenderable, title: string): void {
    const header = new TextRenderable(this.renderer, {
      content: `▸ ${title}`,
      fg: this.api.theme.current.accent,
      marginTop: 2,
      marginLeft: 3,
      marginBottom: 1,
    });
    parent.add(header);
  }

  // ── Token Distribution Bar ────────────────────────────────────────

  private renderDistributionBar(parent: BoxRenderable, acc: AccumulatedTokens): void {
    const total = acc.total || 1; // avoid div by zero
    const barWidth = 30;

    const segments = [
      { label: "Input", value: acc.input, color: this.api.theme.current.info },
      { label: "Output", value: acc.output, color: this.api.theme.current.warning },
      { label: "Reasoning", value: acc.reasoning, color: this.api.theme.current.accent },
      { label: "Cache", value: acc.cacheRead + acc.cacheWrite, color: this.api.theme.current.success },
    ];

    const barBox = new BoxRenderable(this.renderer, {
      flexDirection: "column",
      marginLeft: 3,
      marginRight: 3,
    });
    parent.add(barBox);

    // Stacked bar
    const barRow = new BoxRenderable(this.renderer, {
      flexDirection: "row",
      marginBottom: 1,
    });
    barBox.add(barRow);

    let currentPos = 0;
    const totalSegs = segments.length;
    for (let i = 0; i < totalSegs; i++) {
      const seg = segments[i];
      const ratio = seg.value / total;
      const segWidth = Math.round(ratio * barWidth);
      if (segWidth > 0) {
        const segText = new TextRenderable(this.renderer, {
          content: this.barChars(segWidth),
          fg: seg.color,
          marginLeft: 1,
        });
        barRow.add(segText);
      }
      currentPos += segWidth;
    }
    // Pad remaining
    if (currentPos < barWidth) {
      const padText = new TextRenderable(this.renderer, {
        content: this.barChars(barWidth - currentPos),
        fg: this.api.theme.current.backgroundElement,
      });
      barRow.add(padText);
    }

    // Legend
    const legend = new TextRenderable(this.renderer, {
      content: segments
        .map((s) => `${s.label}: ${((s.value / total) * 100).toFixed(1)}% (${this.fmtNum(s.value)})`)
        .join("  |  "),
      fg: this.api.theme.current.textMuted,
    });
    barBox.add(legend);
  }

  // ── Model Usage ─────────────────────────────────────────────────────

  private renderModelUsage(
    parent: BoxRenderable,
    entries: Array<{ name: string; totalTokens: number; cost: number; count: number }>,
    grandTotal: number,
  ): void {
    const container = new BoxRenderable(this.renderer, {
      flexDirection: "column",
      marginLeft: 3,
      marginRight: 3,
    });
    parent.add(container);

    const barWidth = 25;
    for (const entry of entries) {
      const ratio = grandTotal > 0 ? entry.totalTokens / grandTotal : 0;
      const filled = Math.round(ratio * barWidth);
      const bar = this.barChars(filled) + this.emptyChars(barWidth - filled);
      const pct = (ratio * 100).toFixed(1);
      const color = getModelColor(this.api, entry.name);

      const row = new TextRenderable(this.renderer, {
        content: `● ${entry.name.padEnd(28)} ${bar}  ${this.fmtNum(entry.totalTokens)} (${pct}%)`,
        fg: this.api.theme.current.textMuted,
        marginBottom: 1,
      });
      container.add(row);

      // Color the dot
      (row as any).fgMap = [{ start: 0, end: 1, fg: color }];
    }
  }

  // ── Cache Efficiency ──────────────────────────────────────────────

  private renderCacheEfficiency(parent: BoxRenderable, acc: AccumulatedTokens): void {
    const container = new BoxRenderable(this.renderer, {
      flexDirection: "column",
      marginLeft: 3,
      marginRight: 3,
    });
    parent.add(container);

    const barWidth = 25;

    // Input cache hit
    const inputTotal = acc.input + acc.cacheRead;
    const inputRate = inputTotal > 0 ? acc.cacheRead / inputTotal : 0;
    const inputBar =
      this.barChars(Math.round(inputRate * barWidth)) + this.emptyChars(barWidth - Math.round(inputRate * barWidth));
    container.add(
      new TextRenderable(this.renderer, {
        content: `Input Cache:  ${inputBar}  ${(inputRate * 100).toFixed(1)}% (${this.fmtNum(acc.cacheRead)} / ${this.fmtNum(inputTotal)})`,
        fg: this.api.theme.current.textMuted,
        marginBottom: 1,
      }),
    );

    // Output cache hit
    const outputTotal = acc.output + acc.cacheWrite;
    const outputRate = outputTotal > 0 ? acc.cacheWrite / outputTotal : 0;
    const outputBar =
      this.barChars(Math.round(outputRate * barWidth)) + this.emptyChars(barWidth - Math.round(outputRate * barWidth));

    container.add(
      new TextRenderable(this.renderer, {
        content: `Output Cache: ${outputBar}  ${(outputRate * 100).toFixed(1)}% (${this.fmtNum(acc.cacheWrite)} / ${this.fmtNum(outputTotal)})`,
        fg: this.api.theme.current.textMuted,
        marginBottom: 1,
      }),
    );

    // Color the bars (using a separate colored row for each bar)
    // We can overwrite the above with more precise rendering if needed,
    // but for now plain text is clean.
  }

  // ── Tool Call Stats ───────────────────────────────────────────────

  private renderToolStats(parent: BoxRenderable, count: number): void {
    const container = new BoxRenderable(this.renderer, {
      flexDirection: "column",
      marginLeft: 3,
      marginRight: 3,
      marginBottom: 2,
    });
    parent.add(container);

    container.add(
      new TextRenderable(this.renderer, {
        content: count > 0 ? `Total tool calls: ${this.fmtNum(count)}` : "No tool calls in this session",
        fg: this.api.theme.current.textMuted,
      }),
    );
  }

  // ── Helpers ─────────────────────────────────────────────────────────

  private buildModelMap(
    tokenUsage: RealTokenUsageEntry[],
  ): Array<{ name: string; totalTokens: number; cost: number; count: number }> {
    const map = new Map<string, { totalTokens: number; cost: number; count: number }>();
    for (const entry of tokenUsage) {
      const name = entry.model || "unknown";
      const existing = map.get(name) || { totalTokens: 0, cost: 0, count: 0 };
      existing.totalTokens += entry.totalTokens;
      existing.cost += entry.cost;
      existing.count++;
      map.set(name, existing);
    }
    return Array.from(map.entries())
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.totalTokens - a.totalTokens);
  }

  private barChars(n: number): string {
    return "█".repeat(Math.max(0, n));
  }

  private emptyChars(n: number): string {
    return "░".repeat(Math.max(0, n));
  }

  private fmtNum(n: number): string {
    return n.toLocaleString("en-US");
  }
}
