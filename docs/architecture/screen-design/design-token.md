# 画面のデザイン: 色・字・余白・角丸・影・動きのデザイントークン

ステータス: **正典**。入口は `docs/architecture/screen-design.md`（画面のデザインの全体）。

責務: デザイントークンの段と値と使い分け、新しい器「舞台と紙」の値と夜・昼のテーマ、旧いトークンとの対応、tsukumo と Astryx の向き、直書きの許す範囲、`ui/` の箱の部品（`Surface`・`Badge`・`Divider`）、見本帳（`#design`）の置き場を持つ。
読む時: トークンの値を CSS に書くとき、テーマの定義に触るとき、`ui/` の部品を足すとき、見本帳に触るとき。
直す時: トークンの段や値を変えたとき、向きを変えたとき、直書きを許す範囲を変えたとき、`ui/` の箱の部品を足したとき。

## 13. 画面のデザイン

### 13.14 デザイントークン

**旧い器の色の役割と導出は `color.md`、字の段の使い分けは `principle-and-type.md`「13.3 Type」が持つ。ここは、6 種類（色・字・余白・角丸・影・動き）の値の置き場と向き、新しい器「舞台と紙」の値を持つ。** 値は `src/browser/styles/theme.css` が持ち、CSS からは `var()` で読む。決めた理由・今の直書きの分布・採らなかった案・置き換えの順は `docs/architecture/adr/0041-design-system-tokens-and-gallery.md`、新しい器の切り替えは `docs/architecture/adr/0057-stage-and-paper-layout.md`。この文書で「デザイントークン」と書くのは CSS のカスタムプロパティのことで、LLM のトークン消費とは別。

#### 2 つの器と値の置き場

旧い器と新しい器は、同じ名前のトークンを読む（ADR 0057 論点 1）。

| 置き場                                     | 効く器             | 持つもの                                                                           |
| ------------------------------------------ | ------------------ | ---------------------------------------------------------------------------------- |
| `theme.css` の `:root`                     | 両方（旧い器の値） | すべてのトークン                                                                   |
| `theme.css` の `:root[data-shell="stage"]` | 新しい器だけ       | 見本（ADR 0057 が名指す `whole.html`）から決めた値。旧い器と値が同じものは書かない |

- `data-shell` は `<html>` に立つ。読み込んだときに、URL の検索引数 `shell=stage|classic` を端末ごとの好みの鍵 `tsukumo-shell:v1` へ書き、鍵を読んで立てる（既定は `classic`）。
- 新しい器の値を `<html>` で分けるのは、Astryx のテーマの `var()` がテーマの根（`<html>` の `data-astryx-theme`）で値が決まるため。根より下で書き換えても Astryx の部品に届かない。
- 旧い器を消すときは、`:root[data-shell="stage"]` の値を `:root` へ移す。

#### 向き（tsukumo と Astryx）

**トークンの値の正典は tsukumo（`theme.css`）で、テーマの定義（`ui/theme-root/tsukumo-theme.ts`）が Astryx のトークンへ写す。** ADR 0057 論点 4 で、ADR 0053 論点 1 の字の段・角丸・影の向きを逆にした。余白だけは Astryx の値を引くまま残す。

| 種類   | 正典    | 向き                                                                                                                                                                                                                                      |
| ------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 色     | tsukumo | `--ground` などを、テーマが `--color-*` へ写す。選択と状態の内側の輪（`--shadow-inset-*`）も同じ                                                                                                                                          |
| 書体   | tsukumo | `--font-sans` を `--font-family-body`・`--font-family-heading` へ、`--font-code` を `--font-family-code` へ写す                                                                                                                           |
| 字の段 | tsukumo | `--font-body` などを、テーマが字の役の大きさ（`--text-body-size`・`--text-supporting-size`・`--text-label-size`・`--text-large-size`・`--text-heading-1-size`〜`-3-size`）へ写す。`--line-height-reading` は `--text-body-leading` へ写す |
| 角丸   | tsukumo | `--radius-sm`・`-md`・`-lg`・`-pill` を、`--radius-inner`・`-element`・`-container`・`-full` へ写す                                                                                                                                       |
| 影     | tsukumo | `--shadow-raised` を `--shadow-med` へ、`--shadow-overlay` を `--shadow-high` へ写す                                                                                                                                                      |
| 動き   | tsukumo | `--motion-fast` を `--duration-fast` へ、`--motion-enter` を `--duration-medium` へ、`--motion-ease` を `--ease-entrance` へ写す                                                                                                          |
| 余白   | Astryx  | `theme.css` の `--space-*` が、Astryx の `--spacing-*` を `var()` で引く                                                                                                                                                                  |

