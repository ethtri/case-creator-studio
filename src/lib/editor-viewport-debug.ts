export const isViewportDebugEnabled = (params: URLSearchParams) =>
  params.get("viewportDebug") === "1";

type Rect = { x: number; y: number; width: number; height: number; top: number; right: number; bottom: number; left: number };
type DebugInput = {
  timestamp: string;
  innerHeight: number;
  clientHeight: number;
  scrollY?: number;
  dynamicViewportHeight?: number;
  viewport: { height: number; width: number; offsetTop: number; offsetLeft: number; scale: number } | null;
  rects: Record<"shell" | "area" | "container" | "iframe", Rect | null>;
};

const rounded = (value: number) => Math.round(value * 100) / 100;
const rectValues = (rect: Rect | null) => rect ? Object.fromEntries(
  (["x", "y", "width", "height", "top", "right", "bottom", "left"] as const)
    .map((key) => [key, rounded(rect[key])]),
) : null;

// Explicit allowlist: no location, design content, identifiers or arbitrary input fields.
export const buildViewportSnapshot = (input: DebugInput) => ({
  timestamp: input.timestamp,
  innerHeight: rounded(input.innerHeight),
  clientHeight: rounded(input.clientHeight),
  scrollY: input.scrollY === undefined ? null : rounded(input.scrollY),
  dynamicViewportHeight: input.dynamicViewportHeight === undefined ? null : rounded(input.dynamicViewportHeight),
  visualViewport: input.viewport ? {
    height: rounded(input.viewport.height), width: rounded(input.viewport.width),
    offsetTop: rounded(input.viewport.offsetTop), offsetLeft: rounded(input.viewport.offsetLeft),
    scale: rounded(input.viewport.scale),
  } : null,
  rects: {
    shell: rectValues(input.rects.shell), area: rectValues(input.rects.area),
    container: rectValues(input.rects.container), iframe: rectValues(input.rects.iframe),
  },
});

export const describeDebugBrowser = (userAgent: string) => {
  const browser = userAgent.match(/(EdgiOS|Edg|CriOS|FxiOS)\/([\d.]+)/)
    ?? userAgent.match(/(Chrome|Firefox)\/([\d.]+)/)
    ?? userAgent.match(/(Version)\/([\d.]+).*Safari/);
  const os = userAgent.match(/(?:iPhone OS|CPU OS) ([\d_]+)/)
    ?? userAgent.match(/Android ([\d.]+)/);
  return {
    browser: browser ? `${browser[1] === "Version" ? "Safari" : browser[1]} ${browser[2]}` : "Unidentified browser",
    os: os ? `${/Android/.test(os[0]) ? "Android" : "iOS"} ${os[1].replace(/_/g, ".")}` : "OS unavailable",
    note: "Browser/OS tokens only; physical phone model and actual app context are not detected.",
  };
};
