# ブラウザ側で使うライブラリの検討（2026-09-27）

**この文書は調査メモであって正典ではない。** `docs/` の他ファイルにある「節の索引」はここには
作らない。**依存の追加と実装はこの文書の外**で、ここは入れる・入れないの推奨までを持つ。

**問いの出どころ**: ユーザーの言葉（2026-09-27）「browser側で使うライブラリを検討してほしい。特に
t3code の `apps/web/package.json` で使われているものや、Base UI・react-split・AutoAnimate」。

**実測値は時間が経つと変わる。** 版と大きさは 2026-09-27 に npm の登録簿と手元の組み立てで測ったもの。

## 結論

**いま入れるものは無い。** 3つの名指しの候補はどれも、置き換える自作のものが小さく、素のブラウザの
部品（`<dialog>`・`<select>`・CSS の anchor positioning）で足りている。入れると tsukumo の決め事
（`docs/design.md` 6.5「アニメーションのライブラリも要らない」・6.6「Tailwind には移らない」）の
どれかと競る。t3code の残りの依存は、tsukumo に同じ役目のものがすでに入っているか、役目そのものが無い。

| 候補                                   | 推奨                                               | 1行の理由                                                                                                                      |
| -------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Base UI（`@base-ui/react`）            | **入れない**（セッションの切り替え画面で測り直す） | いまの `Dialog` / `Select` は素の要素で足り、置き換えても消えるのは約100行。浮かぶ部品が要るのはセッションの切り替え画面が最初 |
| react-split                            | **入れない**                                       | 2022-01 から出ていない。仕切りに `role="separator"` もキーボードも無く、grid の `fr` の比率と噛み合わない                      |
| AutoAnimate（`@formkit/auto-animate`） | **入れない**                                       | 並びの動きは「一緒にいる感じ」にも「捗る」にも効かない。消した要素を React の外で DOM へ戻して動かす                           |
| t3code の残りの依存                    | **入れない**（下の表2）                            | 同じ役目のものが入り済み・別のタスクが持つ・役目が無い、のどれか                                                               |

重なる既存のタスクには、背景に足すことを `develop/draft/` に積んだ（セッションの切り替え画面のタスクに Base UI の測り直し、
React Compiler を入れるタスクに `@vitejs/plugin-react` 6 での入れ方）。

## 測った方法

- 版・公開日・展開後の大きさ・依存は npm の登録簿（`registry.npmjs.org/<名前>`）から取った
- 組み立ての大きさは、`/tmp` に候補だけを入れた作業場を作り、このリポジトリの `vite` 8.3 で
  「React を描くだけ」の1本と「候補を1つ使う」1本を組み立てて、JS の差を測った（リポジトリには
  何も足していない。作業場は消した）。いまの `dist/browser/main.js` は 2,925,008 バイト

| 組み立てたもの                           | JS（バイト） |     増分 | gzip の増分 |
| ---------------------------------------- | -----------: | -------: | ----------: |
| React だけ（基準）                       |      219,171 |        — |           — |
| Base UI `Dialog`                         |      279,491 |  +60,320 |     +19,661 |
| Base UI `Tooltip`                        |      303,275 |  +84,104 |     +28,436 |
| Base UI `Popover`                        |      321,553 | +102,382 |     +34,463 |
| Base UI `Autocomplete`                   |      341,002 | +121,831 |     +41,815 |
| AutoAnimate（`useAutoAnimate`）          |      227,637 |   +8,466 |      +2,974 |
| react-split                              |      230,189 |  +11,018 |      +3,766 |
| react-resizable-panels（分割の比較相手） |      259,973 |  +40,802 |     +12,710 |

ページはローカルの `127.0.0.1` からメモリ配信で1本だけ配る（`docs/design.md` 6.4）ので、
**どの候補も大きさは決め手にならない**。決め手は、置き換えたあとのコードが読みやすくなるかと、
tsukumo の決め事と競らないか。

