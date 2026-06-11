import { createSignal, Show } from "solid-js";
import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import FullscreenOverlay from "./FullscreenOverlay";

interface SidebarMonitorProps {
  api: TuiPluginApi;
  session_id: string;
}

export default function SidebarMonitor(props: SidebarMonitorProps) {
  const [showOverlay, setShowOverlay] = createSignal(false);

  return (
    <box style={{ flexDirection: "column", padding: 0 }}>
      <text>🤖 Monitor</text>
      <box onMouseUp={() => setShowOverlay(true)}>
        <text style={{ fg: props.api.theme.current.accent }}>[View Details]</text>
      </box>

      <Show when={showOverlay()}>
        <FullscreenOverlay api={props.api} sessionId={props.session_id} close={() => setShowOverlay(false)} />
      </Show>
    </box>
  );
}
