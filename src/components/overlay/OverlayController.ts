import { BoxRenderable, Renderable, TextAttributes, TextRenderable } from "@opentui/core";
import type { TuiPluginApi } from "@opencode-ai/plugin/tui";

import { TimelinePanel } from "./panels/TimelinePanel";
import { OverviewPanel } from "./panels/OverviewPanel";
import { SidebarPanel } from "./panels/SidebarPanel";

import type { SidebarCategory, View } from "./types";

interface OverlayControllerProps {
  api: TuiPluginApi;
  sessionId: string;
  close: () => void;
}

export class OverlayController {
  private renderer;
  private root;

  // Renderable refs
  private overlay!: BoxRenderable;
  private sidebar!: BoxRenderable;
  private viewPanel!: BoxRenderable;
  private contentArea!: BoxRenderable;
  private previous: { focus: Renderable | null; mode: string } | null = null;

  // State
  private currentSidebarCategory: SidebarCategory = "Overview";
  private currentView: View = "list";
  private fetchError: string | null = null;
  private renderGeneration = 0;
  private cleanedUp = false;

  // Polling timer
  private updateData: ReturnType<typeof setTimeout> | null = null;

  private readonly sidebarCategories: SidebarCategory[] = ["Overview", "Timeline"];

  // Live data cache
  private timelinePanel: TimelinePanel;
  private overviewPanel: OverviewPanel;

  constructor(private props: OverlayControllerProps) {
    this.renderer = props.api.renderer;
    this.root = this.renderer.root;

    this.timelinePanel = new TimelinePanel(this.renderer, props.api);
    this.overviewPanel = new OverviewPanel(this.renderer, props.api, props.sessionId);

    this.buildOverlay();
    new SidebarPanel({
      api: this.props.api,
      renderer: this.renderer,
      sidebarContainer: this.sidebar,
      sidebarCategories: this.sidebarCategories,
      selectCategoryCallback: async (cat: SidebarCategory) => {
        this.selectSidebar(cat);
        await this.renderViewPanel();
      },
    });
  }

  private get theme() {
    return this.props.api.theme.current;
  }

  // ── Data loading ──────────────────────────────────────────
  private async loadRealData(): Promise<boolean> {
    let changed = false;
    try {
      const timelineChanged = this.timelinePanel.loadData(this.props.sessionId);
      if (timelineChanged) changed = true;

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
    this.previous = this.stash();
    this.root.add(this.overlay);

    const poll = async () => {
      if (this.cleanedUp) return;
      const changed = await this.loadRealData();
      if (changed) {
        await this.renderViewPanel();
      }
      this.updateData = setTimeout(poll, 2000);
    };
    this.renderViewPanel();
    poll();

    setTimeout(() => this.overlay.focus(), 0);
  }

  cleanup() {
    this.cleanedUp = true;
    if (this.updateData) {
      clearTimeout(this.updateData);
      this.updateData = null;
    }
    this.root.remove(this.overlay.id);
    if (this.previous && this.previous.focus) {
      this.previous.focus.focus();
    }
  }

  private stash(): { focus: Renderable | null; mode: string } {
    return {
      focus: this.renderer.currentFocusedRenderable,
      mode: this.props.api.mode.current(),
    };
  }

  // ── Overlay root (build once) ─────────────────────────────

  private buildOverlay() {
    const t = this.theme;

    this.overlay = new BoxRenderable(this.renderer, {
      id: "fullscreen-overlay",
      position: "absolute",
      top: 0,
      left: 0,
      width: this.renderer.terminalWidth,
      height: this.renderer.terminalHeight,
      backgroundColor: t.background,
      border: true,
      borderColor: t.border,
      flexDirection: "row",
      focusable: true,
    });
    this.sidebar = new BoxRenderable(this.renderer, {
      width: "20%",
      flexDirection: "column",
      border: true,
    });
    this.viewPanel = new BoxRenderable(this.renderer, {
      width: "80%",
      flexDirection: "column",
      border: true,
    });
    const closeBtn: TextRenderable = new TextRenderable(this.renderer, {
      content: "[X] Close",
      fg: t.error,
      bg: t.background,
      marginTop: -1,
      zIndex: 10,
      onMouseUp: () => this.props.close(),
      onMouseOver: () => (closeBtn.bg = t.backgroundElement),
      onMouseOut: () => (closeBtn.bg = t.background),
    });

    this.overlay.add(this.sidebar);
    this.overlay.add(this.viewPanel);
    this.viewPanel.add(closeBtn);
  }

  private selectSidebar(cat: SidebarCategory) {
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
      marginRight: 1,
    });
    this.viewPanel.add(this.contentArea);

    if (this.fetchError) {
      this.renderErrorState();
      return;
    }

    switch (this.currentSidebarCategory) {
      case "Overview":
        this.overviewPanel.render(this.contentArea);
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
    const t = this.theme;

    const errorContainer = new BoxRenderable(this.renderer, {
      width: "100%",
      height: "100%",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
    });

    const errorBox = new BoxRenderable(this.renderer, {
      border: true,
      borderColor: t.error,
      flexDirection: "column",
      alignItems: "center",
      width: "80%",
      paddingTop: 2,
      paddingBottom: 2,
      paddingLeft: 4,
      paddingRight: 4,
      backgroundColor: t.backgroundPanel,
    });

    errorBox.add(
      new TextRenderable(this.renderer, {
        content: "! Data Load Error",
        fg: t.error,
        attributes: TextAttributes.BOLD,
        marginBottom: 1,
      }),
    );

    errorBox.add(
      new TextRenderable(this.renderer, {
        content: this.fetchError || "An unknown error occurred while fetching data.",
        fg: t.textMuted,
        wrapMode: "word",
        marginBottom: 1,
      }),
    );

    const retryBtn = new TextRenderable(this.renderer, {
      content: "⟳ Retry Now",
      fg: t.accent,
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
