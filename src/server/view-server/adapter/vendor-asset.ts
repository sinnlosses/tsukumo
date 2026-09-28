// ブラウザへそのまま配る外部ライブラリ（npm の依存）の実ファイルを読む。
// `node_modules` のどのファイルを指すかを知っているのはここだけで、`VENDOR_ASSET_CONTENT_TYPES` は配る名前と Content-Type しか持たない。
//
// フロントの資産の束には入れない。
// mermaid だけで 5.3MB あり、入れるとレポートに図が1つも無いときでも最初の読み込みで運ぶことになる。
// ここから配れば、その記法が実際に出てきたときだけブラウザが `<script src>` で取りに来る。
// CDN からは読まない（表示時の外部通信はゼロ。`docs/display.md`「レポートの記法は、TUI と tsukumo で出し分ける」）。
//
// パッケージ名で `require.resolve` しない。
// chart.js の `exports` が `dist/` を公開していないので、パッケージの中のファイルは名前では解けない。
// tsukumo 自身の場所から `node_modules/` を辿る（cwd に依存しない）。

import { readFileSync } from "node:fs"

import { VENDOR_ASSET_CONTENT_TYPES } from "../../../shared/view-server/vendor-asset.ts"
import { bundledFilePath } from "../../adapter/bundled-path.ts"

/** 依存の置き場。tsukumo 自身の場所の直下にある（`pnpm install` が作るもの）。 */
const NODE_MODULES = "node_modules"

/**
 * 配る名前と、`node_modules` の中のファイルの対応。
 * キーは {@link VENDOR_ASSET_CONTENT_TYPES} と揃っている必要がある（揃っているかは検査が allowlist 側から辿って確かめる）。
 *
 * mermaid と chart.js は package.json で版を固定している（`^` を付けない）。
 * 素の JavaScript をそのままブラウザへ配っていて、描けるかどうかは目で見るまで分からないため。
 * mermaid の版は `REPORT_NOTATION_PROMPT` が挙げる図の10種の根拠でもある。
 * highlight.js のテーマだけは `^` で上げてよい。
 * 色を当てる class を出すのは `rehype-highlight`（`lowlight`）が抱える highlight.js のほうなので、版がずれると当たらない class が出る。
 * いまは `lowlight` が `~11.11.0` で別の複製を持つが、配っている 11.12.0 のテーマとバイト一致なので当たる（`cmp` で確認。テーマを配る版を上げるときはここを見る）。
 */
const VENDOR_ASSET_FILES: Readonly<Record<string, readonly string[]>> = {
  "highlight-theme.min.css": ["highlight.js", "styles", "github-dark.min.css"],
  "chart.umd.min.js": ["chart.js", "dist", "chart.umd.js"],
  "mermaid.min.js": ["mermaid", "dist", "mermaid.min.js"],
}

export type VendorAssetFile = {
  readonly contentType: string
  readonly content: Buffer
}

/**
 * 配ってよい名前1つを読む。allowlist に無い名前・`node_modules` に無いファイルのときは undefined（呼び出し側が404にする）。
 * 名前は対応表を引くだけで、要求されたパスからファイル名を組み立てないので `..` で外へ出る経路が無い。
 */
export function readVendorAsset(name: string): VendorAssetFile | undefined {
  const contentType = VENDOR_ASSET_CONTENT_TYPES[name]
  const segments = VENDOR_ASSET_FILES[name]
  if (contentType === undefined || segments === undefined) {
    return undefined
  }

  const content = readOptionalBinaryFile(bundledFilePath(NODE_MODULES, ...segments))
  return content === undefined ? undefined : { contentType, content }
}

function readOptionalBinaryFile(path: string): Buffer | undefined {
  try {
    return readFileSync(path)
  } catch {
    return undefined
  }
}
