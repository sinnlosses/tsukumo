// `vite build` を起こす口。
//
// `vite` は JS API ではなく CLI を `node` の子プロセスで起こす。
// 組み立ての JS API は同じプロセスの `process.env.NODE_ENV` を `production` に書き換えるので、
// 常駐するサーバの中では呼ばない。
// 設定はリポジトリ直下の Vite の設定ファイルで、入口の置き場と出し先は呼ぶ側が引数で渡す。
//
// 型検査はここではしない（`vite build` はトランスパイルだけで型を見ない）。型は `pnpm run check` の `tsc --noEmit` が見る。

import { execFile } from "node:child_process"
import { stripVTControlCharacters } from "node:util"

import { clipText } from "../../../shared/utils/clip-text.ts"
import { bundledFilePath } from "../../adapter/bundled-path.ts"

/** Vite の設定ファイル。入口のファイル名と、出す2つのファイル名はここに書いてある。 */
export const VITE_CONFIG_RELATIVE_PATH: readonly string[] = ["vite.config.ts"]

/** `vite` の CLI の実体（`node_modules/.bin/vite` が指す先）。 */
const VITE_CLI_RELATIVE_PATH: readonly string[] = ["node_modules", "vite", "bin", "vite.js"]

/**
 * `vite build` 自身の出力（警告と、失敗したときの理由）の受け取り上限。成果物は
 * ここを通らない（`--outDir` に出る）ので、数十KBあれば足りる。
 */
const BUILD_OUTPUT_MAX_BYTES = 1024 * 1024

/**
 * `vite build` の理由を stderr へ流すときの上限。実測では構文エラー1件がスタックを除いて10行ほどだが、
 * 壊れ方によっては全ファイル分のエラーが並ぶ。ターミナルに出す1回分として読める長さで切る。
 */
const FAILURE_REASON_MAX_LINES = 20
const FAILURE_REASON_MAX_CHARS = 2000

/** `vite build` が失敗したときの結果。理由は `vite build` の出力（会話の中身は通らない）。 */
export type ViteBuildFailure = { readonly ok: false; readonly reason: string }

/**
 * `sourceDir` の入口（Vite の設定の `input`）を `vite build` で `outDir` へまとめる。
 * うまくいったら `undefined`、だめなら `vite build` が書いた理由を持った結果を返す。
 *
 * 失敗しても `outDir` には手を触れないので、前に置いた成果物はそのまま残る
 * （書きかけを保存したときに、配っているものが消えない）。
 * `vite build` が出し先を空にするのは、組み立てが通って書き出す直前だけ。
 */
export function runViteBuild(
  sourceDir: string,
  outDir: string,
): Promise<ViteBuildFailure | undefined> {
  return new Promise((resolve) => {
    execFile(
      "node",
      [
        bundledFilePath(...VITE_CLI_RELATIVE_PATH),
        "build",
        sourceDir,
        "--config",
        bundledFilePath(...VITE_CONFIG_RELATIVE_PATH),
        "--outDir",
        outDir,
      ],
      { maxBuffer: BUILD_OUTPUT_MAX_BYTES },
      (error, _stdout, stderr) => {
        resolve(error === null ? undefined : { ok: false, reason: failureReason(error, stderr) })
      },
    )
  })
}

/**
 * 失敗の理由を1つの文字列にする。`vite build` の stderr が空のとき（`maxBuffer` 超過や
 * `node` が起こせなかったときはここに何も来ない）は `execFile` の側の文面へ倒す。
 *
 * `vite build` は端末でなくても色の制御文字を書き、理由のあとに vite 自身のスタックを
 * 続けるので、どちらも落とす（行頭が空白と `at ` の行）。
 */
function failureReason(error: Error, stderr: string): string {
  const written = stripVTControlCharacters(stderr)
    .split("\n")
    .filter((line) => !/^\s+at /.test(line))
    .join("\n")
    .trim()
  return clampReason(written === "" ? error.message.trim() : written)
}

/** 長すぎる理由を上限まで切り、切ったことを最後の行で示す（黙って落とさない）。 */
function clampReason(reason: string): string {
  const lines = reason.split("\n")
  const kept = lines.slice(0, FAILURE_REASON_MAX_LINES).join("\n")
  const clamped = clipText(kept, FAILURE_REASON_MAX_CHARS).head
  return clamped === reason ? reason : `${clamped}\n…（長いので途中で切った）`
}
