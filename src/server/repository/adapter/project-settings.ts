// 起動先の作業ツリーにあるプロジェクトの設定（`.tsukumo/project.json`）を読む・書く。
// 起動時に覚えず、呼ばれるたびに読む（画面から書いた値が次に読んだときに効く）。
// 書く画面の下書きのために、「## タスク運用」節と `origin/HEAD` も読む（動作の判定には使わない）。

import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"

import { isObjectType } from "remeda"

import {
  PROJECT_SETTINGS_PATH,
  projectSettingsContentOf,
  type ProjectSettingsDraft,
  projectSettingsOf,
  type ProjectSettingsRead,
  type TaskSettings,
} from "../../../shared/repository/project-settings.ts"
import {
  projectSettingsDraftOf,
  type ProjectSettingsDraftSource,
} from "../core/project-settings-draft.ts"
import { runGit } from "./git.ts"

/** 「## タスク運用」節を探すファイル。タスク運用のスキルと同じ順に見る。 */
const TASK_SECTION_FILES = ["AGENTS.md", "CLAUDE.md"] as const

const TASK_SECTION_HEADING = "## タスク運用"

/** ファイルが無ければ `none`、読めなければ `invalid`。例外を投げない。 */
export async function readProjectSettings(cwd: string): Promise<ProjectSettingsRead> {
  let content: string
  try {
    content = await readFile(join(cwd, PROJECT_SETTINGS_PATH), "utf8")
  } catch (error) {
    return isMissingFile(error) ? { kind: "none" } : { kind: "invalid" }
  }
  return projectSettingsOf(content)
}

/** 書く画面の下書き。例外を投げない（推し量れないものは推し量らない）。 */
export async function readProjectSettingsDraft(cwd: string): Promise<ProjectSettingsDraft> {
  const [settings, taskSection, originHead] = await Promise.all([
    readProjectSettings(cwd),
    readTaskSection(cwd),
    readOriginHead(cwd),
  ])
  return projectSettingsDraftOf({ settings, taskSection, originHead })
}

/** `.tsukumo/` が無ければ作って書く。書けたかどうかを返す（例外を投げない）。 */
export async function writeProjectSettings(cwd: string, tasks: TaskSettings): Promise<boolean> {
  const path = join(cwd, PROJECT_SETTINGS_PATH)
  try {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, projectSettingsContentOf(tasks))
    return true
  } catch {
    return false
  }
}

function isMissingFile(error: unknown): boolean {
  return isObjectType(error) && "code" in error && error.code === "ENOENT"
}

async function readTaskSection(cwd: string): Promise<ProjectSettingsDraftSource["taskSection"]> {
  for (const file of TASK_SECTION_FILES) {
    const content = await readFile(join(cwd, file), "utf8").catch(() => "")
    const section = taskSectionOf(content)
    if (section !== "") {
      return { kind: "found", text: section }
    }
  }
  return { kind: "missing" }
}

/** 見出しの行から次の `## ` の見出しの手前まで。節が無ければ空文字列。 */
function taskSectionOf(content: string): string {
  const lines = content.split("\n")
  const start = lines.findIndex((line) => line.startsWith(TASK_SECTION_HEADING))
  if (start === -1) {
    return ""
  }
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => line.startsWith("## "))
  return [lines[start], ...(end === -1 ? rest : rest.slice(0, end))].join("\n")
}

async function readOriginHead(cwd: string): Promise<ProjectSettingsDraftSource["originHead"]> {
  const outcome = await runGit(cwd, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"])
  const ref = outcome.kind === "output" ? outcome.stdout.trim() : ""
  return ref.startsWith("origin/") && ref.length > "origin/".length
    ? { kind: "found", branch: ref.slice("origin/".length) }
    : { kind: "missing" }
}
