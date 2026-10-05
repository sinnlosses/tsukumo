// プロジェクトの設定（起動先の `.tsukumo/project.json`）の形と検証。
// tsukumo が動くときに読むのはこのファイルだけで、CLAUDE.md や git の状態から値を推し量らない。
//
// ファイルI/Oは持たない。ファイルを読むのは `readProjectSettings`。

import { omit } from "remeda"
import { z } from "zod"

/** 起動先からの相対パス。 */
export const PROJECT_SETTINGS_PATH = ".tsukumo/project.json"

/** 「tsukumo に頼む」で送る文面の既定。`{id}` をタスクIDに置き換えて送る。 */
export const DEFAULT_RUN_PROMPT = "/next-task {id}"

/** 文面のひな形の `{id}` をタスクIDに置き換える。 */
export function runPromptOf(template: string, taskId: string): string {
  return template.replaceAll("{id}", taskId)
}

export type TaskSettings = {
  readonly mainBranch: string
  readonly runPrompt: string
}

/** `tasks` の値。`"off"` はタスク運用を使わないと決めたプロジェクト。 */
export type ProjectTasks = TaskSettings | "off"

/**
 * プロジェクトの設定を読んだ結果。
 * - `none`: 設定が無い（ファイルが無い・`tasks` が無い）
 * - `off`: `tasks` が `"off"`（タスク運用を使わない）
 * - `invalid`: 読めない（JSON が壊れている・形が違う）。既定へ倒さない
 * - `read`: 読めた
 */
export type ProjectSettingsRead =
  | { readonly kind: "none" }
  | { readonly kind: "off" }
  | { readonly kind: "invalid" }
  | { readonly kind: "read"; readonly tasks: TaskSettings }

/** 主ブランチ名の長さの上限。形の検査ではなく素朴な上限（枝があるかは読む側が `git` で確かめる）。 */
export const MAX_MAIN_BRANCH_LENGTH = 200

/** 頼む文面の長さの上限。 */
export const MAX_RUN_PROMPT_LENGTH = 1_000

const taskSettingsSchema = z.strictObject({
  mainBranch: z.string().min(1).max(MAX_MAIN_BRANCH_LENGTH),
  runPrompt: z.string().min(1).max(MAX_RUN_PROMPT_LENGTH),
})

/** 画面から保存するときの `tasks` の形。 */
export const projectTasksSchema = z.union([taskSettingsSchema, z.literal("off")])

const projectSettingsSchema = z.strictObject({
  tasks: z
    .union([
      taskSettingsSchema
        .extend({
          runPrompt: taskSettingsSchema.shape.runPrompt.default(DEFAULT_RUN_PROMPT),
          // 以前の版が書いたタスクの置き場の欄。置き場は Beads だけなので、`beads` なら受けて読み捨てる。
          store: z.literal("beads").optional(),
        })
        .transform((tasks) => omit(tasks, ["store"])),
      z.literal("off"),
    ])
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
  if (tasks === undefined) {
    return { kind: "none" }
  }
  return tasks === "off" ? { kind: "off" } : { kind: "read", tasks }
}

/** 画面から保存する `.tsukumo/project.json` の中身。 */
export function projectSettingsContentOf(tasks: ProjectTasks): string {
  return `${JSON.stringify({ tasks }, undefined, 2)}\n`
}

/** 下書きの欄1つ。`inferred` は `origin/HEAD` から推し量った値か（画面は点線で描く）。 */
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
  readonly mainBranch: ProjectSettingsDraftField<string>
  readonly runPrompt: ProjectSettingsDraftField<string>
}

export const projectSettingsDraftSchema = z.object({
  file: z.enum(["none", "off", "invalid", "read"]),
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
