import { BoxRenderable, TextRenderable, TextAttributes, ScrollBoxRenderable } from "@opentui/core";
import type { CliRenderer } from "@opentui/core";
import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import { getTimelineData, getMessageParts, type TimelineEntry } from "../../../lib/apiDataSource";
import { fmtNum } from "../../../lib/uiHelpers";

export type View = "list" | "detail";

const BATCH_SIZE = 20;
const HEADERS = ["#", "Time", "Type", "Agent/Tool", "Input", "Cache In", "Output", "Cost"];
const COL_WIDTHS: `${number}%`[] = ["5%", "17%", "5%", "23%", "13%", "13%", "13%", "11%"];

export class TimelinePanel {
  private data: TimelineEntry[] = [];
  private prevCount = 0;
  private selectedIndex = 0;

  constructor(
    private renderer: CliRenderer,
    private api: TuiPluginApi,
  ) {}

  /** Load data from API. Returns true if count changed (needs re-render). */
  loadData(sessionId: string): boolean {
    const newData = getTimelineData(this.api, sessionId);
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
      this.renderDetail(container, back);
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

    this.renderSummary(container, data);
    this.renderHeader(container);
    await this.renderRows(container, data, onEnterDetail, isValid);
  }

  private renderSummary(container: BoxRenderable, data: TimelineEntry[]): void {
    const messageCount = data.filter((x) => x.type === "message").length;
    const toolCount = data.filter((x) => x.type === "tool").length;

    const totalInput = data.reduce((sum, x) => sum + (x.inputTokens || 0), 0);
    const totalOutput = data.reduce((sum, x) => sum + (x.outputTokens || 0), 0);
    const totalCacheRead = data.reduce((sum, x) => sum + (x.cacheRead || 0), 0);
    const totalCacheWrite = data.reduce((sum, x) => sum + (x.cacheWrite || 0), 0);
    const totalCost = data.reduce((sum, x) => sum + (x.cost || 0), 0);

    const cacheInputRate =
      totalInput + totalCacheRead > 0
        ? ((totalCacheRead / (totalInput + totalCacheRead)) * 100).toFixed(1)
        : "0";
    const cacheOutputRate =
      totalOutput + totalCacheWrite > 0
        ? ((totalCacheWrite / (totalOutput + totalCacheWrite)) * 100).toFixed(1)
        : "0";

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
      ["In", fmtNum(totalInput)],
      ["Out", fmtNum(totalOutput)],
      ["CacheIn", `${fmtNum(totalCacheRead)} (${cacheInputRate}%)`],
      ["CacheOut", `${fmtNum(totalCacheWrite)} (${cacheOutputRate}%)`],
      ["Cost", `$${fmtNum(totalCost)}`],
    ];

    summaryItems.forEach(([label, value], idx) => {
      const targetRow = idx < 4 ? row1 : row2;

      targetRow.add(
        new TextRenderable(this.renderer, {
          content: `${label}: `,
          truncate: true,
        }),
      );
      targetRow.add(
        new TextRenderable(this.renderer, {
          content: `${value}`,
          fg: this.api.theme.current.syntaxNumber,
          truncate: true,
        }),
      );

      if (idx < summaryItems.length - 1 && idx !== 3) {
        targetRow.add(new TextRenderable(this.renderer, { content: " | ", truncate: true }));
      }
    });

