import { assertEquals } from "jsr:@std/assert";
import {
  evaluateKexiaozhanApiResponse,
  KEXIAOZHAN_API_RESPONSE_MAX_BYTES,
} from "./kexiaozhan-api-response.ts";

Deno.test("accepts only HTTP success with vendor code zero", () => {
  assertEquals(
    evaluateKexiaozhanApiResponse(
      200,
      true,
      '{"code":0,"msg":"success","data":{}}',
    ),
    {
      ok: true,
      status: 200,
      code: 0,
      message: "success",
      error: null,
    },
  );
  assertEquals(
    evaluateKexiaozhanApiResponse(200, true, '{"code":"0"}').ok,
    true,
  );
});

Deno.test("treats HTTP 200 business errors as failures", () => {
  assertEquals(
    evaluateKexiaozhanApiResponse(
      200,
      true,
      '{"code":1003,"msg":"order not found"}',
    ),
    {
      ok: false,
      status: 200,
      code: 1003,
      message: "order not found",
      error: "vendor_business_error",
    },
  );
});

Deno.test("rejects missing code, malformed JSON, and non-object JSON", () => {
  assertEquals(
    evaluateKexiaozhanApiResponse(200, true, '{"msg":"success"}').error,
    "missing_or_invalid_vendor_code",
  );
  assertEquals(
    evaluateKexiaozhanApiResponse(200, true, "<html>ok</html>").error,
    "invalid_json_response",
  );
  assertEquals(
    evaluateKexiaozhanApiResponse(200, true, "[]").error,
    "invalid_json_response",
  );
});

Deno.test("keeps HTTP failure authoritative and bounds stored metadata", () => {
  assertEquals(
    evaluateKexiaozhanApiResponse(
      503,
      false,
      '{"code":0,"msg":"temporarily unavailable"}',
    ),
    {
      ok: false,
      status: 503,
      code: 0,
      message: "temporarily unavailable",
      error: "http_error",
    },
  );

  const oversized = "x".repeat(KEXIAOZHAN_API_RESPONSE_MAX_BYTES + 1);
  assertEquals(
    evaluateKexiaozhanApiResponse(200, true, oversized),
    {
      ok: false,
      status: 200,
      code: null,
      message: null,
      error: "response_too_large",
    },
  );
});

Deno.test("normalizes control characters and truncates vendor messages", () => {
  const message = `bad\u0000  request ${"x".repeat(400)}`;
  const result = evaluateKexiaozhanApiResponse(
    200,
    true,
    JSON.stringify({ code: 2, msg: message }),
  );
  assertEquals(result.message?.includes("\u0000"), false);
  assertEquals(result.message?.length, 240);
});
