// テストの中で子プロセス（`git`・`bun` など）を起こす口。**同期版（`execFileSync` /
// `spawnSync`）は使わない**（`.oxlintrc.json` が test/ で止める）。
//
// bun の `spawnSync` には、子が終わったのに気づかず待ちが 100% CPU で空回りする不具合がある
// （docs/coding-standards.md「テスト」節）。空回りの最中は `spawnSync` 自身の `timeout` も効かず、
// 1回の固まりが `bun run check` 全体を止めうる。非同期の待ちはその経路を通らず、終了の知らせを
// 取りこぼしてもその1件がテストの時間切れで落ちて次へ進む（時間切れになったテストの子は
// bun test が止める）。

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

/** `command` を起こし、終わるまで待って終了コードと出力を返す。起こせなかったときだけ reject する。 */
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
