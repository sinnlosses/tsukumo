# デザインシステムを Astryx へ移す: テーマの組み立て・CSS の層・`ui/` の部品の当て方（2026-11-09）

ステータス: 採用

**画面とレポートの部品を、Astryx（`@astryxdesign/core`）の部品か、Astryx の部品を組み合わせた部品でそろえる。Astryx を読むのは `src/browser/components/ui/` だけで、ほかの場所は `ui/` の部品を経て使う。テーマは tsukumo のトークン（`theme.css`）を `var()` で写した `defineTheme` の定義を `astryx theme build` で組み立て、組み立てた物をリポジトリに置く。CSS は `astryx.css` を丸ごと読み、層の順を tsukumo が先に宣言する。`reset.css` は読ませない。テーマが見出しと段落に当てる既定は、tsukumo の層で打ち消す。`ui/` の部品の props は変えず、中身だけを Astryx に替える。**

利用者が決めたのは次の4つ（2026-11-09）。Astryx を採ること。テーマを試作の B（tsukumo のトークンを Astryx のテーマへ `var()` で写す）にすること。トークンの正典を `theme.css` に残すこと。Astryx を使う境界を `ui/` にすること。neutral の色をそのまま使う試作の C は、パックの accent が部品に出なくなるので採らない。この ADR はその先の論点 1〜8 を決める。新しい部品（Tree List・Hover Card）をレポートのカタログに足すかは、ここでは決めない。

ADR 0041（トークンと見本帳）と 0042（内容部品を React で直に描く）は覆さない（「0041・0042 との関係」）。

## 前提

### いまの形

- `ui/` の部品は 22 個（`ls src/browser/components/ui`）。決まりは `docs/architecture/screen-design/design-token.md`「13.16 `ui/` の箱の部品」が持つ。
- トークンは `src/browser/styles/theme.css` の `:root` にあり、カスタムプロパティは 135 個。決めた理由は ADR 0041。パックの accent は `usePackAppearance` が `<html>` の `--accent` に書く。
- tsukumo の CSS は層を使っていない（`src/browser/` の `*.css` に `@layer` は 0 件）。`vite.config.ts` の `cssCodeSplit: false` で、全部が `main.css` 1 本に入る。
- 根は `src/browser/app.tsx` の `App` で、`QueryClientProvider` の内側に `Root` だけを描く。
- 箱どうしの import は `.dependency-cruiser.cjs` の `ALLOWED_BROWSER_BOX_IMPORTS` が決める。npm のパッケージを読める場所を絞る規則は、`orpc-server-reader`（`@orpc/server` を adapter と `src/wiring/router.ts` に限る）が先例。

### 試作で分かったこと

枝 `prototype/astryx-trial`（ee8925b6c。main に入れない）は、見本帳 `#design` の頭に 4 案を並べた。A は今の `ui/`、B は tsukumo のトークンを写した Astryx のテーマ、C は neutral のテーマ、D は B から `reset.css` を抜いたもの。

1. `defineTheme` の tokens に `var(--accent)` と書くと、パックの accent の差し替えに追随した。
2. CSS Modules の className（層なし）での上書きは、Astryx の `astryx-base` の層に勝った。
3. 色と字は tsukumo に寄せられた。形と大きさ（角丸・高さ・余白）は Astryx のものになった。
4. `main.css` は 419,879 バイトから 715,056 バイトに増えた。
5. 根の `Theme` を置くと、テーマの CSS の `@layer reset` にある h1〜h6・p の規則で、ページ全体の見出しの高さが変わった。見本帳の h1 は 31.19px から 23.98px になり、`reset.css` を抜いた D でも同じだった。見本帳の全体の高さは 19,356px から 18,567px に、`reset.css` も読ませると 18,240px になった。
6. 自前のテーマは実行時の差し込みになり、Astryx がコンソールに警告を出した。
7. E2E の role への影響は確かめていない。

### パッケージを読んで分かったこと（0.7.11）

`npm pack` で `/tmp` に落とした `@astryxdesign/core`・`@astryxdesign/theme-neutral`・`@astryxdesign/cli` の 0.7.11 を読んだ。作業ツリーの依存は変えていない。

