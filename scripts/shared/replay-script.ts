// 再演集の1件（test/harness-replay/<ID>/）の台本 replay.json を読んで検査する、という概念1つを持つ。
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { z } from "zod"

const REPLAY_DIRECTORY = "test/harness-replay"

const replayScriptSchema = z.object({
  id: z.string().min(1),
  difficulty: z.enum(["haiku", "sonnet", "opus"]),
  kind: z.string().min(1),
  base: z.string().min(1),
  after: z.string().min(1),
  checkFiles: z.array(z.string().min(1)).min(1),
  command: z
    .array(z.string().min(1))
    .min(2)
    .refine(([program]) => program === "pnpm", { message: "台本の command は pnpm で始める" }),
})

export type ReplayScript = z.infer<typeof replayScriptSchema>

/** 再演集の置き場から1件の台本を読む。形が崩れていれば例外を投げる。 */
export function readReplayScript(repositoryRoot: string, id: string): ReplayScript {
  const directory = join(repositoryRoot, REPLAY_DIRECTORY, id)
  const script = replayScriptSchema.parse(
    JSON.parse(readFileSync(join(directory, "replay.json"), "utf8")),
  )
  if (script.id !== id) {
    throw new Error(`${id} の replay.json の id が ${script.id} になっている`)
  }
  return script
}

/** 課題の本文の写し。claude に渡す依頼の元になる。 */
export function readReplayTaskText(repositoryRoot: string, id: string): string {
  return readFileSync(join(repositoryRoot, REPLAY_DIRECTORY, id, "task.txt"), "utf8")
}
