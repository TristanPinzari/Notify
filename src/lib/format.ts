export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

const AVATAR_PALETTE = [
  "#a85718",
  "#3a5fa8",
  "#3f7d52",
  "#7a4b86",
  "#9e3b32",
  "#2f7050",
  "#b06a1e",
  "#4b6a8a",
];

export function avatarColor(name: string): string {
  const ch = name.trim()[0]?.toUpperCase() ?? "A";
  const idx = ch >= "A" && ch <= "Z" ? ch.charCodeAt(0) - 65 : ch.charCodeAt(0);
  return AVATAR_PALETTE[idx % AVATAR_PALETTE.length]!;
}
