// ブラウザ側スクリプトと CSS を `bun build` で1本にまとめ、**中身を文字列で返す**。
// どちらも失敗したら undefined を返す（呼び出し側が起動を止める）。
//
// **ファイルに書き出さない。** 出力を標準出力で受け取ってメモリに持ち、
// `src/infrastructure/view-server.ts` が配る。ディスクに成果物を残さないので、古いものを配る事故も、
// `.gitignore` に足す必要も出ない（2026-09-12 T-083 決定）。
//
// **`Bun.build()` ではなく `bun build` のプロセスを起こす**のは、`Bun.*` の固有 API に寄せない
// 規約（`docs/coding-standards.md`「Bun固有APIに寄せない」）のため。`bun` は tsukumo 自身を
// 動かしている実行環境なので、外部コマンドの依存が増えるわけではない。
//
// 型検査はここではしない（`bun build` はトランスパイルだけで型を見ない）。型は
// `bun run check` の `tsc --noEmit` が見る。**`src/presentation/browser/` も tsconfig の
// `include`（`src` 配下の `.ts` すべて）に入っている**ので、検査は自動で届く。

import { execFile } from "node:child_process"

import { bundledFilePath } from "./bundled-path.ts"

/** ブラウザ側スクリプトの入口。ここから辿れるものが1本にまとまる（`buildBrowserScript`）。 */
const BROWSER_SCRIPT_ENTRY = "main.ts"
/** 組み立てた結果の受け取り上限。超えるとビルドが失敗扱いになる（いまの実測は数KB）。 */
const BROWSER_SCRIPT_MAX_BYTES = 8 * 1024 * 1024

/** CSS の入口。ここから `@import` で辿れるものが1本にまとまる（`buildStyleSheet`）。 */
const STYLE_SHEET_ENTRY = "main.css"
/** 組み立てた結果の受け取り上限。超えるとビルドが失敗扱いになる（いまの実測は数十KB）。 */
const STYLE_SHEET_MAX_BYTES = 8 * 1024 * 1024

export function buildBrowserScript(): Promise<string | undefined> {
  const entry = bundledFilePath("src", "presentation", "browser", BROWSER_SCRIPT_ENTRY)
  return bundleWithBun(entry, BROWSER_SCRIPT_MAX_BYTES)
}

/**
 * CSS（`src/presentation/style/`）を `bun build` でまとめる。領域ごとに割った `.css`
 * （`src/presentation/style/*.css`）を `main.css` の `@import` で束ねる。
 */
export function buildStyleSheet(): Promise<string | undefined> {
  const entry = bundledFilePath("src", "presentation", "style", STYLE_SHEET_ENTRY)
  return bundleWithBun(entry, STYLE_SHEET_MAX_BYTES)
}

/**
 * `entry` を `bun build --target=browser` でまとめ、標準出力の中身を返す。**失敗（プロセスの
 * 異常終了・出力が空）のときは undefined**（起動時の前提不足として扱うかどうかは呼び出し側の
 * 判断。`buildBrowserScript` / `buildStyleSheet` の共通の実装）。
 */
export function bundleWithBun(entry: string, maxBytes: number): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(
      "bun",
      ["build", entry, "--target=browser"],
      { maxBuffer: maxBytes },
      (error, stdout) => {
        resolve(error === null && stdout !== "" ? stdout : undefined)
      },
    )
  })
}
