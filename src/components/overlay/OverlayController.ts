import { BoxRenderable, TextAttributes, TextRenderable } from "@opentui/core";
import type { TuiPluginApi } from "@opencode-ai/plugin/tui";

import { getAccumulatedTokenUsage, type AccumulatedTokens } from "../../lib/tokenStore";
import { TimelinePanel } from "./panels/TimelinePanel";
import { OverviewPanel } from "./panels/OverviewPanel";
import { SidebarPanel } from "./panels/SidebarPanel";
import { defaultTheme } from "../../theme";

import type { SidebarCategory, View } from "./types";

interface OverlayControllerProps {
  api: TuiPluginApi;
  sessionId: string;
  close: () => void;
}

export class OverlayController {
  private renderer;
  private root;
  private currentTheme;
  private accent;

  // Renderable refs
  private overlay!: BoxRenderable;
  private sidebar!: BoxRenderable;
  private viewPanel!: BoxRenderable;
  private contentArea!: BoxRenderable;

  // State
  private currentSidebarCategory: SidebarCategory = "Overview";
  private currentView: View = "list";
  private fetchError: string | null = null;
  private renderGeneration = 0;

  // Polling timer
  private updateData!: ReturnType<typeof setTimeout>;

  private readonly sidebarCategories: SidebarCategory[] = ["Overview", "Timeline"];

  // Live data cache
  private timelinePanel: TimelinePanel;
  private overviewPanel: OverviewPanel;
  private accumulatedTokens: AccumulatedTokens = {
    input: 0,
    output: 0,
    reasoning: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
    cost: 0,
  };

  constructor(private props: OverlayControllerProps) {
    this.renderer = props.api.renderer;
    this.root = this.renderer.root;
    this.currentTheme = props.api.theme.current;
    this.accent = this.currentTheme.accent;

    this.timelinePanel = new TimelinePanel(this.renderer, this.accent, this.currentTheme.textMuted);
    this.overviewPanel = new OverviewPanel(this.renderer);

    this.buildOverlay();
    new SidebarPanel({
      renderer: this.renderer,
      sidebarContainer: this.sidebar,
      sidebarCategories: this.sidebarCategories,
      selectCategoryCallback: async (cat: SidebarCategory): Promise<void> => {
        await this.selectSidebar(cat);
        await this.renderViewPanel();
      },
    });
  }

  // ── Async data loading ────────────────────────────────────
  private async loadRealData(): Promise<boolean> {
    let changed = false;
    try {
      const timelineChanged = await this.timelinePanel.loadData(this.props.sessionId);
      if (timelineChanged) changed = true;

      this.accumulatedTokens = await getAccumulatedTokenUsage();

      if (this.fetchError) {
        this.fetchError = null;
        changed = true;
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (this.fetchError !== errorMsg) {
        this.fetchError = errorMsg;
        changed = true;
      }
    }
    return changed;
  }

  // ── Public lifecycle ──────────────────────────────────────

  mount() {
    this.root.add(this.overlay);

    const poll = async () => {
      const changed = await this.loadRealData();
      if (changed) {
        await this.renderViewPanel();
      }
      this.updateData = setTimeout(poll, 2000);
    };
    poll();
  }

  cleanup() {
    this.root.remove(this.overlay.id);
    clearTimeout(this.updateData);
  }

  // ── Overlay root (build once) ─────────────────────────────

  private buildOverlay() {
    this.overlay = new BoxRenderable(this.renderer, {
      id: "fullscreen-overlay",
      position: "absolute",
      top: 0,
      left: 0,
      width: this.renderer.terminalWidth,
      height: this.renderer.terminalHeight,
      backgroundColor: "black",
      border: true,
      borderColor: "red",
      flexDirection: "row",
      focusable: true,
    });
    this.sidebar = new BoxRenderable(this.renderer, {
      width: Math.floor(this.renderer.terminalWidth * 0.2),
      flexDirection: "column",
      border: true,
      borderColor: "gray",
    });
    this.viewPanel = new BoxRenderable(this.renderer, {
      width: Math.floor(this.renderer.terminalWidth * 0.8),
      flexDirection: "column",
      border: true,
    });
    const closeBtn = new TextRenderable(this.renderer, {
      content: "[X] Close",
      fg: "red",
      onMouseDown: () => this.props.close(),
    });

    this.overlay.add(this.sidebar);
    this.overlay.add(this.viewPanel);
    this.viewPanel.add(closeBtn);
  }

  private async selectSidebar(cat: SidebarCategory) {
    this.currentView = "list";
    this.currentSidebarCategory = cat;
  }

  // ── View panel (render many) ──────────────────────────────

  private async renderViewPanel() {
    // Increment generation to invalidate any in-progress renders
    this.renderGeneration++;
    const currentGeneration = this.renderGeneration;
    const isValid = () => currentGeneration === this.renderGeneration;

    if (this.contentArea) this.contentArea.destroyRecursively();
    this.contentArea = new BoxRenderable(this.renderer, {
      flexDirection: "column",
      height: "90%",
    });
    this.viewPanel.add(this.contentArea);

    if (this.fetchError) {
      this.renderErrorState();
      return;
    }

    switch (this.currentSidebarCategory) {
      case "Overview":
        await this.overviewPanel.render(this.contentArea, this.accumulatedTokens, this.timelinePanel);
        break;
      case "Timeline":
        await this.timelinePanel.render(
          this.contentArea,
          this.currentView,
          async () => {
            this.currentView = "detail";
            await this.renderViewPanel();
          },
          async () => {
            this.currentView = "list";
            await this.renderViewPanel();
          },
          isValid,
        );
        break;
    }
  }

  // ── Shared render helpers ─────────────────────────────────

  private renderErrorState() {
    const { error, errorBg, textMuted, accent } = defaultTheme;

    const errorContainer = new BoxRenderable(this.renderer, {
      width: "100%",
      height: "100%",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
    });

    const errorBox = new BoxRenderable(this.renderer, {
      border: true,
      borderColor: error,
      flexDirection: "column",
      alignItems: "center",
      width: "80%",
      paddingTop: 2,
      paddingBottom: 2,
      paddingLeft: 4,
      paddingRight: 4,
      backgroundColor: errorBg,
    });

    errorBox.add(
      new TextRenderable(this.renderer, {
        content: "! Data Load Error",
        fg: error,
        attributes: TextAttributes.BOLD,
        marginBottom: 1,
      }),
    );

    errorBox.add(
      new TextRenderable(this.renderer, {
        content: this.fetchError || "An unknown error occurred while fetching data.",
        fg: textMuted,
        wrapMode: "word",
        marginBottom: 1,
      }),
    );

    const retryBtn = new TextRenderable(this.renderer, {
      content: "⟳ Retry Now",
      fg: accent,
      attributes: TextAttributes.BOLD,
    });
    retryBtn.focusable = true;
    retryBtn.onMouseDown = async () => {
      this.fetchError = null;
      await this.renderViewPanel();
    };
    errorBox.add(retryBtn);

    errorContainer.add(errorBox);
    this.contentArea.add(errorContainer);
  }
}
