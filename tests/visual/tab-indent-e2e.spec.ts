import { test, expect } from "./fixtures";

/** Click the preview overlay to enter edit mode, then wait for the editor to appear */
async function enterEditMode(page: import("@playwright/test").Page) {
  await page.click(".markdown-view");
  await expect(page.locator(".editor")).toBeVisible();
}

test.describe("Tab/Shift+Tab インデント", () => {
  test("- item にカーソルを置いてTab → 先頭に2スペースが追加", async ({ openNote }) => {
    const page = await openNote();
    await enterEditMode(page);
    await page.keyboard.type("- item");
    await page.keyboard.press("Tab");

    const text = await page.locator(".editor").evaluate((el) => (el as HTMLElement).innerText);
    expect(text).toContain("  - item");
  });

  test("  - item にカーソルを置いてShift+Tab → 先頭の2スペースが除去", async ({ openNote }) => {
    const page = await openNote();
    await enterEditMode(page);
    await page.keyboard.type("  - item");

    await page.keyboard.down("Shift");
    await page.keyboard.press("Tab");
    await page.keyboard.up("Shift");

    const text = await page.locator(".editor").evaluate((el) => (el as HTMLElement).innerText);
    expect(text).toContain("- item");
    // 先頭に余計なスペースがないことを確認
    expect(text.trim()).toBe("- item");
  });

  test("Tab がデフォルト動作（フォーカス移動）しないこと", async ({ openNote }) => {
    const page = await openNote();
    await enterEditMode(page);
    await page.keyboard.type("- item");
    await page.keyboard.press("Tab");

    // エディタにまだフォーカスがあること
    const focused = await page.evaluate(() =>
      document.activeElement?.classList.contains("editor")
    );
    expect(focused).toBe(true);
  });
});
