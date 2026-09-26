// `git` を起こす口（docs/design.md 5章「成果の集め方と配り方」）。`main` の上のものを読む
// 2つの境界（`task-summary.ts` と `main-history.ts`）が両方使うので、`node:child_process` を
// 直に触るのはここだけに閉じ込める（原則3。1ファイル = 1つの境界。`test/architecture.test.ts`
// 「子プロセスを起こす箇所」の許可はこのファイル）。
//
// 例外を投げない（常駐プロセスは1回の失敗で落ちない。`docs/coding-standards.md`
// 「エラーハンドリング」）。呼び出し側が「不明」にするか、その回を諦めるかを決める。

import { execFile, spawn } from "node:child_process"

/** `git` の応答を待つ上限。超えたら呼び出し側がその回を諦める。 */
export const GIT_TIMEOUT_MS = 5000

/** 受け取る標準出力の上限。超えると `git` の呼び出しごと失敗する。 */
export const MAX_OUTPUT_BYTES = 16 * 1024 * 1024

/** `git` 1回の結果。タイムアウトだけを分けるのは、その回を諦めるか「不明」にするかが
 * 呼び出し側で変わるため。 */
export type GitOutcome =
  | { readonly kind: "output"; readonly stdout: string }
  | { readonly kind: "failed" }
  | { readonly kind: "timed-out" }

/** `git cat-file --batch` 1回の結果。`contents` は渡した順（`requests` と同じ長さ）で、読めなかった
 * 対象（存在しない blob）は `undefined`。 */
export type BatchOutcome =
  | { readonly kind: "output"; readonly contents: readonly (string | undefined)[] }
  | { readonly kind: "failed" }
  | { readonly kind: "timed-out" }

/** `git` を起こす。例外を投げない（失敗は `failed` / `timed-out` として返す）。 */
export function runGit(cwd: string, args: readonly string[]): Promise<GitOutcome> {
  return new Promise((resolve) => {
    execFile(
      "git",
      args,
      { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES, encoding: "utf8" },
      (error, stdout) => {
        if (error === null) {
          resolve({ kind: "output", stdout })
        } else {
          // `timeout` で打ち切られたときだけ `killed` が立つ（終了コードが 0 でないときは立たない）。
          resolve({ kind: error.killed === true ? "timed-out" : "failed" })
        }
      },
    )
  })
}

/**
 * `git cat-file --batch` を1回起こし、`requests`（`<コミット>:<パス>` または blob の
 * sha そのものの並び）を渡した順に読む。バイト列として切り出す（`--batch` の1件は
 * `<sha> <type> <size>\n` の見出し行の次にちょうど `<size>` バイトの中身、そのあとに区切りの
 * 改行が1つ続く形なので、UTF-8 の文字数ではなくバイト数で進める）。例外を投げない
 * （失敗は `failed` / `timed-out`）。
 */
export function runGitCatFileBatch(
  cwd: string,
  requests: readonly string[],
): Promise<BatchOutcome> {
  if (requests.length === 0) {
    return Promise.resolve({ kind: "output", contents: [] })
  }

  return new Promise((resolve) => {
    const child = spawn("git", ["cat-file", "--batch"], { cwd })
    const chunks: Buffer[] = []
    let receivedBytes = 0
    let settled = false

    const finish = (outcome: BatchOutcome): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      child.kill()
      resolve(outcome)
    }

    const timer = setTimeout(() => finish({ kind: "timed-out" }), GIT_TIMEOUT_MS)

    child.stdout.on("data", (chunk: Buffer) => {
      receivedBytes += chunk.length
      if (receivedBytes > MAX_OUTPUT_BYTES) {
        finish({ kind: "failed" })
        return
      }
      chunks.push(chunk)
    })
    child.on("error", () => finish({ kind: "failed" }))
    child.on("close", (code) => {
      if (settled) {
        return
      }
      if (code !== 0) {
        finish({ kind: "failed" })
        return
      }
      settled = true
      clearTimeout(timer)
      resolve({
        kind: "output",
        contents: parseCatFileBatchOutput(Buffer.concat(chunks), requests.length),
      })
    })

    child.stdin.write(requests.map((request) => `${request}\n`).join(""))
    child.stdin.end()
  })
}

/** {@link runGitCatFileBatch} の出力を、送った順の `count` 件に割る。 */
function parseCatFileBatchOutput(buffer: Buffer, count: number): readonly (string | undefined)[] {
  const results: (string | undefined)[] = []
  let pos = 0

  for (let i = 0; i < count; i++) {
    const newlineIndex = buffer.indexOf(0x0a, pos)
    if (newlineIndex === -1) {
      results.push(undefined)
      continue
    }

    const headerLine = buffer.toString("utf8", pos, newlineIndex)
    pos = newlineIndex + 1

    const size = blobSizeOf(headerLine)
    if (size === undefined) {
      results.push(undefined)
      continue
    }

    results.push(buffer.toString("utf8", pos, pos + size))
    pos += size + 1 // 中身のバイトと、そのあとの区切りの改行を1つ読み飛ばす。
  }

  return results
}

/** `<sha> <type> <size>` なら `<size>`、`<input> missing` なら `undefined`。 */
function blobSizeOf(headerLine: string): number | undefined {
  const parts = headerLine.split(" ")
  if (parts.length !== 3) {
    return undefined
  }
  const size = Number(parts[2])
  return Number.isInteger(size) && size >= 0 ? size : undefined
}
