import { BoxRenderable, TextRenderable } from "@opentui/core";
import type { CliRenderer } from "@opentui/core";
import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import {
  getTokenUsage,
  getToolCallCount,
  getToolUsageStats,
  getMessageCount,
  getAgentUsageStats,
  type AccumulatedTokens,
  type RealTokenUsageEntry,
} from "../../../lib/apiDataSource";
import { fmtNum, itemColor, miniBar, truncate } from "../../../lib/uiHelpers";

interface MetricCard {
  icon: string;
  title: string;
  value: string;
  subtitle: string;
  color: import("@opentui/core").RGBA;
}

interface ListStat {
  name: string;
  count: number;
}

export class OverviewPanel {
  constructor(
    private renderer: CliRenderer,
    private api: TuiPluginApi,
    private sessionId: string,
  ) {}

  render(contentArea: BoxRenderable, accumulatedTokens: AccumulatedTokens): void {
    const acc = accumulatedTokens;
    const hasRealData = acc.total > 0;

    const tokenUsage = getTokenUsage(this.api, this.sessionId);
    const modelEntries = this.buildModelMap(tokenUsage);
    const toolCount = getToolCallCount(this.api, this.sessionId);
    const toolStats = getToolUsageStats(this.api, this.sessionId);
    const agentStats = getAgentUsageStats(this.api, this.sessionId);
    const messageCount = getMessageCount(this.api, this.sessionId);

    const cards = this.buildCards(acc, hasRealData, toolCount, messageCount);

    const cardsWrapper = new BoxRenderable(this.renderer, {
      flexDirection: "column",
      marginTop: 1,
      marginLeft: 3,
      marginRight: 3,
    });
    contentArea.add(cardsWrapper);

    const row1 = new BoxRenderable(this.renderer, {
      flexDirection: "row",
      height: 7,
      marginBottom: 1,
    });
    const row2 = new BoxRenderable(this.renderer, {
      flexDirection: "row",
      height: 7,
    });
    cardsWrapper.add(row1);
    cardsWrapper.add(row2);

    cards.slice(0, 3).forEach((card, idx) => this.renderCard(row1, card, idx, 3));
    cards.slice(3, 6).forEach((card, idx) => this.renderCard(row2, card, idx, 3));

    const listsWrapper = new BoxRenderable(this.renderer, {
      flexDirection: "row",
      marginTop: 1,
      marginLeft: 3,
      marginRight: 3,
    });
    contentArea.add(listsWrapper);

    this.renderListBox(
      listsWrapper,
      "Agents",
      agentStats.map((s) => ({ name: s.agentName, count: s.count })),
    );
    this.renderListBox(
      listsWrapper,
      "Tool Calls",
      toolStats.map((s) => ({ name: s.toolName, count: s.count })),
    );

    if (modelEntries.length > 0) {
      this.renderListBox(
        listsWrapper,
        "Model Usage",
        modelEntries.map((e) => ({ name: e.name, count: e.totalTokens })),
        8,
        20,
      );
    }
  }

  private buildCards(
    acc: AccumulatedTokens,
    hasRealData: boolean,
    toolCount: number,
    messageCount: number,
  ): MetricCard[] {
    const avgTokens = messageCount > 0 ? Math.round(acc.total / messageCount) : 0;

    return [
      {
        icon: "🪙",
        title: "Total Tokens",
        value: hasRealData ? fmtNum(acc.total) : "0",
        subtitle: hasRealData ? `${fmtNum(acc.input)} / ${fmtNum(acc.output)}` : "0 / 0",
        color: this.api.theme.current.accent,
      },
      {
        icon: "📦",
        title: "Cache",
        value: hasRealData ? fmtNum(acc.cacheRead + acc.cacheWrite) : "0",
        subtitle: hasRealData
          ? `in: ${fmtNum(acc.cacheRead)} / out: ${fmtNum(acc.cacheWrite)}`
          : "in: 0 / out: 0",
        color: this.api.theme.current.info,
      },
      {
        icon: "💰",
        title: "Cost",
        value: hasRealData ? `$${acc.cost.toFixed(4)}` : "$0",
        subtitle: "USD",
        color: this.api.theme.current.success,
      },
      {
        icon: "🔧",
        title: "Tool Calls",
        value: toolCount > 0 ? fmtNum(toolCount) : "0",
        subtitle: toolCount > 0 ? `${fmtNum(toolCount)} calls` : "No calls",
        color: this.api.theme.current.warning,
      },
      {
        icon: "💬",
        title: "Messages",
        value: messageCount > 0 ? fmtNum(messageCount) : "0",
        subtitle: `${messageCount} messages`,
        color: this.api.theme.current.secondary,
      },
      {
        icon: "📊",
        title: "Avg Tokens",
        value: fmtNum(avgTokens),
        subtitle: "tokens / message",
        color: this.api.theme.current.accent,
      },
    ];
  }

