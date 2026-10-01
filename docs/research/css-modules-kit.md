# CSS Modules の型生成を happy-css-modules から css-modules-kit へ移すか（2026-09-27）

**この文書は調査メモであって正典ではない。** `docs/` の他ファイルにある「節の索引」はここには
作らない。CSS Modules の型生成を css-modules-kit へ移すべきかという、ユーザーからの指示
（2026-09-27）の記録。**依存の入れ替えはこの文書の外**（提案だけ）。

## 結論

**移せない（2026-09-27、実機確認して撤回）。** 仕組みは同型（生成ファイル＋
`tsconfig.json` の `rootDirs`）で移行コスト自体は小さいはずだったが、実際に `cmk` を Bun 環境へ
入れて動かすと、tsukumo の `typescript@7.0.2`（次世代ネイティブプレビュー版）に `ts.sys` が
無いために cmk が起動直後にクラッシュし、回避策も無かった。詳細は下の「実機で確かめた結果」節。
happy-css-modules（以下 hcm）は作者自身が css-modules-kit（以下 cmk）を後継と明言しており、
tsukumo 側の typescript の版が変わるなどで前提が崩れたら再検討の余地はある。
2026-10-02 に pnpm で cmk にだけ TypeScript 6 を持たせると動くことを確かめたが、利点が型の生成だけに
留まるので移さないと決めた（「pnpm で cmk にだけ TypeScript 6 を持たせた結果」節）。

## 今のコードの前提（実測）

- `package.json` の `scripts`: `"css-types": "hcm 'src/**/*.module.css' --outDir dist/css-module-type --logLevel silent"`。
  `"build"` と `"typecheck"` の両方が `bun run css-types` を先に呼ぶ
- 生成物は `dist/css-module-type/` 配下に `src/` と同じ並びで `.d.ts` を書く。`dist/` は
  `.gitignore` の対象（「ブラウザ側の成果物」という理由で書かれているが、`css-module-type` も
  同じディレクトリに入って一緒に無視されている）
- `tsconfig.json` は `"rootDirs": [".", "dist/css-module-type"]` で、`*.module.css` の隣に生成物が
  あるものとして型を解決させる。`"include"` は `src/**/*.ts` 等の拡張子限定で、`*.module.css`
  自体は含まれていない
- `docs/design.md`（2422〜2427行）に仕組みの説明がある。「CSS に無い名前を引くと型エラーになり、
  ある名前は `string` で届く」「生成物を部品の隣に置かないのは、ページと部品の直下に置ける
  ファイルが決まっているため」
- `bun run check` の型検査は `typecheck` 経由で `css-types`（hcm 実行）→ `tsc --noEmit` の順
- 依存は `package.json` に `"happy-css-modules": "^5.0.2"`

## happy-css-modules の保守状況（一次情報）

- GitHub `mizdra/happy-css-modules`: star 282、作成 2022-06-07、最終 push **2026-07-02**
  （このタスクの時点で約3ヶ月停滞）、open issues 9、archived ではない
- npm `happy-css-modules`: 最新 `5.0.2`（2026-07-02 公開）
- **README 自身が後継への移行を案内している**（WebFetch で確認）: 「Consider migrating to
  `mizdra/css-modules-kit`, which is the successor to happy-css-modules. It offers enhanced
  features such as Renaming and Find All References support.」ただし Sass/Less を使うなら hcm を
  推奨、とも書かれている（tsukumo は Sass/Less を使っていない）

## css-modules-kit の一次情報

- GitHub `mizdra/css-modules-kit`: star 198、作成 2024-11-04、最終 push **2026-09-21**（調査時点の
  6日前）、直近のコミット（2026-09-20 前後）が5件連続で残っており、開発が今も活発
- 作者は hcm と同じ mizdra。後継として明示されている（上記 hcm README の文言）
- パッケージ構成: `@css-modules-kit/codegen`（CLI。`bin` は `cmk`）・`@css-modules-kit/ts-plugin`
  （TypeScript Language Service Plugin、Volar.js ベース）・`@css-modules-kit/core`（共通ロジック）・
  `@css-modules-kit/stylelint-plugin` / `@css-modules-kit/eslint-plugin`（tsukumo は oxlint / oxfmt
  を使っており ESLint・Stylelint 自体を使っていないので、この2つは対象外）
- `@css-modules-kit/codegen`: 最新 `1.4.0`（2026-07-09 公開）。`engines.node` が `>=22.12.0`
  （**tsukumo は Bun で動かしている。`bunx`/`bun run` 経由で `bin/cmk.js` が動くかは今回未確認**）

### 型の生成の仕組み（hcm との比較）

**生成ファイル方式で、hcm と同型。** 言語サービスだけで完結する方式ではない。

- `tsconfig.json` に `"cmkOptions": { "enabled": true, "dtsOutDir": "generated" }` を書き、
  `"rootDirs": [".", "generated"]` を足す。今の tsukumo の `rootDirs` の使い方（`dist/css-module-type`
  を生成先にして隣に解決させる）とそのまま同じ形
