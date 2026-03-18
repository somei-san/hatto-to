import { test, expect } from "./fixtures";

async function check(page: any, text: string): Promise<boolean> {
  return page.evaluate((t: string) => (window as any).hasMarkdownSyntax(t), text);
}

test.describe("hasMarkdownSyntax", () => {
  // ── Headings ──────────────────────────────────────────
  test("# heading → true", async ({ notePage }) => {
    expect(await check(notePage, "# Heading")).toBe(true);
  });

  test("## heading → true", async ({ notePage }) => {
    expect(await check(notePage, "## Heading")).toBe(true);
  });

  test("### heading → true", async ({ notePage }) => {
    expect(await check(notePage, "### Heading")).toBe(true);
  });

  // ── Bullet lists ──────────────────────────────────────
  test("- item → true", async ({ notePage }) => {
    expect(await check(notePage, "- item")).toBe(true);
  });

  test("* item → true", async ({ notePage }) => {
    expect(await check(notePage, "* item")).toBe(true);
  });

  // ── Checkboxes ────────────────────────────────────────
  test("- [ ] task → true", async ({ notePage }) => {
    expect(await check(notePage, "- [ ] task")).toBe(true);
  });

  test("- [x] done → true", async ({ notePage }) => {
    expect(await check(notePage, "- [x] done")).toBe(true);
  });

  // ── Blockquote ────────────────────────────────────────
  test("> quote → true", async ({ notePage }) => {
    expect(await check(notePage, "> quoted text")).toBe(true);
  });

  // ── Ordered list ──────────────────────────────────────
  test("1. item → true", async ({ notePage }) => {
    expect(await check(notePage, "1. first item")).toBe(true);
  });

  // ── Horizontal rule ───────────────────────────────────
  test("--- → true", async ({ notePage }) => {
    expect(await check(notePage, "---")).toBe(true);
  });

  test("***  → true", async ({ notePage }) => {
    expect(await check(notePage, "***")).toBe(true);
  });

  test("___ → true", async ({ notePage }) => {
    expect(await check(notePage, "___")).toBe(true);
  });

  // ── Bold ──────────────────────────────────────────────
  test("**bold** → true", async ({ notePage }) => {
    expect(await check(notePage, "some **bold** text")).toBe(true);
  });

  // ── Italic ────────────────────────────────────────────
  test("*italic* → true", async ({ notePage }) => {
    expect(await check(notePage, "some *italic* text")).toBe(true);
  });

  test("*italic* not confused with bullet * ", async ({ notePage }) => {
    // "* " at line start is a bullet, not italic — but still returns true (as bullet)
    expect(await check(notePage, "* list item")).toBe(true);
  });

  // ── Strikethrough ─────────────────────────────────────
  test("~~strike~~ → true", async ({ notePage }) => {
    expect(await check(notePage, "some ~~deleted~~ text")).toBe(true);
  });

  // ── Inline code ───────────────────────────────────────
  test("`code` → true", async ({ notePage }) => {
    expect(await check(notePage, "use `const x` here")).toBe(true);
  });

  // ── Link ──────────────────────────────────────────────
  test("[text](url) → true", async ({ notePage }) => {
    expect(await check(notePage, "click [here](https://example.com)")).toBe(true);
  });

  // ── Image ─────────────────────────────────────────────
  test("![alt](url) → true", async ({ notePage }) => {
    expect(await check(notePage, "![logo](https://example.com/img.png)")).toBe(true);
  });

  // ── Negative cases ────────────────────────────────────
  test("plain text → false", async ({ notePage }) => {
    expect(await check(notePage, "just plain text here")).toBe(false);
  });

  test("empty string → false", async ({ notePage }) => {
    expect(await check(notePage, "")).toBe(false);
  });

  test("symbols but not markdown → false", async ({ notePage }) => {
    expect(await check(notePage, "価格は$100～$200")).toBe(false);
  });

  // ── Multiline detection ───────────────────────────────
  test("markdown on second line detected", async ({ notePage }) => {
    expect(await check(notePage, "plain text\n## heading")).toBe(true);
  });

  test("multiline plain text → false", async ({ notePage }) => {
    expect(await check(notePage, "line one\nline two\nline three")).toBe(false);
  });
});
