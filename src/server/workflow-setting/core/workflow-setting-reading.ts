// ワークフローの設定コマンド（`tw config --schema`・`tw config`・`tw config set`）の出力を、画面に見せる形へ畳む。
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

/** 設定コマンドを打つ口（中身は配線が渡す）。 */
export type TwConfigPort = {
  readonly schema: () => Promise<TwOutcome>
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

/** `tw` が設定のファイルを言わないうちに使う相対パス（設定コマンドの既定の置き場）。 */
const DEFAULT_CONFIG_PATH = ".tw/config.toml"

const EXIT_CONFIG_MISSING = 6

const stepsEntrySchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string(),
  kind: z.literal("steps"),
  default: z.array(z.string()),
  values: z.array(z.object({ value: z.string(), label: z.string(), description: z.string() })),
})

const configSchemaSchema = z.object({
  schema: z.literal(2),
  keys: z.array(stepsEntrySchema),
})

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
  const parsed = configSchemaSchema.safeParse(json)
  return parsed.success ? parsed.data : undefined
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
  return {
    kind: "available",
    repository: repositoryOf(place, configPath),
    fields: schema.keys.map((entry) => fieldOf(entry, values.get(entry.key))),
  }
}

function fieldOf(entry: SchemaEntry, raw: string | undefined): WorkflowSettingField {
  return {
    kind: "steps",
    key: entry.key,
    label: entry.label,
    description: entry.description,
    values: entry.values,
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