- **写す先と引く先を同じ組にしない（値が循環する）。** 字の段は、テーマが字の役の大きさ（`--text-*-size`）へ写し、旧い器の `theme.css` は Astryx の大きさの段（`--font-size-*`）を引く。触る画面で `lg` より狭いときに Astryx が字の段を組み直す分は、大きさの段を通って旧い器にも届く。テーマはこの条件の規則（`adaptations`）にも字の役の写しを書き、新しい器の値が組み直しで上書きされないようにする。
- 角丸・影・書体は、旧い器の値も `theme.css` に直に書く。値は Astryx の neutral の値と同じ。
- テーマの定義に書けるのは、`theme.css` が宣言したトークンの `var()` とそれを組んだ式だけ（`test/browser/components/ui/theme-root/tsukumo-theme.test.ts` が見る）。

#### 夜と昼のテーマ

新しい器は夜と昼の 2 つのテーマを持つ。舞台はいつも夜で、昼にするのは紙だけ（見本の `?tone=day`）。

- 昼と夜で値が違う色のトークンは、`:root[data-shell="stage"]` に `light-dark(昼, 夜)` で書く。Astryx の `[light, dark]` の組も組み立てると `light-dark()` になるので、テーマの定義には組を書かず、`var()` で写すだけにする（組の昼の値を写すと、テーマの定義に色の値を書くことになる）。
- 昼の紙は、紙の根を `ui/theme-root` の `PaperTone`（`tone="day"`）で包む。中身は Astryx の `Theme` を `mode="light"` で重ねたもので、根に `color-scheme: light` が立ち、その下では `light-dark()` が昼の値を選ぶ。tsukumo の CSS が `var(--ink)` で読む字も、Astryx の部品も、同じ 1 つの値で昼に替わる。
- `--ground`（舞台の地）は昼も夜の値のまま（見本に昼の値が無い）。Astryx の `--color-on-accent` が `--ground` を写すので、昼の紙でもキャラクターの色の上の字は暗いまま読める。
- 歯車から差した色（`applyAppearanceColorOverride`）は `<html>` の style に書くので、新しい器でも勝つ。差した色は昼と夜で同じ値になる。

#### 色（舞台と紙）

見本の名前は `whole.html` の `body` と `body[data-tone="day"] .tone` の宣言。昼の値は見本の値のままにし、字と地の比が 4.5 に届かないものだけ寄せた（寄せた値には「寄せた」と書く）。

