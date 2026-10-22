import test from "node:test";
import assert from "node:assert/strict";
import { resolveTheme, normalizeTheme } from "../src/theme.js";
test("theme resolves: system follows the OS, explicit wins", () => {
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
  assert.equal(normalizeTheme("purple"), "system");
});
