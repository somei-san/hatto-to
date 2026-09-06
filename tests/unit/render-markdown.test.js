const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

global.escapeHtml = require("../../src/utils.js").escapeHtml;
const { renderMarkdown } = require("../../src/markdown.js");

describe("renderMarkdown — inline & block elements", () => {
  test("heading h1", () => {
    const html = renderMarkdown("# Heading 1");
    assert.match(html, /class="md-h1"/);
  });

  test("heading h2", () => {
    const html = renderMarkdown("## Heading 2");
    assert.match(html, /class="md-h2"/);
  });

  test("heading h3", () => {
    const html = renderMarkdown("### Heading 3");
    assert.match(html, /class="md-h3"/);
  });

  test("bullet list", () => {
    const html = renderMarkdown("- item");
    assert.match(html, /class="md-bullet"/);
  });

  test("checkbox unchecked", () => {
    const html = renderMarkdown("- [ ] task");
    assert.match(html, /type="checkbox"/);
    assert.doesNotMatch(html, /checked/);
  });

  test("checkbox checked", () => {
    const html = renderMarkdown("- [x] task");
    assert.match(html, /type="checkbox"/);
    assert.match(html, /checked/);
  });

  test("ordered list", () => {
    const html = renderMarkdown("1. item");
    assert.match(html, /class="md-ordered"/);
  });

  test("bold", () => {
    const html = renderMarkdown("**text**");
    assert.match(html, /<strong>/);
  });

  test("italic", () => {
    const html = renderMarkdown("*text*");
    assert.match(html, /<em>/);
  });

  test("bold and italic combined (***text***) nests em inside strong", () => {
    const html = renderMarkdown("***text***");
    assert.match(html, /<strong><em>text<\/em><\/strong>/);
  });

  test("strikethrough", () => {
    const html = renderMarkdown("~~text~~");
    assert.match(html, /<del>/);
  });

  test("inline code", () => {
    const html = renderMarkdown("`code`");
    assert.match(html, /<code>/);
  });

  test("link", () => {
    const html = renderMarkdown("[text](https://example.com)");
    assert.match(html, /<a href="https:\/\/example\.com"/);
  });

  test("link with empty label renders as a link with the correct href (not swallowed by bare-URL matching)", () => {
    // 空マーカー正規化はリンクを対象外にする（ラベルが空でも URL は実体として
    // 残るため）。ラベル必須の正規表現だとこの raw がリンクとして解決できず、代わりに裸URL側の
    // 正規表現が閉じ括弧まで url に巻き込んでしまう
    const html = renderMarkdown("[](https://example.com)");
    assert.match(html, /<a href="https:\/\/example\.com"/);
    assert.doesNotMatch(html, /href="https:\/\/example\.com\)"/);
    assert.match(html, /<a [^>]*><\/a>/); // 可視テキスト（アンカーの中身）が空になっていること
  });

  test("blockquote", () => {
    const html = renderMarkdown("> text");
    assert.match(html, /class="md-blockquote"/);
  });

  test("horizontal rule", () => {
    const html = renderMarkdown("---");
    assert.match(html, /<hr/);
  });

  // `*`/`-`/`_` の 3 個以上連続（間に空白があってもよい）はすべて水平線（CommonMark 準拠）。
  // キャレットがその行にある間だけ生 raw のテキスト行として表示する（後述の
  // "renderMarkdown — 水平線（hr）のインライン生表示" 参照）ため、水平線であること自体が
  // ⌘B/⌘I が作る中身の空の強調マーカー対（`***`/`****` 等）と衝突しても編集できなくなることはない
  test("asterisks-only lines become a horizontal rule (CommonMark)", () => {
    assert.match(renderMarkdown("***"), /<hr/);
    assert.match(renderMarkdown("****"), /<hr/);
    assert.match(renderMarkdown("******"), /<hr/);
    assert.match(renderMarkdown("** **"), /<hr/);
  });

  test("dashes/underscores-only lines still become a horizontal rule", () => {
    assert.match(renderMarkdown("---"), /<hr/);
    assert.match(renderMarkdown("____"), /<hr/);
  });

  test("space-separated asterisks still become a horizontal rule", () => {
    assert.match(renderMarkdown("* * *"), /<hr/);
  });

  test("not a horizontal rule: content mixed in with the marker chars", () => {
    assert.doesNotMatch(renderMarkdown("**a**"), /<hr/);
    assert.doesNotMatch(renderMarkdown("-- -x"), /<hr/);
  });

  test("empty string returns placeholder", () => {
    const html = renderMarkdown("");
    assert.match(html, /md-placeholder/);
  });

  test("composite: heading + list + bold", () => {
    const html = renderMarkdown("# Title\n- **bold item**");
    assert.match(html, /class="md-h1"/);
    assert.match(html, /class="md-bullet"/);
    assert.match(html, /<strong>/);
  });

  test("nested inline: bold with code inside", () => {
    const html = renderMarkdown("**太字の中に`code`**");
    assert.match(html, /<strong>/);
    assert.match(html, /<code>/);
  });
});

