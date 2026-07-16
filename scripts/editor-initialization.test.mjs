import assert from "node:assert/strict";
import test from "node:test";

import { createEditorInitializationGuard } from "../src/lib/editor-initialization.ts";

test("blocks duplicate and completed initialization for the same design", () => {
  const guard = createEditorInitializationGuard();

  assert.equal(guard.begin("variant:design"), true);
  assert.equal(guard.begin("variant:design"), false);
  assert.equal(guard.isCurrent("variant:design"), true);

  guard.complete("variant:design");

  assert.equal(guard.begin("variant:design"), false);
  assert.equal(guard.begin("variant:another-design"), false);
  assert.equal(guard.isCurrent("variant:design"), false);
});

test("allows retry after an initialization failure", () => {
  const guard = createEditorInitializationGuard();

  assert.equal(guard.begin("variant:design"), true);
  guard.fail("variant:design");
  assert.equal(guard.begin("variant:design"), true);
});

test("ignores stale completion when a new design supersedes an in-flight request", () => {
  const guard = createEditorInitializationGuard();

  assert.equal(guard.begin("variant:first"), true);
  assert.equal(guard.begin("variant:second"), true);

  guard.complete("variant:first");

  assert.equal(guard.isCurrent("variant:second"), true);
  guard.complete("variant:second");
  assert.equal(guard.begin("variant:second"), false);
});
