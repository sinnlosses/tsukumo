// バックグラウンドタスクを1行の要約へ畳み、手順の文字を画面に出す長さで切る。

import type {
  BackgroundTask,
  BackgroundTaskKind,
} from "../../../shared/session-driver/background-task.ts"
import { MAX_TOOL_TEXT_LENGTH } from "../../../shared/session/session-record.ts"
import { clipText, type ClippedText } from "../../../shared/utils/clip-text.ts"

const BACKGROUND_TASK_KIND_LABEL = {
  shell: "シェル",
  agent: "サブエージェント",
  workflow: "ワークフロースクリプト",
  other: "その他",
} satisfies Record<BackgroundTaskKind, string>

/**
 * バックグラウンドタスクの要約。いちばん新しく始まったもの（並びの末尾）の説明を出し、2件以上あれば「ほか n件」を添える。
 * 説明が無ければ種類の語で代える。
 */
export function backgroundSummaryLabel(tasks: readonly BackgroundTask[]): string | undefined {
  const newest = tasks.at(-1)
  if (newest === undefined) {
    return undefined
  }
  const label = backgroundTaskLabel(newest)
  return tasks.length > 1 ? `${label} ほか${String(tasks.length - 1)}件` : label
}

/** 画面に出す長さで切り、落とした文字数を添える。 */
export function truncateForDisplay(text: string): string {
  return clippedTextLabel(clipText(text, MAX_TOOL_TEXT_LENGTH))
}

function backgroundTaskLabel(task: BackgroundTask): string {
  return task.description === "" ? BACKGROUND_TASK_KIND_LABEL[task.kind] : task.description
}

/** 切った先頭に、落とした文字数だけを添える。 */
function clippedTextLabel(clipped: ClippedText): string {
  if (clipped.omittedLength === 0) {
    return clipped.head
  }

  return `${clipped.head}\n…（以下 ${String(clipped.omittedLength)} 文字を省略）`
}
