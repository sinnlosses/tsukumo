// ワークフローの設定コマンド（`tw config --schema`・`tw config --json`・`tw config set`）の出力を、画面に見せる形へ畳む。
// 欄の名前・値の語彙・既定は schema が言うものだけを使い、ここには書かない。

import { z } from "zod"

import {
  workflowEntriesSchema,
  type WorkflowEntry,
  type WorkflowSettingChange,
  type WorkflowSettingField,
  type WorkflowSettingRepository,
  type WorkflowSettingUnavailableReason,
  type WorkflowSettingView,
} from "../../../shared/workflow-setting/workflow-setting.ts"

/** `tw` を1回起こした結果。起動できなかった（ENOENT）ときだけ `missing`。 */
export type TwOutcome =
  | { readonly kind: "missing" }
  | {
      readonly kind: "ran"
      readonly exitCode: number
      readonly stdout: string
      readonly stderr: string
    }

/** 設定コマンドを打つ口（中身は配線が渡す）。 */
export type TwConfigPort = {
  readonly schema: () => Promise<TwOutcome>
  readonly config: () => Promise<TwOutcome>
  readonly entries: () => Promise<TwOutcome>
  readonly set: (key: string, value: string) => Promise<TwOutcome>
}

/** どの `tw` を呼び、どのリポジトリの設定か。 */
export type WorkflowSettingPlace = {
  readonly worktreeName: string
  /** `tw` が言う `.tw/config.toml` の相対パス（リポジトリの根から）を絶対パスにする。 */
  readonly configPathOf: (relativePath: string) => string
  /** 呼ぶ `tw` の場所。見つからないときに画面へ出す。 */
  readonly twLocation: string
}

/** `tw` が設定のファイルを言わないうちに使う相対パス（設定コマンドの既定の置き場）。 */
const DEFAULT_CONFIG_PATH = ".tw/config.toml"

const EXIT_CONFIG_MISSING = 6
const EXIT_CONFIG_INVALID = 3
const EXIT_USAGE = 2

const configOutputSchema = z.object({
  config: z.string(),
  keys: z.array(z.object({ key: z.string(), value: z.unknown() })),
})

const stepsEntrySchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string(),
  kind: z.literal("steps"),
  default: z.array(z.string()),
  values: z.array(
    z.object({
      value: z.string(),
      label: z.string(),
      // 古い `tw` は返さない。`fieldOf` が `label` で埋める。
      title: z.string().optional(),
      description: z.string(),
    }),
  ),
})

const configSchemaSchema = z.object({
  schema: z.literal(2),
  keys: z.array(stepsEntrySchema),
})

const entriesOutputSchema = z.object({ entries: workflowEntriesSchema })

type ConfigSchema = z.infer<typeof configSchemaSchema>

type SchemaEntry = ConfigSchema["keys"][number]

/** 欄の形と今の値を読み、面に出すものを返す。例外を投げない。 */
export async function readWorkflowSetting(
  port: TwConfigPort,
  place: WorkflowSettingPlace,
): Promise<WorkflowSettingView> {
  const outcome = await port.schema()
  if (outcome.kind === "missing") {
    return unavailable(place, "tw-missing", place.twLocation)
  }
  const schema = parseConfigSchema(outcome)
  if (schema === undefined) {
    return unavailable(place, "schema-unsupported", "")
  }
  return foldConfig(await port.config(), schema, place)
}

/** 起動できる入口のスキルを読む。`tw` が無い・古い・出力が読めないときは空で、例外を投げない。 */
export async function readWorkflowEntries(port: TwConfigPort): Promise<readonly WorkflowEntry[]> {
  const outcome = await port.entries()
  if (outcome.kind === "missing" || outcome.exitCode !== 0) {
    return []
  }
  const parsed = parseJsonAs(entriesOutputSchema, outcome.stdout)
  return parsed === undefined ? [] : parsed.entries
}

