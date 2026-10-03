// Computed Chromium shadows are comma-separated rgb()/rgba() entries. Ignore
// transparent composition slots and decorative shadows with blur/offset.
export const hasVisibleFocusRing = (boxShadow) =>
  boxShadow.split(/,(?![^()]*\))/).some((shadow) => {
    const color = shadow.match(/rgba?\(([^)]+)\)/);
    if (!color) return false;
    const channels = color[1].split(",");
    if (channels.length === 4 && Number(channels[3]) === 0) return false;
    const lengths = shadow.replace(color[0], "").match(/-?[\d.]+px/g)?.map(Number.parseFloat);
    return lengths?.[0] === 0 && lengths?.[1] === 0 && lengths?.[2] === 0 && lengths?.[3] >= 2;
  });