- 版: npm の `latest` は 0.7.11 で、`canary` は 0.7.12 系（2026-11-09 に `npm view` で確かめた）。公式のサイトは beta と書いている。ライセンスは 3 つとも MIT。React 19 以上を求める。tsukumo の React は 19.3.1。
- `astryx.css` は 269,224 バイト（`wc -c`）。中身は `@layer astryx-base` の中のアトミックな class だけで、部品ごとの CSS ファイルは無い。JS は組み立て済みで、StyleX の変換は済んでいる。
- テーマの CSS は 2 つの層に分かれる。`@layer reset` に見出し（h1〜h6）・p・small・code・pre・hr の既定を置き、`@layer astryx-theme` にトークンを置く。どちらも `@scope ([data-astryx-theme="<名前>"]) to ([data-astryx-theme])` で囲まれる。neutral の組み立て済みの `theme.css` は 24,877 バイト。
- 根の `Theme` は `<html>` に `data-theme` と `data-astryx-theme` を付け、`display: contents` の `div` で子を包む。組み立て済みを示す `__built` が無いテーマは、実行時に `<style>` を `<head>` へ足し、警告を出す（`Theme.tsx` の `useThemeStyleInjection`）。
- `astryx theme build` は core の `generateThemeCSS` で CSS を書き、`__built: true` の JS と型を一緒に書く。`--check` を付けると何も書かずに、組み立て物と定義のずれを報告する。
- 名前の重なり: `theme.css` の 135 個の名前と、`astryx.css` が宣言する 357 個のカスタムプロパティの名前に、同じものは無い（`comm -12` で 0 件）。
- 余白の段は値が一致する。Astryx の `--spacing-0-5`・`1`・`2`・`3`・`4`・`5`・`6`・`8`・`12` は、tsukumo の `--space-2xs`・`xs`・`sm`・`md`・`lg`・`xl`・`2xl`・`3xl`・`4xl` と同じ値（0.125rem〜3rem）。角丸の `--radius-inner`・`element`・`container`（4px・8px・12px）は、`--radius-sm`・`md`・`lg` と同じ値。
- 部品の文言は ja-JP の訳を同梱している（`InternationalizationProvider`。`Dialog` の閉じるボタンの名前は「閉じる」）。
- 公式の導入の手引き（CLI の `docs migration/migration-setup`）は 2 つを求める。層の順を最初に 1 回だけ、先に読む CSS で宣言すること。アプリの既存の reset は `reset` の層に置き、`astryx-base` より上に置かないこと。

## 論点 1: テーマの CSS の組み立てと版の固定

**採る: `@astryxdesign/cli` を devDependency に入れ、`astryx theme build` で組み立てた CSS・JS・型を `ui/` の中に置いてコミットする。`pnpm run build` には入れない。** 組み立て直しは `package.json` の script（`theme:build`）で打つ。検証の lint の段で `astryx theme build <定義> --check` を打ち、組み立て物と定義のずれを落とす。

理由:

- `astryx theme build` は core の生成器をそのまま使い、`__built: true` の JS と型も書く。この JS を `Theme` に渡すと実行時の差し込みが止まり、警告も出ない。`generateThemeCSS` を自前で呼ぶと、層で包む処理と JS を書く処理を写すことになり、内部の値 `__built` に頼る。
- 組み立て物をコミットすれば、`vite build` は今のまま CSS と JS を読むだけで済む。`pnpm run build` も、tsukumo が子プロセスで起こす組み立て（ADR 0006・0007）も変わらない。CLI は Babel と StyleX の Babel プラグインを抱えるので、組み立ての経路に入れない。
- `--check` は CLI が CI 向けに用意した口で、定義を直して組み立て直しを忘れると lint が落ちる。

版の固定:

- `@astryxdesign/core`・`@astryxdesign/theme-neutral`・`@astryxdesign/cli` は、同じ版（0.7.11）に `^` なしで固定する。theme-neutral は core を厳密な版で peer に求め、公式も「全パッケージを同じ版へ 1 回で上げる」と言う。beta の間は小さな版でも壊れうる。`@stylexjs/stylex` も core が組まれた版（0.19.1）に固定する。固定の先例は ADR 0012 の mermaid と chart.js。
- core と cli の `postinstall` は `astryx init` を促す 1 行を出すだけなので、`pnpm-workspace.yaml` の `allowBuilds` で `false` にする。`astryx init` は打たない。`AGENTS.md`・`CLAUDE.md` に部品の索引を書き込み、常設の文章の字数の上限（`always-on-budget.test.ts`）を破るため。

上げるときの確かめ方:

1. 全パッケージを同じ版へ 1 回で上げる。
2. `astryx upgrade --from <旧版> --apply` で codemod を当てる。
3. `theme:build` で組み立て直し、組み立て物の差分を読む。
4. CHANGELOG のうち、`ui/` が使う部品の項を読む。
5. 見本帳 `#design` を上げる前と後で撮って見比べる。
6. 検証コマンド（E2E を含む）を通す。

採らなかった案:

- 実行時の差し込み（試作の形）: 警告が出て、テーマの CSS が `main.css` の外の `<style>` になる。
- `generateThemeCSS` を自前の script から呼ぶ: 上の理由。
- `pnpm run build` の中で毎回組み立てる: 組み立てと tsukumo の起動の経路に CLI が入る。組み立て物が無いうちは、型の検査も単体テストも動かなくなる。

