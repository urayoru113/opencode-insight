import { BoxRenderable, TextRenderable } from "@opentui/core";
import type { CliRenderer } from "@opentui/core";
import { type AccumulatedTokens } from "../../../lib/tokenStore";
import { defaultTheme } from "../../../theme";
import type { TimelinePanel } from "./TimelinePanel";

export class OverviewPanel {
  private theme = defaultTheme;

  constructor(private renderer: CliRenderer) {}

  async render(
    contentArea: BoxRenderable,
    accumulatedTokens: AccumulatedTokens,
    timelinePanel: TimelinePanel,
  ): Promise<void> {
    const acc = accumulatedTokens;
    const hasRealData = acc.total > 0;

    // Card definitions with icons
    const cards = [
      {
        icon: "🪙",
        title: "Total Tokens",
        value: hasRealData ? this.fmtNum(acc.total) : "0",
        subtitle: `In: ${this.fmtNum(acc.input)} / Out: ${this.fmtNum(acc.output)} / Cache Rate: ${this.fmtNum((acc.cacheRead / (acc.cacheRead + acc.input)) * 100)}%`,
      },
      {
        icon: "🔧",
        title: "Timeline Entries",
        value:
          timelinePanel.getCount() > 0
            ? this.fmtNum(timelinePanel.getCount())
            : "0",
        subtitle: timelinePanel.getCount() > 0 ? "Active" : "None",
      },
    ];

    // Container for cards with proper spacing
    const cardsContainer = new BoxRenderable(this.renderer, {
      flexDirection: "row",
      marginTop: 2,
      marginLeft: 3,
      marginRight: 3,
      height: 12,
    });
    contentArea.add(cardsContainer);

    cards.forEach((card, idx) => {
      const cardBox = new BoxRenderable(this.renderer, {
        flexDirection: "column",
        flexGrow: 1,
        marginRight: idx < cards.length - 1 ? 2 : 0,
        border: true,
        borderColor: this.theme.borderPrimary,
        backgroundColor: this.theme.bgPrimary,
      });

      // Icon row
      const iconRow = new TextRenderable(this.renderer, {
        content: card.icon,
        marginTop: 1,
        marginLeft: 2,
      });
      cardBox.add(iconRow);

      // Title
      const titleText = new TextRenderable(this.renderer, {
        content: card.title,
        fg: this.theme.textSecondary,
        marginTop: 1,
        marginLeft: 2,
      });
      cardBox.add(titleText);

      // Large metric value
      const valueText = new TextRenderable(this.renderer, {
        content: card.value,
        marginTop: 1,
        marginLeft: 2,
        // Use a larger implicit size through content
      });
      cardBox.add(valueText);

      // Subtitle
      const subtitleText = new TextRenderable(this.renderer, {
        content: card.subtitle,
        fg: this.theme.textMuted,
        marginTop: 1,
        marginLeft: 2,
        marginBottom: 1,
      });
      cardBox.add(subtitleText);

      (cardBox as any).focusable = true;

      cardsContainer.add(cardBox);
    });
  }

  private fmtNum(n: number, width = 0): string {
    const formatted = n.toLocaleString("en-US");
    return width > 0 ? formatted.padStart(width) : formatted;
  }
}
