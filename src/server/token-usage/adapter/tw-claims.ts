// この作業ツリーで着手中のタスクとその段を、tw の読む口（`tw status --claims`）から読む。
// tw の内部の置き場（着手の印のディレクトリ・台帳）は読まない。
// 口は子プロセスで重い（1回およそ0.3秒）ので、読み始める `prefetch` と控えだけを返す `read` に分ける。
// `read` は子プロセスを起こさず、イベントループを止めない。成功も失敗も控える。
// 例外を投げない。打てない・読めない・着手が1件でないときは「着手していない」に倒す。

import { execFile } from "node:child_process"

import { z } from "zod"

/** 着手中のタスクと、その最後の段（無ければ `undefined`）。 */
export type OpenTask = { readonly taskId: string; readonly stage: string | undefined }

/** 着手中のタスクの読み手。 */
export type OpenTaskReader = {
  /** `now` は呼んだ時刻（エポックミリ秒）。控えが古く、読みが走っていなければ、口を非同期に打って結果を控える。 */
  readonly prefetch: (now: number) => void
  /** 最後に読めた控えを、古くても返す。一度も控えていなければ `undefined`。 */
  readonly read: () => OpenTask | undefined
}

/** 口の出力（1行 JSON）を返す。打てなければ `undefined`。拒否しない。 */
export type TwClaimsRunner = () => Promise<string | undefined>

const CLAIMS_TTL_MS = 10_000
const TW_CLAIMS_TIMEOUT_MS = 5000

const claimsSchema = z.object({
  claims: z.array(z.object({ task: z.string(), stage: z.string().nullable() })),
})

/** `tw`（パスか、PATH から引く名前）を作業先 `cwd` で打つ。 */
export function twClaimsRunner(tw: string, cwd: string): TwClaimsRunner {
  return () =>
    new Promise((resolve) => {
      try {
        execFile(
          tw,
          ["status", "--claims"],
          { cwd, timeout: TW_CLAIMS_TIMEOUT_MS, encoding: "utf8" },
          (error, stdout) => {
            resolve(error === null ? stdout : undefined)
          },
        )
      } catch {
        resolve(undefined)
      }
    })
}

export function createOpenTaskReader(run: TwClaimsRunner): OpenTaskReader {
  let cached: { readonly readAt: number; readonly task: OpenTask | undefined } | undefined
  let running = false
  const isFresh = (now: number): boolean =>
    cached !== undefined && now >= cached.readAt && now - cached.readAt < CLAIMS_TTL_MS
  return {
    prefetch: (now) => {
      if (running || isFresh(now)) {
        return
      }
      running = true
      run()
        .catch(() => undefined)
        .then((output) => {
          cached = { readAt: now, task: parseOpenTask(output) }
          running = false
        })
    },
    read: () => cached?.task,
  }
}

function parseOpenTask(output: string | undefined): OpenTask | undefined {
  if (output === undefined) {
    return undefined
  }
  try {
    const parsed = claimsSchema.safeParse(JSON.parse(output))
    const [claim, ...rest] = parsed.success ? parsed.data.claims : []
    return claim === undefined || rest.length > 0
      ? undefined
      : { taskId: claim.task, stage: claim.stage ?? undefined }
  } catch {
    return undefined
  }
}
