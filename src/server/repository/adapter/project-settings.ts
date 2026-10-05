// 起動先の作業ツリーにあるプロジェクトの設定（`.tsukumo/project.json`）を読む・書く。
// 起動時に覚えず、呼ばれるたびに読む（画面から書いた値が次に読んだときに効く）。
// 書く画面の下書きのために、`origin/HEAD` も読む（動作の判定には使わない）。

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
  const [settings, originHead] = await Promise.all([readProjectSettings(cwd), readOriginHead(cwd)])
  return projectSettingsDraftOf({ settings, originHead })
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

async function readOriginHead(cwd: string): Promise<ProjectSettingsDraftSource["originHead"]> {
  const outcome = await runGit(cwd, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"])
  const ref = outcome.kind === "output" ? outcome.stdout.trim() : ""
  return ref.startsWith("origin/") && ref.length > "origin/".length
    ? { kind: "found", branch: ref.slice("origin/".length) }
    : { kind: "missing" }
}