| トークン           | 見本の名      | 夜                                                                     | 昼                                                              | 使う場面                                         |
| ------------------ | ------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------ |
| `--ground`         | `--night`     | `#14121a`                                                              | 夜と同じ                                                        | 舞台の地                                         |
| `--surface`        | `--sheet`     | `#211e29`                                                              | `#eceaf1`                                                       | 紙の地                                           |
| `--surface-float`  | `--float`     | `#2d2937`                                                              | `#fbfaff`                                                       | 紙の上に浮く面（入力欄・お伺い・メニュー・探す） |
| `--surface-raised` | `--raise`     | `rgb(236 232 239 / 0.07)`                                              | `rgb(31 28 39 / 0.06)`                                          | 持ち上げ（印・コード・選んでいる行の地）         |
| `--ink`            | `--ink`       | `#ece8ef`                                                              | `#1f1c27`                                                       | 本文の字                                         |
| `--ink-soft`       | `--ink-soft`  | `rgb(236 232 239 / 0.74)`                                              | `rgb(31 28 39 / 0.78)`                                          | 読ませる補助の字                                 |
| `--ink-quiet`      | `--ink-quiet` | `rgb(236 232 239 / 0.56)`（寄せた。見本は 0.52 で、浮く面の上で 4.32） | `rgb(31 28 39 / 0.66)`（寄せた。見本は 0.58 で、紙の上で 3.93） | 控えめな字                                       |
| `--ink-bright`     | なし          | `var(--ink)`                                                           | `var(--ink)`                                                    | 拾う字。見本は色で拾わず太さで拾う               |
| `--rule`           | `--rule`      | `rgb(236 232 239 / 0.11)`                                              | `rgb(31 28 39 / 0.15)`                                          | 線が輪郭を担う所                                 |
| `--rule-soft`      | なし          | `var(--rule)`                                                          | `var(--rule)`                                                   | 部品の枠。見本は罫を 1 段に減らした              |
| `--rule-quiet`     | なし          | `rgb(236 232 239 / 0.06)`                                              | `rgb(31 28 39 / 0.08)`                                          | 表の行・節の区切り                               |
| `--state-ok`       | `--ok`        | `#7ee081`                                                              | `#187332`（寄せた。見本は `#1c7c37` で 4.42）                   | うまくいった（字と対）                           |
| `--state-warn`     | `--warn`      | `#e3c766`                                                              | `#7f5d00`（寄せた。見本は `#8a6500` で 4.47）                   | 注意・答え待ち（字と対）                         |
| `--state-ng`       | `--ng`        | `#f2a0a0`                                                              | `#b3362f`                                                       | 失敗（字と対）                                   |
| `--state-info`     | なし          | `#9cc1ee`                                                              | `#285f9e`（見本に無い）                                         | 知らせ（字と対）                                 |
| `--state-ask`      | なし          | `#c7aef0`                                                              | `#6a45a8`（見本に無い）                                         | 疑問（字と対）                                   |
| `--accent`         | `--accent`    | パックの `accent`                                                      | パックの `accent`                                               | キャラクターの色。読む面には置かない             |

- 比は、字の色を地に重ねた色で測った値。夜の `--ink-quiet` は夜の地・紙・浮く面の上で 4.76 以上、昼の `--ink-quiet` は昼の紙・浮く面の上で 5.01 以上、昼の状態の色は紙の上で 4.98 以上。
- `--rule-control`・`--surface-accent` などの導出の色は、旧い器と同じ式のまま `:root` に置き、新しい器では上の値から導かれる。
- 固定の色（`--chart-series-*`・`--context-*`・`--usage-*`・`--diary-*`・コードの差分の地）は、新しい器でも旧い器の値のまま。紙の部品を描き直す段で決め直す。

#### 字

見本は本文を 16px・行の高さ 1.8 にし、セリフを明朝（`--voice`）で組む。新しい器の字の段は 13（欄外・印）・14（補助）・16（本文）・19（小見出し）・24px（見出し）の5つで、欄外と印も 13px を下回らない（`test/architecture/stage-type-scale.test.ts` が見張る）。