/** 欄1つを書き、読み直した面か、ワークフローが断った理由を返す。例外を投げない。 */
export async function changeWorkflowSetting(
  port: TwConfigPort,
  place: WorkflowSettingPlace,
  key: string,
  value: string,
): Promise<WorkflowSettingChange> {
  const outcome = await port.set(key, value)
  if (outcome.kind === "missing") {
    return { kind: "view", view: unavailable(place, "tw-missing", place.twLocation) }
  }
  if (outcome.exitCode === EXIT_CONFIG_MISSING) {
    return { kind: "view", view: unavailable(place, "config-missing", "") }
  }
  if (outcome.exitCode === 0) {
    return { kind: "view", view: await readWorkflowSetting(port, place) }
  }
  return { kind: "failed", key, message: reasonOf(outcome) }
}

function parseConfigSchema(
  outcome: TwOutcome & { readonly kind: "ran" },
): ConfigSchema | undefined {
  if (outcome.exitCode !== 0) {
    return undefined
  }
  return parseJsonAs(configSchemaSchema, outcome.stdout)
}

function stepsOf(raw: unknown, fallback: readonly string[]): readonly string[] {
  const parsed = z.array(z.string()).safeParse(raw)
  return parsed.success ? parsed.data : fallback
}

function parseJsonAs<T>(schema: z.ZodType<T>, text: string): T | undefined {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return undefined
  }
  const parsed = schema.safeParse(json)
  return parsed.success ? parsed.data : undefined
}

function exitReasonOf(exitCode: number): string {
  if (exitCode === EXIT_CONFIG_INVALID) {
    return "設定ファイルが不正で、tw が読めない"
  }
  if (exitCode === EXIT_USAGE) {
    return "tw が config --json を知らない古い版"
  }
  return `終了コード ${String(exitCode)}`
}

function foldConfig(
  outcome: TwOutcome,
  schema: ConfigSchema,
  place: WorkflowSettingPlace,
): WorkflowSettingView {
  if (outcome.kind === "missing") {
    return unavailable(place, "tw-missing", place.twLocation)
  }
  if (outcome.exitCode === EXIT_CONFIG_MISSING) {
    return unavailable(place, "config-missing", "")
  }
  if (outcome.exitCode !== 0) {
    return unavailable(place, "config-unreadable", exitReasonOf(outcome.exitCode))
  }
  const config = parseJsonAs(configOutputSchema, outcome.stdout)
  if (config === undefined) {
    return unavailable(place, "config-unreadable", "tw config --json の出力が JSON として読めない")
  }
  const values = new Map(config.keys.map((entry) => [entry.key, entry.value] as const))
  return {
    kind: "available",
    repository: repositoryOf(place, config.config),
    fields: schema.keys.map((entry) => fieldOf(entry, values.get(entry.key))),
  }
}

function fieldOf(entry: SchemaEntry, raw: unknown): WorkflowSettingField {
  return {
    kind: "steps",
    key: entry.key,
    label: entry.label,
    description: entry.description,
    values: entry.values.map((choice) => ({
      value: choice.value,
      label: choice.label,
      title: choice.title ?? choice.label,
      description: choice.description,
    })),
    current: stepsOf(raw, entry.default),
  }
}

function unavailable(
  place: WorkflowSettingPlace,
  reason: WorkflowSettingUnavailableReason,
  detail: string,
): WorkflowSettingView {
  return {
    kind: "unavailable",
    repository: repositoryOf(place, DEFAULT_CONFIG_PATH),
    reason,
    detail,
  }
}

function repositoryOf(
  place: WorkflowSettingPlace,
  relativeConfigPath: string,
): WorkflowSettingRepository {
  return { worktreeName: place.worktreeName, configPath: place.configPathOf(relativeConfigPath) }
}

/** `tw` が言った理由の1行（stderr の最初の行）。何も言わなければ終了コード。 */
function reasonOf(outcome: TwOutcome & { readonly kind: "ran" }): string {
  const line = outcome.stderr.split("\n").find((text) => text.trim() !== "")
  return line === undefined ? `終了コード ${String(outcome.exitCode)}` : line.trim()
}