## 論点 2: CSS の読ませ方と層の順

**採る: `astryx.css` を丸ごと `main.css` に入れる。層の順 `@layer reset, tsukumo-base, astryx-base, astryx-theme;` を、`main.tsx` が最初に読む CSS で 1 回だけ宣言する。tsukumo の CSS Modules は層に入れない。`theme.css` の要素への規則（フォーム部品の `font: inherit`・`a`・`a:hover`・`:focus-visible`）は `tsukumo-base` の層に移す。**

| 層（下から）   | 中身                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------- |
| `reset`        | テーマの CSS の見出し・段落の既定                                                         |
| `tsukumo-base` | `theme.css` の要素への規則と、見出し・段落の既定の打ち消し（論点 3）                      |
| `astryx-base`  | `astryx.css`（Astryx の部品の class）                                                     |
| `astryx-theme` | テーマの CSS のトークン                                                                   |
| 層なし         | `theme.css` のトークン・`body`・動きを減らす規則・`@font-face`と、すべての `*.module.css` |

理由:

- 部品の分だけに絞るには、StyleX をソースから組み立てる必要がある（`@astryxdesign/build` の Babel の変換を Vite に入れる）。Vite 8 の組み立てで動くかは確かめていない。tsukumo は 127.0.0.1 から配るので、増える約 30 万バイトは通信の負担にならない。読み込みの手間は土台の課題が前後を測る。
- 層なしの CSS は、詳細度に関わらずどの層にも勝つ。呼び出し側の className の上書きは Astryx の部品に効く（試作の 2）。
- 同じ理由で、`theme.css` の層なしの要素の規則は Astryx の部品の class にも勝ってしまう。`button, input, select, textarea { font: inherit; }` は Astryx のボタンの字の大きさを消し、`a { color }` は Astryx の Link の色を消す。`tsukumo-base` は `astryx-base` より下なので、Astryx の部品では Astryx の class が勝つ。tsukumo の素の要素には、上の層に競う規則が無いので今と同じ規則が効く。
- 層の順は最初に現れた `@layer` 文で決まる。`astryx.css` とテーマの CSS も先頭に `@layer reset, astryx-base, astryx-theme;` を持つ。tsukumo の宣言が `main.css` で先に来ないと、`tsukumo-base` は末尾（`astryx-theme` の上）に付く。そこで層の順だけを書いた CSS を、`main.tsx` で `app.tsx` より前に import する。順が守られているかは、組み立てた `main.css` の最初の `@layer` 文を単体テストで見る。
- トークン（`:root`）は層なしのまま残す。名前が Astryx と重ならない（前提）ので、層の上下は効かない。`body` には Astryx の部品の規則が当たらない。

採らなかった案:

- 使う部品の分だけ読ませる: 上の理由。Astryx が部品ごとの CSS を配るようになったら見直す。
- tsukumo の CSS Modules も層に入れる: 186 ファイル（`*.module.css` の 130 本と、そこから `@import` で読む部分の CSS 56 本。2026-11-09 に `git ls-files 'src/browser/*.css'` で数えた）の順を決め直すことになり、呼び出し側の上書きが必ず勝つという今の性質が崩れる。
- `theme.css` の要素の規則を層なしのまま残す: Astryx の部品の字の大きさと Link の色が tsukumo の規則で上書きされる。

## 論点 3: `reset.css` と、見出し・段落の既定

**採る: `reset.css` は読ませない。テーマの CSS が `@layer reset` で h1〜h6・p・small・code・pre・hr に当てる規則は、`tsukumo-base` の層で `revert` に戻して打ち消す。**

```css
@layer tsukumo-base {
  :where(h1, h2, h3, h4, h5, h6, p, small, code, pre, hr) {
    font-family: revert;
    font-size: revert;
    font-weight: revert;
    line-height: revert;
    color: revert;
    border: revert;
  }
}
```

理由:

- `reset.css` は全要素の `box-sizing`・枠・余白・箇条の印・`img` の `display`・ボタンの地を変える。Astryx に移していない tsukumo の画面（`src/browser/` の CSS 188 本のうち `components/ui/` の外の 167 本。2026-11-09 に `git ls-files` で数えた）にも効く。試作では見本帳の全体の高さが 18,567px から 18,240px に動いた（試作の 5）。
- 見出しの高さが変わった原因は `reset.css` ではなく、テーマの CSS の規則だった（D でも同じ）。規則は `:where()` で詳細度 0 だが、tsukumo の見出しは `line-height` を `body` から継いでいる。要素に直に当たる規則は層の中にあっても継承に勝つ。
- 層の中の `revert` は作り手の層をすべて飛ばしてブラウザの既定（UA）に戻す。結果は Astryx が入る前と同じになる。`tsukumo-base` は `astryx-base` より下なので、Astryx の部品（`Heading`・`Text` など）が class で当てる字の段には効かない。
- トークンの写し（`--text-*` を tsukumo の値に写す）で戻すと、継いでいた字の大きさが上書きされる。小さい字の箱の中の `<p>` も `--font-body` の大きさになってしまう。

