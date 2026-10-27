# 層と機能の辺の検査を dependency-cruiser の宣言に移す

ステータス: 採用

**層・機能・shared・browser の箱・外部コマンドの import の辺の検査を、`.dependency-cruiser.cjs` の宣言 1 枚に移し、`pnpm run lint` で打つ。** ADR 0019 の「外部ツールは増やさない」を改める（0019 は凍結なので書き換えない）。

## 困っていたこと

- ADR 0019 の「外部ツールは増やさない」の根拠は、`src/` が 18 ファイルだった時点の見積もり。いまは `git ls-files 'src/*.ts' 'src/*.tsx' | wc -l` で 952 ファイルあり、`test/architecture/` の自前の構文木走査は 39 ファイル 5,271 行に育っていた
- 機能どうしの辺の規則が、`docs/architecture/server-feature.md` の表と、辺の検査の定数 `SERVER_FEATURE_IMPORTS` の 2 箇所にあり、一致を別の検査で縛っていた
- 辺を足すたびに、定数・表・検査の 3 つを揃える必要があった

## 決めたこと

- 移すのは import の辺だけ。層（`layer-*`）・shared の外部パッケージと `utils/` の閉じ方・機能どうしの辺（`server-feature-edge:<機能>`）・共有の箱が機能を読まない規則・browser の枠/画面/置かれる機能と箱の辺・`node:child_process` を読めるファイルを、`.dependency-cruiser.cjs` の `forbidden` に宣言する。severity は全部 `error`
- 機能どうしの辺の表は規則から生成する（`scripts/document/feature-edge-table.ts`。`pnpm run format` が `docs/architecture/server-feature.md` の印の間を書き直す）。表と規則のずれは起きない
- 残すのは tsukumo 固有の検査と、import の辺で表せない検査。機能どうしの輪、`shared/` の形、1 機能しか読まない検査、`components/` の形、起こす外部コマンドの一覧、`listen` の宛先、`process` の import 名、`writeFileSync` の許可リスト
- dependency-cruiser 18.7.0 は TypeScript 7 以上を読めない（`missing-tsc-transpiler`）。構文の読み手に `@swc/core` を足し、`parser: "swc"` で読む。`pnpm-workspace.yaml` の `allowBuilds` では `"@swc/core": false`（build script は不要）。2 つの依存は `docs/architecture/build/dependency.md` の表に足した
- `lint` の中で `depcruise src --config .dependency-cruiser.cjs` を打つ。`check` の段の名前は増やさない

## 落としたもの

- 「`SERVER_FEATURE_IMPORTS` の組は、どれも実際の import に 1 本以上ある」（使われない組の検査）。dependency-cruiser に同じ検査が無い。許す先が使われなくなっても規則と表に残る
- 知らない箱への import を `browserBoxOf` が `throw` した検査は、`browser-box-unknown` に替わった。拾うのは、その箱のファイルが import されたときだけで、import されないだけのディレクトリは拾えない（知らない枠・画面・置かれる機能のディレクトリは、`browserFeatureOf` の `throw` が引き続き存在だけで落とす）
- dependency-cruiser は `@orpc/*` などの解決できないパッケージを、解決先ではなく名前そのままで扱う。外部パッケージの規則（`orpc-server-reader`・`shared-packages`・`shared-utils-closed`・`browser-utils-closed`）は `(?:^|node_modules/)<名前>(?:/|$)` で名前と解決先の両方に当て、`dependency-rule.test.ts` が両方の形で確かめる
- `src/` の直下に知らない層のディレクトリを足したときと、`server/` の直下・機能の `core/` `adapter/` の外に置いたファイルは、規則に書かない。`layer.test.ts` の shared の検査と `server-feature.test.ts` の機能どうしの辺の収集が、全ファイルの層を判定するときに `throw` して落とす
- 機能の規則は `to.pathNot` の文字列を読んで表にするので、規則の書き方は `^src/server/(?:<自分>|<許す先>…)/` の形に固定される。形を崩すと `feature-edge-table.ts` が `throw` する

## 採らなかった案

- 循環の検査（`no-circular`）を宣言に入れる案。ファイル単位の循環が機能の中に 23 件あり、機能どうしの輪だけを見る自前の検査（`findFeatureCycle`）を残した
- dependency-cruiser を入れず自前の走査を保つ案。辺の規則が増えるたびに定数・表・検査を揃える負担が残る
- TypeScript 6 へ下げて dependency-cruiser の既定の読み手を使う案。このリポジトリは TypeScript 7 を使っており、下げる理由が検査 1 つに見合わない
