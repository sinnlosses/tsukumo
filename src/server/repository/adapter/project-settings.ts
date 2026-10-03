// 起動先の作業ツリーにあるプロジェクトの設定（`.tsukumo/project.json`）を読む。
// 起動時に覚えず、呼ばれるたびに読む（画面から書いた値が次に読んだときに効く）。

import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { isObjectType } from "remeda"

import {
  PROJECT_SETTINGS_PATH,
  projectSettingsOf,
  type ProjectSettingsRead,
} from "../../../shared/repository/project-settings.ts"

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

function isMissingFile(error: unknown): boolean {
  return isObjectType(error) && "code" in error && error.code === "ENOENT"
}