| トークン                             | 旧い器                              | 新しい器                                                                              | 使う場面                               |
| ------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------- |
| `--font-sans`                        | Astryx neutral の本文の書体の並び   | `"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", system-ui, sans-serif` | 本文・見出し                           |
| `--font-voice`                       | 明朝の並び（`--font-serif` と同じ） | 同じ                                                                                  | セリフ・迎えの一言（見本の `--voice`） |
| `--font-mono`・`--font-code`         | 今の値                              | 同じ                                                                                  | 等幅・レポートのコード                 |
| `--font-label`                       | `--font-size-sm`（12px）            | 0.8125rem（13px）                                                                     | 等幅の札・キー・時刻                   |
| `--font-action`                      | `--font-label`                      | 0.8125rem（13px）                                                                     | ボタン・切り替えの字                   |
| `--font-secondary`                   | `--font-size-sm`（12px）            | 0.8125rem（13px）                                                                     | 補足・欄外・表の見出し行               |
| `--font-subheading`                  | `--font-size-base`（14px）          | 0.875rem（14px）                                                                      | 小見出し・表・一覧の行                 |
| `--font-body`                        | `--font-size-base`（14px）          | 1rem（16px）                                                                          | 本文                                   |
| `--font-heading-3`・`--font-heading` | `--font-size-lg`（17px）            | 1.1875rem（19px）                                                                     | 段の見出し                             |
| `--font-heading-2`                   | `--font-size-xl`（20px）            | 1.1875rem（19px）                                                                     | 紙の節の見出し・お伺いの題             |
| `--font-heading-1`                   | `--font-size-2xl`（24px）           | 1.5rem（24px）                                                                        | 重ねる紙の題・紙の結論                 |
| `--font-lead`                        | `--font-heading-1`                  | 1.5rem（24px）                                                                        | 紙の頭の一文（見本の `.lead`）         |
| `--report-heading-2`・`-3`           | 1.3125rem・1.0625rem                | 1.1875rem・1rem                                                                       | レポートの見出し                       |
| `--line-height-reading`              | 1.7                                 | 1.8                                                                                   | 本文の行の高さ                         |

- 旧い器の大きさは触る画面で Astryx が組み直す（本文は 16px になる）。新しい器の大きさは組み直さない。
- 見本で 12.5px・13.5px・14.5px のように半端な大きさは、近い段へ寄せる（同点は大きい段へ）。

#### 余白

名前は大きさの語で、`ui/stack` の `gap` の語と同じ。**同じ値を 2 つの名前で持たない。** 値は Astryx の `--spacing-*` を引き、rem の値は同じ。新しい器も同じ段を使う（見本の余白は 4px の倍数で、段に寄せて 4px を超えてずれるものは局所のつまみにする）。

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

見本の角丸は 10px（ボタン・札）・12px（紙）・16px（入力欄・探す）が多く、旧い器の段と同じ値になる。新しい器で値を書き直さない。

| トークン         | 写す先               | 値       | 使う場面                               |
| ---------------- | -------------------- | -------- | -------------------------------------- |
| `--radius-sm`    | `--radius-inner`     | 0.375rem | 印・コードの欄・小さな枠               |
| `--radius-md`    | `--radius-element`   | 0.625rem | ボタン・入力欄・カードの標準           |
| `--radius-lg`    | `--radius-container` | 0.75rem  | 箱（`Surface`）・区画・紙の上の角      |
| `--radius-xl`    | なし                 | 1rem     | ダイアログ・重なる面・浮く入力欄・探す |
| `--radius-pill`  | `--radius-full`      | 9999px   | 丸いバッジ・状態のチップ               |
| `--radius-round` | なし                 | 50%      | 丸（点・アイコンの枠・立ち絵の枠）     |

#### 影

見本の影は、浮く面に 1px の罫の輪（`0 0 0 1px var(--rule)`）と深いぼかしを重ねる。

| トークン           | 写す先          | 旧い器                                                     | 新しい器                                               | 使う場面                       |
| ------------------ | --------------- | ---------------------------------------------------------- | ------------------------------------------------------ | ------------------------------ |
| `--shadow-raised`  | `--shadow-med`  | 2 層の影と、暗い面で 1px の明るい縁（Astryx neutral の値） | `0 0 0 1px var(--rule), 0 14px 36px rgb(0 0 0 / 0.38)` | 入力欄・メニュー・浮かぶカード |
| `--shadow-overlay` | `--shadow-high` | 2 層の影と、暗い面で 1px の明るい縁（Astryx neutral の値） | `0 0 0 1px var(--rule), 0 24px 60px rgb(0 0 0 / 0.5)`  | お伺い・探す・ダイアログ       |
| `--shadow-sheet`   | なし            | `var(--shadow-overlay)`                                    | `0 24px 70px rgb(0 0 0 / 0.5)`                         | 舞台の上の紙                   |
| `--shadow-ring`    | なし            | `0 0 0 2px var(--accent)`                                  | 同じ                                                   | 選んでいる・目印の輪           |

