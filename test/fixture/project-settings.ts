// 起動先のプロジェクトの設定（`.tsukumo/project.json`）を一時のリポジトリに書く。

import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { PROJECT_SETTINGS_PATH } from "../../src/server/repository/adapter/project-settings.ts"
import type { TaskStore } from "../../src/shared/repository/project-settings.ts"

/** `store` の方式で、主ブランチを `main` にした設定を書く。 */
export function writeProjectSettings(cwd: string, store: TaskStore): void {
  writeProjectSettingsContent(cwd, JSON.stringify({ tasks: { store, mainBranch: "main" } }))
}

/** 中身をそのまま書く（壊れた JSON を書くときに使う）。 */
export function writeProjectSettingsContent(cwd: string, content: string): void {
  const path = join(cwd, PROJECT_SETTINGS_PATH)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}
