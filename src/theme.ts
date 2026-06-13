/** Status indicators with color and icon */
export const statusIndicators: Record<string, { icon: string; color: string }> = {
  completed: { icon: "✓", color: "success" },
  running: { icon: "…", color: "info" },
  error: { icon: "✗", color: "error" },
  success: { icon: "✓", color: "success" },
  failed: { icon: "✗", color: "error" },
  unknown: { icon: "?", color: "warning" },
};