- ぼかしのある影（ぼかし 1px 以上で `inset` でないもの）はトークンを使う。向きのある影（右から重ねる紙の `-24px 0 70px`）と、色・幅が部品ごとに違う輪・内側の線（`inset`）は直書きのまま許す。

#### 動き

| トークン         | 写す先              | 値                               | 使う場面                                            |
| ---------------- | ------------------- | -------------------------------- | --------------------------------------------------- |
| `--motion-fast`  | `--duration-fast`   | 0.12s                            | hover・色の切り替え                                 |
| `--motion-base`  | なし                | 0.2s                             | 開閉・寄り                                          |
| `--motion-enter` | `--duration-medium` | 0.3s                             | 入る動き（吹き出し 0.32s・重ねる紙 0.28s を寄せた） |
| `--motion-shift` | なし                | 0.42s                            | 器の姿勢が変わるときの view transition              |
| `--motion-ease`  | `--ease-entrance`   | `cubic-bezier(0.2, 0.8, 0.2, 1)` | 入る動きと姿勢の変わり目の緩急                      |

- `transition` の時間と、入る動き・姿勢の変わり目の `animation` の時間をトークンにする。hover と開閉の緩急は `ease-out` を基本にし、キーワードのまま書く。
- 吹き出しの往復・立ち絵・読み込みの回転の `animation` は、部品ごとの局所のつまみ（`--portrait-*-duration` など）が持つ。
- `prefers-reduced-motion: reduce` のときも、トークンの値は変えない。`page-base.css` の全要素への規則が animation の時間を `0.01ms`、transition の時間を `1ms` にする（トークンを 0 にしても、直書きの時間と Astryx の部品には効かない）。動きが消えたときに中身が見えないまま残らないよう、入る動きは `from` だけを書き、終わりの状態を部品の素の値に置く。

#### 旧いトークンとの対応

見本の名前と、旧い器のトークンの扱い。名前は旧い器のまま使い、新しく足したのは `--surface-float`・`--font-voice`・`--font-lead`・`--shadow-sheet`・`--motion-enter`・`--motion-shift`・`--motion-ease` の 7 つ。

| 見本の名                             | トークン                                    | 新しい器での扱い                                 |
| ------------------------------------ | ------------------------------------------- | ------------------------------------------------ |
| `--night`                            | `--ground`                                  | 値を替える                                       |
| `--sheet`                            | `--surface`                                 | 値を替える                                       |
| `--float`                            | `--surface-float`（足した）                 | 旧い器では `var(--surface)`                      |
| `--raise`                            | `--surface-raised`                          | 値を替える（旧い器は字の色 10%）                 |
| `--ink`・`--ink-soft`・`--ink-quiet` | 同じ名前                                    | 値を替える                                       |
| `--rule`                             | `--rule`・`--rule-soft`                     | 1 段にまとめる（`--rule-soft` は `var(--rule)`） |
| なし                                 | `--rule-quiet`                              | 値を替える（見本の罫の半分）                     |
| なし                                 | `--rule-control`                            | 旧い器の式のまま（操作子の縁は 3:1 を保つ）      |
| なし                                 | `--ink-bright`                              | `var(--ink)`（見本は色で拾わない）               |
| `--ok`・`--warn`・`--ng`             | `--state-ok`・`-warn`・`-ng`                | 昼の値を足す                                     |
| なし                                 | `--state-info`・`--state-ask`               | 昼の値を足す                                     |
| `--sans`                             | `--font-sans`                               | 値を替える                                       |
| `--voice`                            | `--font-voice`（足した）                    | 旧い器も同じ明朝の並び                           |
| `--mono`                             | `--font-mono`・`--font-code`                | 旧い器のまま                                     |
| 本文の `16px/1.8`                    | `--font-body`・`--line-height-reading`      | 値を替える                                       |
| `.lead`                              | `--font-lead`（足した）                     | 旧い器では `var(--font-heading-1)`               |
| なし                                 | `--font-input`                              | 旧い器のまま（1rem）                             |
| なし                                 | `--surface-accent`                          | 旧い器の式のまま                                 |
| 紙の影                               | `--shadow-sheet`（足した）                  | 旧い器では `var(--shadow-overlay)`               |
| 入る動き                             | `--motion-enter`・`--motion-ease`（足した） | 両方の器で同じ値                                 |
| view transition                      | `--motion-shift`（足した）                  | 両方の器で同じ値                                 |

