// 最終レポートの「確かめたこと」の段と件数を運ぶ係。駆動1代に1つ。
// `task` のある `report` が届いたら、作業ディレクトリの検証の控えと作業ツリーの木を読み、控えの `tree` が木と一致したときだけ `report-verification` を流す。
// 読むのは待たずに裏で走らせるので、`report` そのものは遅れない。
// 控えが無い・読めない・形が違う・段が空・木が合わない・木が取れないときは何も流さない。

import { isPlainObject } from "remeda"

import type {
  VerificationCount,
  VerificationStage,
  VerificationStageResult,
} from "../../../../shared/report/report-verification.ts"
import type { SessionEvent } from "../../../../shared/session/session-event.ts"
import { parseJson } from "../../../../shared/utils/parse-json.ts"
import type { CheckRecordSource } from "../../../core/check-record-source.ts"

export type ReportVerifier = {
  /** 受理されたイベントを1件ずつ見る（復元した再生は渡さない）。 */
  readonly observe: (event: SessionEvent) => void
}

const STAGE_RESULTS = ["passed", "carried", "failed"] as const

export function createReportVerifier(
  source: CheckRecordSource,
  emit: (event: SessionEvent) => void,
): ReportVerifier {
  return {
    observe: (event) => {
      if (event.kind !== "report" || event.task.kind === "none") {
        return
      }
      void emitStages(event.toolUseId)
    },
  }

  async function emitStages(toolUseId: string): Promise<void> {
    try {
      const [record, tree] = await Promise.all([source.readRecordText(), source.readWorktreeTree()])
      if (record.kind !== "text" || tree.kind !== "known") {
        return
      }
      const stages = matchingStages(record.text, tree.sha)
      if (stages.length > 0) {
        emit({ kind: "report-verification", toolUseId, stages })
      }
    } catch {
      // 読めないときは何も流さない（ファイル先頭の約束）。
    }
  }
}

/** 控えの本文を読み、`tree` が木と一致したときだけ段を返す。形が違えば空。 */
function matchingStages(text: string, tree: string): readonly VerificationStage[] {
  const value = parseJson(text)
  if (!isPlainObject(value) || value.tree !== tree || !Array.isArray(value.stages)) {
    return []
  }
  const stages = value.stages.flatMap((stage: unknown): readonly VerificationStage[] => {
    const parsed = parseStage(stage)
    return parsed === undefined ? [] : [parsed]
  })
  return stages.length === value.stages.length ? stages : []
}

function parseStage(value: unknown): VerificationStage | undefined {
  if (!isPlainObject(value) || typeof value.name !== "string") {
    return undefined
  }
  const result = STAGE_RESULTS.find((candidate): candidate is VerificationStageResult => {
    return candidate === value.result
  })
  return result === undefined
    ? undefined
    : { name: value.name, result, count: countOf(value.count) }
}

function countOf(value: unknown): VerificationCount {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? { kind: "counted", tests: value }
    : { kind: "none" }
}
