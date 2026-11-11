# 画面のデザイン: 余白・角丸・影・動きのデザイントークン

ステータス: **正典**。入口は `docs/architecture/screen-design.md`（画面のデザインの全体）。

責務: 余白・角丸・影・動きのデザイントークンの段と値、使い分け、直書きの許す範囲、`ui/` の箱の部品（`Surface`・`Badge`・`Divider`）、見本帳（`#design`）の置き場を持つ。
読む時: 余白・角丸・影・動きの値を CSS に書くとき、`ui/` の部品を足すとき、見本帳に触るとき。
直す時: トークンの段や値を変えたとき、直書きを許す範囲を変えたとき、`ui/` の箱の部品を足したとき。

## 13. 画面のデザイン

### 13.14 デザイントークン（余白・角丸・影・動き）

**色は `color.md`、字の大きさは `principle-and-type.md`「13.3 Type」が持つ。ここは残りの 4 つ。** 値は `src/browser/styles/theme.css` が持ち、CSS からは `var()` で読む。決めた理由・今の直書きの分布・採らなかった案・置き換えの順は `docs/architecture/adr/0041-design-system-tokens-and-gallery.md`。この文書で「デザイントークン」と書くのは CSS のカスタムプロパティのことで、LLM のトークン消費とは別。

#### 向き（tsukumo と Astryx）

トークンの値の正典は種類で分かれる（ADR 0053 の論点 1）。

| 種類                                                                                       | 正典    | 向き                                                                                                                                                    |
| ------------------------------------------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 色・コードの書体（`--font-code`）                                                          | tsukumo | テーマの定義（`ui/theme-root/tsukumo-theme.ts`）が Astryx の `--color-*`・`--font-family-code` へ写す。選択と状態の内側の輪（`--shadow-inset-*`）も同じ |
| 本文の行の高さ                                                                             | tsukumo | `--line-height-reading`（`theme.css`）を、テーマの定義が `--text-body-leading` へ写す。`--line-height-body` はそれを引く                                |
| 字の段・本文の書体・余白・角丸・影                                                         | Astryx  | `theme.css` の `--font-*`・`--font-sans`・`--space-*`・`--radius-*`・`--shadow-raised`・`--shadow-overlay` が、Astryx のトークンを `var()` で引く       |
| キャラクターの書体・動き（`--motion-*`）・`--radius-xl`・`--radius-round`・`--shadow-ring` | tsukumo | Astryx に対応が無く、`theme.css` の値のまま                                                                                                             |

Astryx のトークンは `<html>` に置かれる（`Theme` が `data-astryx-theme` を `<html>` に写す）ので、`:root` の `theme.css` から `var()` で引ける。テーマの定義には、Astryx が正典の種類の写しを書かない（書くと値が循環する）。

#### 余白

名前は大きさの語で、`ui/stack` の `gap` の語と同じ。**同じ値を 2 つの名前で持たない。** 値は Astryx の `--spacing-*` を引き、rem の値は同じ。

| トークン      | 引く先          | 値       | 使う場面                                    |
| ------------- | --------------- | -------- | ------------------------------------------- |
| `--space-2xs` | `--spacing-0-5` | 0.125rem | 罫と字のあいだ・印の上下の細い余白          |
| `--space-xs`  | `--spacing-1`   | 0.25rem  | 字と字・小さな部品の内側                    |
| `--space-sm`  | `--spacing-2`   | 0.5rem   | 部品の内側の標準・同じ群の部品のあいだ      |
| `--space-md`  | `--spacing-3`   | 0.75rem  | 箱（`Surface`）の内側の標準・群と群のあいだ |
| `--space-lg`  | `--spacing-4`   | 1rem     | 区画のあいだ・ダイアログの内側              |
| `--space-xl`  | `--spacing-5`   | 1.25rem  | 大きな区画のあいだ                          |
| `--space-2xl` | `--spacing-6`   | 1.5rem   | 領域と領域のあいだ                          |
| `--space-3xl` | `--spacing-8`   | 2rem     | 画面の区切り・大きな領域の内側              |
| `--space-4xl` | `--spacing-12`  | 3rem     | ページの上下の余白                          |

- 寄せ方は「近い段へ。同点は大きい段へ」（6px は `sm`・10px は `md`）。
- 32px・48px は `3xl`・`4xl`。その間（28px・40px など）で段に寄せると 4px を超えてずれるものは、部品の CSS に名前のある局所のつまみを置く。負の余白は `calc(-1 * var(--space-xs))`。
- 段は端に足す（`5xl` など）。`md` の意味を動かさない。
- 役割の名前の層（意味のトークン）を `theme.css` に持つ。`--inset-control`（操作子の内側）・`--inset-card`（カードの内側）・`--stack-tight`・`--stack-block`・`--stack-group`・`--stack-section`（縦の間隔）・`--inline-tight`・`--inline-control`・`--inline-group`（横の間隔）・`--gutter-region`・`--gutter-page`（領域・ページの縁）。どれを引くかは関係の強さの表（`docs/architecture/browser/bundle-style-component.md`「CSS」）で決める。値は上の段を参照するだけで、部品は意味のトークンを引く。新しく書く宣言と直す宣言は、生の段を直接引くのを意味のトークンの定義と局所のつまみだけにする。既存の宣言の生の段は、触るときに順に意味のトークンへ寄せる（一括では置き換えない）。

