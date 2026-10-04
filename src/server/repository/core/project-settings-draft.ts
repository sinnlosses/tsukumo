// プロジェクトの設定を書く画面に出す下書きを組む。
// 推し量るのは画面の初期値だけで、tsukumo の動作の判定には使わない（動作は `readProjectSettings` が読むファイルだけで決まる）。

import {
  DEFAULT_RUN_PROMPT,
  type ProjectSettingsDraft,
  type ProjectSettingsRead,
  type TaskStore,
} from "../../../shared/repository/project-settings.ts"

/** 推し量れないときの主ブランチ名。 */
const FALLBACK_MAIN_BRANCH = "main"

export type ProjectSettingsDraftSource = {
  readonly settings: ProjectSettingsRead
  /** AGENTS.md か CLAUDE.md の「## タスク運用」節の本文。 */
  readonly taskSection:
    | { readonly kind: "found"; readonly text: string }
    | { readonly kind: "missing" }
  /** `origin/HEAD` が指す枝の名前（`origin/` を除いたもの）。 */
  readonly originHead:
    | { readonly kind: "found"; readonly branch: string }
    | { readonly kind: "missing" }
}

export function projectSettingsDraftOf(source: ProjectSettingsDraftSource): ProjectSettingsDraft {
  const { settings } = source
  if (settings.kind === "read") {
    return {
      file: "read",
      store: { value: settings.tasks.store, inferred: false },
      mainBranch: { value: settings.tasks.mainBranch, inferred: false },
      runPrompt: { value: settings.tasks.runPrompt, inferred: false },
    }
  }
  return {
    file: settings.kind,
    store:
      source.taskSection.kind === "found"
        ? { value: storeOfTaskSection(source.taskSection.text), inferred: true }
        : { value: "files", inferred: false },
    mainBranch:
      source.originHead.kind === "found"
        ? { value: source.originHead.branch, inferred: true }
        : { value: FALLBACK_MAIN_BRANCH, inferred: false },
    runPrompt: { value: DEFAULT_RUN_PROMPT, inferred: false },
  }
}

/** タスク運用のスキルと同じ読み方で、`- タスクの置き場: beads` の行があれば Beads 方式、無ければファイル方式。 */
function storeOfTaskSection(section: string): TaskStore {
  return /^-\s*タスクの置き場:\s*beads\s*$/m.test(section) ? "beads" : "files"
}