  private renderCard(row: BoxRenderable, card: MetricCard, idx: number, total: number): void {
    const cardBox = new BoxRenderable(this.renderer, {
      flexDirection: "column",
      flexGrow: 1,
      marginRight: idx < total - 1 ? 1 : 0,
      border: true,
      borderColor: this.api.theme.current.borderSubtle,
      backgroundColor: this.api.theme.current.backgroundPanel,
    });

    const header = new TextRenderable(this.renderer, {
      content: `${card.icon} ${card.title}`,
      fg: card.color,
      marginTop: 1,
      marginLeft: 1,
      marginRight: 1,
      truncate: true,
    });
    cardBox.add(header);

    const valueText = new TextRenderable(this.renderer, {
      content: card.value,
      fg: this.api.theme.current.text,
      marginTop: 1,
      marginLeft: 1,
      marginRight: 1,
      truncate: true,
    });
    cardBox.add(valueText);

    const subtitleText = new TextRenderable(this.renderer, {
      content: card.subtitle,
      fg: this.api.theme.current.textMuted,
      marginTop: 1,
      marginLeft: 1,
      marginRight: 1,
      marginBottom: 1,
      truncate: true,
    });
    cardBox.add(subtitleText);

    cardBox.focusable = true;
    row.add(cardBox);
  }

  private renderListBox(
    parent: BoxRenderable,
    title: string,
    stats: ListStat[],
    maxItems = 5,
    maxNameLen = 10,
  ): void {
    const wrapper = new BoxRenderable(this.renderer, {
      flexDirection: "column",
      flexGrow: 1,
    });
    parent.add(wrapper);

    const header = new TextRenderable(this.renderer, {
      content: `▸ ${title}`,
      fg: this.api.theme.current.accent,
      marginTop: 2,
      marginBottom: 1,
      truncate: true,
    });
    wrapper.add(header);

    const container = new BoxRenderable(this.renderer, {
      flexDirection: "column",
    });
    wrapper.add(container);

    const totalCount = stats.reduce((sum, s) => sum + (s.count || 0), 0);

    if (stats.length === 0 || totalCount === 0) {
      container.add(
        new TextRenderable(this.renderer, {
          content: "None",
          fg: this.api.theme.current.textMuted,
          marginBottom: 1,
          truncate: true,
        }),
      );
      return;
    }

    const maxCount = Math.max(...stats.map((s) => s.count), 1);
    const display = stats.slice(0, maxItems);
    const others = stats.slice(maxItems);

    for (const stat of display) {
      const name = String(stat.name ?? "unknown");
      const shortName = truncate(name, maxNameLen);
      const bar = miniBar(stat.count, maxCount, 8);
      const pct = totalCount > 0 ? Math.min((stat.count / totalCount) * 100, 100).toFixed(1) : "0";
      const color = itemColor(name);

      const rowBox = new BoxRenderable(this.renderer, {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 1,
        height: 1,
      });
      container.add(rowBox);

      rowBox.add(
        new TextRenderable(this.renderer, {
          content: `● ${shortName}`,
          fg: color,
        }),
      );

      rowBox.add(
        new TextRenderable(this.renderer, {
          content: ` ${bar} `,
          fg: this.api.theme.current.textMuted,
        }),
      );

      rowBox.add(
        new TextRenderable(this.renderer, {
          content: `${fmtNum(stat.count)} (${pct}%)`,
          fg: this.api.theme.current.textMuted,
        }),
      );
    }

    if (others.length > 0) {
      const othersCount = others.reduce((sum, s) => sum + s.count, 0);
      const othersPct = totalCount > 0 ? Math.min((othersCount / totalCount) * 100, 100).toFixed(1) : "0";

      const rowBox = new BoxRenderable(this.renderer, {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 1,
        height: 1,
      });
      container.add(rowBox);

      rowBox.add(
        new TextRenderable(this.renderer, {
          content: `● ... others`,
          fg: this.api.theme.current.textMuted,
        }),
      );

      rowBox.add(
        new TextRenderable(this.renderer, {
          content: ` ${"░".repeat(8)} `,
          fg: this.api.theme.current.textMuted,
        }),
      );

      rowBox.add(
        new TextRenderable(this.renderer, {
          content: `${fmtNum(othersCount)} (${othersPct}%)`,
          fg: this.api.theme.current.textMuted,
        }),
      );
    }
  }

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
}
