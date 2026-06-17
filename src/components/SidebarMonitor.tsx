import { createSignal, Show } from "solid-js";
import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import FullscreenOverlay from "./FullscreenOverlay";

interface SidebarMonitorProps {
  api: TuiPluginApi;
  session_id: string;
}

export default function SidebarMonitor(props: SidebarMonitorProps) {
  const [showOverlay, setShowOverlay] = createSignal(false);
  const [isHovered, setIsHovered] = createSignal(false);
  const t = () => props.api.theme.current;

  return (
    <box style={{ flexDirection: "column", padding: 0 }}>
      <box
        style={{ flexDirection: "row", alignItems: "center", paddingTop: 1, paddingBottom: 1 }}
        onMouseOver={() => setIsHovered(true)}
        onMouseOut={() => setIsHovered(false)}
        onMouseUp={() => setShowOverlay(true)}
      >
        <text style={{ fg: isHovered() ? t().warning : t().text }}>🤖 Opencode Insight</text>
      </box>

      <Show when={showOverlay()}>
        <FullscreenOverlay api={props.api} sessionId={props.session_id} close={() => setShowOverlay(false)} />
      </Show>
    </box>
  );
}