describe("renderMarkdown — ordered list auto-numbering", () => {
  /** Helper: extract display numbers from md-order-num spans */
  function extractOrderNums(html) {
    return [...html.matchAll(/<span class="md-order-num">(\d+)\.<\/span>/g)].map(m => m[1]);
  }

  test("sequential 1. 1. 1. displays as 1. 2. 3.", () => {
    const html = renderMarkdown("1. alpha\n1. bravo\n1. charlie");
    assert.deepEqual(extractOrderNums(html), ["1", "2", "3"]);
  });

  test("indent change continues parent counter", () => {
    const html = renderMarkdown("1. top\n  1. sub-a\n  1. sub-b\n1. top2");
    // top=1, sub-a=1, sub-b=2, top2=2 (returning to parent continues counter)
    assert.deepEqual(extractOrderNums(html), ["1", "1", "2", "2"]);
  });

  test("non-numbered line resets counter", () => {
    const html = renderMarkdown("1. first\nplain text\n1. second");
    // plain text resets, so both show 1
    assert.deepEqual(extractOrderNums(html), ["1", "1"]);
  });

  test("empty line resets counter", () => {
    const html = renderMarkdown("1. a\n1. b\n\n1. c");
    assert.deepEqual(extractOrderNums(html), ["1", "2", "1"]);
  });

  test("bullet list between ordered lists resets counter", () => {
    const html = renderMarkdown("1. x\n- bullet\n1. y");
    assert.deepEqual(extractOrderNums(html), ["1", "1"]);
  });

  test("mixed bullet and ordered interleaved", () => {
    const html = renderMarkdown("- bullet1\n1. ord1\n1. ord2\n- bullet2\n1. ord3");
    // ord1=1, ord2=2, then bullet resets, ord3=1
    assert.deepEqual(extractOrderNums(html), ["1", "2", "1"]);
  });

  test("deeper indent continues when returning to parent level", () => {
    const html = renderMarkdown("1. a\n1. b\n  1. child1\n  1. child2\n1. c");
    // a=1, b=2, child1=1, child2=2, c=3 (returning to parent continues counter)
    assert.deepEqual(extractOrderNums(html), ["1", "2", "1", "2", "3"]);
  });

  test("single ordered item displays as 1.", () => {
    const html = renderMarkdown("1. only");
    assert.deepEqual(extractOrderNums(html), ["1"]);
  });

  test("source number is ignored — always auto-increments", () => {
    const html = renderMarkdown("5. first\n99. second\n1. third");
    assert.deepEqual(extractOrderNums(html), ["1", "2", "3"]);
  });

  test("alternating indent levels continue counters correctly", () => {
    // Simulates the user's real-world pattern: parent/child alternating
    const md = "1. 申請をONにする\n1. ドロワーの表示\n1. 申請との紐づけ\n   1. 下書きになる\n1. 申請開始\n   1. 承認待ちになる\n1. 最終承認\n   1. 承認済みになる";
    const html = renderMarkdown(md);
    // parent: 1,2,3,4,5  child: each sub-list starts at 1
    assert.deepEqual(extractOrderNums(html), ["1", "2", "3", "1", "4", "1", "5", "1"]);
  });

  test("three nesting levels count independently", () => {
    const md = "1. L0-a\n  1. L1-a\n    1. L2-a\n    1. L2-b\n  1. L1-b\n1. L0-b";
    const html = renderMarkdown(md);
    // L0: 1,2  L1: 1,2  L2: 1,2
    assert.deepEqual(extractOrderNums(html), ["1", "1", "1", "2", "2", "2"]);
  });

  test("nested ordered items have indent class for indentation", () => {
    const html = renderMarkdown("1. top\n  1. nested");
    assert.match(html, /md-indent-1/);
  });
});