    summaryBox.add(row1);
    summaryBox.add(row2);
    container.add(summaryBox);
  }

  private renderHeader(container: BoxRenderable): void {
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

    HEADERS.forEach((h, i) => {
      const cell = new BoxRenderable(this.renderer, {
        width: COL_WIDTHS[i],
        height: 3,
        border: i === 0 ? ["right"] : ["left"],
        marginRight: -1,
        alignItems: "center",
        zIndex: 2,
        customBorderChars: {
          topLeft: i === 0 ? "╭" : "┬",
          topRight: "╮",
          bottomLeft: "├",
          bottomRight: "┤",
          leftT: "├",
          rightT: "┤",
          topT: "┬",
          bottomT: "┴",
          horizontal: "─",
          vertical: "│",
          cross: "┼",
        },
      });

      cell.add(
        new TextRenderable(this.renderer, {
          content: h,
          fg: this.api.theme.current.accent,
          truncate: true,
          marginTop: 1,
        }),
      );

      headerBar.add(cell);
    });
    container.add(headerBar);
  }

  private async renderRows(
    container: BoxRenderable,
    data: TimelineEntry[],
    onEnterDetail: (idx: number) => Promise<void>,
    isValid?: () => boolean,
  ): Promise<void> {
    const rowsContainer: ScrollBoxRenderable = new ScrollBoxRenderable(this.renderer, {
      flexDirection: "row",
      viewportCulling: true,
      border: ["left", "right", "bottom"],
      borderStyle: "rounded",
      marginLeft: 3,
      marginRight: 2,
      zIndex: 2,
      paddingBottom: -1,
      scrollbarOptions: {
        onSizeChange: () => {
          rowsContainer.paddingRight = data.length * 2 > rowsContainer.height ? 0 : 1;
        },
        width: 1,
      },
    });
    container.add(rowsContainer);

    for (let batchStart = 0; batchStart < data.length; batchStart += BATCH_SIZE) {
      if (isValid && !isValid()) return;

      const batchEnd = Math.min(batchStart + BATCH_SIZE, data.length);
      for (let idx = batchStart; idx < batchEnd; idx++) {
        if (isValid && !isValid()) return;

        const row = this.buildRow(data[idx], idx, onEnterDetail);
        rowsContainer.add(row);
      }
      if (batchEnd < data.length) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        if (isValid && !isValid()) return;
      }
    }

    setTimeout(() => {
      if (isValid && !isValid()) return;
    }, 0);
  }

  private buildRow(
    item: TimelineEntry,
    idx: number,
    onEnterDetail: (idx: number) => Promise<void>,
  ): BoxRenderable {
    const t = this.api.theme.current;
    const typeIcon = item.type === "message" ? "📃" : "🔧";
    const agentOrTool = item.type === "message" ? item.agent || "Unknown" : item.toolName || "Unknown";
    const input = item.type === "message" ? fmtNum(item.inputTokens || 0) : "-";
    const cacheIn = item.type === "message" ? fmtNum(item.cacheRead || 0) : "-";
    const output = item.type === "message" ? fmtNum(item.outputTokens || 0) : "-";
    const cost = item.type === "message" ? `$${fmtNum(item.cost || 0)}` : "-";

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

    const row = new BoxRenderable(this.renderer, {
      flexDirection: "row",
      height: 3,
      marginBottom: -1,
      marginRight: 1,
    });

    values.forEach((val, i) => {
      const cell = new BoxRenderable(this.renderer, {
        width: COL_WIDTHS[i],
        height: 3,
        border: i === 0 ? ["right"] : ["left"],
        marginRight: -1,
        alignItems: "center",
        paddingRight: 2,
      });

      cell.add(
        new TextRenderable(this.renderer, {
          content: String(val),
          truncate: true,
          fg: i === 3 ? t.text : undefined,
        }),
      );

      row.add(cell);
    });

    row.onMouseOver = () => {
      row.backgroundColor = t.accent;
    };
    row.onMouseOut = () => {
      row.backgroundColor = idx % 2 == 0 ? t.backgroundElement : t.background;
    };
    row.onMouseDown = async () => {
      this.selectedIndex = idx;
      await onEnterDetail(idx);
    };

    row.backgroundColor = idx % 2 == 0 ? t.backgroundElement : t.background;
    return row;
  }

  private renderDetail(container: BoxRenderable, back: () => Promise<void>): void {
    const backBtn = new TextRenderable(this.renderer, {
      content: "← Back to Timeline",
      fg: this.api.theme.current.accent,
    });
    backBtn.focusable = true;
    backBtn.onMouseDown = async () => {
      await back();
    };
    container.add(backBtn);

    setTimeout(() => backBtn.focus(), 0);

    const item = this.data[this.selectedIndex];
    if (!item) {
      container.add(
        new TextRenderable(this.renderer, {
          content: `Error: No item at index ${this.selectedIndex}`,
          fg: this.api.theme.current.error,
          marginTop: 1,
        }),
      );
      return;
    }

    if (item.type === "message") {
      this.renderMessageDetail(container, item);
    } else {
      this.renderToolDetail(container, item);
    }
  }

  private renderMessageDetail(container: BoxRenderable, item: TimelineEntry): void {
    const t = this.api.theme.current;

    const infoCard = new BoxRenderable(this.renderer, {
      flexDirection: "column",
      marginTop: 1,
      marginLeft: 1,
      marginRight: 1,
      marginBottom: 1,
      height: 6,
      border: true,
      borderStyle: "rounded",
      borderColor: t.borderSubtle,
      backgroundColor: t.backgroundPanel,
    });

    this.addDetailLine(infoCard, "💬 Message", undefined, t.text, undefined, TextAttributes.BOLD);

    const cacheInputRate =
      (item.inputTokens || 0) + (item.cacheRead || 0) > 0
        ? (((item.cacheRead || 0) / ((item.inputTokens || 0) + (item.cacheRead || 0))) * 100).toFixed(1)
        : "0";
    const cacheOutputRate =
      (item.outputTokens || 0) + (item.cacheWrite || 0) > 0
        ? (((item.cacheWrite || 0) / ((item.outputTokens || 0) + (item.cacheWrite || 0))) * 100).toFixed(1)
        : "0";

    this.addDetailGridRow(infoCard, [
      { label: "👤 Agent", value: item.agent || "Unknown", fg: t.accent },
      { label: "🤖 Model", value: `${item.provider}/${item.model}`, fg: t.info },
      { label: "🎭 Role", value: item.role, fg: t.textMuted },
      { label: "📥 Input", value: fmtNum(item.inputTokens || 0), fg: t.warning },
    ]);
    this.addDetailGridRow(infoCard, [
      { label: "📤 Output", value: fmtNum(item.outputTokens || 0), fg: t.info },
      { label: "💭 Reasoning", value: fmtNum(item.reasoningTokens || 0), fg: t.secondary },
      {
        label: "💾 Cache In",
        value: `${fmtNum(item.cacheRead || 0)} (${cacheInputRate}%)`,
        fg: t.warning,
        valueFg: t.warning,
      },
      {
        label: "🗄️ Cache Out",
        value: `${fmtNum(item.cacheWrite || 0)} (${cacheOutputRate}%)`,
        fg: t.info,
        valueFg: t.info,
      },
    ]);
    this.addDetailGridRow(infoCard, [
      { label: "🪙 Total", value: fmtNum(item.totalTokens || 0), fg: t.success },
      { label: "💰 Cost", value: `$${fmtNum(item.cost || 0)}`, fg: t.warning, valueFg: t.warning },
      { label: "⏰ Time", value: new Date(item.timestamp).toLocaleString(), fg: t.textMuted },
    ]);

    container.add(infoCard);

    const parts = getMessageParts(this.api, item.id);
    if (parts.length > 0) {
      for (const part of parts) {
        const isThinking = part.type === "reasoning";
        const cardTitle = isThinking ? "💭 Thinking:" : "💬 Output:";
        const titleColor = isThinking ? t.warning : t.accent;
        const cardBg = isThinking ? t.backgroundElement : t.backgroundPanel;

        const contentCard = new BoxRenderable(this.renderer, {
          flexDirection: "column",
          marginTop: 1,
          marginLeft: 1,
          marginRight: 1,
          marginBottom: 1,
          border: true,
          borderStyle: "rounded",
          borderColor: t.borderSubtle,
          backgroundColor: cardBg,
        });

        contentCard.add(
          new TextRenderable(this.renderer, {
            content: cardTitle,
            fg: titleColor,
            marginTop: 1,
            marginLeft: 1,
            marginRight: 1,
            attributes: TextAttributes.BOLD,
          }),
        );

        contentCard.add(
          new TextRenderable(this.renderer, {
            content: part.text,
            wrapMode: "word",
            marginTop: 1,
            marginLeft: 1,
            marginRight: 1,
            marginBottom: 1,
          }),
        );

        container.add(contentCard);
      }
    } else {
      const emptyCard = new BoxRenderable(this.renderer, {
        flexDirection: "column",
        marginTop: 1,
        marginLeft: 1,
        marginRight: 1,
        marginBottom: 1,
        border: true,
        borderStyle: "rounded",
        borderColor: t.borderSubtle,
        backgroundColor: t.backgroundPanel,
      });
      emptyCard.add(
        new TextRenderable(this.renderer, {
          content: "(No content available)",
          fg: t.textMuted,
          marginTop: 1,
          marginLeft: 1,
          marginRight: 1,
          marginBottom: 1,
        }),
      );
      container.add(emptyCard);
    }
  }

  private renderToolDetail(container: BoxRenderable, item: TimelineEntry): void {
    const t = this.api.theme.current;
    const statusColor = item.status === "completed" ? t.success : item.status === "error" ? t.error : t.accent;
    const statusIcon = item.status === "completed" ? "✅" : item.status === "error" ? "❌" : "⏳";

    const infoCard = new BoxRenderable(this.renderer, {
      flexDirection: "column",
      height: 4,
      marginTop: 1,
      marginLeft: 1,
      marginRight: 1,
      marginBottom: 1,
      border: true,
      borderStyle: "rounded",
      borderColor: t.borderSubtle,
      backgroundColor: t.backgroundPanel,
    });

    this.addDetailGridRow(
      infoCard,
      [
        {
          label: "🔧 Tool",
          value: item.toolName || "Unknown",
          fg: t.accent,
          valueFg: t.accent,
          attributes: TextAttributes.BOLD,
        },
        { label: `${statusIcon} Status`, value: item.status, fg: statusColor, valueFg: statusColor },
      ],
      2,
    );
    this.addDetailGridRow(
      infoCard,
      [
        { label: "🏷️ Call ID", value: item.callId || "N/A", fg: t.info },
        { label: "⏰ Time", value: new Date(item.timestamp).toLocaleString(), fg: t.warning },
      ],
      2,
    );

    container.add(infoCard);

    if (item.toolInput && Object.keys(item.toolInput).length > 0) {
      const inputCard = new BoxRenderable(this.renderer, {
        flexDirection: "column",
        minHeight: 7,
        marginLeft: 1,
        marginRight: 1,
        marginBottom: 1,
        border: true,
        borderStyle: "rounded",
        borderColor: t.borderSubtle,
        backgroundColor: t.backgroundElement,
      });

      inputCard.add(
        new TextRenderable(this.renderer, {
          content: "📥 Input:",
          fg: t.accent,
          marginLeft: 1,
          marginRight: 1,
          marginBottom: 1,
          attributes: TextAttributes.BOLD,
        }),
      );

      inputCard.add(
        new TextRenderable(this.renderer, {
          content: JSON.stringify(item.toolInput, null, 2),
          wrapMode: "word",
          marginLeft: 1,
          marginRight: 1,
          marginBottom: 1,
        }),
      );

      container.add(inputCard);
    }

    if (item.toolOutput) {
      const outputCard = new BoxRenderable(this.renderer, {
        flexDirection: "column",
        marginLeft: 1,
        marginRight: 1,
        marginBottom: 1,
        border: true,
        borderStyle: "rounded",
        borderColor: t.borderSubtle,
        backgroundColor: t.backgroundPanel,
      });

      outputCard.add(
        new TextRenderable(this.renderer, {
          content: "📤 Output:",
          fg: t.accent,
          marginLeft: 1,
          marginRight: 1,
          attributes: TextAttributes.BOLD,
        }),
      );

      outputCard.add(
        new TextRenderable(this.renderer, {
          content: item.toolOutput,
          wrapMode: "word",
          marginLeft: 1,
          marginRight: 1,
          marginBottom: 1,
        }),
      );

      container.add(outputCard);
    }
  }

  private addDetailLine(
    parent: BoxRenderable,
    label: string,
    value?: string,
    fg?: import("@opentui/core").RGBA,
    valueFg?: import("@opentui/core").RGBA,
    attributes?: number,
  ): void {
    this.addDetailGridRow(parent, [{ label, value, fg, valueFg, attributes }]);
  }

  private addDetailGridRow(
    parent: BoxRenderable,
    items: Array<{
      label: string;
      value?: string;
      fg?: import("@opentui/core").RGBA;
      valueFg?: import("@opentui/core").RGBA;
      attributes?: number;
    }>,
    columns = 4,
  ): void {
    const row = new BoxRenderable(this.renderer, {
      flexDirection: "row",
      width: "100%",
      marginLeft: 1,
      marginRight: 1,
      marginBottom: 1,
    });

    const wrapper = new BoxRenderable(this.renderer, {
      flexDirection: "row",
      width: "100%",
    });
    row.add(wrapper);

    const colWidth = `${Math.floor(100 / columns)}%` as `${number}%`;
    for (let i = 0; i < columns; i++) {
      const cell = new BoxRenderable(this.renderer, {
        width: colWidth,
        flexDirection: "row",
      });
      if (items[i]) {
        this.renderDetailCell(cell, items[i]);
      }
      wrapper.add(cell);
    }

    parent.add(row);
  }

  private renderDetailCell(
    box: BoxRenderable,
    item: {
      label: string;
      value?: string;
      fg?: import("@opentui/core").RGBA;
      valueFg?: import("@opentui/core").RGBA;
      attributes?: number;
    },
  ): void {
    const t = this.api.theme.current;

    box.add(
      new TextRenderable(this.renderer, {
        content: `${item.label}: `,
        fg: item.fg,
        attributes: item.attributes,
        truncate: true,
      }),
    );

    if (item.value !== undefined) {
      box.add(
        new TextRenderable(this.renderer, {
          content: item.value,
          fg: item.valueFg ?? t.text,
          attributes: item.attributes,
          truncate: true,
        }),
      );
    }
  }
}
