import { BoxRenderable, TextRenderable, TextAttributes, CliRenderer } from "@opentui/core";
import { SidebarCategory } from "../types";
import * as tui from "@opencode-ai/plugin/tui";

export interface SidebarPanelProps {
  api: tui.TuiPluginApi;
  renderer: CliRenderer;
  sidebarContainer: BoxRenderable;
  sidebarCategories: SidebarCategory[];
  selectCategoryCallback: (cat: SidebarCategory) => Promise<void>;
}

export class SidebarPanel {
  private readonly defaultSelectedCategoryIndex = 0;
  private readonly selectedSidebarAttribute: number = TextAttributes.BOLD | TextAttributes.ITALIC;
  private readonly blankSidebarAttribute: number = TextAttributes.NONE;
  private readonly hoveredSidebarAttribute: number = TextAttributes.UNDERLINE;

  private sidebarItems: TextRenderable[] = [];
  private currentCategory!: SidebarCategory;
  private categoryBoxes: BoxRenderable[] = [];

  private get theme() {
    return this.props.api.theme.current;
  }

  constructor(private props: SidebarPanelProps) {
    const titleBox = new BoxRenderable(props.renderer, {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      marginTop: 1,
      marginBottom: 1,
      marginLeft: 1,
      marginRight: 1,
    });
    titleBox.add(
      new TextRenderable(props.renderer, {
        content: "Opencode Insight",
        fg: this.theme.accent,
        marginTop: 1,
        marginBottom: 1,
        marginLeft: 1,
        marginRight: 1,
        attributes: TextAttributes.BOLD,
      }),
    );
    props.sidebarContainer.add(titleBox);

    const separator = new BoxRenderable(props.renderer, {
      border: ["bottom"],
      marginLeft: 1,
      marginRight: 1,
      marginBottom: 1,
    });
    props.sidebarContainer.add(separator);

    this.sidebarItems = this.props.sidebarCategories.map((cat: SidebarCategory) => {
      const box = new BoxRenderable(props.renderer, {
        flexDirection: "row",
        alignItems: "center",
        height: 5,
        marginLeft: 1,
        marginRight: 1,
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: this.theme.background,
      });

      const item = new TextRenderable(props.renderer, {
        content: cat,
        marginLeft: 1,
        marginRight: 1,
        onMouseUp: async () => {
          await this.onSelect(cat);
        },
        onMouseOver: () => {
          box.backgroundColor = this.theme.backgroundElement;
          item.attributes = this.hoveredSidebarAttribute;
        },
        onMouseOut: () => {
          if (cat === this.currentCategory) {
            box.backgroundColor = this.theme.borderActive;
            item.attributes = this.selectedSidebarAttribute;
          } else {
            box.backgroundColor = this.theme.background;
            item.attributes = this.blankSidebarAttribute;
          }
        },
      });
      item.focusable = true;
      box.add(item);
      this.props.sidebarContainer.add(box);
      this.categoryBoxes.push(box);
      return item;
    });
    this.onSelect(this.props.sidebarCategories[this.defaultSelectedCategoryIndex]);
  }

  public async onSelect(cat: SidebarCategory): Promise<void> {
    this.currentCategory = cat;

    for (let idx = 0; idx < this.sidebarItems.length; idx++) {
      const item = this.sidebarItems[idx];
      const box = this.categoryBoxes[idx];
      const isSelected = cat === this.props.sidebarCategories[idx];

      if (isSelected) {
        item.attributes = this.selectedSidebarAttribute;
        item.fg = this.theme.accent;
        box.backgroundColor = this.theme.borderActive;
        await this.props.selectCategoryCallback(cat);
      } else {
        item.attributes = this.blankSidebarAttribute;
        item.fg = this.theme.text;
        box.backgroundColor = this.theme.background;
      }
    }
  }
}
