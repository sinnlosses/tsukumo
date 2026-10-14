// ワークフローの設定（`flow` と `parts.<枠>`）を画面に見せる形と、画面から書いた結果の形。
// 欄の名前・値の語彙・既定はどれもワークフローの設定の口（`tw config --schema`）から来て、ここには書かない。

import { z } from "zod"

/** どのリポジトリの設定か。面の見出しの下に出す。 */
export type WorkflowSettingRepository = {
  /** 作業ツリーの名前（帯に出すプロジェクト名と同じ値）。 */
  readonly worktreeName: string
  /** `.tw/config.toml` の絶対パス。 */
  readonly configPath: string
}

/** `choice` の欄が取れる値1つ。 */
export type WorkflowSettingChoice = {
  readonly value: string
  readonly label: string
  readonly description: string
}

/**
 * 画面に描く欄1つ。`current` は `.tw/config.toml` に書いてある値か、書いていなければワークフローが決めた既定。
 * `part` の値は既定の語・なしの語・パーツの全名のどれかで、候補の一覧は SDK のスキルとエージェントから画面が作る。
 */
export type WorkflowSettingField =
  | {
      readonly kind: "choice"
      readonly key: string
      readonly label: string
      readonly description: string
      readonly values: readonly WorkflowSettingChoice[]
      readonly current: string
    }
  | {
      readonly kind: "part"
      readonly key: string
      readonly label: string
      readonly description: string
      readonly candidates: "agent" | "skill"
      readonly allowNone: boolean
      readonly current: string
    }

/** 欄を出せないわけ。 */
export type WorkflowSettingUnavailableReason =
  | "tw-missing"
  | "schema-unsupported"
  | "config-missing"
  | "config-unreadable"

/**
 * ワークフローの設定の面に出すもの。
 * `unavailable` の `detail` は、`tw-missing` なら探した場所、`config-unreadable` なら `tw` が言った理由の1行で、ほかは空。
 */
export type WorkflowSettingView =
  | {
      readonly kind: "available"
      readonly repository: WorkflowSettingRepository
      readonly defaultWord: string
      readonly noneWord: string
      readonly fields: readonly WorkflowSettingField[]
    }
  | {
      readonly kind: "unavailable"
      readonly repository: WorkflowSettingRepository
      readonly reason: WorkflowSettingUnavailableReason
      readonly detail: string
    }

/**
 * 画面から1つの欄を書いた結果。
 * 書けたときと、書く前に `tw` や `.tw/config.toml` が無いと分かったときは、読み直した面（`view`）。
 * ワークフローが値を断ったときは `failed` で、`message` は `tw` が言った理由の1行。
 */
export type WorkflowSettingChange =
  | { readonly kind: "view"; readonly view: WorkflowSettingView }
  | { readonly kind: "failed"; readonly key: string; readonly message: string }

const repositorySchema = z.object({ worktreeName: z.string(), configPath: z.string() })

const fieldSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("choice"),
    key: z.string(),
    label: z.string(),
    description: z.string(),
    values: z
      .array(z.object({ value: z.string(), label: z.string(), description: z.string() }))
      .readonly(),
    current: z.string(),
  }),
  z.object({
    kind: z.literal("part"),
    key: z.string(),
    label: z.string(),
    description: z.string(),
    candidates: z.enum(["agent", "skill"]),
    allowNone: z.boolean(),
    current: z.string(),
  }),
])

/** 配る形そのもの（{@link WorkflowSettingView} と同じ鍵）。 */
export const workflowSettingViewSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("available"),
    repository: repositorySchema,
    defaultWord: z.string(),
    noneWord: z.string(),
    fields: z.array(fieldSchema).readonly(),
  }),
  z.object({
    kind: z.literal("unavailable"),
    repository: repositorySchema,
    reason: z.enum(["tw-missing", "schema-unsupported", "config-missing", "config-unreadable"]),
    detail: z.string(),
  }),
])

/** 配る形そのもの（{@link WorkflowSettingChange} と同じ鍵）。 */
export const workflowSettingChangeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("view"), view: workflowSettingViewSchema }),
  z.object({ kind: z.literal("failed"), key: z.string(), message: z.string() }),
])
