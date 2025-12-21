// Clipart data with SVG paths for stickers
export interface ClipartItem {
  id: string;
  name: string;
  category: string;
  svg: string;
  defaultColor?: string;
}

export interface ClipartCategory {
  id: string;
  name: string;
  icon: string;
}

export const clipartCategories: ClipartCategory[] = [
  { id: "popular", name: "Popular", icon: "⭐" },
  { id: "emojis", name: "Emojis", icon: "😀" },
  { id: "love", name: "Love", icon: "❤️" },
  { id: "nature", name: "Nature", icon: "🌿" },
  { id: "shapes", name: "Shapes", icon: "◆" },
  { id: "text", name: "Text", icon: "Aa" },
];

export const clipartItems: ClipartItem[] = [
  // Popular
  {
    id: "star-1",
    name: "Star",
    category: "popular",
    defaultColor: "#fbbf24",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`,
  },
  {
    id: "heart-1",
    name: "Heart",
    category: "popular",
    defaultColor: "#ef4444",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`,
  },
  {
    id: "lightning-1",
    name: "Lightning",
    category: "popular",
    defaultColor: "#eab308",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`,
  },
  {
    id: "fire-1",
    name: "Fire",
    category: "popular",
    defaultColor: "#f97316",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 23c-3.866 0-7-3.134-7-7 0-2.5 1.5-4.5 3-6 0 2 1 3 2.5 3.5C10 12 9.5 10 10 8c.5-2 2-4 4-5 0 3 2 5 3 7 .5 1 1 2 1 3.5 0 3.866-3.134 6.5-6 6.5z"/></svg>`,
  },
  {
    id: "crown-1",
    name: "Crown",
    category: "popular",
    defaultColor: "#fbbf24",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5z"/></svg>`,
  },
  {
    id: "diamond-1",
    name: "Diamond",
    category: "popular",
    defaultColor: "#06b6d4",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 9l10 13 10-13L12 2z"/></svg>`,
  },
  // Emojis
  {
    id: "smile-1",
    name: "Smile",
    category: "emojis",
    defaultColor: "#fbbf24",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/><path fill="white" d="M8 14s1.5 2 4 2 4-2 4-2"/><circle fill="white" cx="9" cy="9" r="1.5"/><circle fill="white" cx="15" cy="9" r="1.5"/></svg>`,
  },
  {
    id: "wink-1",
    name: "Wink",
    category: "emojis",
    defaultColor: "#fbbf24",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/><path fill="white" d="M8 14s1.5 2 4 2 4-2 4-2"/><circle fill="white" cx="9" cy="9" r="1.5"/><path stroke="white" stroke-width="2" d="M14 9h2"/></svg>`,
  },
  {
    id: "cool-1",
    name: "Cool",
    category: "emojis",
    defaultColor: "#fbbf24",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/><path fill="white" d="M8 15s1.5 2 4 2 4-2 4-2"/><rect fill="#333" x="6" y="8" width="12" height="4" rx="2"/></svg>`,
  },
  {
    id: "love-eyes-1",
    name: "Heart Eyes",
    category: "emojis",
    defaultColor: "#fbbf24",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/><path fill="white" d="M8 14s1.5 2 4 2 4-2 4-2"/><path fill="#ef4444" d="M9 10c-.5-.5-1.5-.5-2 0s-.5 1.5 0 2l2 2 2-2c.5-.5.5-1.5 0-2s-1.5-.5-2 0z"/><path fill="#ef4444" d="M15 10c-.5-.5-1.5-.5-2 0s-.5 1.5 0 2l2 2 2-2c.5-.5.5-1.5 0-2s-1.5-.5-2 0z"/></svg>`,
  },
  {
    id: "laugh-1",
    name: "Laugh",
    category: "emojis",
    defaultColor: "#fbbf24",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/><path fill="white" d="M6 13c0 3.5 2.5 6 6 6s6-2.5 6-6H6z"/><path d="M9 9V7M15 9V7" stroke="currentColor" stroke-width="2"/></svg>`,
  },
  {
    id: "tongue-1",
    name: "Tongue Out",
    category: "emojis",
    defaultColor: "#fbbf24",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/><circle fill="white" cx="9" cy="9" r="1.5"/><circle fill="white" cx="15" cy="9" r="1.5"/><path fill="#ef4444" d="M10 14h4v4c0 1-1 2-2 2s-2-1-2-2v-4z"/></svg>`,
  },
  // Love
  {
    id: "heart-2",
    name: "Heart Outline",
    category: "love",
    defaultColor: "#ec4899",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`,
  },
  {
    id: "double-heart",
    name: "Double Hearts",
    category: "love",
    defaultColor: "#ec4899",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 12l-1-1C4.5 8.5 3 7.5 3 5.5 3 4 4 3 5.5 3c.8 0 1.6.4 2.5 1.1.9-.7 1.7-1.1 2.5-1.1 1.5 0 2.5 1 2.5 2.5 0 2-1.5 3-4 5.5L8 12z" transform="translate(-1, 2)"/><path d="M16 21l-1.5-1.3C10 16 8 14 8 11.5 8 9.5 9.5 8 11.5 8c1 0 2 .5 3 1.3 1-.8 2-1.3 3-1.3 2 0 3.5 1.5 3.5 3.5 0 2.5-2 4.5-6 8.2L16 21z" transform="translate(1, 0)"/></svg>`,
  },
  {
    id: "heart-arrow",
    name: "Arrow Heart",
    category: "love",
    defaultColor: "#ef4444",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/><line x1="2" y1="2" x2="22" y2="22" stroke="white" stroke-width="1.5"/><polygon fill="white" points="20,24 22,22 24,24 22,22" transform="translate(-2,-2)"/></svg>`,
  },
  {
    id: "kiss-1",
    name: "Kiss",
    category: "love",
    defaultColor: "#ec4899",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4C8 4 5 7 5 10c0 2 1 3.5 2 4.5L12 20l5-5.5c1-1 2-2.5 2-4.5 0-3-3-6-7-6z"/><circle fill="white" cx="12" cy="11" r="2"/></svg>`,
  },
  {
    id: "sparkle-heart",
    name: "Sparkle Heart",
    category: "love",
    defaultColor: "#f472b6",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/><circle fill="white" cx="8" cy="8" r="1"/><circle fill="white" cx="14" cy="10" r="0.5"/></svg>`,
  },
  // Nature
  {
    id: "sun-1",
    name: "Sun",
    category: "nature",
    defaultColor: "#fbbf24",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`,
  },
  {
    id: "moon-1",
    name: "Moon",
    category: "nature",
    defaultColor: "#a78bfa",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>`,
  },
  {
    id: "cloud-1",
    name: "Cloud",
    category: "nature",
    defaultColor: "#94a3b8",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/></svg>`,
  },
  {
    id: "flower-1",
    name: "Flower",
    category: "nature",
    defaultColor: "#f472b6",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="3" fill="#fbbf24"/><ellipse cx="12" cy="6" rx="3" ry="4"/><ellipse cx="12" cy="18" rx="3" ry="4"/><ellipse cx="6" cy="12" rx="4" ry="3"/><ellipse cx="18" cy="12" rx="4" ry="3"/></svg>`,
  },
  {
    id: "leaf-1",
    name: "Leaf",
    category: "nature",
    defaultColor: "#22c55e",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11 20A7 7 0 015.43 12.28c.35-2.73 2.33-5.35 4.91-6.78A12.62 12.62 0 0119 4c0 3.5-1.5 6.5-4 9s-4 4.5-4 7z"/><path stroke="currentColor" stroke-width="1" fill="none" d="M10.5 14.5L14 11"/></svg>`,
  },
  {
    id: "tree-1",
    name: "Tree",
    category: "nature",
    defaultColor: "#22c55e",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l-6 8h4v3H8l4 5 4-5h-2v-3h4l-6-8z"/><rect x="10" y="17" width="4" height="4" fill="#92400e"/></svg>`,
  },
  {
    id: "rainbow-1",
    name: "Rainbow",
    category: "nature",
    defaultColor: "#ef4444",
    svg: `<svg viewBox="0 0 24 24"><path fill="#ef4444" d="M4 16c0-4.4 3.6-8 8-8s8 3.6 8 8h-2c0-3.3-2.7-6-6-6s-6 2.7-6 6H4z"/><path fill="#f97316" d="M6 16c0-3.3 2.7-6 6-6s6 2.7 6 6h-2c0-2.2-1.8-4-4-4s-4 1.8-4 4H6z"/><path fill="#fbbf24" d="M8 16c0-2.2 1.8-4 4-4s4 1.8 4 4h-2c0-1.1-.9-2-2-2s-2 .9-2 2H8z"/></svg>`,
  },
  // Shapes
  {
    id: "circle-1",
    name: "Circle",
    category: "shapes",
    defaultColor: "#3b82f6",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>`,
  },
  {
    id: "square-1",
    name: "Square",
    category: "shapes",
    defaultColor: "#8b5cf6",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>`,
  },
  {
    id: "triangle-1",
    name: "Triangle",
    category: "shapes",
    defaultColor: "#22c55e",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 22h20L12 2z"/></svg>`,
  },
  {
    id: "hexagon-1",
    name: "Hexagon",
    category: "shapes",
    defaultColor: "#f97316",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l8.66 5v10L12 22l-8.66-5V7z"/></svg>`,
  },
  {
    id: "star-2",
    name: "Star 6pt",
    category: "shapes",
    defaultColor: "#eab308",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1l2.5 7h7.5l-6 4.5 2.5 7.5-6.5-5-6.5 5 2.5-7.5-6-4.5h7.5z"/></svg>`,
  },
  {
    id: "pentagon-1",
    name: "Pentagon",
    category: "shapes",
    defaultColor: "#06b6d4",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l9 7-3.5 10h-11L3 9z"/></svg>`,
  },
  // Text/Phrases
  {
    id: "text-love",
    name: "LOVE",
    category: "text",
    defaultColor: "#ef4444",
    svg: `<svg viewBox="0 0 80 24" fill="currentColor"><text x="0" y="20" font-family="Arial Black, sans-serif" font-size="20" font-weight="bold">LOVE</text></svg>`,
  },
  {
    id: "text-cool",
    name: "COOL",
    category: "text",
    defaultColor: "#3b82f6",
    svg: `<svg viewBox="0 0 80 24" fill="currentColor"><text x="0" y="20" font-family="Arial Black, sans-serif" font-size="20" font-weight="bold">COOL</text></svg>`,
  },
  {
    id: "text-wow",
    name: "WOW",
    category: "text",
    defaultColor: "#8b5cf6",
    svg: `<svg viewBox="0 0 70 24" fill="currentColor"><text x="0" y="20" font-family="Arial Black, sans-serif" font-size="20" font-weight="bold">WOW!</text></svg>`,
  },
  {
    id: "text-omg",
    name: "OMG",
    category: "text",
    defaultColor: "#ec4899",
    svg: `<svg viewBox="0 0 70 24" fill="currentColor"><text x="0" y="20" font-family="Arial Black, sans-serif" font-size="20" font-weight="bold">OMG!</text></svg>`,
  },
  {
    id: "text-lol",
    name: "LOL",
    category: "text",
    defaultColor: "#fbbf24",
    svg: `<svg viewBox="0 0 60 24" fill="currentColor"><text x="0" y="20" font-family="Arial Black, sans-serif" font-size="20" font-weight="bold">LOL</text></svg>`,
  },
  {
    id: "text-xoxo",
    name: "XOXO",
    category: "text",
    defaultColor: "#f472b6",
    svg: `<svg viewBox="0 0 90 24" fill="currentColor"><text x="0" y="20" font-family="Arial Black, sans-serif" font-size="20" font-weight="bold">XOXO</text></svg>`,
  },
];

export const getClipartByCategory = (categoryId: string): ClipartItem[] => {
  if (categoryId === "popular") {
    return clipartItems.filter((item) => item.category === "popular");
  }
  return clipartItems.filter((item) => item.category === categoryId);
};