describe("renderMarkdown — edge cases", () => {
  test("_text_ does NOT render as italic (only *text* is supported)", () => {
    const html = renderMarkdown("_text_");
    assert.doesNotMatch(html, /<em>/);
    assert.match(html, /_text_/);
  });

  test("bold and italic coexist: **bold** and *italic*", () => {
    const html = renderMarkdown("**bold** and *italic*");
    assert.match(html, /<strong>bold<\/strong>/);
    assert.match(html, /<em>italic<\/em>/);
  });

  test("code block protects markdown symbols inside", () => {
    const html = renderMarkdown("```\n**not bold**\n```");
    assert.doesNotMatch(html, /<strong>/);
    assert.match(html, /\*\*not bold\*\*/);
  });

  test("unclosed fence with content below renders as literal text", () => {
    const html = renderMarkdown("```\nsome code");
    assert.doesNotMatch(html, /class="md-codeblock"/);
    assert.match(html, /some code/);
  });

  test("nested checkbox renders as checkbox", () => {
    const html = renderMarkdown("- [ ] parent\n  - [ ] child");
    const checkboxCount = (html.match(/type="checkbox"/g) || []).length;
    assert.equal(checkboxCount, 2);
  });

  test("javascript: link is NOT rendered as anchor", () => {
    // renderMarkdown only allows https?:// URLs — javascript: never becomes <a href>
    const html = renderMarkdown("[xss](javascript:alert(1))");
    assert.doesNotMatch(html, /<a href=/);
  });

  test("html special chars are escaped in output", () => {
    const html = renderMarkdown("<script>alert(1)</script>");
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;/);
  });

  // 中身が空のマーカー対（例: ⌘B を打った直後でまだ内容が無い状態）は、行内の他の文字に隣接して
  // いれば装飾に化けずリテラルのまま描画される。行がマーカーだけで完結する場合（`****` 単体等）は
  // 水平線記法（`***`/`---`/`___` の 3 個以上連続）と区別が付かないため対象外（別問題）
  test("empty marker pairs stay literal when adjacent to other text on the line", () => {
    assert.match(renderMarkdown("a****b"), /^<div[^>]*>a\*\*\*\*b<\/div>$/);
    assert.match(renderMarkdown("a**b"), /^<div[^>]*>a\*\*b<\/div>$/);
    assert.match(renderMarkdown("a``b"), /^<div[^>]*>a``b<\/div>$/);
    assert.match(renderMarkdown("a~~~~b"), /^<div[^>]*>a~~~~b<\/div>$/);
  });

  test("space-only content between ** stays a valid (if unusual) bold element", () => {
    const html = renderMarkdown("a** **b");
    assert.match(html, /<strong> <\/strong>/);
  });
});