### 13.15 直書きを止める検査

`test/architecture/` の検査が、`src/browser/` の `theme.css`・`page-base.css` 以外の `*.css` で、余白・角丸・影・動きの 4 つの値がトークンかそれに従う値（`0`・`auto`・`em`・`%`・局所の `var(--*)`・28px 以上の余白・向きのある影・輪と `inset`）だけであることを確かめる。字の大きさの検査（`test/architecture/font-size.test.ts`）と同じ形で、**置き換えが済むまでの違反は、ファイルごとの件数の除外の一覧に載せて通す**。件数が増えたら落ち、減ったら一覧を減らすよう促す。除外の一覧は減る向きにだけ動く。

置き換えが済んだあとも一覧に残してよい例外は、トークンにすると意味が変わる 2 つ。領域の寸法として使う `100vh`（`stage/speech-log.css` の `padding-top`）と、親の角丸に追従させる `border-radius: inherit`（`dispatch/dispatch.module.css`）。どちらも件数 1 で載せ、検査の許す値は広げない。

`astryx theme build` が書く組み立て物の置き場 `src/browser/components/ui/theme-root/built/` は、手で書かない生成物なので、`test/architecture/source-file.ts` の `GENERATED_DIRECTORIES` に載せて、この検査を含む構造の検査から外す。

### 13.16 `ui/` の箱の部品

`ui/` の部品の中身は Astryx（ADR 0053）の部品で、props は tsukumo の語彙のまま変えない。`@astryxdesign/*` と `@stylexjs/stylex` を import できるのは `src/browser/components/ui/` だけで、`.dependency-cruiser.cjs` の `astryx-reader` が外からの import を止める。Astryx に当てない例外は `typing-dot-list` で、Astryx に入力中の点の部品が無いので、今の CSS のまま残す。`layout-resizer` は、`ResizeHandle` の見た目と `separator` の役だけを使う。`useResizable` は大きさを自分で持ち、呼ぶ側の単位（比率・px）への `toValue` と「動かしたときだけ確定する」配線が写せないので、`resizable` は渡さず、ドラッグの配線は今の `pointerdown` のまま `ResizeHandle` に載せる。例外にはしない。

根の `ThemeRoot`（`ui/theme-root/`）は、`App` の `QueryClientProvider` の内側・`Root` の外側で、`InternationalizationProvider`（`locale="ja-JP"`）と `Theme`（テーマ `tsukumo`・`mode="dark"`）を重ねて子を包む。テーマの定義 `tsukumo-theme.ts` は、値を tsukumo のトークンの `var()` とそれを組んだ式だけで書き、写す先は上の「向き」の表に限る（触る画面の `adaptations` には、本文の行の高さと字の役の大きさを同じ値で書く）。昼の紙を出す `PaperTone` も `ui/theme-root/` に置き、`Theme` を同じテーマで `mode="light"`（`tone="night"` なら `mode="dark"`）にして重ねる。Astryx の `color` に口が無い状態の色（`state-ok` など）は、隣の `tsukumo-component-override.ts` の `components` で `var()` の値として足す。パックの accent は `usePackAppearance` が `<html>` の `--accent` に書き、テーマの `--color-accent` がそれに追随する。

CSS の層の順は、`styles/layer-order.css` が `@layer reset, tsukumo-base, astryx-base, astryx-theme;` と宣言し、`main.tsx` が `./app.tsx` より前に読む。`page-base.css` の要素への規則（フォーム部品の継承・フォーカスの輪・リンク）は `tsukumo-base` の層に置き、CSS Modules は層に入れない。テーマが見出しと段落に当てる既定は打ち消さず、素の見出しと段落も Astryx の段になる。層に入っていない `ui/` の部品の CSS は、Astryx のどの層にも勝つ。`ThemeRoot` が `reset.css` を `reset` の層で読むので、`box-sizing` は `border-box`、見出しと段落の `margin` は `0` になる。

