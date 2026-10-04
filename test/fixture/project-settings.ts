// 起動先のプロジェクトの設定（`.tsukumo/project.json`）を一時のリポジトリに書く。

import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import {
  PROJECT_SETTINGS_PATH,
  type ProjectSettingsDraft,
  type TaskStore,
} from "../../src/shared/repository/project-settings.ts"

/** 設定ファイルが無く、何も推し量れなかったときの下書き。 */
export const PLAIN_PROJECT_SETTINGS_DRAFT = {
  file: "none",
  store: { value: "files", inferred: false },
  mainBranch: { value: "main", inferred: false },
  runPrompt: { value: "/next-task {id}", inferred: false },
} satisfies ProjectSettingsDraft

/** `store` の方式で、主ブランチを `mainBranch`（既定 `main`）にした設定を書く。 */
export function writeProjectSettings(cwd: string, store: TaskStore, mainBranch = "main"): void {
  writeProjectSettingsContent(cwd, JSON.stringify({ tasks: { store, mainBranch } }))
}

/** 中身をそのまま書く（壊れた JSON を書くときに使う）。 */
export function writeProjectSettingsContent(cwd: string, content: string): void {
  const path = join(cwd, PROJECT_SETTINGS_PATH)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}
