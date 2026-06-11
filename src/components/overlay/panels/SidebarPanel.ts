import { BoxRenderable, TextRenderable, TextAttributes } from "@opentui/core";
import { SidebarCategory } from "../types";

export interface SidebarPanelProps {
  renderer: any;
  sidebarContainer: BoxRenderable;
  sidebarCategories: SidebarCategory[];
  selectCategoryCallback: (cat: SidebarCategory) => Promise<void>;
}

export class SidebarPanel {
  private readonly selectedSidebarAttribute: number = TextAttributes.BOLD | TextAttributes.ITALIC;
  private readonly blankSidebarAttribute: number = TextAttributes.NONE;
  private readonly hoveredSidebvarAttribute: number = TextAttributes.UNDERLINE;

  private sidebarItems: TextRenderable[] = [];
  private currentCategory!: SidebarCategory;

  constructor(private props: SidebarPanelProps) {
    this.sidebarItems = this.props.sidebarCategories.map((cat: SidebarCategory) => {
      const item = new TextRenderable(props.renderer, {
        content: cat,
        marginTop: 1,
        marginLeft: 2,
        onMouseUp: async () => {
          await this.onSelect(cat);
        },

        // hover and unhover
        onMouseOver: async () => {
          item.attributes = this.hoveredSidebvarAttribute;
        },
        onMouseOut: async () => {
          if (this.currentCategory === cat) {
            item.attributes = this.selectedSidebarAttribute;
          } else {
            item.attributes = this.blankSidebarAttribute;
          }
        },
      });
      item.focusable = true;
      this.props.sidebarContainer.add(item);
      return item;
    });
    this.onSelect(this.props.sidebarCategories[0]);
  }

  public async onSelect(cat: SidebarCategory): Promise<void> {
    this.currentCategory = cat;

    for (let idx = 0; idx < this.sidebarItems.length; idx++) {
      const item = this.sidebarItems[idx];

      if (cat === this.props.sidebarCategories[idx]) {
        item.attributes = this.selectedSidebarAttribute;
        await this.props.selectCategoryCallback(cat);
      } else {
        item.attributes = this.blankSidebarAttribute;
      }
    }
  }
}
