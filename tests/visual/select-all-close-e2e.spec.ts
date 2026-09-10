import { test, expect, placeCaret, getContent, enterEdit } from "./fixtures";

// ⌘A（付箋の本文を全選択）と ⌘W（ウィンドウを閉じる）。どちらも document の keydown で拾う
// ショートカット（src/note.js の selectAllNote と末尾のハンドラ）。

function selectionText(page: import("@playwright/test").Page) {
  return page.evaluate(() => window.getSelection()!.toString());
}

test.describe("⌘A は付箋の本文を全選択する", () => {
  test("複数行の本文が装飾込みで全選択され、続く Backspace で空になる", async ({ openNote }) => {
    const page = await openNote({ content: "line1\n**bold** and *it*\n- item" });
    await placeCaret(page, 0, 2);

    await page.keyboard.press("Meta+a");

    const text = await selectionText(page);
    for (const part of ["line1", "bold", "it", "item"]) expect(text).toContain(part);

    await page.keyboard.press("Backspace");
    await expect.poll(() => getContent(page)).toBe("");
  });

  test("空の付箋では選択を作らない", async ({ openNote }) => {
    const page = await openNote({ content: "" });
    await enterEdit(page);

    await page.keyboard.press("Meta+a");

    expect(await selectionText(page)).toBe("");
    expect(await page.evaluate(() => window.getSelection()!.isCollapsed)).toBe(true);
  });

  test("画像を含む本文でも前後のテキストが選択され、画像の選択状態は解除される", async ({ openNote }) => {
    const page = await openNote({ content: "head\n![](images/00000000-0000-4000-8000-000000000001.png)\ntail" });
    await placeCaret(page, 1); // 画像行にキャレットを置くと画像が選択状態になる
    await expect(page.locator("#markdown-view .img-selected")).toHaveCount(1);

    await page.keyboard.press("Meta+a");

    const text = await selectionText(page);
    expect(text).toContain("head");
    expect(text).toContain("tail");
    await expect(page.locator("#markdown-view .img-selected")).toHaveCount(0);
  });

  test("⌘⇧A のような修飾の組み合わせ違いでは反応しない", async ({ openNote }) => {
    const page = await openNote({ content: "abc\ndef" });
    await placeCaret(page, 0, 1);

    await page.keyboard.press("Meta+Shift+a");

    expect(await selectionText(page)).toBe("");
  });
});

test.describe("⌘W はウィンドウを閉じる", () => {
  test("⌘W でウィンドウの close が呼ばれる", async ({ openNote }) => {
    const page = await openNote({ content: "abc" });
    await placeCaret(page, 0, 1);

    await page.keyboard.press("Meta+w");

    await expect.poll(() => page.evaluate(() => (window as any).__closeWasCalled === true)).toBe(true);
  });

  test("修飾なしの w は文字として入力され close は呼ばれない", async ({ openNote }) => {
    const page = await openNote({ content: "abc" });
    await placeCaret(page, 0, 3);

    await page.keyboard.press("w");

    await expect.poll(() => getContent(page)).toBe("abcw");
    expect(await page.evaluate(() => (window as any).__closeWasCalled)).toBeUndefined();
  });
});
