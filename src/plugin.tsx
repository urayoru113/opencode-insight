import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import SidebarMonitor from "./components/SidebarMonitor";

async function tuiMonitorPlugin(
  api: TuiPluginApi,
  _options: Record<string, unknown>,
  _meta: { name: string; version: string }
): Promise<void> {
  api.slots.register({
    slots: {
      sidebar_content(_ctx, props: { session_id: string }) {
        return <SidebarMonitor api={api} session_id={props.session_id} />;
      },
    },
  });
}

export default {
  id: "opencode-insight",
  tui: tuiMonitorPlugin,
};
