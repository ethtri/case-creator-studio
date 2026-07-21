import {
  assertEquals,
  assertMatch,
  assertNotMatch,
  assertThrows,
} from "https://deno.land/std@0.190.0/testing/asserts.ts";
import {
  formatSnapcaseOrderReference,
  type ProductionEmailPrototypeInput,
  renderProductionEmailPrototype,
} from "./production-email-prototype.ts";

const BASE_INPUT: ProductionEmailPrototypeInput = {
  orderId: "01919e8a-7f65-7db4-8f6f-aaaaaaaaaaaa",
  product: "Custom Phone Case",
  model: "iPhone 16 Pro Max",
  quantity: 1,
  destinationCity: "Testville",
  destinationRegion: "CA",
  designLabel: "Synthetic cobalt grid design",
  previewContentId: "snapcase-test-cobalt-grid",
  siteUrl: "https://staging.snapcase.ai",
  generatedAt: "2026-07-20T18:30:00Z",
};

Deno.test("production email prototype renders bounded operational context and warnings", () => {
  const rendered = renderProductionEmailPrototype(BASE_INPUT);

  assertEquals(
    rendered.orderReference,
    "SC-01919E8A-7F65-7DB4-8F6F-AAAAAAAAAAAA",
  );
  assertEquals(
    rendered.operationsUrl,
    "https://staging.snapcase.ai/operations",
  );
  assertEquals(rendered.previewContentId, "snapcase-test-cobalt-grid");
  assertMatch(rendered.subject, /SC-01919E8A-7F65-7DB4-8F6F-AAAAAAAAAAAA/);
  assertMatch(rendered.html, /Custom Phone Case/);
  assertMatch(rendered.html, /iPhone 16 Pro Max/);
  assertMatch(rendered.html, />1</);
  assertMatch(rendered.html, /Testville, CA/);
  assertMatch(rendered.html, /src="cid:snapcase-test-cobalt-grid"/);
  assertMatch(rendered.html, /width="552" height="552"/);
  assertMatch(rendered.html, /Information can become stale/i);
  assertMatch(rendered.html, /STOP AND REVIEW IF ANYTHING DOES NOT MATCH/);
  assertMatch(rendered.html, /requires an approved Snapcase operator account/);
  assertMatch(rendered.html, /Forwarding may copy the inline design preview/);
  assertMatch(
    rendered.html,
    /does not prove which Kexiaozhan job was selected/,
  );
  assertMatch(
    rendered.text,
    /Authenticated Operations: https:\/\/staging\.snapcase\.ai\/operations/,
  );
});

Deno.test("production email prototype does not emit PII or permanent artwork links", () => {
  const rendered = renderProductionEmailPrototype(BASE_INPUT);
  const combined = `${rendered.subject}\n${rendered.html}\n${rendered.text}`;

  assertNotMatch(combined, /@/);
  assertNotMatch(combined, /123 Main Street/);
  assertNotMatch(combined, /555-0100/);
  assertNotMatch(rendered.html, /<img[^>]+src="https?:/i);
  assertNotMatch(rendered.operationsUrl, /[?#]/);
  assertEquals(new URL(rendered.operationsUrl).pathname, "/operations");
});

Deno.test("three same-model synthetic emails remain identifiable without arrival order", () => {
  const fixtures = [
    {
      orderId: "01919e8a-7f65-7db4-8f6f-aaaaaaaaaaaa",
      designLabel: "Synthetic cobalt grid design",
      previewContentId: "snapcase-test-cobalt-grid",
    },
    {
      orderId: "01919e8a-7f65-7db4-8f6f-bbbbbbbbbbbb",
      designLabel: "Synthetic coral stripe design",
      previewContentId: "snapcase-test-coral-stripe",
    },
    {
      orderId: "01919e8a-7f65-7db4-8f6f-cccccccccccc",
      designLabel: "Synthetic monochrome type design",
      previewContentId: "snapcase-test-mono-type",
    },
  ];

  const rendered = fixtures.toReversed().map((fixture) =>
    renderProductionEmailPrototype({ ...BASE_INPUT, ...fixture })
  );

  assertEquals(new Set(rendered.map((email) => email.subject)).size, 3);
  assertEquals(
    new Set(rendered.map((email) => email.previewContentId)).size,
    3,
  );
  for (const fixture of fixtures) {
    const orderReference = formatSnapcaseOrderReference(fixture.orderId);
    const matchingEmail = rendered.find((email) =>
      email.subject.includes(orderReference)
    );
    assertMatch(matchingEmail?.html ?? "", new RegExp(fixture.designLabel));
    assertMatch(
      matchingEmail?.html ?? "",
      new RegExp(`cid:${fixture.previewContentId}`),
    );
  }
});

Deno.test("production email prototype fails closed on unsafe identifiers and links", () => {
  assertThrows(
    () =>
      renderProductionEmailPrototype({ ...BASE_INPUT, orderId: "ORDER-123" }),
    Error,
    "orderId must be a UUID",
  );
  assertThrows(
    () => renderProductionEmailPrototype({ ...BASE_INPUT, quantity: 0 }),
    Error,
    "quantity must be an integer",
  );
  assertThrows(
    () =>
      renderProductionEmailPrototype({
        ...BASE_INPUT,
        previewContentId: "https://cdn.example.com/artwork.png",
      }),
    Error,
    "safe inline content ID",
  );
  for (
    const siteUrl of [
      "http://staging.snapcase.ai",
      "https://staging.snapcase.ai/?token=secret",
      "https://operator:secret@staging.snapcase.ai",
      "https://staging.snapcase.ai/somewhere",
      "https://snapcase.example.com",
      "https://staging.snapcase.ai:8443",
    ]
  ) {
    assertThrows(
      () => renderProductionEmailPrototype({ ...BASE_INPUT, siteUrl }),
      Error,
      "valid HTTPS origin",
    );
  }
  assertThrows(
    () =>
      renderProductionEmailPrototype({
        ...BASE_INPUT,
        generatedAt: "2026-07-20T18:30:00",
      }),
    Error,
    "RFC3339 timestamp",
  );
  assertThrows(
    () =>
      renderProductionEmailPrototype({
        ...BASE_INPUT,
        generatedAt: "2026-02-31T18:30:00Z",
      }),
    Error,
    "RFC3339 timestamp",
  );
});

Deno.test("production email prototype escapes bounded display fields", () => {
  const rendered = renderProductionEmailPrototype({
    ...BASE_INPUT,
    product: "Custom <Case>",
    designLabel: 'Synthetic "contrast" design',
  });

  assertMatch(rendered.html, /Custom &lt;Case&gt;/);
  assertMatch(rendered.html, /Synthetic &quot;contrast&quot; design/);
  assertNotMatch(rendered.html, /Custom <Case>/);
});
