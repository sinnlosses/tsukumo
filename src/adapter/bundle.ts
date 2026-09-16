// ブラウザ側スクリプト（`src/ui/`）と CSS を `bun build` で1本にまとめ、**中身を文字列で返す**。
// どちらも失敗したら undefined を返す（呼び出し側が起動を止める）。
//
// **ファイルに書き出さない。** 出力を標準出力で受け取ってメモリに持ち、`src/adapter/server.ts` が
// 配る。ディスクに成果物を残さないので、古いものを配る事故も、`.gitignore` に足す必要も出ない
// （2026-09-12 決定）。
//
// **`Bun.build()` ではなく `bun build` のプロセスを起こす**のは、`Bun.*` の固有 API に寄せない
// 規約（`docs/coding-standards.md`「Bun固有APIに寄せない」）のため。`bun` は tsukumo 自身を
// 動かしている実行環境なので、外部コマンドの依存が増えるわけではない。
//
// 型検査はここではしない（`bun build` はトランスパイルだけで型を見ない）。型は
// `bun run check` の `tsc --noEmit` が見る。

import { execFile } from "node:child_process"

import { bundledFilePath } from "./bundled-path.ts"

/** ブラウザ側スクリプト（React）の入口。ここから辿れるものが1本にまとまる（`buildUiScript`）。 */
const UI_SCRIPT_ENTRY = "main.tsx"
/** 組み立てた結果の受け取り上限。React 一式・react-markdown 一式を含む。 */
const UI_SCRIPT_MAX_BYTES = 8 * 1024 * 1024

/** CSS の入口。ここから `@import` で辿れるものが1本にまとまる（`buildStyleSheet`）。 */
const STYLE_SHEET_ENTRY = "main.css"
/** 組み立てた結果の受け取り上限。超えるとビルドが失敗扱いになる（いまの実測は数十KB）。 */
const STYLE_SHEET_MAX_BYTES = 8 * 1024 * 1024

/**
 * ブラウザ側スクリプト（`src/ui/`）を `bun build` でまとめる。JSX は tsconfig の
 * `"jsx": "react-jsx"` で自動変換される（docs/design.md 11章）。
 */
export function buildUiScript(): Promise<string | undefined> {
  const entry = bundledFilePath("src", "ui", UI_SCRIPT_ENTRY)
  return bundleWithBun(entry, UI_SCRIPT_MAX_BYTES)
}

/**
 * CSS（`src/ui/style/`）を `bun build` でまとめる。領域ごとに割った `.css`
 * （`src/ui/style/*.css`）を `main.css` の `@import` で束ねる。
 */
export function buildStyleSheet(): Promise<string | undefined> {
  const entry = bundledFilePath("src", "ui", "style", STYLE_SHEET_ENTRY)
  return bundleWithBun(entry, STYLE_SHEET_MAX_BYTES)
}

/**
 * `entry` を `bun build --target=browser` でまとめ、標準出力の中身を返す。**失敗（プロセスの
 * 異常終了・出力が空）のときは undefined**（起動時の前提不足として扱うかどうかは呼び出し側の
 * 判断。`buildUiScript` / `buildStyleSheet` の共通の実装）。
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
