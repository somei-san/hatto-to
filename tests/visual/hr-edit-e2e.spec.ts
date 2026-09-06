import { test, expect, getContent, getCaretPosition, placeCaret, commitHistory, selectMarkdownRange } from "./fixtures";

/** document へ copy の ClipboardEvent を dispatch し、セットされた text/plain を返す
 * （selection-copy-e2e.spec.ts と同じ作法）。 */
function dispatchCopyWithClipboardData(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const dt = new DataTransfer();
    const ev = new ClipboardEvent("copy", { bubbles: true, cancelable: true, clipboardData: dt });
    document.dispatchEvent(ev);
    return { plain: dt.getData("text/plain") };
  });
}

// 水平線（hr、`***`/`---`/`___` 等の 3 個以上の連続。空白を挟んだ `- - -`/`* * *` も含め
// CommonMark 準拠で classifyLine が判定する）は <hr> として描画され、<hr> は contenteditable の
// 着地点を持たないためキャレットを置けない。選択（collapsed キャレットも非 collapsed 選択も）の
// anchor/focus がその行に乗っているあいだだけ、行全体を生 raw のテキスト行として表示し
// （hrRevealLines。インライン装飾の revealState とは別の状態で、非 collapsed 選択の間も
// 両端点ぶん複数行を保持できる）、両端点から外れると <hr> に戻る。生表示中は普通のテキスト行と
// 同じに Backspace・文字入力・Enter・隣接行との結合・Shift+矢印での選択伸長が効く
// （classifyLine は raw を見るため、生表示中も raw が水平線のままなら描画だけが切り替わる）。
//
// hr 行の raw はどこでもインライン処理（inlineMarkdown/inlineSegments 経由の装飾解釈）に
// 通さない: 可視 = raw の恒等写像を、描画・キャレット写像・コピーのすべてで保つ。`* * *` は
// ITALIC_RE（`/\*([^*]+)\*/`）が "* *" を装飾として拾ってしまう形なので、hr と判定された raw を
// 一切装飾解釈しないことがこの一致の前提になる。

async function performUndo(page: import("@playwright/test").Page) {
  await page.evaluate(() => (window as unknown as { performUndo(): Promise<void> }).performUndo());
}

