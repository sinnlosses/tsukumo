// ワークフローの設定の口（`tw config --schema`・`tw config`・`tw config set`）の出力を、画面に見せる形へ畳む。
// 欄の名前・値の語彙・既定は schema が言うものだけを使い、ここには書かない。

import { z } from "zod"

import type {
  WorkflowSettingChange,
  WorkflowSettingField,
  WorkflowSettingRepository,
  WorkflowSettingUnavailableReason,
  WorkflowSettingView,
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

/** 設定の口を打つ口（中身は配線が渡す）。 */
export type TwConfigPort = {
  /** `version` が 2 のときは `--schema --version 2`、省くと引数なしの `--schema`。 */
  readonly schema: (version?: 2) => Promise<TwOutcome>
  readonly config: () => Promise<TwOutcome>
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

/** `tw` が設定のファイルを言わないうちに使う相対パス（設定の口の既定の置き場）。 */
const DEFAULT_CONFIG_PATH = ".tw/config.toml"

const EXIT_CONFIG_MISSING = 6

const choiceEntrySchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string(),
  kind: z.literal("choice"),
  default: z.string(),
  values: z.array(z.object({ value: z.string(), label: z.string(), description: z.string() })),
})

const stepsEntrySchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string(),
  kind: z.literal("steps"),
  default: z.array(z.string()),
  values: z.array(z.object({ value: z.string(), label: z.string(), description: z.string() })),
})

const configSchemaV2Schema = z.object({
  schema: z.literal(2),
  keys: z.array(z.discriminatedUnion("kind", [choiceEntrySchema, stepsEntrySchema])),
})

const configSchemaSchema = z.object({
  schema: z.literal(1),
  default_word: z.string(),
  none_word: z.string(),
  keys: z.array(
    z.discriminatedUnion("kind", [
      choiceEntrySchema,
      z.object({
        key: z.string(),
        label: z.string(),
        description: z.string(),
        kind: z.literal("part"),
        default: z.string(),
        candidates: z.enum(["agent", "skill"]),
        allow_none: z.boolean(),
      }),
    ]),
  ),
})

type ConfigSchemaV1 = z.infer<typeof configSchemaSchema>
type ConfigSchemaV2 = z.infer<typeof configSchemaV2Schema>

/** 読めた版の schema。schema 2 には既定の語・なしの語が無い。 */
type ConfigSchema =
  | { readonly version: 1; readonly body: ConfigSchemaV1 }
  | { readonly version: 2; readonly body: ConfigSchemaV2 }

type SchemaEntry = ConfigSchemaV1["keys"][number] | ConfigSchemaV2["keys"][number]

/** 欄の形と今の値を読み、面に出すものを返す。例外を投げない。 */
export async function readWorkflowSetting(
  port: TwConfigPort,
  place: WorkflowSettingPlace,
): Promise<WorkflowSettingView> {
  const versioned = await port.schema(2)
  if (versioned.kind === "missing") {
    return unavailable(place, "tw-missing", place.twLocation)
  }
  const schema = parseConfigSchema(versioned)
  if (schema !== undefined) {
    return foldConfig(await port.config(), schema, place)
  }
  const plain = await port.schema()
  if (plain.kind === "missing") {
    return unavailable(place, "tw-missing", place.twLocation)
  }
  const fallback = parseConfigSchema(plain)
  if (fallback === undefined) {
    return unavailable(place, "schema-unsupported", "")
  }
  return foldConfig(await port.config(), fallback, place)
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
  let json: unknown
  try {
    json = JSON.parse(outcome.stdout)
  } catch {
    return undefined
  }
  const v2 = configSchemaV2Schema.safeParse(json)
  if (v2.success) {
    return { version: 2, body: v2.data }
  }
  const v1 = configSchemaSchema.safeParse(json)
  return v1.success ? { version: 1, body: v1.data } : undefined
}

/** `steps` の今の値は1行の JSON の文字列の配列。読めなければ既定。 */
function stepsOf(raw: string | undefined, fallback: readonly string[]): readonly string[] {
  if (raw === undefined) {
    return fallback
  }
  try {
    const parsed = z.array(z.string()).safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : fallback
  } catch {
    return fallback
  }
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
  const rows = outcome.stdout
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => line.split("\t"))
  const configPath = rows.find((row) => row[0] === "CONFIG")?.[1]
  if (outcome.exitCode !== 0 || configPath === undefined) {
    return unavailable(place, "config-unreadable", reasonOf(outcome))
  }
  const values = new Map(
    rows.flatMap(([key, value]) =>
      key === undefined || value === undefined ? [] : [[key, value] as const],
    ),
  )
  const entries: readonly SchemaEntry[] = schema.body.keys
  return {
    kind: "available",
    repository: repositoryOf(place, configPath),
    defaultWord: schema.version === 1 ? schema.body.default_word : "",
    noneWord: schema.version === 1 ? schema.body.none_word : "",
    fields: entries.map((entry) => fieldOf(entry, values.get(entry.key))),
  }
}

function fieldOf(entry: SchemaEntry, raw: string | undefined): WorkflowSettingField {
  switch (entry.kind) {
    case "choice":
      return {
        kind: "choice",
        key: entry.key,
        label: entry.label,
        description: entry.description,
        values: entry.values,
        current: raw ?? entry.default,
      }
    case "steps":
      return {
        kind: "steps",
        key: entry.key,
        label: entry.label,
        description: entry.description,
        values: entry.values,
        current: stepsOf(raw, entry.default),
      }
    case "part":
      return {
        kind: "part",
        key: entry.key,
        label: entry.label,
        description: entry.description,
        candidates: entry.candidates,
        allowNone: entry.allow_none,
        current: raw ?? entry.default,
      }
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