#### 角丸

| トークン         | 引く先               | 値       | 使う場面                           |
| ---------------- | -------------------- | -------- | ---------------------------------- |
| `--radius-sm`    | `--radius-inner`     | 0.375rem | 印・コードの欄・小さな枠           |
| `--radius-md`    | `--radius-element`   | 0.625rem | ボタン・入力欄・カードの標準       |
| `--radius-lg`    | `--radius-container` | 0.75rem  | 箱（`Surface`）・区画              |
| `--radius-xl`    | （直書き）           | 1rem     | ダイアログ・重なる面               |
| `--radius-pill`  | `--radius-full`      | 9999px   | 丸いバッジ・状態のチップ           |
| `--radius-round` | （直書き）           | 50%      | 丸（点・アイコンの枠・立ち絵の枠） |

#### 影

| トークン           | 引く先          | 値                                                 | 使う場面                 |
| ------------------ | --------------- | -------------------------------------------------- | ------------------------ |
| `--shadow-raised`  | `--shadow-med`  | 2 層の影と、暗い面で 1px の明るい縁（Astryx の値） | メニュー・浮かぶカード   |
| `--shadow-overlay` | `--shadow-high` | 2 層の影と、暗い面で 1px の明るい縁（Astryx の値） | ダイアログ・引き出し・板 |
| `--shadow-ring`    | （直書き）      | `0 0 0 2px var(--accent)`                          | 選んでいる・目印の輪     |

- ぼかしのある影（ぼかし 1px 以上で `inset` でないもの）はトークンを使う。向きのある影と、色・幅が部品ごとに違う輪・内側の線（`inset`）は直書きのまま許す。

#### 動き

| トークン        | 値    | 使う場面            |
| --------------- | ----- | ------------------- |
| `--motion-fast` | 0.12s | hover・色の切り替え |
| `--motion-base` | 0.2s  | 開閉・寄り・出入り  |

- `transition` の時間だけをトークンにする。緩急は `ease-out` を基本にし、キーワードのまま書く。
- `animation`（吹き出し・立ち絵・読み込みの回転）は部品ごとの局所のつまみ（`--portrait-*-duration` など）が持つ。
- `prefers-reduced-motion: reduce` のときは、`theme.css` の全要素への規則が animation の時間を `0.01ms`、transition の時間を `1ms` にするので、トークンの側では何もしない。

### 13.15 直書きを止める検査

`test/architecture/` の検査が、`src/browser/` の `theme.css` 以外の `*.css` で、上の 4 つの値がトークンかそれに従う値（`0`・`auto`・`em`・`%`・局所の `var(--*)`・28px 以上の余白・向きのある影・輪と `inset`）だけであることを確かめる。字の大きさの検査（`test/architecture/font-size.test.ts`）と同じ形で、**置き換えが済むまでの違反は、ファイルごとの件数の除外の一覧に載せて通す**。件数が増えたら落ち、減ったら一覧を減らすよう促す。除外の一覧は減る向きにだけ動く。

置き換えが済んだあとも一覧に残してよい例外は、トークンにすると意味が変わる 2 つ。領域の寸法として使う `100vh`（`stage/speech-log.css` の `padding-top`）と、親の角丸に追従させる `border-radius: inherit`（`dispatch/dispatch.module.css`）。どちらも件数 1 で載せ、検査の許す値は広げない。

`astryx theme build` が書く組み立て物の置き場 `src/browser/components/ui/theme-root/built/` は、手で書かない生成物なので、`test/architecture/source-file.ts` の `GENERATED_DIRECTORIES` に載せて、この検査を含む構造の検査から外す。

### 13.16 `ui/` の箱の部品

`ui/` の部品の中身は Astryx（ADR 0053）の部品で、props は tsukumo の語彙のまま変えない。`@astryxdesign/*` と `@stylexjs/stylex` を import できるのは `src/browser/components/ui/` だけで、`.dependency-cruiser.cjs` の `astryx-reader` が外からの import を止める。Astryx に当てない例外は `typing-dot-list` で、Astryx に入力中の点の部品が無いので、今の CSS のまま残す。`layout-resizer` は、移すときに Astryx の `ResizeHandle` が当たるかを確かめ、当たらなければ例外に足す。

