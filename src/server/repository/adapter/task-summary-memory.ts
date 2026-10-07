// タスク一覧の記憶。ファイルに触るのはここだけで、置き場は `~/.tsukumo/task-summary.json`。
// 入るのは作業ディレクトリごとに最後に読めたタスク一覧（進捗管理の要約と本文）だけで、会話は入らない。本文を含むのでログには出さない。

import { join } from "node:path"

import { z } from "zod"

import type { TaskSummaryItem } from "../../../shared/repository/task-summary.ts"
import { readJsonFile, writeJsonFile } from "../../adapter/lib/json-file.ts"
import { tsukumoHomeDir } from "../../adapter/tsukumo-home.ts"

const TASK_SUMMARY_MEMORY_FILE_NAME = "task-summary.json"

/** ファイルの形の版。形を変えたら上げ、古いファイルと見分ける。 */
const TASK_SUMMARY_MEMORY_FORMAT_VERSION = 2 satisfies number

/** 覚える作業ディレクトリの数。超えたら古いものから落とす。 */
export const TASK_SUMMARY_MEMORY_LIMIT = 8

const taskLocationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("issue"), url: z.string() }),
  z.object({ kind: z.literal("none") }),
])

// JSON は `undefined` の欄を落とすので、`undefined` を持てる欄は欠けていてもよいものとして読む。
const taskSummaryItemSchema = z.object({
  id: z.string(),
  summary: z.string(),
  status: z.string().optional(),
  difficulty: z.string().optional(),
  loopable: z.string().optional(),
  dependencies: z.array(z.string()),
  waitingFor: z.array(z.string()),
  assignee: z.string().optional(),
  body: z.string(),
  location: taskLocationSchema,
})

const taskSummaryMemoryFileSchema = z.object({
  v: z.literal(TASK_SUMMARY_MEMORY_FORMAT_VERSION),
  entries: z.array(z.object({ cwd: z.string(), items: z.array(taskSummaryItemSchema) })),
})

type MemoryEntry = { readonly cwd: string; readonly items: readonly TaskSummaryItem[] }

export function taskSummaryMemoryPath(): string {
  return join(tsukumoHomeDir(), TASK_SUMMARY_MEMORY_FILE_NAME)
}

/** 作業ディレクトリで最後に読めた一覧。ファイルが無い・壊れている・版や形が違う・その作業ディレクトリの組が無いときは `undefined`。 */
export function readTaskSummaryMemory(
  cwd: string,
  path: string = taskSummaryMemoryPath(),
): readonly TaskSummaryItem[] | undefined {
  return readEntries(path).find((entry) => entry.cwd === cwd)?.items
}

/** 作業ディレクトリの一覧を先頭に置き、上限を超えた古い組を落として丸ごと書く。失敗しても例外を投げない。 */
export function writeTaskSummaryMemory(
  cwd: string,
  items: readonly TaskSummaryItem[],
  path: string = taskSummaryMemoryPath(),
): void {
  const others = readEntries(path).filter((entry) => entry.cwd !== cwd)
  const entries = [{ cwd, items }, ...others].slice(0, TASK_SUMMARY_MEMORY_LIMIT)
  writeJsonFile(path, { v: TASK_SUMMARY_MEMORY_FORMAT_VERSION, entries })
}

function readEntries(path: string): readonly MemoryEntry[] {
  const parsed = taskSummaryMemoryFileSchema.safeParse(readJsonFile(path))
  if (!parsed.success) {
    return []
  }
  return parsed.data.entries.map((entry) => ({
    cwd: entry.cwd,
    items: entry.items.map(
      (item) =>
        ({
          id: item.id,
          summary: item.summary,
          status: item.status,
          difficulty: item.difficulty,
          loopable: item.loopable,
          dependencies: item.dependencies,
          waitingFor: item.waitingFor,
          assignee: item.assignee,
          body: item.body,
          location: item.location,
        }) satisfies TaskSummaryItem,
    ),
  }))
}
