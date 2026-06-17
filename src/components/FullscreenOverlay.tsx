import { onCleanup, onMount } from "solid-js";
import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import { OverlayController } from "./overlay/OverlayController";

interface FullscreenOverlayProps {
  api: TuiPluginApi;
  sessionId: string;
  close: () => void;
}

export default function FullscreenOverlay(props: FullscreenOverlayProps) {
  onMount(() => {
    const controller = new OverlayController({ api: props.api, sessionId: props.sessionId, close: props.close });
    controller.mount();
    onCleanup(() => controller.cleanup());
  });

  return null;
}
