// この作業ツリーで着手中のタスクとその段を、tw の読む口（`tw status --claims`）から読む。
// tw の内部の置き場（着手の印のディレクトリ・台帳）は読まない。
// 口は子プロセスで重い（1回およそ0.3秒）ので、作業ツリーごとに結果を一定の時間だけ控える。成功も失敗も控える。
// 例外を投げない。打てない・読めない・着手が1件でないときは「着手していない」に倒す。

import { execFileSync } from "node:child_process"

import { z } from "zod"

/** 着手中のタスクと、その最後の段（無ければ `undefined`）。 */
export type OpenTask = { readonly taskId: string; readonly stage: string | undefined }

/** 呼んだ時刻（エポックミリ秒）を渡して、着手中のタスクを返す。 */
export type OpenTaskReader = (now: number) => OpenTask | undefined

/** 口の出力（1行 JSON）を返す。打てなければ `undefined`。 */
export type TwClaimsRunner = () => string | undefined

const CLAIMS_TTL_MS = 10_000
const TW_CLAIMS_TIMEOUT_MS = 5000

const claimsSchema = z.object({
  claims: z.array(z.object({ task: z.string(), stage: z.string().nullable() })),
})

/** `tw`（パスか、PATH から引く名前）を作業先 `cwd` で打つ。 */
export function twClaimsRunner(tw: string, cwd: string): TwClaimsRunner {
  return () => {
    try {
      return execFileSync(tw, ["status", "--claims"], {
        cwd,
        timeout: TW_CLAIMS_TIMEOUT_MS,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })
    } catch {
      return undefined
    }
  }
}

/** 控えの時間のあいだは `run` を打ち直さない読み手を作る。 */
export function createOpenTaskReader(run: TwClaimsRunner): OpenTaskReader {
  let cached: { readonly readAt: number; readonly task: OpenTask | undefined } | undefined
  return (now) => {
    if (cached !== undefined && now >= cached.readAt && now - cached.readAt < CLAIMS_TTL_MS) {
      return cached.task
    }
    const task = parseOpenTask(run())
    cached = { readAt: now, task }
    return task
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
