// 設定のダイアログの「ワークフロー」の面のロジック。
// 面を開くたびにワークフローの設定を読み直し（`workflowSetting.read`）、並び・選択・コマンドの操作は下書きだけを変える。
// 保存で、下書きのある欄ごとに1回 `workflowSetting.set` で書き、返った値で描き直す（押した側へ先に倒さない）。
// 下書きはこのフックの状態なので、面を切り替える・ダイアログを閉じると黙って消える。

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import { rpc } from "../../../../stores/rpc.ts"
import { useSession } from "../../../../stores/session.ts"
import {
  UNREACHABLE_MESSAGE,
  canSaveWorkflowDrafts,
  dirtyWorkflowFields,
  failureAfterSave,
  workflowDraftChange,
  workflowFieldWrites,
  workflowRepositoryLine,
  workflowSettingRows,
  workflowUnavailableMessage,
  type FieldWrite,
  type SaveOutcome,
  type ScreenNavWorkflowSettingDraftChange,
  type ScreenNavWorkflowSettingRepository,
  type ScreenNavWorkflowSettingRow,
  type SetFailure,
} from "../domain/workflow-setting-row.ts"

export type {
  ScreenNavWorkflowSettingChoiceRow,
  ScreenNavWorkflowSettingCommandRow,
  ScreenNavWorkflowSettingDraftChange,
  ScreenNavWorkflowSettingReadonlyRow,
  ScreenNavWorkflowSettingRepository,
  ScreenNavWorkflowSettingRow,
  ScreenNavWorkflowSettingStep,
  ScreenNavWorkflowSettingStepsRow,
} from "../domain/workflow-setting-row.ts"

type ScreenNavWorkflowSetting =
  | { readonly kind: "loading" }
  /** 手続きそのものが返らなかった。 */
  | { readonly kind: "unreachable"; readonly message: string }
  /** 欄を出せない。`message` は何が無いかの1文。 */
  | {
      readonly kind: "unavailable"
      readonly repository: ScreenNavWorkflowSettingRepository
      readonly message: string
    }
  | {
      readonly kind: "available"
      readonly repository: ScreenNavWorkflowSettingRepository
      readonly rows: readonly ScreenNavWorkflowSettingRow[]
      readonly change: ScreenNavWorkflowSettingDraftChange
      readonly onSave: () => void
      /** 書いて、書けたかを返す。 */
      readonly saveAndWait: () => Promise<boolean>
      /** 下書きのある欄の数。 */
      readonly draftCount: number
      readonly onCancel: () => void
      /** 偽のあいだ「保存」は押せない（空のコマンドが下書きにある）。 */
      readonly canSave: boolean
      /** 書いている最中は操作させない。 */
      readonly busy: boolean
    }

export function useWorkflowSetting(): ScreenNavWorkflowSetting {
  const dispatchAwaited = useSession((session) => session.dispatchAwaited)
  const queryClient = useQueryClient()
  // 面は選んだときだけマウントされるので、開くたびに `tw` を打ち直して `.tw/config.toml` の今を読む。
  const query = useQuery(rpc.workflowSetting.read.queryOptions({ retry: false, staleTime: 0 }))
  const [drafts, setDrafts] = useState<ReadonlyMap<string, readonly string[]>>(new Map())
  const [textDrafts, setTextDrafts] = useState<ReadonlyMap<string, string>>(new Map())
  const [failure, setFailure] = useState<SetFailure>({ kind: "none" })
  const mutation = useMutation({
    mutationFn: async (writes: readonly FieldWrite[]): Promise<SaveOutcome> => {
      for (const write of writes) {
        const sent = await dispatchAwaited((client) => client.workflowSetting.set(write))
        if (sent.kind !== "ok") {
          return { kind: "unsent" }
        }
        const result = sent.value
        if (result.kind === "failed") {
          return result
        }
        queryClient.setQueryData(rpc.workflowSetting.read.queryKey(), result.view)
      }
      return { kind: "saved" }
    },
    onSuccess: (result, writes) => {
      if (result.kind === "saved") {
        setDrafts(new Map())
        setTextDrafts(new Map())
        setFailure({ kind: "none" })
        return
      }
      setFailure(failureAfterSave(result, writes))
    },
  })

  if (query.data === undefined) {
    return query.isError
      ? { kind: "unreachable", message: UNREACHABLE_MESSAGE }
      : { kind: "loading" }
  }
  const view = query.data
  if (view.kind === "unavailable") {
    return {
      kind: "unavailable",
      repository: workflowRepositoryLine(view.repository),
      message: workflowUnavailableMessage(view),
    }
  }
  const dirtyFields = dirtyWorkflowFields(view.fields, drafts, textDrafts)
  const writes = workflowFieldWrites(dirtyFields, drafts, textDrafts)
  return {
    kind: "available",
    repository: workflowRepositoryLine(view.repository),
    rows: workflowSettingRows(view.fields, drafts, textDrafts, failure, {
      setSteps: (key, next) => {
        setDrafts((previous) => new Map(previous).set(key, next))
      },
      setText: (key, next) => {
        setTextDrafts((previous) => new Map(previous).set(key, next))
      },
    }),
    change: workflowDraftChange(dirtyFields, drafts),
    onSave: () => {
      if (writes.length > 0) {
        mutation.mutate(writes)
      }
    },
    saveAndWait: async () => {
      if (writes.length === 0) {
        return true
      }
      const outcome = await mutation.mutateAsync(writes)
      return outcome.kind === "saved"
    },
    draftCount: dirtyFields.length,
    onCancel: () => {
      setDrafts(new Map())
      setTextDrafts(new Map())
      setFailure({ kind: "none" })
    },
    canSave: canSaveWorkflowDrafts(dirtyFields, textDrafts),
    busy: mutation.isPending,
  }
}