## 表1. 名指しの3つ

| 候補                                                         | 置き換える自作のもの                                                                                                                                                                                                   | 足す依存の重さ                                                                                                                                                                                          | 入れたときに消せるコード                                                                                                                                   | 入れない理由                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base UI 1.8.0（2026-09-04、MIT）                             | `components/ui/dialog/`（77行＋CSS 14行）と `hooks/use-modal-dialog.ts`（31行）、`components/ui/select/`（57行＋CSS 36行）。`/`・`@` の補完の一覧（`command-suggestions.tsx`・`file-suggestions.tsx`）も形の上では候補 | 展開後 9.6MB。依存は `@floating-ui/react-dom`・`@floating-ui/utils`・`@base-ui/utils`・`@babel/runtime`・`use-sync-external-store`（`date-fns` は任意の peer）。組み立ての増分は部品1つで gzip 20〜42KB | `use-modal-dialog.ts` と `Dialog` の開閉・backdrop の読み替え（約60行）。`Select` は素の `<select>` の包みなので、見た目が変わらない限り消える行はほぼ無い | いまの部品は**素の要素の上に薄く載っていて**、Base UI に替えても読む量は減らない（`Dialog.Root` / `Portal` / `Backdrop` / `Popup` の4段になる）。箱は Orca のタブ（Chromium）だけで、浮かぶ位置はすでに CSS の anchor positioning で書いている（`character-view.module.css` の `anchor-name`）。ポータルに出すと、上に重ねるために root へ `isolation: isolate` が要る（Base UI のクイックスタート）。**浮かぶ部品が要る最初の場面はセッションの切り替えを帯へ移すタスク**（ホバーの一行と、探す＋一覧の切り替え画面）なので、そこで素の `popover`・anchor positioning と並べて測り直す |
| react-split 2.0.14（2022-01-07、MIT。中身は split.js 1.6.5） | `conversation-layout/components/layout-resizer/layout-resizer.tsx`（76行）と `hooks/use-conversation-layout.ts` の書き込み（132行のうち比率の CSS 変数を書く部分）                                                     | 展開後 38KB＋split.js 131KB、`prop-types` に依存。組み立ての増分は gzip 4KB                                                                                                                             | `LayoutResizer` の `pointerdown` / `pointermove` / `pointerup` の配線（約40行）                                                                            | **2022-01 から版が出ていない。** 仕切りは split.js が `document.createElement("div")` で React の外に作り、`role` も `aria-*` もキーボードの操作も持たない（いまの `LayoutResizer` は `role="separator"` と `aria-label` を持ち、E2E の DOM の期待値にも出ている）。子の幅を `calc(% - px)` の inline style で書くので、いまの CSS grid の `fr`（`--layout-top-left` などの変数）・雑談の畳み（`collapsedRowTop`）・狭い画面のタブの積み替えと噛み合わず、分割の形をほぼ書き直すことになる                                                                                              |
| AutoAnimate 0.10.0（2026-07-10、MIT）                        | 無い（いまの動きは CSS の `@keyframes` だけ。`.chat-entry-pop`・立ち絵の5つの動き）                                                                                                                                    | 展開後 59KB、依存なし。組み立ての増分は gzip 3KB                                                                                                                                                        | 無い（足すだけ）                                                                                                                                           | 並びの出入りと入れ替わりを動かすもので、**キャラクターの存在も仕事の捗りも増やさない**（`docs/requirements.md` 1章）。ユーザーは移り変わりの動きより「すぐに正しい姿」を求めた（`docs/screen-design.md`「切り替えのときの立ち絵」）。仕組みの上では、消えた子を `insertBefore` で DOM へ戻して動かす（React の知らない要素が並びに残る）。`prefers-reduced-motion` は付けた時点で1回だけ読み、以後の切り替えに追随しない。E2E は `reducedMotion: "reduce"` で走るので、入れても E2E は動きを一度も通らない                                                                              |