`reset.css` を読まないので、Astryx の部品が頼る既定（`box-sizing: border-box` など）が欠ける。組み立て済みの JS のうち StyleX の class を持つ 240 ファイルで、`box-sizing: border-box` の class を自分で使うのは 60 ファイル（`rg -l` で数えた）。残りの部品が reset に頼っているかは分からない。そこで土台の課題で、論点 6 で当てる Astryx の部品を reset あり・なしで並べて寸法を測る。食い違う部品と直し方は、部品ごとの課題に渡す。直しは `ui/` の部品の CSS Modules か、Astryx の部品の根の class（`astryx-<部品>`）に絞った規則で書く。`reset.css` を全体に読ませる手は取らない。

採らなかった案:

- `reset.css` を読ませる（試作の B のまま）: 上の理由。移し終えて tsukumo の素の要素がほぼ無くなったら、そのとき見直す。
- テーマの CSS から `@layer reset` の塊を後処理で消す: 組み立て物を書き換えると `--check` が使えない。
- 見出し・段落のトークンを今の値に写して戻す: 上の理由。

## 論点 4: トークンの写し方

**採る: 意味の合う Astryx のトークンだけを、tsukumo のトークンへ `var()` で写す。合うトークンは無いが tsukumo の画面に出る色（覆い・hover と押したときの色・状態の淡い地・選択の輪）は、tsukumo のトークンから `color-mix()` などで導いて写す。tsukumo に相当の無い段は Astryx（neutral）の既定に任せる。定義には 16 進の色も長さの数も書かない。**

| 種類              | 写すもの（Astryx → tsukumo）                                                                                                                                                                                               | Astryx に任せるもの                                                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 地                | `--color-background-body`・`muted` → `--ground`、`surface`・`card`・`popover` → `--surface`                                                                                                                                | なし                                                                                                                                     |
| 字・アイコン      | `--color-text-primary` → `--ink`、`secondary` → `--ink-soft`、`disabled` → `--ink-quiet`、`accent` → `--accent`、状態の字 → `--state-*`（アイコンも同じ）                                                                  | 色相の 10 系統（blue〜yellow）                                                                                                           |
| 枠                | `--color-border` → `--rule-quiet`、`emphasized` → `--rule`                                                                                                                                                                 | 色相の 10 系統                                                                                                                           |
| 差し色            | `--color-accent` → `--accent`、`accent-muted` → `--surface-accent`、`on-accent` → `--ground`                                                                                                                               | なし                                                                                                                                     |
| 状態              | `--color-success`・`warning`・`error`・`info` → `--state-*`、淡い地（`*-muted`）→ `--surface` に `--state-*` を 13% 混ぜた色（13.16 のバッジと同じ割合）                                                                   | なし                                                                                                                                     |
| 覆い・hover・押下 | `--color-overlay`（覆い）→ `--ground` から、`overlay-hover`・`overlay-pressed`・`tint-hover`・`--color-neutral` → `--ink` から導く                                                                                         | なし                                                                                                                                     |
| 書体              | `--font-family-body`・`heading` → `--font-sans`、`code` → `--font-code`                                                                                                                                                    | なし                                                                                                                                     |
| 字の段            | `--text-body-size` → `--font-body`、`label` → `--font-label`、`supporting` → `--font-secondary`、`heading-1`〜`3` → `--font-heading-1`〜`3`、`heading-4` → `--font-heading`、行の高さ（`*-leading`）→ `--line-height-body` | `heading-5`・`6`・`large`・`code`・`display-*`・太さ                                                                                     |
| 余白              | `--spacing-0-5`〜`6`・`8`・`12` → `--space-2xs`〜`4xl`（前提の表）                                                                                                                                                         | `--spacing-1-5`・`7`・`9`・`10`・`11`                                                                                                    |
| 角丸              | `--radius-inner`・`element`・`container` → `--radius-sm`・`md`・`lg`、`full` → `--radius-pill`                                                                                                                             | `none`・`page`・`chat`                                                                                                                   |
| 影                | `--shadow-med` → `--shadow-raised`、`high` → `--shadow-overlay`、`inset-selected` → `inset var(--shadow-ring)`、状態の内側の輪 → `--state-*` から導く                                                                      | `--shadow-low`・`inset-hover`                                                                                                            |
| 焦点・高さ・動き  | なし                                                                                                                                                                                                                       | 焦点の輪（色は `--color-accent` を通して `--accent` になる）・部品の高さ（`--size-element-*`）・時間と緩急（`--duration-*`・`--ease-*`） |