`ui/` の部品は、持つのは顔（地・枠・字の色・振る舞い）で、置き方（margin・flex・align-self）は呼び出し側が `className` で渡す。箱の語彙を持つ 3 つを足す。props は全部必須で、型で縛る（`ui/stack` と同じ）。

| 部品      | 持つもの                                                                                                                                                                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Surface` | 地（`tone`: `--surface`・`--surface-raised`・`--surface-accent`）・枠（`--rule-soft` の 1px で固定）・角丸（`radius`: `--radius-*`）・内側の余白（`space`: `--space-*`）・影（`shadow`: `none`・`raised`・`overlay`）                          |
| `Badge`   | 小さな印。`tone`（`neutral`・`ok`・`warn`・`ng`・`accent`）・`shape`（`pill`＝`--radius-pill`・`square`＝`--radius-sm`）・字は `--font-label`。`data-tone`・`data-shape` を出す                                                                |
| `Divider` | 罫。Astryx の `Divider`（`role="separator"` の `div`）で描く。`tone` は `strong`→`strong`、`quiet`・`soft`→`subtle` に写し（`soft` の区別は落ちる）、`orientation`（`horizontal`・`vertical`）は `aria-orientation` に出る。`data-tone` を出す |

カタログの部品（`report` の a2ui の面）は、枠を `Surface`・見出しを `Heading`・並べる入れ物を `Stack` 系・印を `Badge` で組む。

**状態のバッジは全部品で `Badge` の `shape: square`（記号＋語）に揃える。** 地は状態の色を 13% 重ねた割合（`color-mix(in srgb, var(--surface), var(--state-*) 13%)`）で、`neutral` は `surface-raised`。種類は今の 5 つ（`neutral`・`ok`・`warn`・`ng`・`accent`）で足りるので足さない。`Note` のラベル（ⓘ・⚠・✕・?）は `Note` が持ち、`Badge` にしない。`flow-detailed` の分岐は Markdown の中なので `Badge` を置けず、CSS のバッジで代え、`Badge` と同じ地（状態の色の 13%、色の無い分岐は `surface-raised`）と角を使う。`pill` は状態を言わない丸い印のために残す。

### 13.17 見本帳

**見本帳は専用の画面 `#design`。** 帯に出さず、hash を打って開く。初期読み込みの束には入れず、`import()` で外して読む。置き場は `src/browser/components/app/design/`（カタログの描き手を引くので、全画面を知る `components/app/` に置く）。デザイントークン（値と使われ方）・`ui/` の部品（状態ごと）・カタログの全部品を 1 ページに並べる。カタログの部品の例は `report_part_card` が返す例（`src/shared/report/part-example-list.ts`）をそのまま使い、a2ui の面で描く（セクションを持たない例は見出しの無いセクションに入れ、部品名の見出しの次に部品の本体が来る。撮るときは `--advance 3000` で動きの終わりを待つ。グラフは画面に入ってから伸びるので、`--scroll-to '[data-catalog-part="Chart"]' --advance 4000` のように部品を指して撮る）。見本帳が並べるカタログの部品は例の一覧から導くので、部品を足せば自動で並ぶ。見本帳が描いた部品の名前がカタログ（`REPORT_COMPONENT_SCHEMAS`）の全部品と一致すること、余白・角丸・影・動きのトークンの一覧が `theme.css` の宣言と一致することは、単体テスト（`test/browser/components/app/design/`）が見る。撮影（`scripts/capture/capture-view.ts --hash '#design'`）と E2E からは hash で開いて撮る。色の表と紙の見本は夜と昼の `PaperTone` で並べて描き、新しい器の値は URL に `shell=stage` を付けて開いた見本帳で見る。Storybook は入れない（理由は ADR 0041）。
