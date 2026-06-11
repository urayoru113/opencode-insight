import { BoxRenderable, TextRenderable, TextAttributes, Box, Text, ScrollBoxRenderable } from "@opentui/core";
import type { CliRenderer, RGBA } from "@opentui/core";
import { getTimelineData, getMessageParts, type TimelineEntry } from "../../../lib/tokenStore";

export type View = "list" | "detail";

const BATCH_SIZE = 40;

export class TimelinePanel {
  private data: TimelineEntry[] = [];
  private prevCount = 0;
  private selectedIndex = 0;

  private borderChars = {
    topLeft: "🭽",
    topRight: "▏",
    bottomLeft: "▔",
    bottomRight: " ",
    leftT: "e",
    rightT: "f",
    topT: "g",
    bottomT: "h",
    horizontal: "▔",
    vertical: "▏",
    cross: "k",
  };

  constructor(
    private renderer: CliRenderer,
    private accent: RGBA,
    private textMuted: RGBA,
  ) {}

  /** Load data from DB. Returns true if count changed (needs re-render). */
  async loadData(sessionId: string): Promise<boolean> {
    const newData = await getTimelineData(sessionId);
    const changed = newData.length !== this.prevCount;
    this.data = newData;
    this.prevCount = newData.length;
    return changed;
  }

  /** Get current data count */
  getCount(): number {
    return this.data.length;
  }

  /** Get max selectable index */
  getMaxIndex(): number {
    return Math.max(0, this.data.length - 1);
  }

  /** Get selected index */
  getSelectedIndex(): number {
    return this.selectedIndex;
  }

  /** Set selected index */
  setSelectedIndex(idx: number): void {
    this.selectedIndex = idx;
  }

  /** Render the panel into the given container */
  async render(
    container: BoxRenderable,
    view: View,
    onEnterDetail: (idx: number) => Promise<void>,
    back: () => Promise<void>,
    isValid?: () => boolean,
  ): Promise<void> {
    if (view === "detail") {
      await this.renderDetail(container, back);
      return;
    }
    await this.renderList(container, onEnterDetail, isValid);
  }

