export const VIVID_PALETTE = [
  "#ff6b6b",
  "#feca57",
  "#48dbfb",
  "#ff9ff3",
  "#54a0ff",
  "#5f27cd",
  "#01a3a4",
  "#f368e0",
  "#6bcb77",
  "#ff9f43",
  "#00d2d3",
  "#ee5a24",
];

export function itemColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return VIVID_PALETTE[hash % VIVID_PALETTE.length];
}

export function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "…";
}

export function miniBar(filled: number, total: number, width = 15): string {
  const ratio = total > 0 ? filled / total : 0;
  const n = Math.round(ratio * width);
  return "█".repeat(Math.max(0, Math.min(width, n))) + "░".repeat(Math.max(0, width - n));
}

export function fmtNum(n: number): string {
  return n.toLocaleString("en-US");
}
