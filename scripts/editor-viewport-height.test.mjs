import test from "node:test";
import assert from "node:assert/strict";
import { editorViewportHeight } from "../src/lib/editor-viewport-height.ts";

test("normal, toolbar and orientation states retain their visible bottom", () => {
  assert.equal(editorViewportHeight(844, { height: 844, offsetTop: 0 }), 844);
  assert.equal(editorViewportHeight(844, { height: 744, offsetTop: 100 }), 844);
  assert.equal(editorViewportHeight(390, { height: 290, offsetTop: 40 }), 330);
});

test("keyboard pan uses the keyboard's visible bottom without a full-height fallback", () => {
  assert.equal(editorViewportHeight(844, { height: 444, offsetTop: 200 }), 644);
  assert.equal(editorViewportHeight(844, { height: 444, offsetTop: 0 }), 444);
  assert.equal(editorViewportHeight(844, { height: 844, offsetTop: 0 }), 844);
});

test("pinch pan remains in CSS coordinates and cannot extend layout scroll range", () => {
  assert.equal(editorViewportHeight(844, { height: 703.33, offsetTop: 80 }), 783.33);
  assert.equal(editorViewportHeight(844, { height: 703.33, offsetTop: 300 }), 844);
  // Current document scroll/shell client rect are intentionally not inputs.
  for (let i = 0; i < 10; i++) assert.equal(editorViewportHeight(844, { height: 744, offsetTop: 100 }), 844);
});

test("negative bounce and unavailable/invalid viewport values cannot inflate the shell", () => {
  assert.equal(editorViewportHeight(844, { height: 744, offsetTop: -40 }), 744);
  assert.equal(editorViewportHeight(844, { height: 744, offsetTop: Infinity }), 744);
  assert.equal(editorViewportHeight(844, { height: Infinity, offsetTop: 0 }), 844);
  assert.equal(editorViewportHeight(844, null), 844);
});
