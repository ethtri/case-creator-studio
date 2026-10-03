type ViewportBounds = { height: number; offsetTop: number } | null;

/**
 * The editor starts at the layout viewport origin. A panned visual viewport's
 * bottom is offsetTop + height, not height alone (CSSOM View).
 * Do not subtract the shell's scrolling client rect: that would feed the new
 * shell height back into the document's scroll range. Keep the result within
 * the layout viewport, including during zoom, overscroll and stale events.
 */
export function editorViewportHeight(layoutHeight: number, viewport: ViewportBounds): number {
  const layout = Number.isFinite(layoutHeight) ? Math.max(0, layoutHeight) : 0;
  if (!viewport || !Number.isFinite(viewport.height) || viewport.height <= 0) return layout;
  const offset = Number.isFinite(viewport.offsetTop) ? Math.max(0, viewport.offsetTop) : 0;
  return Math.min(layout, viewport.height + offset);
}
