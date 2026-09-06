import {
  test, expect, getContent, getCaretPosition, placeCaret, selectMarkdownRange, commitHistory,
} from "./fixtures";

// 範囲選択中のマーカー入力で選択範囲を装飾で包む。
// A: `*`/`` ` ``/`~` を単一行の非 collapsed 選択に打つと、文字を挿入する代わりに
//    cycleMarkerRun（note-lines.js）でその文字の装飾を 1 段階進める。外側へ重ね続けるのでは
//    なく、マーカーごとの周期の最後で無装飾に戻る（`*`: 0→1→2→3→0 の 4 段階、`` ` `` と `~` は
//    0→1→0（`~` は 2 本で包む）の 2 段階）。`~` は打鍵した 1 文字ではなく `~~` で包む
//    （markdown.js の DEL_RE は `~~x~~` しか取り消し線として解釈しないため）。
// B: ⌘B/⌘I は `*` の連続数（lead/trail）を見て太字/斜体をトグルする（増減が固定量の別ロジック。
//    A の周期送りとは別物）。collapsed キャレットも同じ toggleEmphasisMarkers を使い、
//    キャレット前後の `*` の連続数を lead/trail として扱う（無地の位置なら `****`/`**` を挿入
//    してキャレットを中央に置き、既存の `*` に挟まれていれば増減する）。
// 行またぎ選択・フェンス内容行はどちらも対象外（既存どおりの文字挿入・置換、または no-op）。

async function performUndo(page: import("@playwright/test").Page) {
  await page.evaluate(() => (window as unknown as { performUndo(): Promise<void> }).performUndo());
}

async function performRedo(page: import("@playwright/test").Page) {
  await page.evaluate(() => (window as unknown as { performRedo(): Promise<void> }).performRedo());
}

async function selectionText(page: import("@playwright/test").Page) {
  return page.evaluate(() => window.getSelection()?.toString() ?? "");
}

