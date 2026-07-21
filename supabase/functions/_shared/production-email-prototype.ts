const MAX_PRODUCT_LENGTH = 100;
const MAX_MODEL_LENGTH = 100;
const MAX_LOCATION_LENGTH = 80;
const MAX_DESIGN_LABEL_LENGTH = 120;
const MAX_QUANTITY = 99;

export type ProductionEmailPrototypeInput = {
  orderId: string;
  product: string;
  model: string;
  quantity: number;
  destinationCity: string;
  destinationRegion: string;
  designLabel: string;
  previewContentId: string;
  siteUrl: string;
  generatedAt: string;
};

export type RenderedProductionEmailPrototype = {
  subject: string;
  html: string;
  text: string;
  orderReference: string;
  operationsUrl: string;
  previewContentId: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const RFC3339_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:Z|[+-]\d{2}:\d{2})$/;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function boundedText(value: string, label: string, maxLength: number): string {
  const normalized = value.trim();
  const hasControlCharacter = [...normalized].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127;
  });
  if (
    !normalized ||
    normalized.length > maxLength ||
    hasControlCharacter
  ) {
    throw new Error(`${label} must be non-empty, bounded text`);
  }
  return normalized;
}

function normalizeGeneratedAt(value: string): string {
  const match = RFC3339_PATTERN.exec(value);
  if (value !== value.trim() || !match) {
    throw new Error("generatedAt must be an RFC3339 timestamp");
  }
  const [, year, month, day, hour, minute, second] = match;
  const wallClock = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ),
  );
  if (
    wallClock.getUTCFullYear() !== Number(year) ||
    wallClock.getUTCMonth() !== Number(month) - 1 ||
    wallClock.getUTCDate() !== Number(day) ||
    wallClock.getUTCHours() !== Number(hour) ||
    wallClock.getUTCMinutes() !== Number(minute) ||
    wallClock.getUTCSeconds() !== Number(second)
  ) {
    throw new Error("generatedAt must be an RFC3339 timestamp");
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error("generatedAt must be an RFC3339 timestamp");
  }
  return parsed.toISOString();
}

function buildOperationsUrl(siteUrl: string): string {
  let baseUrl: URL;
  try {
    baseUrl = new URL(siteUrl);
  } catch {
    throw new Error("siteUrl must be a valid HTTPS origin");
  }

  if (
    baseUrl.protocol !== "https:" ||
    !(
      baseUrl.hostname === "snapcase.ai" ||
      baseUrl.hostname.endsWith(".snapcase.ai")
    ) ||
    baseUrl.port ||
    baseUrl.username ||
    baseUrl.password ||
    baseUrl.search ||
    baseUrl.hash ||
    (baseUrl.pathname !== "/" && baseUrl.pathname !== "")
  ) {
    throw new Error("siteUrl must be a valid HTTPS origin");
  }

  return new URL("/operations", baseUrl).toString();
}

export function formatSnapcaseOrderReference(orderId: string): string {
  const normalized = orderId.trim();
  if (!UUID_PATTERN.test(normalized)) {
    throw new Error("orderId must be a UUID");
  }
  return `SC-${normalized.toUpperCase()}`;
}