- 写すときは表の左を全部写し、右は写さない。字の段の対応は、土台の課題が見本帳で 1 段ずつ見て決め直してよい。決め直したら、この表ではなく `design-token.md` に書く。
- 任せる理由: 部品の高さは tsukumo にトークンが無い。動きは、tsukumo の `transition` が 2 段（ADR 0041）なのに対し、Astryx は 9 段の時間が比で結ばれている。2 段だけ写すと段の間の比が崩れる。色相の 10 系統とデータの色（`--color-data-*`）は、`ui/` が使う部品では出ない。動きを減らす設定は、`theme.css` の `prefers-reduced-motion` の規則が Astryx の部品にも効く。
- テーマは neutral を継ぐ（試作の B と同じ）。neutral の lucide のアイコンの登録が tsukumo のアイコン（lucide）とそろうため。neutral は触る画面で `lg` より狭いとき（`pointer: coarse`）に字の段を組み直し、`--text-*` を上書きする。そこで同じ条件の規則を自分の `adaptations` に足し、上の字の段の写しを書き直す（後の規則が勝つ）。
- 定義の値が tsukumo のトークンの `var()` と、それを組んだ式（`color-mix()` など）だけでできていることは、土台の課題が単体テストで縛る。トークンの正典を `theme.css` から動かさないため。

## 論点 5: 境界の検査とテーマの定義の置き場

**採る: `.dependency-cruiser.cjs` に、`orpc-server-reader` と同じ形の規則 `astryx-reader` を足す。`src/` のうち `src/browser/components/ui/` の外から、`@astryxdesign/*` と `@stylexjs/stylex` を import すると落ちる。テーマの定義・組み立て物・根の部品は `ui/theme-root/` に置く。**

```js
rule(
  "astryx-reader",
  { path: "^src/", pathNot: "^src/browser/components/ui/" },
  { path: packagePath(["@astryxdesign/[^/]+", "@stylexjs/stylex"]) },
),
```

