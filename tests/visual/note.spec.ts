import { test, expect } from "./fixtures";

const COLORS = ["yellow", "blue", "green", "pink", "purple", "gray"] as const;

for (const color of COLORS) {
  test(`empty note — ${color}`, async ({ openNote }) => {
    const page = await openNote({ color });
    await expect(page).toHaveScreenshot(`note-${color}.png`);
  });
}

test("note with text content", async ({ openNote }) => {
  const page = await openNote({
    color: "yellow",
    content: "これはテストメモです\nHatto-to 付箋アプリ",
  });
  await expect(page).toHaveScreenshot("note-with-text.png");
});

test("note — markdown preview", async ({ openNote }) => {
  const page = await openNote({
    color: "yellow",
    content: "# タイトル\n## サブ見出し\n\n- りんご\n- みかん\n\n- [ ] 未完了タスク\n- [x] 完了タスク",
  });
  await expect(page).toHaveScreenshot("note-markdown.png");
});

test("color picker open", async ({ notePage }) => {
  await notePage.click("#btn-color");
  await notePage.waitForSelector(".color-picker.open");
  await expect(notePage).toHaveScreenshot("color-picker-open.png");
});

test("note — opacity 50%", async ({ openNote }) => {
  const page = await openNote({}, { opacity: 50 });
  await expect(page).toHaveScreenshot("note-opacity-50.png");
});