### 論点への答え

- **Base UI を `components/ui/` の土台にするか**: しない。見た目の相性は悪くない（見た目を持たない
  部品で、`className` と `data-open` などの属性を CSS Modules から引ける。色は `theme.css` の
  トークンのまま使える）。ただ、いまの `components/ui/` の値打ちは variant の表と `satisfies` の
  検査（`docs/design.md` 2章「`components/ui/` の部品（variant の作法と一覧）」）にあり、振る舞いは
  素の要素が持っている。土台を替えても消える自作の振る舞いが小さい
- **react-split と今の分割のどちらが読みやすいか**: 今の分割。仕切り1本が「比率の CSS 変数2つを
  書く」だけで、ドラッグ中は state に触らない形が1ファイルで読める。もし仕切りのライブラリが要る
  日が来たら、比べる相手は react-split ではなく react-resizable-panels（2026-09-27 に 4.14.1、
  `role="separator"` とキーボード操作を持ち、入れ子の分割を持つ）
- **AutoAnimate の演出が目的に沿うか**: 沿わない。演出を足すなら、キャラクターにつながる場所
  （吹き出し・立ち絵・書き上げる演出）に CSS で足すのがいまの決め事どおり

## 表2. t3code の `apps/web/package.json` の残り

2026-09-27 の `main` の `apps/web/package.json`（`@t3tools/web` 0.0.42）。`@t3tools/*` の
workspace のパッケージは除いた（依存の置き場を `package.json` ごとに分けるかは別のタスクに委ねる）。

| 依存（t3code）                                                                             | tsukumo の同じ役目のもの                                                                                      | 推奨                                                                                                                              |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `lucide-react`・`react-markdown`・`rehype-raw`・`rehype-sanitize`・`remark-gfm`・`zustand` | 同じものが入り済み                                                                                            | —                                                                                                                                 |
| `babel-plugin-react-compiler`（と `@rolldown/plugin-babel`）                               | 無い（React Compiler を入れるタスクが持つ）                                                                   | そのタスクに委ねる。`@vitejs/plugin-react` 6 には babel の口が無いので、入れ方をそのタスクの背景へ足すドラフトを積んだ            |
| `@tiptap/*`（7つ）                                                                         | 入力欄のエディタは CodeMirror 6 に決めた（`docs/research/markdown-composer.md`）                              | 入れない。tiptap は書いた記号を隠す WYSIWYG 寄りで、ユーザーが決めた「書きながら装飾が見える」形から外れる                        |
| `tailwindcss`・`@tailwindcss/vite`・`class-variance-authority`・`tailwind-merge`           | CSS Modules と `theme.css` のトークン、variant は `satisfies Record<…>` の表、class の連結は `clsx`           | 入れない（`docs/design.md` 6.6「Tailwind には移らない」）。cva 単体も、variant の表を型で全域検査するいまの形より読む量が増える   |
| `@tanstack/react-router`（と `@tanstack/router-plugin`）                                   | `stores/location-hash.ts`（178行）と `stores/screen.tsx`（110行）が `location.hash` の画面4つと `turn` を持つ | 入れない。画面が4つで入れ子も読み込みも無く、ルートの木を生成する組み立ての段が増えるほうが重い                                   |
| `@tanstack/react-pacer`                                                                    | `utils/debounce.ts`（54行）の `useDebouncedCallback`                                                          | 入れない。いまのものは「鍵ごとに別のタイマー」と「アンマウントで待たずに流す」を持ち、置き換えてもその2つを上に書き足すことになる |
| `@legendapp/list`                                                                          | 無い（仮想化していない）                                                                                      | 入れない。長い一覧で遅いという困りごとが出ていない                                                                                |
| `@pierre/diffs`・`@pierre/trees`                                                           | 変更の前後は言語 `diff` のコードブロックを highlight.js で色付け（`docs/display.md` 4.2）                     | 入れない。`@pierre/diffs` は shiki を連れてくる（展開後 7.4MB）。色付けを2系統にしない                                            |
| `@dnd-kit/*`（4つ）                                                                        | 無い（並べ替えの画面が無い）                                                                                  | 入れない                                                                                                                          |
| `@daypicker/react`                                                                         | 無い（成果の暦は見せるだけで、日付を入力させない）                                                            | 入れない                                                                                                                          |
| `culori`                                                                                   | 色の混ぜは CSS の `color-mix()`（`button.module.css` ほか）                                                   | 入れない                                                                                                                          |
| `remark-breaks`                                                                            | 無い（1つの改行は Markdown どおり空白）                                                                       | 入れない。レポートの改行の意味が変わるので、入れるなら記法の決定（`docs/display.md`）が先                                         |
| `hast-util-to-html`・`hast-util-to-jsx-runtime`                                            | `react-markdown` が中で使う（推移の依存）                                                                     | 入れない（直接使う場面が無い）                                                                                                    |
| `heic-to`                                                                                  | 無い（貼り付けの画像はクリップボードの PNG）                                                                  | 入れない（展開後 24MB）                                                                                                           |
| `@clerk/*`・`jose`・`@noble/hashes`                                                        | 無い（認証が無い。`127.0.0.1` だけで配る）                                                                    | 入れない                                                                                                                          |
| `effect`・`@effect/atom-react`                                                             | 状態は zustand と TanStack Query                                                                              | 入れない                                                                                                                          |
| `jszip`・`jsonc-parser`                                                                    | 無い（役目が無い）                                                                                            | 入れない                                                                                                                          |
| devDependencies の `jsdom`・`react-test-renderer`                                          | 単体テストの DOM は `happy-dom`、描画は `@testing-library/react`                                              | 入れない                                                                                                                          |
| devDependencies の `vite-plus`（`vp` コマンド）                                            | `vite` と `vitest` を直接使う                                                                                 | この検討の外（ブラウザ側のライブラリではなく道具立て）                                                                            |

