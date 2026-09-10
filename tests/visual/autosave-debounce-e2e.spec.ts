import { test, expect, injectNoteMock, enterEdit } from "./fixtures";

// デバウンス窓（saveTimer, note.js scheduleSave）の経過を検証するテストなので、
// 実時間待機ではなく page.clock で仮想時計を進めて決定的に確定させる。
// page.clock.install() はページ内の全タイマーを止めるため、injectNoteMock の invokeDelays
// （setTimeout で応答を遅らせる）とは併用できない。

test.describe("自動保存デバウンス", () => {
  test("高速連続入力 → 最後の入力から300ms後に1回だけinvoke", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 300, height: 350 } });
    const page = await ctx.newPage();
    await page.clock.install();
    await injectNoteMock(page, { content: "" }, {}, { captureInvokes: true });
    await page.goto("/note.html?id=test-note-id");
    await page.waitForLoadState("networkidle");

    await enterEdit(page);
    await page.clock.pauseAt(Date.now() + 1000); // 以降、時計は runFor で進めた分しか進まない

    // キャプチャをリセット
    await page.evaluate(() => { (window as any).__captured_invokes.length = 0; });

    // 高速で5文字連続入力（各入力間にデバウンスリセットが起こる）
    await page.locator("#markdown-view").pressSequentially("abcde", { delay: 50 });

    // 仮想時計は入力の間止まったままなので、まだデバウンス中
    const callsImmediate = await page.evaluate(() =>
      (window as any).__captured_invokes.filter((c: any) => c.cmd === "update_note_content").length
    );
    expect(callsImmediate).toBe(0);

    // デバウンス窓（300ms）の直前までは保存されず、窓を越えた時点で保存される
    await page.clock.runFor(299);
    const callsBeforeWindow = await page.evaluate(() =>
      (window as any).__captured_invokes.filter((c: any) => c.cmd === "update_note_content").length
    );
    expect(callsBeforeWindow).toBe(0);
    await page.clock.runFor(2);

    const calls = await page.evaluate(() =>
      (window as any).__captured_invokes.filter((c: any) => c.cmd === "update_note_content")
    );
    expect(calls).toHaveLength(1);
    expect((calls[0] as any).args.content).toContain("abcde");

    await ctx.close();
  });

  test("デバウンス中の再入力 → タイマーリセットされ最終的に1回だけinvoke", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 300, height: 350 } });
    const page = await ctx.newPage();
    await page.clock.install();
    await injectNoteMock(page, { content: "" }, {}, { captureInvokes: true });
    await page.goto("/note.html?id=test-note-id");
    await page.waitForLoadState("networkidle");

    await enterEdit(page);
    await page.clock.pauseAt(Date.now() + 1000);

    await page.evaluate(() => { (window as any).__captured_invokes.length = 0; });

    // 1文字入力
    await page.locator("#markdown-view").press("x");

    // デバウンス窓（300ms）内まで仮想時計を進める
    await page.clock.runFor(200);

    // デバウンスタイマー内にもう1文字入力 → タイマーリセット
    await page.locator("#markdown-view").press("y");

    // この時点ではまだinvokeされていない
    const callsMid = await page.evaluate(() =>
      (window as any).__captured_invokes.filter((c: any) => c.cmd === "update_note_content").length
    );
    expect(callsMid).toBe(0);

    // リセットされた窓は y の入力から数え直される（x から 300ms 経っても保存されない）
    await page.clock.runFor(299);
    const callsBeforeWindow = await page.evaluate(() =>
      (window as any).__captured_invokes.filter((c: any) => c.cmd === "update_note_content").length
    );
    expect(callsBeforeWindow).toBe(0);
    await page.clock.runFor(2);

    const calls = await page.evaluate(() =>
      (window as any).__captured_invokes.filter((c: any) => c.cmd === "update_note_content")
    );
    expect(calls).toHaveLength(1);
    expect((calls[0] as any).args.content).toContain("x");
    expect((calls[0] as any).args.content).toContain("y");

    await ctx.close();
  });
});