根の `ThemeRoot`（`ui/theme-root/`）は、`App` の `QueryClientProvider` の内側・`Root` の外側で、`InternationalizationProvider`（`locale="ja-JP"`）と `Theme`（テーマ `tsukumo`・`mode="dark"`）を重ねて子を包む。テーマの定義 `tsukumo-theme.ts` は、値を tsukumo のトークンの `var()` とそれを組んだ式だけで書き、写すのは色・コードの書体・本文の行の高さ（触る画面の `adaptations` も同じ値）の 3 種類に限る（上の「向き」）。Astryx の `color` に口が無い状態の色（`state-ok` など）は、隣の `tsukumo-component-override.ts` の `components` で `var()` の値として足す。パックの accent は `usePackAppearance` が `<html>` の `--accent` に書き、テーマの `--color-accent` がそれに追随する。

CSS の層の順は、`styles/layer-order.css` が `@layer reset, tsukumo-base, astryx-base, astryx-theme;` と宣言し、`main.tsx` が `./app.tsx` より前に読む。`theme.css` の要素への規則（フォーム部品の継承・フォーカスの輪・リンク）は `tsukumo-base` の層に置き、CSS Modules は層に入れない。テーマが見出しと段落に当てる既定は打ち消さず、素の見出しと段落も Astryx の段になる。層に入っていない `ui/` の部品の CSS は、Astryx のどの層にも勝つ。`reset.css` は読まないので、`box-sizing` は `content-box` のまま残り、見出しの `margin` もブラウザの既定のまま残る。`astryx-heading` の `margin` は、`ui/` の側で `0` に戻す。

`ui/` の部品は、持つのは顔（地・枠・字の色・振る舞い）で、置き方（margin・flex・align-self）は呼び出し側が `className` で渡す。箱の語彙を持つ 3 つを足す。props は全部必須で、型で縛る（`ui/stack` と同じ）。

| 部品      | 持つもの                                                                                                                                                                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Surface` | 地（`tone`: `--surface`・`--surface-raised`・`--surface-accent`）・枠（`--rule-soft` の 1px で固定）・角丸（`radius`: `--radius-*`）・内側の余白（`space`: `--space-*`）・影（`shadow`: `none`・`raised`・`overlay`）                          |
| `Badge`   | 小さな印。`tone`（`neutral`・`ok`・`warn`・`ng`・`accent`）・`shape`（`pill`＝`--radius-pill`・`square`＝`--radius-sm`）・字は `--font-label`。`data-tone`・`data-shape` を出す                                                                |
| `Divider` | 罫。Astryx の `Divider`（`role="separator"` の `div`）で描く。`tone` は `strong`→`strong`、`quiet`・`soft`→`subtle` に写し（`soft` の区別は落ちる）、`orientation`（`horizontal`・`vertical`）は `aria-orientation` に出る。`data-tone` を出す |

カタログの部品（`report` の a2ui の面）は、枠を `Surface`・見出しを `Heading`・並べる入れ物を `Stack` 系・印を `Badge` で組む。

**状態のバッジは全部品で `Badge` の `shape: square`（記号＋語）に揃える。** 地は状態の色を 13% 重ねた割合（`color-mix(in srgb, var(--surface), var(--state-*) 13%)`）で、`neutral` は `surface-raised`。種類は今の 5 つ（`neutral`・`ok`・`warn`・`ng`・`accent`）で足りるので足さない。`Note` のラベル（ⓘ・⚠・✕・?）は `Note` が持ち、`Badge` にしない。`flow-detailed` の分岐は Markdown の中なので `Badge` を置けず、CSS のバッジで代え、`Badge` と同じ地（状態の色の 13%、色の無い分岐は `surface-raised`）と角を使う。`pill` は状態を言わない丸い印のために残す。

### 13.17 見本帳

**見本帳は専用の画面 `#design`。** 帯に出さず、hash を打って開く。初期読み込みの束には入れず、`import()` で外して読む。置き場は `src/browser/components/app/design/`（カタログの描き手を引くので、全画面を知る `components/app/` に置く）。デザイントークン（値と使われ方）・`ui/` の部品（状態ごと）・カタログの全部品を 1 ページに並べる。カタログの部品の例は `report_part_card` が返す例（`src/shared/report/part-example-list.ts`）をそのまま使い、a2ui の面で描く（セクションを持たない例は見出しの無いセクションに入れ、部品名の見出しの次に部品の本体が来る。撮るときは `--advance 3000` で動きの終わりを待つ。グラフは画面に入ってから伸びるので、`--scroll-to '[data-catalog-part="Chart"]' --advance 4000` のように部品を指して撮る）。見本帳が並べるカタログの部品は例の一覧から導くので、部品を足せば自動で並ぶ。見本帳が描いた部品の名前がカタログ（`REPORT_COMPONENT_SCHEMAS`）の全部品と一致すること、余白・角丸・影・動きのトークンの一覧が `theme.css` の宣言と一致することは、単体テスト（`test/browser/components/app/design/`）が見る。撮影（`scripts/capture/capture-view.ts --hash '#design'`）と E2E からは hash で開いて撮る。Storybook は入れない（理由は ADR 0041）。