- ただし `"include"` に `*.module.css` を含む必要がある、と get-started.md が明記している
  （`["src/**/*.ts"]` のような拡張子限定は「避けるべきパターン」として名指しされている）。
  **今の tsukumo の `tsconfig.json` の `include` はこの「避けるべきパターン」に一致する**ので、
  移すなら `include` を広げる変更が要る
- CLI は `cmk`（生成のみ）と `cmk --watch`（監視）。公式の組み込み例は
  `"generate": "cmk"` を `build`/`lint`（型検査含む）の前段に置く形で、今の
  `"css-types" && "typecheck"` の構造とほぼ同じに置き換えられる
- **ケース変換をしない**（`foo-bar` は `styles.fooBar` ではなく `styles['foo-bar']` のまま）。
  `docs/design.md` が明記する「class 名は用語集の語をそのまま保ち、キャメルケースへ変換しない」
  という tsukumo の方針とちょうど一致する（hcm も同じ挙動なので、ここは差が無い）

### `bun run check` の型検査との組み合わせ

- hcm・cmk とも「生成コマンドを先に走らせてから `tsc --noEmit`」という形で、`bun run check` の
  構造（`typecheck` → `lint` → `format:check` → `test` → `test:e2e`）を変える必要は無い
- 未確認: cmk の CLI（Node 前提、`engines.node >= 22.12.0`）が tsukumo の Bun 実行環境で
  そのまま動くか。hcm は現に `hcm` という bin 名で `bun run` から呼べている（`bin` の解決は
  パッケージマネージャ次第で、Bun でも Node 向け bin は基本的に動くが、実機での確認はしていない）

### エディタの補完と定義へのジャンプ

- hcm は「Typed, definition jumpable CSS Modules」を謳っており、**今の構成でも定義ジャンプ自体は
  既に効いている**はず（生成した `.d.ts` と `rootDirs` の組み合わせによるもの）
- cmk は `@css-modules-kit/ts-plugin`（TypeScript Language Service Plugin、Volar.js ベース）で
  定義ジャンプに加え **Rename Symbol・Find All References** を追加提供する。対応エディタは
  VS Code（Marketplace の拡張機能）・Neovim・Emacs（eglot。ただし「Eglot は複数の言語サーバーを
  持てない」制約でプロパティ補完等は使えないと明記）・Zed・StackBlitz Codeflow。**WebStorm は
  「Not yet supported」と明記されている**
- **未確認**: 開発者（ユーザー本人）が普段使っているエディタが何か。CLAUDE.md・README には記載を
  見つけられなかった。VS Code 系なら恩恵が大きいが、WebStorm 系なら ts-plugin の恩恵が無い

### 保守の状況（まとめ）

| 項目               | happy-css-modules                 | css-modules-kit             |
| ------------------ | --------------------------------- | --------------------------- |
| 作成日             | 2022-06-07                        | 2024-11-04                  |
| 最終 push          | 2026-07-02（約3ヶ月停滞）         | 2026-09-21（6日前）         |
| 直近のコミット頻度 | 確認できる範囲では停滞            | 2026-09-20 前後に5件連続    |
| star               | 282                               | 198                         |
| open issues        | 9                                 | 15                          |
| archived           | していない                        | していない                  |
| 最新版             | 5.0.2（2026-07-02）               | codegen 1.4.0（2026-07-09） |
| 作者の位置づけ     | 自身の README で cmk を後継と明言 | hcm の後継を自称            |

（GitHub API・npm registry から実測。2026-09-27 時点）

## Vite 移行タスクとの時期の関係

ブラウザ側の組み立てを `bun build` から `vite build` へ移すタスク（`status: todo`）は
`src/browser/main.tsx` の **JS/CSS バンドル**が対象で、`src/server/view-server/adapter/bundle.ts`
を差し替える。一方 hcm/cmk はどちらも **`tsc`（型検査）側の付随ツール**で、バンドラーとは
独立に動く（`typecheck` スクリプトは `build` スクリプトから見て別経路）。よって
**その Vite 移行の完了を待つ技術的な依存関係は無い**。

ただし両方とも `package.json` の `scripts` と `tsconfig.json` を触るので、変更の影響範囲が
一部重なる。無理に急いで同時に進める理由は無いが、どちらを先にやっても後から出る差分は
小さいはずで、**先着順で進めてよい**（Vite 移行のほうが規模が大きく本タスクより大掛かり）。

## 実機で確かめた結果（2026-09-27）

**cmk は tsukumo では動かない。Bun/Node の違いではなく、tsukumo の `typescript@7.0.2` との
非互換が原因。** 回避策は見つからなかった。

- `bun add -d @css-modules-kit/codegen` で実際に入れ、`bun run cmk --help` を実行すると、
  `node_modules/@css-modules-kit/codegen/bin/cmk.js` の**モジュール読み込み直後・`try` 節の外**にある
  `createLogger(cwd, shouldBePretty(undefined))` が `ts.sys.writeOutputIsTTY` を参照して
  `TypeError: Cannot read properties of undefined (reading 'writeOutputIsTTY')` で即座に落ちる
  （`--help` や引数解析より前にクラッシュするので、フラグでは避けられない）
