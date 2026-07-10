import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.190.0/testing/asserts.ts";
import {
  buildKexiaozhanPaymentNotification,
  buildKexiaozhanPaymentStatusQuery,
  buildKexiaozhanSigningString,
  formatKexiaozhanPayTimeUtc,
  getKexiaozhanFulfillmentMethod,
  hmacSha256Hex,
  parseKexiaozhanPaymentNotificationExtraFields,
  timingSafeEqual,
  verifyKexiaozhanSignature,
} from "./kexiaozhan-payment.ts";

const MACHINE_KEY = "machine_test_key";

Deno.test("Kexiaozhan webhookUrl signature matches vendor vector", async () => {
  const fields = {
    order_no: "ORDER202606030001",
    out_trade_no: "PAY202606030001",
    amount: "12.30",
    goods_name: "Photo Print",
    currency: "CNY",
    machine_sn: "MACHINE_SN_001",
    timestamp: "1780497600",
    nonce: "n6Y8pK2z",
  };

  assertEquals(
    buildKexiaozhanSigningString(fields),
    "amount=12.30&currency=CNY&goods_name=Photo Print&machine_sn=MACHINE_SN_001&nonce=n6Y8pK2z&order_no=ORDER202606030001&out_trade_no=PAY202606030001&timestamp=1780497600",
  );
  assertEquals(
    await hmacSha256Hex(MACHINE_KEY, buildKexiaozhanSigningString(fields)),
    "3c5ac4c80fd2a08439bec24eb0913962153c2bb8f803489780a9b6bfb425cf49",
  );
});

Deno.test("Kexiaozhan callback signature matches legacy vendor vector", async () => {
  const notification = await buildKexiaozhanPaymentNotification({
    outTradeNo: "PAY202606030001",
    transactionId: "TP2026060300008888",
    amount: "12.30",
    extraInfo: "payment success",
    orderStatus: 1,
    payTime: "2026-06-03 20:10:30",
  }, MACHINE_KEY);

  assertEquals(
    notification.sign,
    "b9479b040c806e8852b6c7b4f9ae76c81eda5cae57d6707bf7fa8e13e133f332",
  );
});

Deno.test("Kexiaozhan callback signature supports Stripe PaymentIntent and RFC3339 payTime", async () => {
  const notification = await buildKexiaozhanPaymentNotification({
    outTradeNo: "PAY202606030001",
    transactionId: "pi_3Abc123Stripe456",
    amount: "12.30",
    extraInfo: "payment success",
    orderStatus: 1,
    payTime: "2006-01-02T15:04:05Z07:00",
  }, MACHINE_KEY);

  assertEquals(
    buildKexiaozhanSigningString(notification),
    "amount=12.30&extraInfo=payment success&orderStatus=1&outTradeNo=PAY202606030001&payTime=2006-01-02T15:04:05Z07:00&transactionId=pi_3Abc123Stripe456",
  );
  assertEquals(
    notification.sign,
    "514fd150a7ffc11bfaf826ea21cbb009fc877a425d8a13cddd2aed6e09617126",
  );
});

Deno.test("Kexiaozhan callback signature matches the immediate-print vendor vector", async () => {
  const extraFields = parseKexiaozhanPaymentNotificationExtraFields(
    '{"fulfillmentMethod":"immediatePrint"}',
  );
  const notification = await buildKexiaozhanPaymentNotification({
    outTradeNo: "PAY202606030001",
    transactionId: "TP2026060300008888",
    amount: "12.30",
    extraInfo: "payment success",
    orderStatus: 1,
    payTime: "2026-06-03 20:10:30",
    ...extraFields,
  }, MACHINE_KEY);

  assertEquals(notification.fulfillmentMethod, "immediatePrint");
  assertEquals(
    buildKexiaozhanSigningString(notification),
    "amount=12.30&extraInfo=payment success&fulfillmentMethod=immediatePrint&orderStatus=1&outTradeNo=PAY202606030001&payTime=2026-06-03 20:10:30&transactionId=TP2026060300008888",
  );
  assertEquals(
    notification.sign,
    "fd18e133b5b86aa731d9b09b585ce395adbab6cf1712e2913274b5265affc972",
  );
});

