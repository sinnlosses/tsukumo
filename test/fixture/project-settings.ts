// 起動先のプロジェクトの設定（`.tsukumo/project.json`）を一時のリポジトリに書く。

import { mkdirSync, renameSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import {
  DEFAULT_RUN_PROMPT,
  PROJECT_SETTINGS_PATH,
  type ProjectSettingsDraft,
} from "../../src/shared/repository/project-settings.ts"

/** 設定ファイルが無く、何も推し量れなかったときの下書き。 */
export const PLAIN_PROJECT_SETTINGS_DRAFT = {
  file: "none",
  mainBranch: { value: "main", inferred: false },
  runPrompt: { value: DEFAULT_RUN_PROMPT, inferred: false },
} satisfies ProjectSettingsDraft

/** 主ブランチを `mainBranch`（既定 `main`）にした設定を書く。 */
export function writeProjectSettings(cwd: string, mainBranch = "main"): void {
  writeProjectSettingsContent(cwd, JSON.stringify({ tasks: { mainBranch } }))
}

/**
 * 中身をそのまま書く（壊れた JSON を書くときに使う）。
 * 見回りが書きかけ（空のファイル）を「読めない」と読まないよう、隣に書いてから名前を付け替える。
 */
export function writeProjectSettingsContent(cwd: string, content: string): void {
  const path = join(cwd, PROJECT_SETTINGS_PATH)
  const writing = `${path}.writing`
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(writing, content)
  renameSync(writing, path)
}
