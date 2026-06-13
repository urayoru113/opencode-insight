import { BoxRenderable, TextRenderable, TextAttributes, Box, Text, ScrollBoxRenderable } from "@opentui/core";
import type { CliRenderer } from "@opentui/core";
import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import { getTimelineData, getMessageParts, type TimelineEntry } from "../../../lib/apiDataSource";

export type View = "list" | "detail";

const BATCH_SIZE = 20;

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
    private api: TuiPluginApi,
  ) {}

  /** Load data from API. Returns true if count changed (needs re-render). */
  async loadData(sessionId: string): Promise<boolean> {
    const newData = await getTimelineData(this.api, sessionId);
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
    const summaryBox = new BoxRenderable(this.renderer, {
      flexDirection: "column",
      marginTop: 1,
      marginLeft: 2,
      marginRight: 1,
      paddingLeft: 2,
      height: 4,
      borderStyle: "double",
    });

    const row1 = new BoxRenderable(this.renderer, { flexDirection: "row" });
    const row2 = new BoxRenderable(this.renderer, { flexDirection: "row" });

    const summaryItems = [
      ["Total", data.length],
      ["Messages", messageCount],
      ["Tools", toolCount],
      ["In", this.fmtNum(totalInput)],
      ["Out", this.fmtNum(totalOutput)],
      ["CacheIn", `${this.fmtNum(totalCacheRead)} (${cacheInputRate}%)`],
      ["CacheOut", `${this.fmtNum(totalCacheWrite)} (${cacheOutputRate}%)`],
      ["Cost", `$${this.fmtNum(totalCost)}`],
    ];

    summaryItems.forEach(([label, value], idx) => {
      const targetRow = idx < 4 ? row1 : row2;

      targetRow.add(
        new TextRenderable(this.renderer, {
          content: `${label}: `,
        }),
      );
      targetRow.add(
        new TextRenderable(this.renderer, {
          content: `${value}`,
          fg: this.api.theme.current.syntaxNumber,
        }),
      );

      if (idx < summaryItems.length - 1 && idx !== 3) {
        targetRow.add(new TextRenderable(this.renderer, { content: " | " }));
      }
    });

    summaryBox.add(row1);
    summaryBox.add(row2);
    container.add(summaryBox);

    // Header row
    const headerBar = new BoxRenderable(this.renderer, {
      height: 3,
      marginTop: 2,
      marginLeft: 3,
      paddingRight: 2,
      marginRight: 2,
      border: ["top", "left", "right"],
      borderStyle: "rounded",
      zIndex: 1,
      flexDirection: "row",
    });
    const headers = ["#", "Time", "Type", "Agent/Tool", "Input", "Cache In", "Output", "Cost"];
    const colWidths: `${number}%`[] = ["5%", "17%", "5%", "23%", "13%", "13%", "13%", "11%"];
    headers.forEach((h, i) => {
      headerBar.add(
        Box(
          {
            width: colWidths[i],
            height: 3,
            border: i == 0 ? ["right"] : ["left"],
            marginRight: -1,
            alignItems: "center",
            zIndex: 2,
            flexGrow: 1,
            customBorderChars: {
              topLeft: i === 0 ? "╭" : "┬",
              topRight: "╮",
              bottomLeft: "│",
              bottomRight: "│",
              leftT: "e",
              rightT: "f",
              topT: "g",
              bottomT: "h",
              horizontal: "─",
              vertical: "│",
              cross: "k",
            },
          },
          Text({ content: h, fg: this.api.theme.current.accent, paddingTop: 1 }),
        ),
      );
    });
    container.add(headerBar);

    // Data rows
    const rowsContainer = new ScrollBoxRenderable(this.renderer, {
      flexDirection: "row",
      viewportCulling: true,
      border: ["left", "right", "bottom"],
      borderStyle: "rounded",
      marginLeft: 3,
      marginRight: 2,
      zIndex: 2,
      paddingBottom: -1,
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
          marginRight: data.length > 16 ? 1 : 2,
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
                border: i == 0 ? ["right"] : ["left"],
                marginRight: -1,
                alignItems: "center",
              },
              Text({ truncate: true, content: val, paddingTop: 1 }),
            ),
          );
        });

        row.onMouseOver = async () => {
          row.backgroundColor = "#285f9f";
        };
        row.onMouseOut = async () => {
          row.backgroundColor =
            idx % 2 == 0 ? this.api.theme.current.backgroundElement : this.api.theme.current.background;
        };
        row.onMouseDown = async () => {
          this.selectedIndex = idx;
          await onEnterDetail(idx);
        };

        row.backgroundColor =
          idx % 2 == 0 ? this.api.theme.current.backgroundElement : this.api.theme.current.background;
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
      fg: this.api.theme.current.accent,
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
        fg: this.api.theme.current.textMuted,
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
        fg: this.api.theme.current.textMuted,
        marginTop: 1,
        marginLeft: 1,
      }),
    );

    container.add(
      new TextRenderable(this.renderer, {
        content: `Cache In: ${this.fmtNum(item.cacheRead || 0)} (${cacheInputRate}%) | Cache Out: ${this.fmtNum(item.cacheWrite || 0)} (${cacheOutputRate}%)`,
        fg: this.api.theme.current.textMuted,
        marginTop: 1,
        marginLeft: 1,
      }),
    );

    container.add(
      new TextRenderable(this.renderer, {
        content: `Total: ${this.fmtNum(item.totalTokens || 0)} | Cost: $${this.fmtNum(item.cost || 0)}`,
        fg: this.api.theme.current.textMuted,
        marginTop: 1,
        marginLeft: 1,
      }),
    );

    // Time
    container.add(
      new TextRenderable(this.renderer, {
        content: `Time: ${new Date(item.timestamp).toLocaleString()}`,
        fg: this.api.theme.current.textMuted,
        marginTop: 1,
        marginLeft: 1,
        marginBottom: 1,
      }),
    );

    // Fetch and display message content
    try {
      const parts = await getMessageParts(this.api, item.id);
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
            fg: this.api.theme.current.textMuted,
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
    const statusColor =
      item.status === "completed" ? "#9ece6a" : item.status === "error" ? "#f7768e" : this.api.theme.current.accent;

    container.add(
      new TextRenderable(this.renderer, {
        content: `🔧 ${item.toolName}`,
        fg: this.api.theme.current.accent,
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
        fg: this.api.theme.current.textMuted,
        marginTop: 1,
        marginLeft: 1,
      }),
    );

    // Input
    if (item.toolInput && Object.keys(item.toolInput).length > 0) {
      container.add(
        new TextRenderable(this.renderer, {
          content: "📥 Input:",
          fg: this.api.theme.current.accent,
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
          fg: this.api.theme.current.accent,
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