Deno.test("Kexiaozhan callback signature matches the deferred-print vendor vector", async () => {
  const notification = await buildKexiaozhanPaymentNotification({
    outTradeNo: "PAY202606030001",
    transactionId: "TP2026060300008888",
    amount: "12.30",
    extraInfo: "payment success",
    orderStatus: 1,
    payTime: "2026-06-03 20:10:30",
    fulfillmentMethod: "deferredPrint",
  }, MACHINE_KEY);

  assertEquals(
    buildKexiaozhanSigningString(notification),
    "amount=12.30&extraInfo=payment success&fulfillmentMethod=deferredPrint&orderStatus=1&outTradeNo=PAY202606030001&payTime=2026-06-03 20:10:30&transactionId=TP2026060300008888",
  );
  assertEquals(
    notification.sign,
    "90444590593c62c5426ad2c5dee673cffd88dcab6fdd5d3248f899ab152dccec",
  );
});

Deno.test("Kexiaozhan query signature matches vendor vector", async () => {
  const params = await buildKexiaozhanPaymentStatusQuery({
    outTradeNo: "PAY202606030001",
    machineSn: "MACHINE_SN_001",
  }, MACHINE_KEY);

  assertEquals(
    params.get("sign"),
    "204abff9a1295dbdc6c1d731b497bad6d944f45d03b22a328055bab50434d93b",
  );
  assertEquals(params.get("outTradeNo"), "PAY202606030001");
  assertEquals(params.get("machineSn"), "MACHINE_SN_001");
});

Deno.test("Kexiaozhan callback extra field config rejects unsafe values", () => {
  assertEquals(parseKexiaozhanPaymentNotificationExtraFields(undefined), {});

  assertThrows(
    () => parseKexiaozhanPaymentNotificationExtraFields("{"),
    Error,
    "valid JSON",
  );
  assertThrows(
    () =>
      parseKexiaozhanPaymentNotificationExtraFields(
        '{"outTradeNo":"override"}',
      ),
    Error,
    "cannot override outTradeNo",
  );
  assertThrows(
    () =>
      parseKexiaozhanPaymentNotificationExtraFields(
        '{"printMode":{"nested":true}}',
      ),
    Error,
    "string, number, or boolean",
  );
});

Deno.test("Kexiaozhan fulfillment mode accepts only exact vendor values", () => {
  assertEquals(
    getKexiaozhanFulfillmentMethod({ fulfillmentMethod: "deferredPrint" }),
    "deferredPrint",
  );
  assertEquals(
    getKexiaozhanFulfillmentMethod({ fulfillmentMethod: " immediatePrint" }),
    null,
  );
  assertEquals(
    getKexiaozhanFulfillmentMethod({ fulfillmentMethod: "admin_batch" }),
    null,
  );
  assertEquals(getKexiaozhanFulfillmentMethod({}), null);
});

Deno.test("Kexiaozhan signing excludes sign, empty, null, and undefined values", () => {
  assertEquals(
    buildKexiaozhanSigningString({
      sign: "ignored",
      z: "",
      b: null,
      c: undefined,
      a: 1,
      d: false,
    }),
    "a=1&d=false",
  );
});

Deno.test("Kexiaozhan signature verification is timing-safe and normalized", async () => {
  const fields = {
    machineSn: "MACHINE_SN_001",
    outTradeNo: "PAY202606030001",
  };
  const signature =
    "204abff9a1295dbdc6c1d731b497bad6d944f45d03b22a328055bab50434d93b";

  assertEquals(
    await verifyKexiaozhanSignature(
      fields,
      MACHINE_KEY,
      signature.toUpperCase(),
    ),
    true,
  );
  assertEquals(timingSafeEqual(signature, `${signature}0`), false);
});

Deno.test("Kexiaozhan signing fails closed without machineKey", async () => {
  await assertRejects(
    () => hmacSha256Hex("", "amount=12.30"),
    Error,
    "machineKey",
  );
});

Deno.test("Kexiaozhan payTime formatter emits UTC RFC3339 text", () => {
  assertEquals(
    formatKexiaozhanPayTimeUtc(new Date("2026-06-03T20:10:30.999Z")),
    "2026-06-03T20:10:30Z",
  );
});
