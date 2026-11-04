// タスクの再試集の1件（test/harness-replay/<ID>/）の replay.json を読んで検査する、という概念1つを持つ。
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { z } from "zod"

const REPLAY_DIRECTORY = "test/harness-replay"

const replayCaseSchema = z.object({
  id: z.string().min(1),
  difficulty: z.enum(["haiku", "sonnet", "opus"]),
  kind: z.string().min(1),
  base: z.string().min(1),
  after: z.string().min(1),
  checkFiles: z.array(z.string().min(1)).min(1),
  command: z
    .array(z.string().min(1))
    .min(2)
    .refine(([program]) => program === "pnpm", { message: "判定コマンドは pnpm で始める" }),
})

export type ReplayCase = z.infer<typeof replayCaseSchema>

/** タスクの再試集の置き場から再試の1件を読む。形が崩れていれば例外を投げる。 */
export function readReplayCase(repositoryRoot: string, id: string): ReplayCase {
  const directory = join(repositoryRoot, REPLAY_DIRECTORY, id)
  const replayCase = replayCaseSchema.parse(
    JSON.parse(readFileSync(join(directory, "replay.json"), "utf8")),
  )
  if (replayCase.id !== id) {
    throw new Error(`${id} の replay.json の id が ${replayCase.id} になっている`)
  }
  return replayCase
}

/** 課題の本文の写し。claude に渡す依頼の元になる。 */
export function readReplayTaskText(repositoryRoot: string, id: string): string {
  return readFileSync(join(repositoryRoot, REPLAY_DIRECTORY, id, "task.txt"), "utf8")
}