test.describe("水平線（hr）行のキャレット・編集", () => {
  test("↓ でテキスト行から hr 行へ入ると生表示になり、キャレットは行頭に着地する", async ({ openNote }) => {
    const page = await openNote({ content: "a\n***\nb" });

    await placeCaret(page, 0, 1); // "a" の行末
    await page.locator("#markdown-view").press("ArrowDown");

    expect(await getCaretPosition(page)).toEqual({ line: 1, col: 0 });
    expect(await page.locator("#markdown-view hr").count()).toBe(0);
    expect(await page.locator('#markdown-view [data-line="1"]').textContent()).toBe("***");
  });

  test("↑ でテキスト行から hr 行へ入ると生表示になり、キャレットは行末に着地する", async ({ openNote }) => {
    const page = await openNote({ content: "a\n***\nb" });

    await placeCaret(page, 2, 0); // "b" の行頭
    await page.locator("#markdown-view").press("ArrowUp");

    expect(await getCaretPosition(page)).toEqual({ line: 1, col: 3 });
    expect(await page.locator("#markdown-view hr").count()).toBe(0);
  });

  test("hr 行から離れると <hr> に戻る", async ({ openNote }) => {
    const page = await openNote({ content: "a\n***\nb" });

    await placeCaret(page, 0, 1);
    await page.locator("#markdown-view").press("ArrowDown");
    await expect(page.locator("#markdown-view hr")).toHaveCount(0);

    await page.locator("#markdown-view").press("ArrowDown"); // hr 行から次のテキスト行へ

    // hr 行を離れたことによる <hr> への戻りは selectionchange 駆動の非同期な再描画で決まるため、
    // toHaveCount の自動リトライで決着を待つ（連続した矢印キー入力は次のキーが割り込みうる）
    await expect(page.locator("#markdown-view hr")).toHaveCount(1);
    expect(await getContent(page)).toBe("a\n***\nb");
  });

  test("<hr> をクリックすると生表示になりキャレットが置かれる", async ({ openNote }) => {
    const page = await openNote({ content: "a\n***\nb" });

    await page.locator("hr.md-hr").click({ force: true });

    expect(await page.locator("#markdown-view hr").count()).toBe(0);
    expect(await getCaretPosition(page)).toEqual({ line: 1, col: 3 });
  });

  test("生表示中の Backspace で 1 文字消えて ** になり、水平線でなくなる", async ({ openNote }) => {
    const page = await openNote({ content: "a\n***\nb" });

    await placeCaret(page, 1, 3); // raw col3（末尾）へ直接入る。placeCaretAtRaw が生表示へ切り替える
    await page.keyboard.press("Backspace");

    expect(await getContent(page)).toBe("a\n**\nb");
    expect(await page.locator("#markdown-view hr").count()).toBe(0);
    expect(await page.locator("#markdown-view strong").count()).toBe(0); // ** は装飾化しない
  });

  test("生表示中の hr 行の末尾で文字を打てる", async ({ openNote }) => {
    const page = await openNote({ content: "a\n***\nb" });

    await placeCaret(page, 1, 3);
    await page.keyboard.press("!");

    expect(await getContent(page)).toBe("a\n***!\nb");
    expect(await page.locator("#markdown-view hr").count()).toBe(0);
  });

  test("生表示中の Enter で行を分割できる", async ({ openNote }) => {
    const page = await openNote({ content: "a\n***\nb" });

    await placeCaret(page, 1, 1); // "*|**"
    await page.keyboard.press("Enter");

    expect(await getContent(page)).toBe("a\n*\n**\nb");
  });

  test("hr 行の末尾で Delete → 次の行と結合できる", async ({ openNote }) => {
    const page = await openNote({ content: "a\n***\nb" });

    await placeCaret(page, 1, 3); // "***|"（末尾）
    await page.keyboard.press("Delete");

    expect(await getContent(page)).toBe("a\n***b");
  });

  test("hr の次の行の行頭で Backspace → hr 行と結合できる", async ({ openNote }) => {
    const page = await openNote({ content: "a\n***\nb" });

    await placeCaret(page, 2, 0); // "b" の行頭（hr 自体には触れていない）
    await page.keyboard.press("Backspace");

    expect(await getContent(page)).toBe("a\n***b");
  });

  test("hr の前の行の行末で Delete → hr 行と結合できる", async ({ openNote }) => {
    const page = await openNote({ content: "a\n***\nb" });

    await placeCaret(page, 0, 1); // "a" の行末（hr 自体には触れていない）
    await page.keyboard.press("Delete");

    expect(await getContent(page)).toBe("a***\nb");
  });

  test("空行で ⌘B → **** はキャレットがある間は生表示、離れると水平線、戻ると生表示に戻って ⌘B で空行に戻せる", async ({
    openNote,
  }) => {
    const page = await openNote({ content: "\nx" });

    await placeCaret(page, 0, 0);
    await page.keyboard.press("Meta+b");
    expect(await getContent(page)).toBe("****\nx");
    expect(await page.locator("#markdown-view hr").count()).toBe(0);

    await placeCaret(page, 1, 0);
    // 離れたことによる <hr> への戻りは selectionchange 駆動の非同期な再描画で決まるため、
    // toHaveCount の自動リトライで決着を待つ
    await expect(page.locator("#markdown-view hr")).toHaveCount(1);
    expect(await getContent(page)).toBe("****\nx");

    await placeCaret(page, 0, 2); // "**|**" へ戻る
    expect(await page.locator("#markdown-view hr").count()).toBe(0);
    await page.keyboard.press("Meta+b");

    expect(await getContent(page)).toBe("\nx");
  });

  test("hr 行の編集は undo 1 手で元に戻る", async ({ openNote }) => {
    const page = await openNote({ content: "a\n***\nb" });

    await placeCaret(page, 1, 3);
    await page.keyboard.press("Backspace");
    expect(await getContent(page)).toBe("a\n**\nb");

    await commitHistory(page);
    await performUndo(page);

    expect(await getContent(page)).toBe("a\n***\nb");
  });

  test("空白入りの `- - -` もクリックで行末に入り、← で raw 行頭まで戻れる（先頭の `- ` をリストマーカーと誤認しない）", async ({
    openNote,
  }) => {
    const page = await openNote({ content: "- - -" });

    await page.locator("hr.md-hr").click({ force: true });
    expect(await getCaretPosition(page)).toEqual({ line: 0, col: 5 }); // マーカー扱いされず行末=5

    for (let i = 0; i < "- - -".length; i++) await page.keyboard.press("ArrowLeft");
    expect(await getCaretPosition(page)).toEqual({ line: 0, col: 0 }); // 先頭の "- " に阻まれず raw col 0 まで戻れる
  });

  test("空白入りの `- - -` の行末で文字を打てる", async ({ openNote }) => {
    const page = await openNote({ content: "- - -" });

    await page.locator("hr.md-hr").click({ force: true });
    await page.keyboard.press("x");

    // "- - -x" は末尾の x により水平線でなくなり、先頭の "- " が通常のリストマーカーとして
    // 扱われる（本アプリの既存仕様。水平線判定とは無関係）。ここでは打鍵そのものが通ることのみ確認する
    expect(await getContent(page)).toBe("- - -x");
  });

  test("1 文字の行（*）を選択して * を打つと *** になり、選択は中身に残る（消えない）", async ({ openNote }) => {
    const page = await openNote({ content: "*" });

    await selectMarkdownRange(page, 0, 0, 0, 1); // 可視 "*" 全体を選択
    await page.keyboard.press("*");

    expect(await getContent(page)).toBe("***");
    expect(await page.locator("#markdown-view hr").count()).toBe(0); // 生表示のまま
    const selected = await page.evaluate(() => window.getSelection()?.toString());
    expect(selected).toBe("*"); // 元の "*" が中身として選択されたまま残る
  });

  test("生表示中の hr 行で Shift+矢印による選択の伸長ができる", async ({ openNote }) => {
    const page = await openNote({ content: "a\n***\nb" });

    await page.locator('#markdown-view [data-line="1"]').click({ force: true }); // "***" の生表示へ
    await placeCaret(page, 1, 3); // 末尾へ
    await page.keyboard.press("Shift+ArrowLeft");

    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("*");
    expect(await page.locator("#markdown-view hr").count()).toBe(0); // 選択中も生表示のまま
  });

  test("*** 1 行だけの付箋で hr をクリックしてから ⌘A で全選択できる", async ({ openNote }) => {
    const page = await openNote({ content: "***" });

    await page.locator("hr.md-hr").click({ force: true });
    await page.keyboard.press("Meta+a");

    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("***");
    expect(await page.locator("#markdown-view hr").count()).toBe(0);
  });

  test("hr 行を端点にした複数行選択で、hr 行は生表示のまま保たれる", async ({ openNote }) => {
    const page = await openNote({ content: "a\n***\nb" });

    // ドラッグでの選択終端がちょうど未生表示の <hr> 自身（テキストノードを持たない）に
    // 落ちるケースを、ネイティブ Selection API で直接再現する
    await page.evaluate(() => {
      const startText = document.querySelector('#markdown-view [data-line="0"]')!.firstChild!;
      const hrEl = document.querySelector('#markdown-view [data-line="1"]')!;
      window.getSelection()!.setBaseAndExtent(startText, 0, hrEl, 0);
    });

    // 生表示への切り替えは selectionchange 駆動の非同期な再描画で決まるため、
    // toHaveCount の自動リトライで決着を待つ
    await expect(page.locator("#markdown-view hr")).toHaveCount(0); // 端点の hr 行が生表示になる
    expect(await getContent(page)).toBe("a\n***\nb");
  });

  test("hr 行を含む選択の ⌘C で raw のまま text/plain にコピーされる", async ({ openNote }) => {
    const page = await openNote({ content: "a\n***\nb" });

    await selectMarkdownRange(page, 0, 0, 2, "b".length);
    const { plain } = await dispatchCopyWithClipboardData(page);

    expect(plain).toBe("a\n***\nb");
  });

  test("先頭に空白がある水平線（' ---'）もクリックで行末に入り、raw と 1 文字も違わず打鍵できる", async ({
    openNote,
  }) => {
    const page = await openNote({ content: " ---" });

    await page.locator("hr.md-hr").click({ force: true });
    // markerLength は hr を 0 と返す（先頭空白もマーカー扱いしない）ため行末 = raw の文字数
    expect(await getCaretPosition(page)).toEqual({ line: 0, col: 4 });

    await page.keyboard.press("x");

    expect(await getContent(page)).toBe(" ---x");
  });

  test("`* * *` の生表示は raw どおり5文字で、← を5回押すと raw 行頭まで戻れる（装飾に化けない）", async ({
    openNote,
  }) => {
    const page = await openNote({ content: "* * *" });

    await page.locator("hr.md-hr").click({ force: true });
    expect(await getCaretPosition(page)).toEqual({ line: 0, col: 5 }); // "* * *" の raw 文字数どおり

    for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowLeft");
    expect(await getCaretPosition(page)).toEqual({ line: 0, col: 0 });
    // ITALIC_RE が "* *" を拾って <em> </em> に化けさせていないことも確認する
    expect(await page.locator("#markdown-view em").count()).toBe(0);
  });

  test("`* * *` を含む選択の ⌘C で raw と一致する text/plain になる（装飾に化けない）", async ({ openNote }) => {
    const page = await openNote({ content: "a\n* * *\nb" });

    await selectMarkdownRange(page, 0, 0, 2, "b".length);
    const { plain } = await dispatchCopyWithClipboardData(page);

    expect(plain).toBe("a\n* * *\nb");
  });

  test("hr を含まない付箋で1文字打ってからドラッグ選択しても、選択が壊れず狙った範囲のままになる", async ({
    openNote,
  }) => {
    const page = await openNote({ content: "ab\ncd" });

    await placeCaret(page, 0, 1); // "a|b"
    await page.keyboard.press("!");
    expect(await getContent(page)).toBe("a!b\ncd");

    await selectMarkdownRange(page, 0, 0, 1, "cd".length); // 全体をドラッグ選択

    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("a!b\ncd");
  });
});
