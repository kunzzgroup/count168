import test from "node:test";
import assert from "node:assert/strict";

import {
  parseRemoveWordChips,
  resolveSubmittedRemoveWordChips,
  serializeRemoveWordChips,
} from "./removeWordChips.js";

test("includes an uncommitted draft when the process form is submitted", () => {
  assert.equal(resolveSubmittedRemoveWordChips("", "TEST"), "TEST");
});

test("merges the draft with existing chips without duplicates", () => {
  assert.equal(resolveSubmittedRemoveWordChips("FIRST,TEST", "test"), "FIRST,TEST");
  assert.equal(resolveSubmittedRemoveWordChips("FIRST", "SECOND"), "FIRST,SECOND");
});

test("preserves original casing for chips", () => {
  assert.deepEqual(parseRemoveWordChips("Hello,World"), ["Hello", "World"]);
  assert.equal(serializeRemoveWordChips(["Hello", "mixedCase"]), "Hello,mixedCase");
});

test("dedupes chips case-insensitively and keeps the first casing", () => {
  assert.deepEqual(parseRemoveWordChips("Hello,hello,HELLO"), ["Hello"]);
  assert.equal(resolveSubmittedRemoveWordChips("Hello", "HELLO"), "Hello");
});

test("parses legacy semicolon values and serializes as commas", () => {
  assert.deepEqual(parseRemoveWordChips("sad;aa;aaa"), ["sad", "aa", "aaa"]);
  assert.equal(serializeRemoveWordChips(parseRemoveWordChips("sad;aa;aaa")), "sad,aa,aaa");
  assert.deepEqual(parseRemoveWordChips("sad, aa; aaa"), ["sad", "aa", "aaa"]);
});