describe("renderMarkdown — image syntax", () => {
  test("image without alt", () => {
    const html = renderMarkdown("![](images/a.png)");
    assert.match(html, /<img alt="" src="images\/a\.png" data-rel-src="images\/a\.png" title="ダブルクリックで開く">/);
  });

  test("image with alt", () => {
    const html = renderMarkdown("![説明](images/a.png)");
    assert.match(html, /<img alt="説明" src="images\/a\.png" data-rel-src="images\/a\.png" title="ダブルクリックで開く">/);
  });

  test("image mixed with link on the same line", () => {
    const html = renderMarkdown("![](images/a.png) [text](https://example.com)");
    assert.match(html, /<img alt="" src="images\/a\.png" data-rel-src="images\/a\.png" title="ダブルクリックで開く">/);
    assert.match(html, /<a href="https:\/\/example\.com"/);
  });

  test("link is not mistaken for an image (no leading !)", () => {
    const html = renderMarkdown("[text](https://example.com)");
    assert.doesNotMatch(html, /<img/);
  });

  test("uses window.resolveImageSrc when defined", () => {
    global.window = { resolveImageSrc: (src) => `asset://localhost/${src}` };
    try {
      const html = renderMarkdown("![](images/a.png)");
      // src は resolve 後の asset URL、data-rel-src は resolve 前の相対パスのまま
      assert.match(html, /<img alt="" src="asset:\/\/localhost\/images\/a\.png" data-rel-src="images\/a\.png" title="ダブルクリックで開く">/);
    } finally {
      delete global.window;
    }
  });

  test("image nested inside a link renders <img> inside <a>", () => {
    const html = renderMarkdown("[![alt](images/a.png)](https://example.com)");
    assert.match(
      html,
      /<a href="https:\/\/example\.com" data-url="https:\/\/example\.com"><img alt="alt" src="images\/a\.png" data-rel-src="images\/a\.png" title="ダブルクリックで開く"><\/a>/
    );
  });

  test("image alt attribute injection attempt is neutralized", () => {
    const html = renderMarkdown('![" onerror=alert(1) x="](images/a.png)');
    // The payload text survives as inert data, but the `"` that would break out of the
    // attribute is escaped — no unescaped `"` appears right before `onerror=`.
    assert.doesNotMatch(html, /alt="[^"]*"[^>]*onerror=/);
    assert.match(html, /<img alt="&quot; onerror=alert\(1\) x=&quot;" src="images\/a\.png" data-rel-src="images\/a\.png" title="ダブルクリックで開く">/);
  });

  test("image src attribute injection attempt is neutralized", () => {
    const html = renderMarkdown('![](images/a.png"onerror=xss)');
    assert.doesNotMatch(html, /src="images\/a\.png"onerror=xss"/);
    assert.match(html, /src="images\/a\.png&quot;onerror=xss"/);
  });

  test("link href attribute injection attempt is neutralized", () => {
    const html = renderMarkdown('[text](https://example.com/"onmouseover=xss x=")');
    assert.doesNotMatch(html, /href="https:\/\/example\.com\/"onmouseover/);
    assert.match(html, /href="https:\/\/example\.com\/&quot;onmouseover=xss x=&quot;"/);
  });
});

describe("renderMarkdown — image width syntax (![alt|300](src))", () => {
  test("alt末尾が |数字 → width 属性を出し、alt から除去する", () => {
    const html = renderMarkdown("![説明|300](images/a.png)");
    assert.match(html, /<img alt="説明" src="images\/a\.png" data-rel-src="images\/a\.png" title="ダブルクリックで開く" width="300">/);
  });

  test("alt が |数字 のみ（ベースなし） → alt は空、width だけ付く", () => {
    const html = renderMarkdown("![|300](images/a.png)");
    assert.match(html, /<img alt="" src="images\/a\.png" data-rel-src="images\/a\.png" title="ダブルクリックで開く" width="300">/);
  });

  test("末尾セグメントが数字以外 → 幅指定とみなさず alt をそのまま残す", () => {
    const html = renderMarkdown("![a|b](images/a.png)");
    assert.match(html, /<img alt="a\|b" src="images\/a\.png" data-rel-src="images\/a\.png" title="ダブルクリックで開く">/);
    assert.doesNotMatch(html, /width=/);
  });

  test("alt に | が複数（![a|b|300]） → 末尾の |300 だけを幅として分離し alt は 'a|b'", () => {
    const html = renderMarkdown("![a|b|300](images/a.png)");
    assert.match(html, /<img alt="a\|b" src="images\/a\.png" data-rel-src="images\/a\.png" title="ダブルクリックで開く" width="300">/);
  });

  test("|0 は無視される（width 属性なし）", () => {
    const html = renderMarkdown("![説明|0](images/a.png)");
    assert.doesNotMatch(html, /width=/);
  });

  test("下限未満（|39）は無視される", () => {
    const html = renderMarkdown("![説明|39](images/a.png)");
    assert.doesNotMatch(html, /width=/);
  });

  test("下限（|40）は採用される", () => {
    const html = renderMarkdown("![説明|40](images/a.png)");
    assert.match(html, /width="40"/);
  });

  test("上限（|2000）は採用される", () => {
    const html = renderMarkdown("![説明|2000](images/a.png)");
    assert.match(html, /width="2000"/);
  });

  test("上限超過（|2001）は無視される", () => {
    const html = renderMarkdown("![説明|2001](images/a.png)");
    assert.doesNotMatch(html, /width=/);
  });

  test("width 指定と data-rel-src・title は共存する", () => {
    global.window = { resolveImageSrc: (src) => `asset://localhost/${src}` };
    try {
      const html = renderMarkdown("![説明|300](images/a.png)");
      assert.match(
        html,
        /<img alt="説明" src="asset:\/\/localhost\/images\/a\.png" data-rel-src="images\/a\.png" title="ダブルクリックで開く" width="300">/
      );
    } finally {
      delete global.window;
    }
  });

  test("エスケープ対象の alt に |数字 が付いていても、幅分離後の属性エスケープは維持される", () => {
    const html = renderMarkdown('!["x|300](images/a.png)');
    // `"` はそのまま alt に残り（末尾は数字だが直前が \| ではなく通常文字なので幅指定として分離される）
    // その上で属性値としてエスケープされていることを確認する
    assert.match(html, /<img alt="&quot;x" src="images\/a\.png" data-rel-src="images\/a\.png" title="ダブルクリックで開く" width="300">/);
  });
});

describe("renderMarkdown — NBSP (U+00A0) normalization", () => {
  test("checkbox with NBSP: - [ ] task", () => {
    const html = renderMarkdown("- [ ] task");
    assert.match(html, /class="md-check"/);
    assert.match(html, /type="checkbox"/);
    assert.doesNotMatch(html, /checked/);
  });

  test("bullet with NBSP: - item", () => {
    const html = renderMarkdown("- item");
    assert.match(html, /class="md-bullet"/);
  });

  test("ordered list with NBSP: 1. item", () => {
    const html = renderMarkdown("1. item");
    assert.match(html, /class="md-ordered"/);
  });

  test("mixed NBSP and regular space: - [ ] task", () => {
    const html = renderMarkdown("- [ ] task");
    assert.match(html, /class="md-check"/);
    assert.match(html, /type="checkbox"/);
  });
});

describe("renderMarkdown — 空チェックボックス項目のキャレット着地点", () => {
  test("内容が空の未完了チェックボックス行は span に nbsp を持つ", () => {
    const html = renderMarkdown("- [ ] ");
    assert.match(html, /<span>&nbsp;<\/span>/);
  });

  test("内容が空の完了チェックボックス行も同様に nbsp を持つ", () => {
    const html = renderMarkdown("- [x] ");
    assert.match(html, /<span>&nbsp;<\/span>/);
  });

  test("内容があるチェックボックス行には nbsp を挿入しない", () => {
    const html = renderMarkdown("- [ ] task");
    assert.doesNotMatch(html, /<span>&nbsp;<\/span>/);
    assert.match(html, /<span>task<\/span>/);
  });
});

describe("renderMarkdown — インライン生表示（reveal）", () => {
  test("reveal 対象行の装飾は生 raw（マーカー込み）で表示される", () => {
    const html = renderMarkdown("pre **bold** post", { line: 0, start: 4, end: 12 });
    assert.doesNotMatch(html, /<strong>/);
    assert.match(html, /class="md-reveal"/);
    assert.match(html, />pre <span class="md-reveal">\*\*bold\*\*<\/span> post</);
  });

  test("reveal 対象でない行はそのまま装飾変換される（複数行中 1 行だけ reveal）", () => {
    const html = renderMarkdown("**a**\n**b**", { line: 1, start: 0, end: 5 });
    assert.match(html, /<strong>a<\/strong>/); // 0 行目は通常どおり
    assert.match(html, /class="md-reveal">\*\*b\*\*<\/span>/); // 1 行目だけ reveal
  });

  test("reveal のリスト行はマーカーを除いた内容側だけが対象になる（行頭記号自体は元々隠さない）", () => {
    const html = renderMarkdown("- **bold** item", { line: 0, start: 0, end: 8 });
    assert.match(html, /class="md-bullet"/); // リストマーカー自体の描画は変わらない
    assert.match(html, /class="md-reveal">\*\*bold\*\*<\/span>/);
  });

  test("行・範囲が一致しなければ reveal は適用されない（stale な状態からの自然なフォールバック）", () => {
    const html = renderMarkdown("**bold**", { line: 5, start: 0, end: 8 }); // 存在しない行
    assert.match(html, /<strong>bold<\/strong>/);
    assert.doesNotMatch(html, /md-reveal/);
  });

  test("reveal 未指定時は挙動が変わらない（既存呼び出しとの後方互換）", () => {
    assert.equal(renderMarkdown("**bold**"), renderMarkdown("**bold**", null));
  });
});

describe("renderMarkdown — 水平線（hr）のインライン生表示", () => {
  // <hr> は contenteditable の着地点を持たないため、選択の端点がその行に乗っているあいだは
  // 行全体を生 raw のテキスト行として表示し、離れると <hr> に戻す。inlineSegments の reveal
  // （revealState、collapsed キャレット専用）とは別の第 3 引数 hrRevealLines（行番号の Set）で
  // 管理する: 非 collapsed 選択の間も両端点ぶん複数行を保持できる必要があるため
  test("hrRevealLines に含まれる hr 行は <hr> ではなく生 raw のテキスト行になる", () => {
    const html = renderMarkdown("***", null, new Set([0]));
    assert.doesNotMatch(html, /<hr/);
    assert.match(html, /class="md-line md-reveal"/);
    assert.match(html, />\*\*\*</);
  });

  test("hrRevealLines に含まれない hr 行は通常どおり <hr> になる", () => {
    const html = renderMarkdown("a\n***", null, new Set([0]));
    assert.match(html, /<hr/);
  });

  test("複数行を同時に生表示できる（非 collapsed 選択の両端点）", () => {
    const html = renderMarkdown("***\nx\n***", null, new Set([0, 2]));
    assert.equal((html.match(/<hr/g) || []).length, 0);
    assert.equal((html.match(/class="md-line md-reveal"/g) || []).length, 2);
  });

  test("hrRevealLines 未指定時は従来どおり <hr> のまま", () => {
    assert.match(renderMarkdown("***"), /<hr/);
  });

  // 生表示は escapeHtml(line) を直接使い renderInline（inlineMarkdown/inlineSegments）を経由
  // しない。先頭に空白がある " ---" は markerLength が 0（hr はマーカー無し）なので DOM の
  // 可視文字数と raw の文字数が完全に一致する必要があり、trimmedLine（インデント除去後）ではなく
  // 行全体を渡さないと空白分だけずれる
  test("先頭に空白がある水平線も raw と 1 文字も違わずそのまま表示される", () => {
    const html = renderMarkdown(" ---", null, new Set([0]));
    assert.match(html, /> ---</);
  });

  // "* * *" は ITALIC_RE（/\*([^*]+)\*/）が "* *" を "*" + " " + "*" として拾ってしまうため、
  // renderInline 経由（inlineMarkdown）だとマーカーが消えて <em> </em> * に化ける。escapeHtml
  // 直書きならこの装飾解釈自体が起こらない
  test("space-separated asterisks の水平線はマーカーが消えず raw のまま表示される", () => {
    const html = renderMarkdown("* * *", null, new Set([0]));
    assert.doesNotMatch(html, /<em>/);
    assert.match(html, />\* \* \*</);
  });
});