test.describe("マーカー入力で選択範囲を包む", () => {
  test("* で選択を包み、選択は中身のまま残る", async ({ openNote }) => {
    const page = await openNote({ content: "abc x def" });

    await selectMarkdownRange(page, 0, 4, 0, 5); // 可視 "x"
    await page.keyboard.press("*");

    expect(await getContent(page)).toBe("abc *x* def");
    expect(await selectionText(page)).toBe("x");
  });

  test("* を4回打つと 0→1→2→3→0 の周期で進み、最後は無装飾に戻る（途中の描画も確認）", async ({ openNote }) => {
    const page = await openNote({ content: "abc x def" });
    await selectMarkdownRange(page, 0, 4, 0, 5); // 可視 "x"

    await page.keyboard.press("*"); // 0 → 1
    expect(await getContent(page)).toBe("abc *x* def");
    expect(await selectionText(page)).toBe("x");
    expect(await page.locator("#markdown-view em").textContent()).toBe("x");

    await page.keyboard.press("*"); // 1 → 2
    expect(await getContent(page)).toBe("abc **x** def");
    expect(await selectionText(page)).toBe("x");
    expect(await page.locator("#markdown-view strong").textContent()).toBe("x");

    await page.keyboard.press("*"); // 2 → 3
    expect(await getContent(page)).toBe("abc ***x*** def");
    expect(await selectionText(page)).toBe("x");
    expect(await page.locator("#markdown-view strong em").textContent()).toBe("x");

    await page.keyboard.press("*"); // 3 → 0（周期の最後で無装飾に戻る）
    expect(await getContent(page)).toBe("abc x def");
    expect(await selectionText(page)).toBe("x");
    expect(await page.locator("#markdown-view em").count()).toBe(0);
    expect(await page.locator("#markdown-view strong").count()).toBe(0);
  });

  test("` は2回打つと外れる（0→1→0）", async ({ openNote }) => {
    const page = await openNote({ content: "abc x def" });

    await selectMarkdownRange(page, 0, 4, 0, 5);
    await page.keyboard.press("Backquote");
    expect(await getContent(page)).toBe("abc `x` def");
    expect(await page.locator("#markdown-view code").textContent()).toBe("x");

    await page.keyboard.press("Backquote");
    expect(await getContent(page)).toBe("abc x def");
    expect(await page.locator("#markdown-view code").count()).toBe(0);
  });

  test("~ は2回打つと外れる（0→2→0。markdown.js は ~~ でないと del にならないため 2 本で包む）", async ({ openNote }) => {
    const page = await openNote({ content: "abc x def" });

    await selectMarkdownRange(page, 0, 4, 0, 5);
    await page.keyboard.press("~");
    expect(await getContent(page)).toBe("abc ~~x~~ def");
    expect(await page.locator("#markdown-view del").textContent()).toBe("x");

    await page.keyboard.press("~");
    expect(await getContent(page)).toBe("abc x def");
    expect(await page.locator("#markdown-view del").count()).toBe(0);
  });

  test("_ は包む対象外なので選択への打鍵は通常どおり置換する", async ({ openNote }) => {
    const page = await openNote({ content: "abc x def" });

    await selectMarkdownRange(page, 0, 4, 0, 5); // 可視 "x"
    await page.keyboard.press("_");

    expect(await getContent(page)).toBe("abc _ def");
  });

  test("行頭マーカー行（- item）の内容選択への * はマーカーを巻き込まず内容だけ包む", async ({ openNote }) => {
    const page = await openNote({ content: "- item" });

    await selectMarkdownRange(page, 0, 0, 0, "item".length); // 可視 "item" 全体
    await page.keyboard.press("*");

    expect(await getContent(page)).toBe("- *item*");
  });

  test("行頭マーカー行（- [ ] task）の内容選択への * はマーカーを巻き込まない", async ({ openNote }) => {
    const page = await openNote({ content: "- [ ] task" });

    await selectMarkdownRange(page, 0, 0, 0, "task".length); // 可視 "task" 全体
    await page.keyboard.press("*");

    expect(await getContent(page)).toBe("- [ ] *task*");
  });

  test("行頭マーカー行（# Title）の内容選択への * はマーカーを巻き込まない", async ({ openNote }) => {
    const page = await openNote({ content: "# Title" });

    await selectMarkdownRange(page, 0, 0, 0, "Title".length); // 可視 "Title" 全体
    await page.keyboard.press("*");

    expect(await getContent(page)).toBe("# *Title*");
  });

  test("行またぎ選択への * は既存どおり選択を置換する（包まない）", async ({ openNote }) => {
    const page = await openNote({ content: "abc\ndef" });

    await selectMarkdownRange(page, 0, 0, 1, "def".length);
    await page.keyboard.press("*");

    expect(await getContent(page)).toBe("*");
  });

  test("フェンス内容行の選択への * は既存どおり選択を置換する（包まない）", async ({ openNote }) => {
    const page = await openNote({ content: "```\ncode\n```" });

    await placeCaret(page, 1, 0);
    await page.keyboard.press("Shift+ArrowRight");
    await page.keyboard.press("Shift+ArrowRight"); // "co" を選択
    await page.keyboard.press("*");

    expect(await getContent(page)).toBe("```\n*de\n```\n");
  });

  test("コードスパンの中身への ` は周期送りせず既存どおり選択を置換する（スパンが割れない）", async ({ openNote }) => {
    const page = await openNote({ content: "`abc`" });

    await selectMarkdownRange(page, 0, 1, 0, 2); // 可視 "b"（コードスパンの中身の一部）
    await page.keyboard.press("Backquote");

    expect(await getContent(page)).toBe("`a`c`"); // `a`b`c` にスパンが割れない
    expect(await page.locator("#markdown-view code").count()).toBe(0); // 中身が壊れ code として成立しない
  });

  test("コードスパンの中身の複数文字選択への * も周期送りせず選択を置換する", async ({ openNote }) => {
    const page = await openNote({ content: "`abcd`" });

    await selectMarkdownRange(page, 0, 1, 0, 3); // 可視 "bc"（中身の内部、両端の境界には触れない）
    await page.keyboard.press("*");

    expect(await getContent(page)).toBe("`a*d`"); // "bc" が "*" に置換される（包まれない）
  });

  test("コードスパンの開きマーカー側に接する選択への ` も周期送りしない（選択した中身は生き残らない）", async ({
    openNote,
  }) => {
    const page = await openNote({ content: "`abcd`" });

    await selectMarkdownRange(page, 0, 0, 0, 2); // 可視 "ab"（開きマーカー側の境界に接する）
    await page.keyboard.press("Backquote");

    // 選択した "ab" は typing で消費され、コードスパンとして生き残らない
    // （先頭の孤立した ` は選択範囲外に残ったマーカー保存によるもので、周期送りの対象外化とは別の挙動）
    expect(await getContent(page)).toBe("``cd`");
  });

  test("コードスパンの閉じマーカー側に接する選択への * も周期送りしない", async ({ openNote }) => {
    const page = await openNote({ content: "`abcd`" });

    await selectMarkdownRange(page, 0, 2, 0, 4); // 可視 "cd"（閉じマーカー側の境界に接する）
    await page.keyboard.press("*");

    expect(await getContent(page)).toBe("`ab*`");
  });

  test("包んだ操作は undo 1 手で元に戻る", async ({ openNote }) => {
    const page = await openNote({ content: "abc x def" });

    await selectMarkdownRange(page, 0, 4, 0, 5);
    await page.keyboard.press("*");
    expect(await getContent(page)).toBe("abc *x* def");

    await commitHistory(page);
    await performUndo(page);

    expect(await getContent(page)).toBe("abc x def");
  });

  test("包んだ操作は undo → redo で包んだ状態に戻る", async ({ openNote }) => {
    const page = await openNote({ content: "abc x def" });

    await selectMarkdownRange(page, 0, 4, 0, 5);
    await page.keyboard.press("*");
    expect(await getContent(page)).toBe("abc *x* def");

    await commitHistory(page);
    await performUndo(page);
    expect(await getContent(page)).toBe("abc x def");

    await performRedo(page);
    expect(await getContent(page)).toBe("abc *x* def");
  });

  test("undo はデバウンス中の直前の打鍵を巻き込まない", async ({ openNote }) => {
    const page = await openNote({ content: "x def" });

    await placeCaret(page, 0, 0);
    await page.keyboard.press("A"); // まだ確定していない（saveNow のデバウンス窓の中）
    await selectMarkdownRange(page, 0, 1, 0, 2); // 可視 "x"（"A" の直後）
    await page.keyboard.press("*");
    expect(await getContent(page)).toBe("A*x* def");

    await performUndo(page);

    expect(await getContent(page)).toBe("Ax def"); // 直前の "A" は残る
  });

  test("undo は commitHistory で確定済みの打鍵とは独立した 1 手になる", async ({ openNote }) => {
    const page = await openNote({ content: "x def" });

    await placeCaret(page, 0, 0);
    await page.keyboard.press("A");
    await commitHistory(page);
    await selectMarkdownRange(page, 0, 1, 0, 2);
    await page.keyboard.press("*");
    expect(await getContent(page)).toBe("A*x* def");

    await performUndo(page);
    expect(await getContent(page)).toBe("Ax def");

    await performUndo(page);
    expect(await getContent(page)).toBe("x def");
  });
});

