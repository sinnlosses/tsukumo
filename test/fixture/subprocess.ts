// テストの中で子プロセス（`git`・`node` など）を起こす口。同期版（`execFileSync` /
// `spawnSync`）は使わない（`.oxlintrc.json` が test/ で止める）。
//
// 同期で待つと、子が詰まったときにテストの時間切れが効かず、1件の詰まりが `pnpm run check`
// 全体を止めうる。非同期で待てば、詰まってもその1件がテストの時間切れで落ちて次へ進む。

import { spawn } from "node:child_process"

export type SubprocessResult = {
  /** 終了コード。シグナルで終わったときは `undefined`。 */
  readonly exitCode: number | undefined
  readonly stdout: string
  readonly stderr: string
}

export type SubprocessOptions = {
  readonly cwd?: string
  readonly env?: Readonly<Record<string, string | undefined>>
  /** 標準入力へ書いて閉じる中身。省くと標準入力は空のまま閉じる。 */
  readonly input?: string
}

/** `command` を起こし、終わるまで待って終了コードと出力を返す。起こせなかったときだけ reject する。
 * 標準入力を読まずに終わる `command` では書き込みが `EPIPE` になりうるが、それは失敗ではないので
 * 無視し、終了コードは `close` の側で見る。 */
export function runSubprocess(
  command: string,
  args: readonly string[],
  options: SubprocessOptions = {},
): Promise<SubprocessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { cwd: options.cwd, env: options.env })
    const stdout: string[] = []
    const stderr: string[] = []
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk: string) => stdout.push(chunk))
    child.stderr.on("data", (chunk: string) => stderr.push(chunk))
    child.on("error", reject)
    child.stdin.on("error", () => {})
    child.on("close", (code) => {
      resolve({
        exitCode: code === null ? undefined : code,
        stdout: stdout.join(""),
        stderr: stderr.join(""),
      })
    })
    child.stdin.end(options.input ?? "")
  })
}

/** {@link runSubprocess} を待ち、終了コードが 0 でなければ stderr を添えて投げる。標準出力を返す。 */
export async function runSubprocessOrThrow(
  command: string,
  args: readonly string[],
  options: SubprocessOptions = {},
): Promise<string> {
  const result = await runSubprocess(command, args, options)
  if (result.exitCode !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} が終了コード ${String(result.exitCode)} で終わった: ${result.stderr}`,
    )
  }
  return result.stdout
}