| 置き場                           | 中身                                                                                                                                                                 |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui/theme-root/theme-root.tsx`   | 根の部品 `ThemeRoot`（論点 8）。`astryx.css` と組み立て済みのテーマの CSS を import する                                                                             |
| `ui/theme-root/tsukumo-theme.ts` | `defineTheme` の定義（`name: "tsukumo"`・`extends: neutralTheme`）。`astryx theme build` の入力で、実行時には読まない                                                |
| `ui/theme-root/built/`           | `astryx theme build` の出力（CSS・JS・`.d.ts`）。生成物として、整形（`.prettierignore`）・lint・`src/browser/` の CSS の検査（字の大きさ・デザイントークン）から外す |
| `styles/layer-order.css`         | 層の順の宣言だけ（論点 2）。`main.tsx` が最初に import する                                                                                                          |
| `styles/theme.css`               | `@layer tsukumo-base { … }` の中に、要素への規則と打ち消し（論点 3）                                                                                                 |

- 理由: `ui/<部品>/<部品>.tsx` の置き方の検査（`test/architecture/browser-box.test.ts`）に合う。テーマは `ui/` の部品の見た目の一部なので、`ui/` の外（`styles/` や `scripts/`）に置くと境界の規則に例外が要る。組み立て物を見張るのは `--check` だけにする（論点 1）。
- 検査を弱めていないかは `ui/` の外のファイルに import を 1 つ書き、depcruise が落ちることで確かめる。depcruise の対象は `src` だけで、`test/` は対象外。単体テストも `ui/` の部品を経て Astryx を描く。

採らなかった案:

- テーマの定義を `src/browser/styles/` に置く: `styles/` は CSS だけの置き場で、境界の規則に穴が開く。
- 組み立て物を `src/` の外に置く: `ui/` から `src/` の外を読む import ができ、境界の外に Astryx を読むファイルができる。

## 論点 6: `ui/` の 22 部品と Astryx の部品の対応、移す順と課題の分け方

**採る: `ui/` の部品の props（tsukumo の語彙。ADR 0041 の論点 3）は変えず、中身だけを Astryx の部品に替える。呼ぶ側は原則として触らない。21 部品に Astryx の部品を当て、`typing-dot-list` だけを例外にする。`layout-resizer` は当てられるかを移す課題で確かめ、当たらなければ例外に足す。**

「呼ぶ」の列は `ui/` の外で `ui/<部品>/<部品>.tsx` を import するファイルの数（`rg -l` で数えた。2026-11-09）。

| 部品              | 呼ぶ | 当てる Astryx の部品                    | 語彙の合わせ方・気を付けること                                                                                                                                               | 課題     |
| ----------------- | ---- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `text`            | 93   | `Text`                                  | 大きさと太さは字の段の写し（論点 4）で合わせる。`tone` の状態の色（`state-*`）は Astryx の `color` に無いので CSS Modules で足す。`element` の `summary` は `as` に無い      | 字と並び |
| `heading`         | 26   | `Heading`                               | 段は `Text` と同じ表を読む                                                                                                                                                   | 字と並び |
| `stack`           | 1    | `Stack`                                 | `gap` の語は `xs`〜`xl` が `1`〜`5` に写る。`element` は `as`                                                                                                                | 字と並び |
| `h-stack`         | 29   | `HStack`                                | 同上                                                                                                                                                                         | 字と並び |
| `v-stack`         | 24   | `VStack`                                | 同上                                                                                                                                                                         | 字と並び |
| `divider`         | 2    | `Divider`                               | `tone` の 3 段を `variant` の 2 段（`strong`・`subtle`）と CSS Modules で表す。今は `<hr>` で、Astryx も `separator` の役を出す                                              | 字と並び |
| `visually-hidden` | 4    | `VisuallyHidden`                        | `role="status"` と `aria-live` を渡す口を保つ                                                                                                                                | 字と並び |
| `button`          | 77   | `Button`（`pressed` は `ToggleButton`） | 押せないは今の `aria-disabled` の 1 通りを保つ（Astryx は既定で `disabled` を付ける）。今の 27 の `variant` は Astryx の 4 つのどれかを土台にし、差は CSS Modules で足す     | 操作と印 |
| `badge`           | 8    | `Badge`                                 | `tone` を `variant` に写す（`ok` → `success` など）。`accent` と `shape` は CSS Modules                                                                                      | 操作と印 |
| `icon`            | 15   | `Icon`                                  | lucide の部品を `icon` に渡す                                                                                                                                                | 操作と印 |
| `spinner`         | 3    | `Spinner`                               | `aria-hidden` を渡し、今と同じく読み上げに出さない（Astryx は既定で `progressbar` の役を出す）                                                                               | 操作と印 |
| `skeleton`        | 3    | `Skeleton`                              | 今と同じく読み上げに出さない                                                                                                                                                 | 操作と印 |
| `field`           | 6    | `Field`                                 | 名札の `htmlFor` と入力欄の `id` の結びを保つ                                                                                                                                | 入力     |
| `text-field`      | 9    | `TextInput`・`TextArea`                 | 名札は `Field` が持つので、入力欄の側の名札は隠す                                                                                                                            | 入力     |
| `select`          | 2    | `Selector`                              | 今は素の `<select>`。Astryx は `combobox` と `listbox` の自前の一覧で、選び方のテストが変わる（論点 7）                                                                      | 入力     |
| `dialog`          | 19   | `Dialog`                                | どちらも素の `<dialog>` と `showModal()`。`backdrop` の 5 種と `placement` の座標は CSS Modules と `position` で表す                                                         | 重なる面 |
| `bottom-sheet`    | 4    | `BottomSheet`                           | 払って閉じる動きとつまみは Astryx の側に寄せる                                                                                                                               | 重なる面 |
| `menu`            | 3    | `MoreMenu`                              | `menu`・`menuitem` の役は同じ。狭い画面では下の板で出す（`presentation="adaptive"`）                                                                                         | 重なる面 |
| `image-zoom`      | 6    | `Lightbox`                              | 読めなかったときの代わりの絵（`fallback`）は `ui/` の側が持つ                                                                                                                | 重なる面 |
| `surface`         | 3    | `Card`                                  | `tone` の `accent` と `radius` の段は `Card` に無いので CSS Modules。顔の CSS（`surface-face.module.css`）は `src/` の 28 ファイルが読み、うち 25 が `ui/` の外の `composes` | 箱       |
| `layout-resizer`  | 3    | `ResizeHandle`（`useResizable`）        | Astryx は区画の大きさを自分で持つ。今の配線（比率を値に直す・確定を呼ぶ）に合わなければ例外にする                                                                            | 箱       |
| `typing-dot-list` | 3    | なし（例外）                            | Astryx に入力中の点の部品が無い。今の CSS のまま残す                                                                                                                         | なし     |

- `surface-face.module.css` は、`Card` と同じ写し先のトークンを読む CSS の顔として残す。`composes` で読む 25 ファイルを `Surface` の部品へ移すのは、ADR 0041 の「部品への移行」と同じく、領域ごとの別の課題にする。
- `button` の `variant` を減らすかは、操作と印の課題が数を添えて提案する。この ADR では減らさない。
- 例外の部品も写したトークンだけを読み、Astryx の部品と並べたときの見た目をそろえる。

後段の課題の分け方（7 件）:

| 順  | 課題                    | 中身                                                                                                                                                                                                                  |
| --- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 土台                    | 依存と版の固定・`astryx theme build` と `--check`・テーマの定義（論点 4）・`ThemeRoot`（論点 8）・層の順と `tsukumo-base`（論点 2・3）・`astryx-reader`・reset に頼る寸法の測定・happy-dom で描けるかの確認（論点 7） |
| 2   | 字と並び（7 部品）      | `text`・`heading`・`stack`・`h-stack`・`v-stack`・`divider`・`visually-hidden`                                                                                                                                        |
| 3   | 操作と印（5 部品）      | `button`・`badge`・`icon`・`spinner`・`skeleton`                                                                                                                                                                      |
| 4   | 入力（3 部品）          | `field`・`text-field`・`select`                                                                                                                                                                                       |
| 5   | 重なる面（4 部品）      | `dialog`・`bottom-sheet`・`menu`・`image-zoom`                                                                                                                                                                        |
| 6   | 箱（2 部品）            | `surface`・`layout-resizer`                                                                                                                                                                                           |
| 7   | レポートの内容部品 5 つ | `ui/` に `Table`・`CodeBlock`・`Blockquote`・`Banner`・`MetadataList` を包む部品を足し、Table・Code・Quote・Note・DescriptionList の土台にする                                                                        |

- 土台を最初にする。2 は土台のすぐあとにする。`button` は字の段の表（`text.tsx` の `TEXT_SIZE_CLASS`）を読み、ほかの部品の中で `HStack` などが並べるため。3〜6 は 2 のあとに 1 件ずつ進める。どれも見本帳と E2E の期待値（`test/e2e/expected/`）を書き直すので、並べて進めると期待値が衝突する。7 は 2・3・6 のあと。
- 7 で、内容部品の機能（`Code` の色付けと印の行、`Note` の `ask` などの種類）が Astryx の部品に無いと分かったら、その内容部品は例外の候補として報告する。例外の表に足すかは利用者が決める。

採らなかった案:

- `ui/` の props を Astryx の props に合わせて替える: 呼ぶ側（`text` だけで 93 ファイル）を全部書き換えることになり、見た目の移行と呼ぶ側の書き換えが 1 つの差分に混ざる。tsukumo の語彙（全部必須で型で縛る props。ADR 0041）も失う。
- 部品を 1 つずつ別の課題にする: 22 件になり、見本帳と E2E の期待値の撮り直しが 22 回になる。

## 論点 7: E2E と単体テストの role

**採る: 役（role）・アクセシブルネーム・状態の aria は、`ui/` の側で今のものを保つのを既定にする。** Astryx が同じ役を出す部品（`Dialog` の `dialog`・`MoreMenu` の `menu` と `menuitem`・`Divider` の `separator`）はそのまま使う。役が違う部品は、`ui/` が props で今に合わせる（`Button` の押せないは `aria-disabled` のまま、`Spinner` は `aria-hidden`）。保てないとき（`Select` の選び方）だけ、テストを新しい当て方に合わせ、その部品の課題の中で直す。Astryx が出す文言（閉じるボタンの名前など）は ja-JP の訳にする（論点 8）。

`test/` の `getByRole` の数（2026-11-09 に `rg -o` で、役の名前を閉じ引用符まで合わせて数えた。`menu` に `menuitem` は入らない。括弧の中は `test/e2e` の分）:

| 役          | 件数       |
| ----------- | ---------- |
| `button`    | 463（104） |
| `dialog`    | 38（18）   |
| `option`    | 23（5）    |
| `menu`      | 6（1）     |
| `menuitem`  | 13（1）    |
| `combobox`  | 12（5）    |
| `separator` | 11（1）    |

`getByRole` を使うファイルは `test/browser` に 91 本、`test/e2e` に 22 本ある。

理由:

- `button` の 463 件のうち 359 件は `test/e2e` の外の単体テストにある。役を変えるとテストの書き換えが部品の差し替えより大きくなり、差し替えの差分が読めなくなる。
- 役は利用者に見える振る舞い（読み上げ）で、見た目の移行で変えるものではない。

確かめること:

- 単体テストは happy-dom（vitest の `dom` の project）で Astryx の部品を描く。happy-dom で動くか（`showModal`・`popover`・`ResizeObserver` など）は確かめていない。土台の課題が Astryx の部品を 1 つ単体テストで描いて確かめ、足りない API はテストの setup で補う。補えない部品は E2E で守る側に寄せ、その部品の課題で決める。
- DOM の写しの期待値（`test/e2e/expected/*.dom-pick.json`、37 本）は、部品ごとの課題が `pnpm run test:e2e:update` で撮り直す。

採らなかった案:

- Astryx の既定の役に合わせてテストを書き換える: 上の理由。

## 論点 8: 根の `Theme` の置き場と `<html>` に付く属性

**採る: `App` の `QueryClientProvider` の内側、`Root` の外側に `ui/` の `ThemeRoot` を置く。`ThemeRoot` は Astryx の `InternationalizationProvider`（`locale="ja-JP"`）と `Theme`（テーマ `tsukumo`・`mode="dark"`）を重ねて、子を包む。**

| 付くもの                                                   | 今のスタイル・撮影・テストに当たるか                                                                                                                                                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<html>` の `data-theme="dark"`                            | tsukumo の CSS・テスト・撮影は `data-theme` を読まない（`src`・`test`・`scripts` で 0 件）。テーマの CSS の `html[data-theme="dark"] { color-scheme: dark }` は、`theme.css` の層なしの `:root { color-scheme: dark }` と同じ値 |
| `<html>` の `data-astryx-theme="tsukumo"`                  | テーマのトークンの `@scope` の根になる。`<html>` に付くので、ポータルで外に出る Astryx の面にもトークンが届く                                                                                                                   |
| 子を包む `div`（`display: contents`・`data-astryx-theme`） | 箱を作らないので、`#app` の縦の flex（`theme.css` の狭い画面の規則）はそのまま効く。`#app >` の子の結合子は tsukumo の CSS に無い（0 件）。DOM の写しは 1 段深くなる                                                            |
| 包む `div` の `color`・`font-family`                       | `--color-text-primary`・`--font-family-body` を `--ink`・`--font-sans` に写す（論点 4）ので、`body` と同じ値になる                                                                                                              |

- `mode` は `dark` に固定する。tsukumo は暗い面だけを持つ（`theme.css` の `color-scheme: dark`）。`system` にすると `data-theme` が外れ、写していない Astryx の色が `light-dark()` で利用者の OS の明るさに合わせて変わる。
- `InternationalizationProvider` を置くのは、Astryx の部品が出す文言（閉じるボタンの名前・メニューの名前など）を日本語にするため。アクセシブルネームとして E2E にも当たる（論点 7）。
- `Root` のすぐ外に置くのは、DOM を作る包みがこの `div` だけだから。DOM の写しの深さが変わる場所が 1 か所で済む。
- Temporal を持たないブラウザに出す案内（`main.tsx`）は `App` を描かないので、`Theme` の外になる。案内は Astryx の部品を使わない。

採らなかった案:

- `main.tsx` の `createRoot` の直下に置く: `App` を描く単体テストに `Theme` が入らなくなる。
- 部品ごとに `Theme` を置く: 最初の `Theme` だけが根として `<html>` に属性を付けるので、どの部品が先に描かれたかで根が変わる。

## 0041・0042 との関係

- 0041 は覆さない。トークンの段と名前・`ui/` の語彙（`Surface`・`Badge`・`Divider` を含む）・見本帳・直書きの検査はそのまま続く。トークンの正典は `theme.css` のままで、Astryx の側が `var()` で読む。変わるのは、`ui/` の部品の中身と、`theme.css` の要素への規則が入る層（論点 2）。Storybook を入れない決めも続く。
- 0042 は覆さない。内容部品は React の部品として直に描き、その土台が `ui/` の Astryx の部品になる。
- `design-token.md`「13.16 `ui/` の箱の部品」は、土台の課題が書き足す。書き足すのは、`ui/` の部品の中身が Astryx であること・`ThemeRoot`・層の順・例外の部品。

## 未決

1. `reset.css` に頼る Astryx の部品の寸法の食い違い（論点 3）。土台の課題が測り、部品ごとの課題が直す。部品の根の class で直せない部品が出たら、`reset.css` の扱いを見直す。
2. happy-dom で描けない Astryx の部品（論点 7）。
3. `layout-resizer` を例外にするか（論点 6）。
4. `main.css` が約 30 万バイト増えたときの読み込みの手間（論点 2）。土台の課題が前後を測る。目立てば、部品の分だけ読ませる案を見直す。
5. 新しい部品（Tree List・Hover Card）をレポートのカタログに足すか。この ADR では決めない。

## 影響

- 依存に `@astryxdesign/core`・`@astryxdesign/theme-neutral`・`@stylexjs/stylex`、devDependency に `@astryxdesign/cli` が入る。どれも `^` なしで固定する。
- `ui/theme-root/` が増え、`app.tsx` は `ThemeRoot` で `Root` を包む。
- `styles/layer-order.css` が増え、`theme.css` の要素への規則が `tsukumo-base` の層に入る。
- `.dependency-cruiser.cjs` に `astryx-reader` が増え、lint の段で `astryx theme build --check` を打つ。
- 後段の課題 7 件の本文を、この ADR の論点 6 の分け方に合わせる。
