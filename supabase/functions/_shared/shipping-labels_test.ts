import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.190.0/testing/asserts.ts";
import {
  buildManualLabelPath,
  hasPdfMagic,
  isPdfFile,
  isShippingLabelFormat,
  MAX_MANUAL_LABEL_BYTES,
  parseSignedUrlTtlSeconds,
  toSafeShippingLabel,
} from "./shipping-labels.ts";

Deno.test("manual label validation requires a bounded PDF", () => {
  assert(isPdfFile({ name: "label.PDF", type: "application/pdf", size: 100 }));
  assertFalse(
    isPdfFile({ name: "label.txt", type: "application/pdf", size: 100 }),
  );
  assertFalse(isPdfFile({ name: "label.pdf", type: "text/plain", size: 100 }));
  assertFalse(isPdfFile({
    name: "label.pdf",
    type: "application/pdf",
    size: MAX_MANUAL_LABEL_BYTES + 1,
  }));
});

Deno.test("manual label bytes require PDF magic", () => {
  assert(hasPdfMagic(new TextEncoder().encode("%PDF-1.7")));
  assertFalse(hasPdfMagic(new TextEncoder().encode("<html>")));
});

Deno.test("manual storage paths ignore uploaded filenames", () => {
  assertEquals(
    buildManualLabelPath(
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ),
    "manual/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.pdf",
  );
});

Deno.test("label format and signed URL TTL fail closed", () => {
  assert(isShippingLabelFormat("pdf_4x6"));
  assert(isShippingLabelFormat("pdf_letter"));
  assertFalse(isShippingLabelFormat("zpl"));
  assertEquals(parseSignedUrlTtlSeconds(undefined), 60);
  assertEquals(parseSignedUrlTtlSeconds("120"), 120);
  assertEquals(parseSignedUrlTtlSeconds("900"), 60);
});

Deno.test("safe label summaries never expose storage or provider URLs", () => {
  const safe = toSafeShippingLabel({
    id: "label-id",
    production_job_id: "job-id",
    provider: "easypost",
    state: "purchased",
    label_storage_path: "private/path.pdf",
    provider_shipment_id: "shp_secret",
    label_url: "https://provider.example/label.pdf",
  });

  assertEquals(safe.id, "label-id");
  assertFalse("label_storage_path" in safe);
  assertFalse("provider_shipment_id" in safe);
  assertFalse("label_url" in safe);
});
