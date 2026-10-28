// ワークフローの設定（スキルの並び `steps`）を画面に見せる形と、画面から書いた結果の形。
// 欄の名前・値の語彙・既定はどれもワークフローの設定コマンド（`tw config --schema`）から来て、ここには書かない。

import { z } from "zod"

/** どのリポジトリの設定か。面の見出しの下に出す。 */
export type WorkflowSettingRepository = {
  /** 作業ツリーの名前（帯に出すプロジェクト名と同じ値）。 */
  readonly worktreeName: string
  /** `.tw/config.toml` の絶対パス。 */
  readonly configPath: string
}

/** 並びに置ける候補1つ。 */
export type WorkflowSettingChoice = {
  readonly value: string
  readonly label: string
  /** 日本語の段の名前。 */
  readonly title: string
  readonly description: string
}

/**
 * スキルの並びの欄。
 * `current` は実行の順の全名で、`.tw/config.toml` に書いてある値か、書いていなければワークフローが決めた既定。`values` に無い名前を含みうる。
 */
export type WorkflowSettingStepsField = {
  readonly kind: "steps"
  readonly key: string
  readonly label: string
  readonly description: string
  readonly values: readonly WorkflowSettingChoice[]
  readonly current: readonly string[]
}

/** 選択肢1つ。 */
export type WorkflowSettingOptionValue = {
  readonly value: string
  readonly label: string
  readonly description: string
}

/** 決められた選択肢から1つを選ぶ欄。`current` は書いてある値か既定。 */
export type WorkflowSettingChoiceField = {
  readonly kind: "choice"
  readonly key: string
  readonly label: string
  readonly description: string
  readonly values: readonly WorkflowSettingOptionValue[]
  readonly current: string
}

/** コマンド1行を書く欄。`current` は書いてある値か既定。 */
export type WorkflowSettingCommandField = {
  readonly kind: "command"
  readonly key: string
  readonly label: string
  readonly description: string
  readonly current: string
}

/** tsukumo が読む欄1つ。 */
export type WorkflowSettingField =
  | WorkflowSettingStepsField
  | WorkflowSettingChoiceField
  | WorkflowSettingCommandField

/** 欄を出せないわけ。 */
export type WorkflowSettingUnavailableReason =
  | "tw-missing"
  | "schema-unsupported"
  | "config-missing"
  | "config-unreadable"

/**
 * ワークフローの設定の面に出すもの。
 * `unavailable` の `detail` は、`tw-missing` なら探した場所、`config-unreadable` なら終了コードの意味か、出力を読めなかったことを言う1行で、ほかは空。
 */
export type WorkflowSettingView =
  | {
      readonly kind: "available"
      readonly repository: WorkflowSettingRepository
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
    kind: z.literal("steps"),
    key: z.string(),
    label: z.string(),
    description: z.string(),
    values: z
      .array(
        z.object({
          value: z.string(),
          label: z.string(),
          title: z.string(),
          description: z.string(),
        }),
      )
      .readonly(),
    current: z.array(z.string()).readonly(),
  }),
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
    kind: z.literal("command"),
    key: z.string(),
    label: z.string(),
    description: z.string(),
    current: z.string(),
  }),
])

/** 配る形そのもの（{@link WorkflowSettingView} と同じ鍵）。 */
export const workflowSettingViewSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("available"),
    repository: repositorySchema,
    fields: z.array(fieldSchema).readonly(),
  }),
  z.object({
    kind: z.literal("unavailable"),
    repository: repositorySchema,
    reason: z.enum(["tw-missing", "schema-unsupported", "config-missing", "config-unreadable"]),
    detail: z.string(),
  }),
])

/** 入口のスキル1つ。`value` は保存して送る名前、`title` は画面に出す名前。 */
export type WorkflowEntry = {
  readonly value: string
  readonly title: string
}

/** 配る形そのもの（{@link WorkflowEntry} の並び）。読めないときは空。 */
export const workflowEntriesSchema = z
  .array(z.object({ value: z.string(), title: z.string() }))
  .readonly()

/** 配る形そのもの（{@link WorkflowSettingChange} と同じ鍵）。 */
export const workflowSettingChangeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("view"), view: workflowSettingViewSchema }),
  z.object({ kind: z.literal("failed"), key: z.string(), message: z.string() }),
])
