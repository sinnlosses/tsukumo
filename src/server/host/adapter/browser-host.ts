// macOS の既定のブラウザ・アプリで開くホスト（`TSUKUMO_HOST=browser`）。
//
// `open` コマンドを呼ぶのはこのファイルだけ（この境界は検査が落とす）。
//   showView → open <url>。呼ぶたびに OS の既定のブラウザが開く（起動時の1回だけ呼ばれる）。
//   openFile → open <path>。拡張子に結び付いた OS の既定のアプリが開く。

import { execFile } from "node:child_process"

import { isObjectType } from "remeda"

import { isMissingFileError } from "../../adapter/lib/missing-file-error.ts"
import type { Host, HostResult, ShowViewResult } from "../core/host.ts"

const OPEN_COMMAND = "open"

/** `open` コマンド1回に許す時間。 */
const OPEN_COMMAND_TIMEOUT_MS = 5_000

/** ブラウザのアダプタを作る。`open` が無い環境でも、失敗を返すだけで例外は投げない。 */
export function createBrowserHost(): Host {
  return { showView: (url) => showView(url), openFile: (path) => openTarget(path) }
}

async function showView(url: string): Promise<ShowViewResult> {
  const opened = await openTarget(url)
  return opened.ok
    ? {
        ok: true,
        close: () =>
          Promise.resolve({ ok: false, reason: "ブラウザのタブは tsukumo から閉じられない" }),
      }
    : opened
}

/**
 * `open` を1回呼ぶ。理由には実行したコマンドラインを入れない（引数の URL の起動トークンやパスが紛れ込むため）。
 * `--` を挟み、`-` で始まる値をオプションと読ませない。
 */
function openTarget(target: string): Promise<HostResult> {
  return new Promise((resolve) => {
    execFile(
      OPEN_COMMAND,
      ["--", target],
      { encoding: "utf8", timeout: OPEN_COMMAND_TIMEOUT_MS },
      (error) => {
        if (error === null) {
          resolve({ ok: true })
          return
        }

        resolve({ ok: false, reason: describeFailure(error) })
      },
    )
  })
}

function describeFailure(error: unknown): string {
  if (isMissingFileError(error)) {
    return `${OPEN_COMMAND} コマンドが見つからない`
  }

  const exitCode =
    isObjectType(error) && "code" in error && typeof error.code === "number"
      ? error.code
      : undefined
  return exitCode === undefined
    ? `${OPEN_COMMAND} が失敗した`
    : `${OPEN_COMMAND} が失敗した（終了コード ${String(exitCode)}）`
}