test.describe("⌘B/⌘I の太字・斜体トグル", () => {
  test("*x* を選択して ⌘B → ***x***", async ({ openNote }) => {
    const page = await openNote({ content: "*x*" });

    await selectMarkdownRange(page, 0, 0, 0, 1); // 可視 "x"
    await page.keyboard.press("Meta+b");

    expect(await getContent(page)).toBe("***x***");
    expect(await selectionText(page)).toBe("x");
  });

  test("***x*** を選択して ⌘B → *x*", async ({ openNote }) => {
    const page = await openNote({ content: "***x***" });

    await selectMarkdownRange(page, 0, 0, 0, 1);
    await page.keyboard.press("Meta+b");

    expect(await getContent(page)).toBe("*x*");
  });

  test("**x** を選択して ⌘I → ***x***", async ({ openNote }) => {
    const page = await openNote({ content: "**x**" });

    await selectMarkdownRange(page, 0, 0, 0, 1);
    await page.keyboard.press("Meta+i");

    expect(await getContent(page)).toBe("***x***");
  });

  test("***x*** を選択して ⌘I → **x**", async ({ openNote }) => {
    const page = await openNote({ content: "***x***" });

    await selectMarkdownRange(page, 0, 0, 0, 1);
    await page.keyboard.press("Meta+i");

    expect(await getContent(page)).toBe("**x**");
  });

  test("マーカーの無い選択に ⌘B → 両側に ** が付く", async ({ openNote }) => {
    const page = await openNote({ content: "abc x def" });

    await selectMarkdownRange(page, 0, 4, 0, 5);
    await page.keyboard.press("Meta+b");

    expect(await getContent(page)).toBe("abc **x** def");
  });

  test("行頭マーカー行（- item）の内容選択への ⌘B はマーカーを巻き込まない", async ({ openNote }) => {
    const page = await openNote({ content: "- item" });

    await selectMarkdownRange(page, 0, 0, 0, "item".length);
    await page.keyboard.press("Meta+b");

    expect(await getContent(page)).toBe("- **item**");
  });

  test("行頭マーカー行（- [ ] task）の内容選択への ⌘B はマーカーを巻き込まない", async ({ openNote }) => {
    const page = await openNote({ content: "- [ ] task" });

    await selectMarkdownRange(page, 0, 0, 0, "task".length);
    await page.keyboard.press("Meta+b");

    expect(await getContent(page)).toBe("- [ ] **task**");
  });

  test("行頭マーカー行（# Title）の内容選択への ⌘B はマーカーを巻き込まない", async ({ openNote }) => {
    const page = await openNote({ content: "# Title" });

    await selectMarkdownRange(page, 0, 0, 0, "Title".length);
    await page.keyboard.press("Meta+b");

    expect(await getContent(page)).toBe("# **Title**");
  });

  test("collapsed キャレットで ⌘B → **** を挿入しキャレットを中央に置く", async ({ openNote }) => {
    const page = await openNote({ content: "ab" });

    await placeCaret(page, 0, 1);
    await page.keyboard.press("Meta+b");

    expect(await getContent(page)).toBe("a****b");
    expect(await getCaretPosition(page)).toEqual({ line: 0, col: 3 });
  });

  test("collapsed キャレットで ⌘I → ** を挿入しキャレットを中央に置く", async ({ openNote }) => {
    const page = await openNote({ content: "ab" });

    await placeCaret(page, 0, 1);
    await page.keyboard.press("Meta+i");

    expect(await getContent(page)).toBe("a**b");
    expect(await getCaretPosition(page)).toEqual({ line: 0, col: 2 });
  });

  test("collapsed キャレットで ⌘B を連打すると増え続けず、既存の `*` の対称本数をトグルする", async ({
    openNote,
  }) => {
    const page = await openNote({ content: "ab" });

    await placeCaret(page, 0, 1); // "a|b"
    await page.keyboard.press("Meta+b");
    expect(await getContent(page)).toBe("a****b");
    expect(await getCaretPosition(page)).toEqual({ line: 0, col: 3 }); // "a**|**b"

    await page.keyboard.press("Meta+b"); // もう一度 ⌘B → 増やすのではなく外れて元に戻る
    expect(await getContent(page)).toBe("ab");
    expect(await getCaretPosition(page)).toEqual({ line: 0, col: 1 });
  });

  test("collapsed キャレットで ⌘I を連打すると増え続けず、奇数/偶数で本数をトグルする", async ({ openNote }) => {
    const page = await openNote({ content: "ab" });

    await placeCaret(page, 0, 1); // "a|b"
    await page.keyboard.press("Meta+i");
    expect(await getContent(page)).toBe("a**b");
    expect(await getCaretPosition(page)).toEqual({ line: 0, col: 2 }); // "a*|*b"

    await page.keyboard.press("Meta+i"); // もう一度 ⌘I → 増やすのではなく外れて元に戻る
    expect(await getContent(page)).toBe("ab");
    expect(await getCaretPosition(page)).toEqual({ line: 0, col: 1 });
  });

  test("collapsed キャレットが既存の `**|**` の内側にあれば ⌘B は 2 本外す", async ({ openNote }) => {
    const page = await openNote({ content: "a****b" });

    await placeCaret(page, 0, 3); // "a**|**b"
    await page.keyboard.press("Meta+b");

    expect(await getContent(page)).toBe("ab");
    expect(await getCaretPosition(page)).toEqual({ line: 0, col: 1 });
  });

  test("collapsed キャレットが既存の `**|**` の内側にあれば ⌘I は 1 本ずつ増やす", async ({ openNote }) => {
    const page = await openNote({ content: "a****b" });

    await placeCaret(page, 0, 3); // "a**|**b"
    await page.keyboard.press("Meta+i");

    expect(await getContent(page)).toBe("a******b"); // "a***|***b"
    expect(await getCaretPosition(page)).toEqual({ line: 0, col: 4 });
  });

  test("`***|***` への ⌘I は 1 本ずつ外す", async ({ openNote }) => {
    const page = await openNote({ content: "a******b" });

    await placeCaret(page, 0, 4); // "a***|***b"
    await page.keyboard.press("Meta+i");

    expect(await getContent(page)).toBe("a****b"); // "a**|**b"
    expect(await getCaretPosition(page)).toEqual({ line: 0, col: 3 });
  });

  test("collapsed キャレットの ⌘B トグルは undo 1 手で元に戻る", async ({ openNote }) => {
    const page = await openNote({ content: "a****b" });

    await placeCaret(page, 0, 3); // "a**|**b"
    await page.keyboard.press("Meta+b");
    expect(await getContent(page)).toBe("ab");

    await commitHistory(page);
    await performUndo(page);

    expect(await getContent(page)).toBe("a****b");
  });

  test("⌘B で挿入した中身が空の ** ペアは、キャレットが行を離れて reveal が外れても可視のまま残る", async ({
    openNote,
  }) => {
    const page = await openNote({ content: "a\nb" });

    await placeCaret(page, 0, 1); // "a|"
    await page.keyboard.press("Meta+b");
    expect(await getContent(page)).toBe("a****\nb");

    await placeCaret(page, 1, 0); // キャレットを別行へ移し reveal を外す
    expect(await getContent(page)).toBe("a****\nb");
    expect(await page.locator("#markdown-view strong").count()).toBe(0);
    expect(await page.locator("#markdown-view em").count()).toBe(0);
    const line0 = await page.locator('#markdown-view [data-line="0"]').first().textContent();
    expect(line0).toBe("a****");
  });

  test("空行で ⌘B → **** はキャレットがある間は生表示、離れると水平線、戻ると生表示に戻って ⌘B で空行に戻せる", async ({
    openNote,
  }) => {
    const page = await openNote({ content: "\nx" });

    await placeCaret(page, 0, 0); // 空行
    await page.keyboard.press("Meta+b");
    expect(await getContent(page)).toBe("****\nx");
    // キャレットがまだこの行にある間は水平線ではなく生 raw のテキスト行
    expect(await page.locator("#markdown-view hr").count()).toBe(0);
    const line0 = page.locator('#markdown-view [data-line="0"]').first();
    expect(await line0.textContent()).toBe("****");

    await placeCaret(page, 1, 0); // 別行へ移すと水平線に戻る
    expect(await getContent(page)).toBe("****\nx");
    expect(await page.locator("#markdown-view hr").count()).toBe(1);

    await placeCaret(page, 0, 2); // "**|**" へ戻ると再び生表示になる
    expect(await page.locator("#markdown-view hr").count()).toBe(0);
    expect(await line0.textContent()).toBe("****");

    await page.keyboard.press("Meta+b");
    expect(await getContent(page)).toBe("\nx");
  });

  test("行またぎ選択への ⌘B は何もしない", async ({ openNote }) => {
    const page = await openNote({ content: "abc\ndef" });

    await selectMarkdownRange(page, 0, 0, 1, "def".length);
    await page.keyboard.press("Meta+b");

    expect(await getContent(page)).toBe("abc\ndef");
  });

  test("フェンス内容行の選択への ⌘B は何もしない", async ({ openNote }) => {
    const page = await openNote({ content: "```\ncode\n```" });

    await placeCaret(page, 1, 0);
    await page.keyboard.press("Shift+ArrowRight");
    await page.keyboard.press("Shift+ArrowRight");
    await page.keyboard.press("Meta+b");

    expect(await getContent(page)).toBe("```\ncode\n```");
  });

  test("コードスパンの中身への ⌘B は何もしない（preventDefault のみ）", async ({ openNote }) => {
    const page = await openNote({ content: "`abc`" });

    await selectMarkdownRange(page, 0, 1, 0, 2); // 可視 "b"（コードスパンの中身）
    await page.keyboard.press("Meta+b");

    expect(await getContent(page)).toBe("`abc`");
  });

  test("コードスパンの境界に接する選択への ⌘B も何もしない", async ({ openNote }) => {
    const page = await openNote({ content: "`abcd`" });

    await selectMarkdownRange(page, 0, 0, 0, 2); // 可視 "ab"（開きマーカー側の境界に接する）
    await page.keyboard.press("Meta+b");

    expect(await getContent(page)).toBe("`abcd`");
  });

  test("コードスパンの内側の collapsed キャレットへの ⌘B は何もしない", async ({ openNote }) => {
    const page = await openNote({ content: "`abc`" });

    await selectMarkdownRange(page, 0, 2, 0, 2); // 可視 "ab|c"（マーカー間、内容の途中）
    await page.keyboard.press("Meta+b");

    expect(await getContent(page)).toBe("`abc`");
  });

  test("トグルの undo は 1 手で元に戻る", async ({ openNote }) => {
    const page = await openNote({ content: "*x*" });

    await selectMarkdownRange(page, 0, 0, 0, 1);
    await page.keyboard.press("Meta+b");
    expect(await getContent(page)).toBe("***x***");

    await commitHistory(page);
    await performUndo(page);

    expect(await getContent(page)).toBe("*x*");
  });
});
