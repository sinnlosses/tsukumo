// プロジェクトの設定（起動先の `.tsukumo/project.json`）の形と検証。
// tsukumo が動くときに読むのはこのファイルだけで、CLAUDE.md や git の状態から値を推し量らない。
//
// ファイルI/Oは持たない。ファイルを読むのは `readProjectSettings`。

import { z } from "zod"

/** 起動先からの相対パス。 */
export const PROJECT_SETTINGS_PATH = ".tsukumo/project.json"

export const TASK_STORES = ["files", "beads"] as const

/** タスクの置き場。`files` は `main` の `develop/task/`、`beads` は `bd`。 */
export type TaskStore = (typeof TASK_STORES)[number]

/** 「tsukumo に頼む」で送る文面の既定。`{id}` をタスクIDに置き換えて送る。 */
export const DEFAULT_RUN_PROMPT = "/next-task {id}"

/** 文面のひな形の `{id}` をタスクIDに置き換える。 */
export function runPromptOf(template: string, taskId: string): string {
  return template.replaceAll("{id}", taskId)
}

export type TaskSettings = {
  readonly store: TaskStore
  readonly mainBranch: string
  readonly runPrompt: string
}

/**
 * プロジェクトの設定を読んだ結果。
 * - `none`: タスク運用なし（ファイルが無い・`tasks` が無い）
 * - `invalid`: 読めない（JSON が壊れている・形が違う）。既定へ倒さない
 * - `read`: 読めた
 */
export type ProjectSettingsRead =
  | { readonly kind: "none" }
  | { readonly kind: "invalid" }
  | { readonly kind: "read"; readonly tasks: TaskSettings }

/** 主ブランチ名の長さの上限。形の検査ではなく素朴な上限（枝があるかは読む側が `git` で確かめる）。 */
export const MAX_MAIN_BRANCH_LENGTH = 200

/** 頼む文面の長さの上限。 */
export const MAX_RUN_PROMPT_LENGTH = 1_000

/** 画面から保存するときの `tasks` の形。ファイルの検証も同じ欄を使う。 */
export const taskSettingsSchema = z.strictObject({
  store: z.enum(TASK_STORES),
  mainBranch: z.string().min(1).max(MAX_MAIN_BRANCH_LENGTH),
  runPrompt: z.string().min(1).max(MAX_RUN_PROMPT_LENGTH),
})

const projectSettingsSchema = z.strictObject({
  tasks: taskSettingsSchema
    .extend({ runPrompt: taskSettingsSchema.shape.runPrompt.default(DEFAULT_RUN_PROMPT) })
    .optional(),
})

/** 完全な参照名で指す（ブランチ名だけだと同名のタグやファイルと曖昧になりうる）。 */
export function mainBranchRefOf(tasks: TaskSettings): string {
  return `refs/heads/${tasks.mainBranch}`
}

/** 在るファイルの中身を検証する（無いファイルは呼ぶ側が `none` にする）。 */
export function projectSettingsOf(content: string): ProjectSettingsRead {
  const parsed = projectSettingsSchema.safeParse(parseJson(content))
  if (!parsed.success) {
    return { kind: "invalid" }
  }
  const { tasks } = parsed.data
  return tasks === undefined ? { kind: "none" } : { kind: "read", tasks }
}

/** 画面から保存する `.tsukumo/project.json` の中身。 */
export function projectSettingsContentOf(tasks: TaskSettings): string {
  return `${JSON.stringify({ tasks }, undefined, 2)}\n`
}

/** 下書きの欄1つ。`inferred` は「## タスク運用」節や `origin/HEAD` から推し量った値か（画面は点線で描く）。 */
export type ProjectSettingsDraftField<T> = {
  readonly value: T
  readonly inferred: boolean
}

/**
 * 書く画面に出す下書き。`file` はいまのファイルの状態（`ProjectSettingsRead` の `kind`）。
 * 推し量った値は画面に出すだけで、tsukumo の動作には使わない（動作はファイルだけで決まる）。
 */
export type ProjectSettingsDraft = {
  readonly file: ProjectSettingsRead["kind"]
  readonly store: ProjectSettingsDraftField<TaskStore>
  readonly mainBranch: ProjectSettingsDraftField<string>
  readonly runPrompt: ProjectSettingsDraftField<string>
}

export const projectSettingsDraftSchema = z.object({
  file: z.enum(["none", "invalid", "read"]),
  store: z.object({ value: z.enum(TASK_STORES), inferred: z.boolean() }),
  mainBranch: z.object({ value: z.string(), inferred: z.boolean() }),
  runPrompt: z.object({ value: z.string(), inferred: z.boolean() }),
}) satisfies z.ZodType<ProjectSettingsDraft>

/** 構文が壊れていれば `undefined`（スキーマが `invalid` にする）。 */
function parseJson(content: string): unknown {
  try {
    return JSON.parse(content)
  } catch {
    return undefined
  }
}