export function renderProductionEmailPrototype(
  input: ProductionEmailPrototypeInput,
): RenderedProductionEmailPrototype {
  const orderReference = formatSnapcaseOrderReference(input.orderId);
  const product = boundedText(input.product, "product", MAX_PRODUCT_LENGTH);
  const model = boundedText(input.model, "model", MAX_MODEL_LENGTH);
  const destinationCity = boundedText(
    input.destinationCity,
    "destinationCity",
    MAX_LOCATION_LENGTH,
  );
  const destinationRegion = boundedText(
    input.destinationRegion,
    "destinationRegion",
    MAX_LOCATION_LENGTH,
  );
  const designLabel = boundedText(
    input.designLabel,
    "designLabel",
    MAX_DESIGN_LABEL_LENGTH,
  );
  if (
    !Number.isInteger(input.quantity) || input.quantity < 1 ||
    input.quantity > MAX_QUANTITY
  ) {
    throw new Error(
      `quantity must be an integer between 1 and ${MAX_QUANTITY}`,
    );
  }
  if (!CONTENT_ID_PATTERN.test(input.previewContentId)) {
    throw new Error("previewContentId must be a safe inline content ID");
  }

  const generatedAt = normalizeGeneratedAt(input.generatedAt);
  const operationsUrl = buildOperationsUrl(input.siteUrl);
  const destination = `${destinationCity}, ${destinationRegion}`;
  const subject = `Production review: ${orderReference}`;

  const html = `
  <div style="font-family: Arial, Helvetica, sans-serif; background-color: #f4f5f7; padding: 24px; color: #171717;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #dedede; border-radius: 8px; padding: 24px;">
      <p style="margin: 0 0 6px 0; color: #555555; font-size: 13px;">Snapcase production reference</p>
      <h1 style="font-size: 22px; line-height: 1.3; margin: 0 0 18px 0; letter-spacing: 0;">${
    escapeHtml(orderReference)
  }</h1>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; margin: 0 0 20px 0;">
        <tr><td style="padding: 6px 0; color: #666666; width: 120px;">Product</td><td style="padding: 6px 0; font-weight: 700;">${
    escapeHtml(product)
  }</td></tr>
        <tr><td style="padding: 6px 0; color: #666666;">Model</td><td style="padding: 6px 0; font-weight: 700;">${
    escapeHtml(model)
  }</td></tr>
        <tr><td style="padding: 6px 0; color: #666666;">Quantity</td><td style="padding: 6px 0; font-weight: 700;">${input.quantity}</td></tr>
        <tr><td style="padding: 6px 0; color: #666666;">Destination</td><td style="padding: 6px 0; font-weight: 700;">${
    escapeHtml(destination)
  }</td></tr>
      </table>

      <p style="margin: 0 0 8px 0; font-weight: 700;">Design preview</p>
      <img src="cid:${
    escapeHtml(input.previewContentId)
  }" width="552" height="552" alt="${
    escapeHtml(designLabel)
  }" style="display: block; width: 100%; max-width: 552px; height: auto; aspect-ratio: 1 / 1; object-fit: contain; border: 1px solid #d7d7d7; border-radius: 6px; background-color: #f8f8f8;" />
      <p style="margin: 8px 0 20px 0; color: #666666; font-size: 13px;">${
    escapeHtml(designLabel)
  }</p>

      <div style="border: 1px solid #e0b44c; background-color: #fff8e6; border-radius: 6px; padding: 14px; margin: 0 0 16px 0;">
        <p style="margin: 0; font-weight: 700;">Information can become stale</p>
        <p style="margin: 6px 0 0 0; line-height: 1.5;">This is a point-in-time reference generated at ${
    escapeHtml(generatedAt)
  }. Sign in to Snapcase Operations and use the current order record as the source of truth.</p>
      </div>

      <div style="border: 2px solid #b42318; background-color: #fff4f2; border-radius: 6px; padding: 14px; margin: 0 0 20px 0;">
        <p style="margin: 0; color: #8f1d16; font-weight: 700;">STOP AND REVIEW IF ANYTHING DOES NOT MATCH</p>
        <p style="margin: 6px 0 0 0; line-height: 1.5;">Do not print or ship if the physical case, model, quantity, or design differs from this reference. Move the item to review and record the mismatch in Operations.</p>
      </div>

      <p style="margin: 0 0 18px 0; text-align: center;">
        <a href="${
    escapeHtml(operationsUrl)
  }" style="display: inline-block; background-color: #171717; color: #ffffff; text-decoration: none; font-weight: 700; padding: 12px 18px; border-radius: 6px;">Open authenticated Operations</a>
      </p>

      <p style="margin: 0 0 8px 0; color: #555555; font-size: 13px; line-height: 1.5;">Full shipping details are intentionally omitted. The Operations page requires an approved Snapcase operator account. Forwarding may copy the inline design preview, but it does not grant Operations access.</p>
      <p style="margin: 0; color: #555555; font-size: 13px; line-height: 1.5;">This email is a visual aid only. It does not prove which Kexiaozhan job was selected or identify an otherwise anonymous physical output.</p>
    </div>
  </div>
  `;

  const text = [
    "SNAPCASE PRODUCTION REVIEW",
    `Order: ${orderReference}`,
    `Product: ${product}`,
    `Model: ${model}`,
    `Quantity: ${input.quantity}`,
    `Destination: ${destination}`,
    `Design preview: inline image (${designLabel})`,
    "",
    "INFORMATION CAN BECOME STALE",
    `This is a point-in-time reference generated at ${generatedAt}. Sign in to Snapcase Operations and use the current order record as the source of truth.`,
    "",
    "STOP AND REVIEW IF ANYTHING DOES NOT MATCH",
    "Do not print or ship if the physical case, model, quantity, or design differs from this reference. Move the item to review and record the mismatch in Operations.",
    "",
    `Authenticated Operations: ${operationsUrl}`,
    "Full shipping details are intentionally omitted. Forwarding may copy the inline design preview, but it does not grant Operations access.",
    "This email is a visual aid only. It does not prove which Kexiaozhan job was selected or identify an otherwise anonymous physical output.",
  ].join("\n");

  return {
    subject,
    html,
    text,
    orderReference,
    operationsUrl,
    previewContentId: input.previewContentId,
  };
}
