# 会話の画面の Markdown を部品に上げるときは、遅延読み込みの口を入口にする（2026-10-10）

**`main-view/markdown/` の読み手がメインビューの外の部品にまたがったら、`conversation/components/markdown/` の
部品に上げ、外から引く口 `markdown.tsx` を遅延読み込みの口にする。** `import()` で読む描画一式は、部品の中の
概念のディレクトリ `renderer/` に入れる。外の読み手が直に引いていたものは、読み手を数え直して置き直す。
遅延読み込みの方式（`deferredModule`・`main.tsx` が最初の描画の前に `loadMarkdown()` を起こす・`React.lazy` を
使わない）は `docs/architecture/browser.md`「重いライブラリ」のままで、この判断は置き場だけを決める。

## 何が困っていたか

`main-view/markdown/` はメインビューの中の概念のディレクトリで、読み手はいまどれもメインビューの中にある
（`main-view.tsx`・`report/`・`question-record/`・`report-outline/`・`inquiry/`）。お伺いの札（`inquiry/`）を
答え待ちの札と共有するために会話の画面の部品へ上げると、`markdown/` の読み手が2つの部品にまたがり、
`docs/architecture.md`「全体構成」の置き場の表では `conversation/components/markdown/` の部品になる。

部品の外から引いてよいのは `<部品>.tsx` だけなので、入口は描画一式の本体の `markdown.tsx` になる。
一方 `docs/architecture/browser.md`「重いライブラリ」は、使い手は `deferred-markdown.tsx` を使い
`markdown.tsx` を直接 import しない（すると一式が入口の束に戻る）と決めている。2つの決まりが逆を向く。

ほかにも、外の読み手が `deferred-markdown.tsx` 以外を直に引いている:

| ファイル                     | 外の読み手                                                   |
| ---------------------------- | ------------------------------------------------------------ |
| `report-notation.module.css` | `report/`・`inquiry/`・`question-record/`・`report-outline/` |
| `split-blocks.ts`            | `report/`                                                    |
| `repository-link.tsx`        | `main-view.tsx`                                              |

概念のディレクトリの決まり（`docs/architecture.md`「機能の中を分ける（container / presenter と `hooks/`）」）は
「2つ目の読み手を得たらディレクトリごと上げる」だけで、ページの中のどこへ上げるかを決めていない
（ページの直下には概念のディレクトリを置けない）。

## 決めたこと

- **上げる引き金は、`markdown/` の読み手がメインビューの外の部品にまたがったとき。** それまではメインビューの中の
  概念のディレクトリのまま置く
- **上げ先は置き場の表の「`components/` の下の2つ以上の部品」の行の「部品」**（`conversation/components/markdown/`）。
  表に行は足さない。上げたあとの木:

  ```
  conversation/components/markdown/
    markdown.tsx              入口。いまの deferred-markdown.tsx の中身（loadMarkdown・Markdown・QuestionPreviewMarkdown）と、
                              外の読み手が使う .detail-block の class 名
    markdown.module.css       いまの deferred-markdown.module.css
    renderer/                 import() で読む描画一式（概念のディレクトリ）
      markdown-renderer.tsx   いまの markdown.tsx
      chart-block.tsx chart.ts chart-palette.ts code-file-name.ts color-swatch.ts copy-button.tsx
      mermaid-block.tsx mermaid-block.module.css notation.tsx preview-image.ts report-image.tsx
      report-notation.module.css sanitize-schema.ts task-check.ts theme-color.ts vendor-script.ts
  ```

  `test/architecture.test.ts` の `PAGE_CONCEPT_DIRECTORIES` は `markdown` を `renderer` に替える。
  `vite.config.ts` の `chunkFileNames` は `[name].js` なので、描画一式のチャンクの名前は `markdown.js` から
  `markdown-renderer.js` に変わる

- **外の読み手が直に引いていたものは、読み手を数え直して置き直す**:
  - `split-blocks.ts` は読み手が `report/` だけなので `main-view/components/report/domain/split-blocks.ts`
  - `repository-link.tsx` は読み手が `main-view.tsx` と描画一式の2つの部品なので、
    `conversation/components/repository-link/repository-link.tsx` の部品
  - `report-notation.module.css` の規則は `.detail-block` を除いてすべて `.detail-block` の子孫の選択子で、
    外の4つの読み手が使う class は `.detail-block` だけ。入口の `markdown.tsx` がその class 名を名前を付けて
    公開し、外の読み手は CSS を import しない。ファイルは `renderer/` に入れる
- **描画一式を直接 import しない決まりは、部品の境界の検査が守る。** `componentBoundaryViolations`
  （`test/architecture.test.ts`）は `from "…"` を辺に数え、`import()` は数えないので、入口が `import()` で
  `renderer/` を読むのは通り、部品の外から `renderer/` を直に引くと落ちる
- `features/task-board/` の `deferred-task-body.tsx` はページの形の外（入口の決まりが無い）なので変えない

## 残る害

部品の中では、入口が `renderer/` を `import()` ではなく静的に import しても検査は落とさない（一式が入口の束に
戻るだけで、描画は変わらない）。入口から `renderer/` を `export … from` で再エクスポートしても同じで、
検査が落とすのは部品の外からの辺だけ。入口は部品の中で1つなので、読めば分かる範囲に留まる。

## 採らなかった案

- **表に「遅延読み込みの入口を持つ部品」の行を足し、`deferred-<部品>.tsx` を外から引く口にする**: 境界の検査の
  入口を「`deferred-<部品>.tsx` があればそれだけ」に変えれば検査で落とせる。ただし `<部品>.tsx` が「外から
  引けないほうの名前」になり、表の「外から引くのはこのファイルだけ」と意味が逆になる。表・ページの形の検査・
  境界の検査の3か所に例外が増える。CSS・`split-blocks.ts`・`repository-link.tsx` の直の import も残るので、
  置き直しは結局要る
- **直に引かれているものを置き直すだけにする**: 入口は描画一式の本体の `markdown.tsx` のままで、遅延読み込みの口
  `deferred-markdown.tsx` を外から引くと境界の検査が落とす。衝突が解けない
- **`report-notation.module.css` を、表の「2つ以上の部品が読む CSS」どおりページの `conversation.module.css` へ
  出す**: 1456行の記法の見た目がページの CSS に混ざり、記法の CSS を名前で探せなくなる。外の読み手が使うのは
  `.detail-block` 1つだけなので、class 名を入口から渡せば足りる
