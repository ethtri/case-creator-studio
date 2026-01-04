export const isPreviewUrl = (preview?: string | null) =>
  typeof preview === "string" && /^https?:\/\//.test(preview);
