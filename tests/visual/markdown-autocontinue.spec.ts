import { test, expect } from "./fixtures";

async function getAutoPrefix(page: any, text: string): Promise<string | null> {
  return page.evaluate((t: string) => (window as any).getAutoPrefix(t), text);
}

async function isEmptyListItem(page: any, text: string): Promise<boolean> {
  return page.evaluate((t: string) => (window as any).isEmptyListItem(t), text);
}

test.describe("getAutoPrefix", () => {
  // ── Bullet lists ────────────────────────────────────────
  test("- item → '- '", async ({ notePage }) => {
    expect(await getAutoPrefix(notePage, "- item")).toBe("- ");
  });

  test("* item → '* '", async ({ notePage }) => {
    expect(await getAutoPrefix(notePage, "* item")).toBe("* ");
  });

  // ── Checkboxes ──────────────────────────────────────────
  test("- [ ] task → '- [ ] '", async ({ notePage }) => {
    expect(await getAutoPrefix(notePage, "- [ ] task")).toBe("- [ ] ");
  });

  test("- [x] done → '- [ ] ' (unchecked continuation)", async ({ notePage }) => {
    expect(await getAutoPrefix(notePage, "- [x] done")).toBe("- [ ] ");
  });

  // ── Ordered list ────────────────────────────────────────
  test("1. item → '2. '", async ({ notePage }) => {
    expect(await getAutoPrefix(notePage, "1. item")).toBe("2. ");
  });

  test("9. item → '10. '", async ({ notePage }) => {
    expect(await getAutoPrefix(notePage, "9. item")).toBe("10. ");
  });

  // ── Blockquote ──────────────────────────────────────────
  test("> quote → '> '", async ({ notePage }) => {
    expect(await getAutoPrefix(notePage, "> quote")).toBe("> ");
  });

  // ── Non-matching lines ──────────────────────────────────
  test("plain text → null", async ({ notePage }) => {
    expect(await getAutoPrefix(notePage, "plain text")).toBeNull();
  });

  test("# heading → null", async ({ notePage }) => {
    expect(await getAutoPrefix(notePage, "# heading")).toBeNull();
  });

  test("empty string → null", async ({ notePage }) => {
    expect(await getAutoPrefix(notePage, "")).toBeNull();
  });
});

test.describe("isEmptyListItem", () => {
  // ── Should cancel (empty prefix) ───────────────────────
  test("'- ' → true", async ({ notePage }) => {
    expect(await isEmptyListItem(notePage, "- ")).toBe(true);
  });

  test("'* ' → true", async ({ notePage }) => {
    expect(await isEmptyListItem(notePage, "* ")).toBe(true);
  });

  test("'- [ ] ' → true", async ({ notePage }) => {
    expect(await isEmptyListItem(notePage, "- [ ] ")).toBe(true);
  });

  test("'1. ' → true", async ({ notePage }) => {
    expect(await isEmptyListItem(notePage, "1. ")).toBe(true);
  });

  test("'> ' → true", async ({ notePage }) => {
    expect(await isEmptyListItem(notePage, "> ")).toBe(true);
  });

  // ── Should NOT cancel (has content) ────────────────────
  test("'- text' → false", async ({ notePage }) => {
    expect(await isEmptyListItem(notePage, "- text")).toBe(false);
  });

  test("'1. item' → false", async ({ notePage }) => {
    expect(await isEmptyListItem(notePage, "1. item")).toBe(false);
  });

  test("'> quoted' → false", async ({ notePage }) => {
    expect(await isEmptyListItem(notePage, "> quoted")).toBe(false);
  });

  // ── Non-list lines ─────────────────────────────────────
  test("plain text → false", async ({ notePage }) => {
    expect(await isEmptyListItem(notePage, "plain text")).toBe(false);
  });

  test("'# heading' → false", async ({ notePage }) => {
    expect(await isEmptyListItem(notePage, "# heading")).toBe(false);
  });
});
