// プロジェクトの設定を書く画面に出す下書きを組む。
// 推し量るのは画面の初期値だけで、tsukumo の動作の判定には使わない（動作は `readProjectSettings` が読むファイルだけで決まる）。

import {
  DEFAULT_RUN_PROMPT,
  type ProjectSettingsDraft,
  type ProjectSettingsRead,
} from "../../../shared/repository/project-settings.ts"

/** 推し量れないときの主ブランチ名。 */
const FALLBACK_MAIN_BRANCH = "main"

export type ProjectSettingsDraftSource = {
  readonly settings: ProjectSettingsRead
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
      mainBranch: { value: settings.tasks.mainBranch, inferred: false },
      runPrompt: { value: settings.tasks.runPrompt, inferred: false },
    }
  }
  return {
    file: settings.kind,
    mainBranch:
      source.originHead.kind === "found"
        ? { value: source.originHead.branch, inferred: true }
        : { value: FALLBACK_MAIN_BRANCH, inferred: false },
    runPrompt: { value: DEFAULT_RUN_PROMPT, inferred: false },
  }
}