  private async renderList(
    container: BoxRenderable,
    onEnterDetail: (idx: number) => Promise<void>,
    isValid?: () => boolean,
  ): Promise<void> {
    const data = this.data;
    const messageCount = data.filter((x) => x.type === "message").length;
    const toolCount = data.filter((x) => x.type === "tool").length;

    // Calculate totals
    const totalInput = data.reduce((sum, x) => sum + (x.inputTokens || 0), 0);
    const totalOutput = data.reduce((sum, x) => sum + (x.outputTokens || 0), 0);
    const totalCacheRead = data.reduce((sum, x) => sum + (x.cacheRead || 0), 0);
    const totalCacheWrite = data.reduce((sum, x) => sum + (x.cacheWrite || 0), 0);
    const totalCost = data.reduce((sum, x) => sum + (x.cost || 0), 0);
    const cacheInputRate =
      totalInput + totalCacheRead > 0 ? ((totalCacheRead / (totalInput + totalCacheRead)) * 100).toFixed(1) : "0";
    const cacheOutputRate =
      totalOutput + totalCacheWrite > 0 ? ((totalCacheWrite / (totalOutput + totalCacheWrite)) * 100).toFixed(1) : "0";

    // Summary line
    const summary = new TextRenderable(this.renderer, {
      content: [
        `Messages: ${messageCount}`,
        `Tools: ${toolCount}`,
        `In: ${this.fmtNum(totalInput)}`,
        `Out: ${this.fmtNum(totalOutput)}`,
        `CacheIn: ${this.fmtNum(totalCacheRead)} (${cacheInputRate}%)`,
        `CacheOut: ${this.fmtNum(totalCacheWrite)} (${cacheOutputRate}%)`,
        `Cost: $${this.fmtNum(totalCost)}`,
      ].join(" | "),
      marginTop: 2,
      marginLeft: 3,
      fg: this.textMuted,
    });
    container.add(summary);

    // Header row
    const headerRow = new BoxRenderable(this.renderer, {
      flexDirection: "row",
      height: 3,
      marginTop: 2,
      marginBottom: -1,
      marginLeft: 3,
      marginRight: 4,
    });
    const headers = ["#", "Time", "Type", "Agent/Tool", "Input", "Cache In", "Output", "Cost"];
    const colWidths: `${number}%`[] = ["5%", "16%", "7%", "22%", "11%", "11%", "11%", "17%"];
    headers.forEach((h, i) => {
      headerRow.add(
        Box(
          {
            flexGrow: 1,
            width: colWidths[i],
            height: 3,
            border: true,
            customBorderChars: this.borderChars,
            marginRight: -1,
            alignItems: "center",
          },
          Text({ content: h, fg: this.accent }),
        ),
      );
    });
    container.add(headerRow);

    // Data rows
    const rowsContainer = new ScrollBoxRenderable(this.renderer, {
      flexDirection: "row",
      viewportCulling: true,
      marginLeft: 3,
      paddingBottom: 1,
      scrollbarOptions: {
        width: 1,
      },
    });
    container.add(rowsContainer);

    for (let batchStart = 0; batchStart < data.length; batchStart += BATCH_SIZE) {
      if (isValid && !isValid()) return;

      const batchEnd = Math.min(batchStart + BATCH_SIZE, data.length);
      for (let idx = batchStart; idx < batchEnd; idx++) {
        if (isValid && !isValid()) return;

        const item = data[idx];
        const row = new BoxRenderable(this.renderer, {
          flexDirection: "row",
          height: 3,
          marginBottom: -1,
          marginRight: data.length > 18 ? 3 : 4,
        });

        const typeIcon = item.type === "message" ? "📃" : "🔧";
        const agentOrTool = item.type === "message" ? item.agent || "Unknown" : item.toolName || "Unknown";
        const input = item.type === "message" ? this.fmtNum(item.inputTokens || 0) : "-";
        const cacheIn = item.type === "message" ? this.fmtNum(item.cacheRead || 0) : "-";
        const output = item.type === "message" ? this.fmtNum(item.outputTokens || 0) : "-";
        const cost = item.type === "message" ? `$${this.fmtNum(item.cost || 0)}` : "-";

        const values = [
          `${idx}`,
          new Date(item.timestamp).toLocaleString(),
          typeIcon,
          agentOrTool,
          input,
          cacheIn,
          output,
          cost,
        ];
        values.forEach((val, i) => {
          row.add(
            Box(
              {
                flexGrow: 1,
                width: colWidths[i],
                border: true,
                customBorderChars: this.borderChars,
                marginRight: -1,
                alignItems: "center",
              },
              Text({ truncate: true, content: val }),
            ),
          );
        });

        row.onMouseOver = async () => {
          row.backgroundColor = "#24283b";
        };
        row.onMouseOut = async () => {
          row.backgroundColor = "#000000";
        };
        row.onMouseDown = async () => {
          this.selectedIndex = idx;
          await onEnterDetail(idx);
        };

        rowsContainer.add(row);
      }

      if (batchEnd < data.length) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        if (isValid && !isValid()) return;
      }
    }
  }

  private async renderDetail(container: BoxRenderable, back: () => Promise<void>): Promise<void> {
    const backBtn = new TextRenderable(this.renderer, {
      content: "← Back to Timeline",
      fg: this.accent,
    });
    backBtn.focusable = true;
    backBtn.onMouseDown = async () => {
      await back();
    };
    container.add(backBtn);

    const item = this.data[this.selectedIndex];
    if (!item) {
      container.add(
        new TextRenderable(this.renderer, {
          content: `Error: No item at index ${this.selectedIndex}`,
          fg: "red",
          marginTop: 1,
        }),
      );
      return;
    }

    if (item.type === "message") {
      await this.renderMessageDetail(container, item);
    } else {
      await this.renderToolDetail(container, item);
    }
  }

  private async renderMessageDetail(container: BoxRenderable, item: TimelineEntry): Promise<void> {
    // Agent info
    container.add(
      new TextRenderable(this.renderer, {
        content: `💬 Message | Agent: ${item.agent || "Unknown"} | Model: ${item.provider}/${item.model} | Role: ${item.role}`,
        fg: this.textMuted,
        marginTop: 1,
        marginLeft: 1,
      }),
    );

    // Token breakdown
    const cacheInputRate =
      (item.inputTokens || 0) + (item.cacheRead || 0) > 0
        ? (((item.cacheRead || 0) / ((item.inputTokens || 0) + (item.cacheRead || 0))) * 100).toFixed(1)
        : "0";
    const cacheOutputRate =
      (item.outputTokens || 0) + (item.cacheWrite || 0) > 0
        ? (((item.cacheWrite || 0) / ((item.outputTokens || 0) + (item.cacheWrite || 0))) * 100).toFixed(1)
        : "0";

    container.add(
      new TextRenderable(this.renderer, {
        content: `Input: ${this.fmtNum(item.inputTokens || 0)} | Output: ${this.fmtNum(item.outputTokens || 0)} | Reasoning: ${this.fmtNum(item.reasoningTokens || 0)}`,
        fg: this.textMuted,
        marginTop: 1,
        marginLeft: 1,
      }),
    );

    container.add(
      new TextRenderable(this.renderer, {
        content: `Cache In: ${this.fmtNum(item.cacheRead || 0)} (${cacheInputRate}%) | Cache Out: ${this.fmtNum(item.cacheWrite || 0)} (${cacheOutputRate}%)`,
        fg: this.textMuted,
        marginTop: 1,
        marginLeft: 1,
      }),
    );

    container.add(
      new TextRenderable(this.renderer, {
        content: `Total: ${this.fmtNum(item.totalTokens || 0)} | Cost: $${this.fmtNum(item.cost || 0)}`,
        fg: this.textMuted,
        marginTop: 1,
        marginLeft: 1,
      }),
    );

    // Time
    container.add(
      new TextRenderable(this.renderer, {
        content: `Time: ${new Date(item.timestamp).toLocaleString()}`,
        fg: this.textMuted,
        marginTop: 1,
        marginLeft: 1,
        marginBottom: 1,
      }),
    );

    // Fetch and display message content
    try {
      const parts = await getMessageParts(item.id);
      if (parts.length > 0) {
        const mergedContent = parts
          .map((part) => {
            const prefix = part.type === "reasoning" ? "🤔 Thinking:" : "💬 Output";
            return `${prefix}\n${part.text}`;
          })
          .join("\n\n───\n\n");

        container.add(
          new TextRenderable(this.renderer, {
            content: mergedContent,
            wrapMode: "word",
            marginTop: 1,
            marginLeft: 1,
            marginRight: 1,
            marginBottom: 1,
          }),
        );
      } else {
        container.add(
          new TextRenderable(this.renderer, {
            content: "(No content available)",
            fg: this.textMuted,
            marginTop: 1,
            marginLeft: 1,
          }),
        );
      }
    } catch (err) {
      container.add(
        new TextRenderable(this.renderer, {
          content: `Error loading content: ${err instanceof Error ? err.message : String(err)}`,
          fg: "red",
          marginTop: 1,
          marginLeft: 1,
        }),
      );
    }
  }

  private async renderToolDetail(container: BoxRenderable, item: TimelineEntry): Promise<void> {
    // Tool info
    const statusColor = item.status === "completed" ? "#9ece6a" : item.status === "error" ? "#f7768e" : this.accent;

    container.add(
      new TextRenderable(this.renderer, {
        content: `🔧 ${item.toolName}`,
        fg: this.accent,
        marginTop: 1,
        marginLeft: 1,
        attributes: TextAttributes.BOLD,
      }),
    );

    container.add(
      new TextRenderable(this.renderer, {
        content: `Status: ${item.status} | Call ID: ${item.callId || "N/A"}`,
        fg: statusColor,
        marginTop: 1,
        marginLeft: 1,
      }),
    );

    container.add(
      new TextRenderable(this.renderer, {
        content: `Time: ${new Date(item.timestamp).toLocaleString()}`,
        fg: this.textMuted,
        marginTop: 1,
        marginLeft: 1,
      }),
    );

    // Input
    if (item.toolInput && Object.keys(item.toolInput).length > 0) {
      container.add(
        new TextRenderable(this.renderer, {
          content: "📥 Input:",
          fg: this.accent,
          marginTop: 2,
          marginLeft: 1,
          attributes: TextAttributes.BOLD,
        }),
      );
      container.add(
        new TextRenderable(this.renderer, {
          content: JSON.stringify(item.toolInput, null, 2),
          wrapMode: "word",
          marginTop: 1,
          marginLeft: 1,
        }),
      );
    }

    // Output
    if (item.toolOutput) {
      container.add(
        new TextRenderable(this.renderer, {
          content: "📤 Output:",
          fg: this.accent,
          marginTop: 2,
          marginLeft: 1,
          attributes: TextAttributes.BOLD,
        }),
      );
      container.add(
        new TextRenderable(this.renderer, {
          content: item.toolOutput,
          wrapMode: "word",
          marginTop: 1,
          marginLeft: 1,
        }),
      );
    }
  }

  private fmtNum(n: number): string {
    return n.toLocaleString("en-US");
  }
}