## 入れないと決めたあとで見つけたこと

- **`/`・`@` の補完の一覧は、支援技術に一覧として伝わっていない**（`role="listbox"` も
  `aria-activedescendant` も無い）。Base UI の `Autocomplete` を入れる理由にはしなかった（入力欄は
  `<textarea>` と CodeMirror 6 の2つの面を持ち、`Autocomplete.Input` の `<input>` と形が合わない）。
  直すなら素の ARIA を足す別の話
- **仕切り（`LayoutResizer`）はキーボードで動かせない**（`tabIndex` も `keydown` も無い）。
  react-resizable-panels が持つ振る舞いの1つだが、足すだけなら自作に数十行で済む

## 見直す条件

- セッションの切り替え画面で、ホバーの一行・探す欄の一覧を素の `popover` と anchor positioning で
  書いて、位置の追従やキーボードの扱いを自前で抱える量が `Dialog` の自作を超えたら、Base UI を
  そこで測り直す（`Tooltip` / `Preview Card` / `Autocomplete`）
- 仕切りを増やす・入れ子にする・キーボードで動かす、のどれかが要件になったら react-resizable-panels を測る

## 参照

- t3code の `apps/web/package.json`: https://github.com/pingdotgg/t3code/blob/main/apps/web/package.json
- Base UI のクイックスタート（見た目を持たない・`className`・`isolation: isolate`・部品の一覧）: https://base-ui.com/react/overview/quick-start
- react-split の README: https://github.com/nathancahill/split/tree/master/packages/react-split
- AutoAnimate（追加・削除・移動の3つ、`prefers-reduced-motion` の既定、親に `position: relative`）: https://auto-animate.formkit.com/
- `@vitejs/plugin-react` 6.1.1 の README「React Compiler」（`node_modules/@vitejs/plugin-react/README.md`）
