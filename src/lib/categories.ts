// Category color tokens shared by the warehouse UI. Class strings are written out
// in full (no interpolation) so Tailwind's JIT keeps them in the build.
import type { CategoryColor } from "./types";

export const CATEGORY_COLORS: CategoryColor[] = [
  "gray",
  "red",
  "amber",
  "green",
  "blue",
  "purple",
  "pink",
  "teal",
];

// Badge (chip) classes per color token.
const BADGE: Record<CategoryColor, string> = {
  gray: "bg-black/10 text-[var(--text)] dark:bg-white/15",
  red: "bg-red-500/15 text-red-500",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  green: "bg-leaf/20 text-leaf",
  blue: "bg-blue-500/15 text-blue-500",
  purple: "bg-purple-500/15 text-purple-500",
  pink: "bg-pink-500/15 text-pink-500",
  teal: "bg-teal-500/15 text-teal-500",
};

// Solid swatch classes for the color picker.
const SWATCH: Record<CategoryColor, string> = {
  gray: "bg-gray-400",
  red: "bg-red-500",
  amber: "bg-amber-500",
  green: "bg-leaf",
  blue: "bg-blue-500",
  purple: "bg-purple-500",
  pink: "bg-pink-500",
  teal: "bg-teal-500",
};

function isColor(c: string): c is CategoryColor {
  return (CATEGORY_COLORS as string[]).includes(c);
}

export function badgeClass(color: string | null | undefined): string {
  return BADGE[color && isColor(color) ? color : "gray"];
}

export function swatchClass(color: CategoryColor): string {
  return SWATCH[color];
}

// Default categories seeded on first boot (per branch).
export const DEFAULT_INVENTORY_CATEGORIES: { name: string; color: CategoryColor }[] = [
  { name: "Food", color: "green" },
  { name: "Packaging", color: "blue" },
  { name: "Cleaning", color: "purple" },
  { name: "Other", color: "gray" },
];
