// タスクの置き場（ファイル方式か Beads 方式か）を、設定ファイルの「## タスク運用」節の
// `- タスクの置き場:` 行から決める。規則は task-workflow の `layout.read_store` と同じ
// （WORKFLOW.md「ファイル配置と設定ファイル（AGENTS.md → CLAUDE.md の順）」「Beads 方式」）:
// AGENTS.md → CLAUDE.md のうち節を持つファイルを設定とし、行が無ければファイル方式。
// 両方に節がある・知らない値は「読めない」（task コマンドが INVALID にするのと同じ）。
//
// ファイルI/Oは持たない。`main` の上の設定ファイルを読むのは呼ぶ側。

export type TaskStore =
  | { readonly kind: "files" }
  | { readonly kind: "beads" }
  | { readonly kind: "invalid" }

/** 在る設定ファイルの中身を AGENTS.md → CLAUDE.md の順で渡す（無いファイルは渡さない）。 */
export function taskStoreOf(configContents: readonly string[]): TaskStore {
  const sections = configContents.flatMap(taskSectionsOf)
  if (sections.length > 1) {
    return { kind: "invalid" }
  }

  const line = sections[0]?.find((candidate) => candidate.startsWith(STORE_LINE_PREFIX))
  if (line === undefined) {
    return { kind: "files" }
  }

  const word = settingWordOf(line.slice(STORE_LINE_PREFIX.length).trim())
  if (word === STORE_FILES) {
    return { kind: "files" }
  }
  return word === STORE_BEADS ? { kind: "beads" } : { kind: "invalid" }
}

const TASK_SECTION_HEADING = "## タスク運用"
const STORE_LINE_PREFIX = "- タスクの置き場:"
const STORE_FILES = "develop/task"
const STORE_BEADS = "beads"

/** 「## タスク運用」節の行（見出しの次から、次の `## ` の前まで）を1つだけ包んだ並び。節が無ければ空。 */
function taskSectionsOf(content: string): readonly (readonly string[])[] {
  const lines = content.split("\n")
  const start = lines.findIndex((line) => line.startsWith(TASK_SECTION_HEADING))
  if (start === -1) {
    return []
  }
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => line.startsWith("## "))
  return [end === -1 ? rest : rest.slice(0, end)]
}

/**
 * 値の先頭語。`` `x` `` で囲めば中身、囲まなければ最初の語を括弧・句読点の前で切る。
 * task-workflow の `layout.setting_word` と同じ規則に揃える。
 */
function settingWordOf(value: string): string {
  const quoted = /`([^`]+)`/.exec(value)?.[1]
  const word = quoted === undefined ? (value.split(/\s+/)[0] ?? "") : quoted.trim()
  return (word.split(/[（(、。]/)[0] ?? "").replace(/^`+|`+$/g, "").trim()
}
