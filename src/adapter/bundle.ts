// ブラウザ側スクリプト（`src/ui/`）と CSS を `bun build` で1本にまとめ、**中身を文字列で返す**。
// 失敗したときは `bun build` が stderr に書いた理由を添えて返す（呼び出し側が起動を止めるか、
// 前の版を配り続けるかを決める）。
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
 * `bun build` の理由を stderr へ流すときの上限。実測では構文エラー1件が4行・230バイトだが、
 * 壊れ方によっては全ファイル分のエラーが並ぶ。**ターミナルに出す1回分**として読める長さで切る。
 */
const FAILURE_REASON_MAX_LINES = 20
const FAILURE_REASON_MAX_CHARS = 2000

/**
 * 組み立ての結果。**失敗したときは必ず理由が付く**形（直和）にしてあるのは、
 * 「組み立てられなかったが理由が分からない」状態を型から消すため。
 *
 * `reason` に入るのは `bun build` の出力（リポジトリ内のパスと、そこに書いたソースの断片）。
 * **利用者と Claude の会話は通らない**ので `docs/coding-standards.md`「会話内容の扱い」の
 * 対象ではなく、ターミナルにそのまま出してよい。逆に、ここに SDK のイベントや transcript から
 * 来た値を混ぜてはならない。
 */
export type BundleResult =
  | { readonly ok: true; readonly content: string }
  | { readonly ok: false; readonly reason: string }

/**
 * ブラウザ側スクリプト（`src/ui/`）を `bun build` でまとめる。JSX は tsconfig の
 * `"jsx": "react-jsx"` で自動変換される（docs/design.md 11章）。
 */
export function buildUiScript(): Promise<BundleResult> {
  const entry = bundledFilePath("src", "ui", UI_SCRIPT_ENTRY)
  return bundleWithBun(entry, UI_SCRIPT_MAX_BYTES)
}

/**
 * CSS（`src/ui/styles/`）を `bun build` でまとめる。領域ごとに割った `.css`
 * （`src/ui/styles/*.css`）を `main.css` の `@import` で束ねる。
 */
export function buildStyleSheet(): Promise<BundleResult> {
  const entry = bundledFilePath("src", "ui", "styles", STYLE_SHEET_ENTRY)
  return bundleWithBun(entry, STYLE_SHEET_MAX_BYTES)
}

/**
 * `entry` を `bun build --target=browser` でまとめ、標準出力の中身を返す。**失敗（プロセスの
 * 異常終了・出力が空）のときは `bun build` が書いた理由を添えて返す**（起動時の前提不足として
 * 扱うかどうかは呼び出し側の判断。`buildUiScript` / `buildStyleSheet` の共通の実装）。
 */
export function bundleWithBun(entry: string, maxBytes: number): Promise<BundleResult> {
  return new Promise((resolve) => {
    execFile(
      "bun",
      ["build", entry, "--target=browser"],
      { maxBuffer: maxBytes },
      (error, stdout, stderr) => {
        resolve(
          error === null && stdout !== ""
            ? { ok: true, content: stdout }
            : { ok: false, reason: failureReason(error, stderr) },
        )
      },
    )
  })
}

/**
 * 失敗の理由を1つの文字列にする。`bun build` の stderr が空のとき（`maxBuffer` 超過や
 * `bun` が起こせなかったときはここに何も来ない）は `execFile` の側の文面へ倒す。
 */
function failureReason(error: Error | null, stderr: string): string {
  const written = stderr.trim()
  if (written !== "") {
    return clampReason(written)
  }

  return error === null ? "bun build の出力が空だった" : clampReason(error.message.trim())
}

/** 長すぎる理由を上限まで切り、**切ったことを最後の行で示す**（黙って落とさない）。 */
function clampReason(reason: string): string {
  const lines = reason.split("\n")
  const kept = lines.slice(0, FAILURE_REASON_MAX_LINES).join("\n")
  const clamped =
    kept.length > FAILURE_REASON_MAX_CHARS ? kept.slice(0, FAILURE_REASON_MAX_CHARS) : kept
  return clamped === reason ? reason : `${clamped}\n…（長いので途中で切った）`
}