- 原因は tsukumo の `typescript` が `^7.0.2`（TypeScript の次世代ネイティブプレビュー版、いわゆる
  Corsa）であること。この版の JS 側公開 API は `default` / `version` / `versionMajorMinor` のみで、
  **`ts.sys` 自体が存在しない**（`node -e "require('typescript').sys"` も
  `node -e "import('typescript').then(m => m.sys)"` も `undefined` と実測）。cmk は classic な
  TypeScript コンパイラ API（`ts.sys`）に依存して作られており、この非互換は環境変数・CLI オプション
  では迂回できない
- 検証後、`bun remove @css-modules-kit/codegen` で依存を戻し、作業ツリーをクリーンに復帰させた
- **結論**: tsukumo が `typescript@7.0.2`（Corsa）を使い続ける限り、cmk への移行は成立しない。
  再検討するなら、tsukumo 側が classic な `typescript`（4.x/5.x 系）に戻すか、cmk が Corsa 対応の
  `ts.sys` 代替を出すか、どちらかの前提が変わったとき

## pnpm で cmk にだけ TypeScript 6 を持たせた結果（2026-10-02）

**動くが、移さないと決めた。** パッケージ管理が pnpm に移ったので、上の「結論」の回避策を
試し直した（実験の変更はすべて戻した）。

- cmk 1.4.0 の `codegen`・`core`・`ts-plugin` は `typescript` を `^5.7.3 || ^6.0.0` の peer 依存で引く。
  `pnpm-workspace.yaml` の `overrides`（`@css-modules-kit/core>typescript`）と `packageExtensions` は
  peer 依存の解決に効かず、ルートの 7.0.2 を掴んだままだった
- `.pnpmfile.cjs` の `readPackage` で `@css-modules-kit/*` の peer 依存の `typescript` を消し、
  `dependencies` に `typescript: npm:typescript@^6.0.0` を足すと、cmk だけ 6.0.3・本体は 7.0.2 に分かれ、
  `cmk` が落ちずに起動した
- `tsconfig.json` に `"cmkOptions": { "enabled": true, "dtsOutDir": "dist/css-module-type" }` を置き、
  `include` に `src/**/*.module.css` を足す（無いと CSS を拾えず `The file specified in tsconfig.json not found.`
  で止まる）と、120 ファイルの型を約 0.3 秒で生成し、その型だけで `tsc --noEmit`（本体・Storybook）が通った。
  存在しないクラス名は TS2551 で落ちた
- **移さない理由**: 移行で増える利点の本体は ts-plugin の Rename・参照検索・定義へのジャンプで、
  TypeScript 7 の言語サーバは Language Service Plugin を読まないため、型の生成だけなら hcm と差が無い。
  そのぶん TypeScript 6 の依存と pnpmfile のフックが増える。ts-plugin が TypeScript 7 で動くようになったら再検討する

## 確かめていないこと

- 開発者が使っているエディタの種類（VS Code か WebStorm か等）。ts-plugin の恩恵の大小に関わる
- cmk の `dashedIdents` 以外のオプション（`namedExports`・`animation`・`container`）が tsukumo の
  CSS の書き方（アニメーション・コンテナクエリの有無）にどう影響するか、個々の検証はしていない
- 実際に移した場合の `dist/css-module-type/` → `generated/`（仮）への出力先変更が、
  `docs/design.md` の記述やエディタの型解決にどう波及するかの実地確認
- cmk の `stylelint-plugin` / `eslint-plugin` は tsukumo が oxlint/oxfmt を使っているため
  対象外と判断したが、oxlint 側に相当する診断（存在しない class 名の検出など）が要るかどうかの
  検討はしていない（現状 tsc の型エラーで代替できているはずだが未検証）

## 実装タスクの案（移すと決めた場合）

1. `happy-css-modules` を `@css-modules-kit/codegen` に、必要なら `@css-modules-kit/ts-plugin` も
   合わせて依存に加える（`package.json` の変更はこのタスクの外なので承認を得てから）
2. `tsconfig.json` に `cmkOptions`（`enabled: true`、`dtsOutDir` は今の `dist/css-module-type` に
   合わせるか検討）を足し、`rootDirs` の生成先パスを合わせる。`include` を
   `*.module.css` を含む形に直す（`docs/design.md` 2422〜2427行の記述も合わせて更新）
3. `package.json` の `"css-types"` スクリプトを `cmk`（もしくは `cmk 'src/**/*.module.css'` 相当）に
   置き換え、`"build"`・`"typecheck"` の呼び出し順はそのまま流用できるか確認
4. `bun run check` を通し、実際に `styles["..."]` の型付け・存在しない class 名でのエラー・
   エディタの定義ジャンプが今までどおり動くことを確認する
5. VS Code（またはユーザーの実エディタ）に `@css-modules-kit/ts-plugin` の拡張機能を入れ、
   Rename Symbol・Find All References が新しく効くことを目視で確かめる
6. 移行後、`happy-css-modules` を依存から外す
