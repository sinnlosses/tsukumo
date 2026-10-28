// 設定のダイアログの「ワークフロー」の面のロジック。
// 面を開くたびにワークフローの設定を読み直し（`workflowSetting.read`）、並びの操作は下書きだけを変える。
// 保存で、下書きのある欄ごとに並び全体を1回 `workflowSetting.set` で書き、返った値で描き直す（押した側へ先に倒さない）。
// 下書きはこのフックの状態なので、面を切り替える・ダイアログを閉じると黙って消える。

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { isDeepEqual } from "remeda"

import type {
  WorkflowSettingChange,
  WorkflowSettingRepository,
  WorkflowSettingStepsField,
  WorkflowSettingView,
} from "../../../../../shared/workflow-setting/workflow-setting.ts"
import { rpc } from "../../../../domain/rpc.ts"
import { useSession } from "../../../../stores/session.ts"
import { reorderSteps } from "../domain/step-reorder.ts"
import {
  workflowSettingSteps,
  type WorkflowSettingOption,
} from "../domain/workflow-setting-option.ts"

/** 面の見出しの下に出す、どのリポジトリの設定か。 */
export type ScreenNavWorkflowSettingRepository = {
  readonly name: string
  readonly path: string
}

type ScreenNavWorkflowSettingNotice =
  | { readonly kind: "none" }
  | { readonly kind: "shown"; readonly text: string }

export type ScreenNavWorkflowSettingStep = {
  readonly value: string
  readonly label: string
  /** 日本語の段の名前。候補に無い名前では `value`。 */
  readonly title: string
  readonly description: string
  /** 候補に無い名前（過去に入れたスキルが消えた）。消さずに残す。 */
  readonly known: boolean
  readonly canMoveUp: boolean
  readonly canMoveDown: boolean
  /** 並びは1つ以上なので、最後の1つは外せない。 */
  readonly canRemove: boolean
  /** 今の値（保存前の並び）と位置が違う。下書きで足した行も含む。 */
  readonly moved: boolean
}

type ScreenNavWorkflowSettingMove = "top" | "up" | "down" | "bottom"

/** 欄1つ。`steps`・`addable` は下書きの並びから作る。 */
export type ScreenNavWorkflowSettingRow = {
  readonly key: string
  readonly label: string
  readonly description: string
  /** ワークフローが値を断った・書けなかったときの理由。次に書けたときか、やめたときに消える。 */
  readonly notice: ScreenNavWorkflowSettingNotice
  readonly steps: readonly ScreenNavWorkflowSettingStep[]
  readonly addable: readonly WorkflowSettingOption[]
  /** 並びが2つ以上あり、つかんで動かせる。 */
  readonly reorderable: boolean
  readonly onMove: (index: number, to: ScreenNavWorkflowSettingMove) => void
  /** `to` は動かしたあとにその行が占める位置。 */
  readonly onReorder: (from: number, to: number) => void
  readonly onRemove: (index: number) => void
  readonly onAdd: (value: string) => void
}

/** 下書きが今の値と違うか。違うときの `text` は下の帯に「● 」を添えて出す1句。 */
export type ScreenNavWorkflowSettingDraftChange =
  | { readonly kind: "none" }
  | { readonly kind: "changed"; readonly text: string }

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
      readonly onCancel: () => void
      /** 書いている最中は操作させない。 */
      readonly busy: boolean
    }

type SetFailure =
  | { readonly kind: "none" }
  | { readonly kind: "shown"; readonly key: string; readonly message: string }

type FieldWrite = { readonly key: string; readonly value: string }

type SaveOutcome = { readonly kind: "saved" } | Extract<WorkflowSettingChange, { kind: "failed" }>

const UNREACHABLE_MESSAGE = "ワークフローの設定を読めなかった（サーバに届かない）。"
const SEND_FAILED_MESSAGE = "書けなかった（サーバに届かない）。"
const REORDERED_TEXT = "並びを変えた"

export function useWorkflowSetting(): ScreenNavWorkflowSetting {
  const dispatchAwaited = useSession((session) => session.dispatchAwaited)
  const queryClient = useQueryClient()
  // 面は選んだときだけマウントされるので、開くたびに `tw` を打ち直して `.tw/config.toml` の今を読む。
  const query = useQuery(rpc.workflowSetting.read.queryOptions({ retry: false, staleTime: 0 }))
  const [drafts, setDrafts] = useState<ReadonlyMap<string, readonly string[]>>(new Map())
  const [failure, setFailure] = useState<SetFailure>({ kind: "none" })
  const mutation = useMutation({
    mutationFn: async (writes: readonly FieldWrite[]): Promise<SaveOutcome> => {
      for (const write of writes) {
        const result = await dispatchAwaited.workflowSetting.set(write)
        if (result.kind === "failed") {
          return result
        }
        queryClient.setQueryData(rpc.workflowSetting.read.queryKey(), result.view)
      }
      return { kind: "saved" }
    },
    onSuccess: (result) => {
      if (result.kind === "failed") {
        setFailure({ kind: "shown", key: result.key, message: result.message })
        return
      }
      setDrafts(new Map())
      setFailure({ kind: "none" })
    },
    onError: (_error, writes) => {
      const key = writes[0]?.key
      if (key !== undefined) {
        setFailure({ kind: "shown", key, message: SEND_FAILED_MESSAGE })
      }
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
      repository: repositoryLine(view.repository),
      message: unavailableMessage(view),
    }
  }
  const stepsFields = view.fields.filter(
    (field): field is WorkflowSettingStepsField => field.kind === "steps",
  )
  const dirtyFields = stepsFields.filter((field) => {
    const draft = drafts.get(field.key)
    return draft !== undefined && !isDeepEqual(draft, field.current)
  })
  return {
    kind: "available",
    repository: repositoryLine(view.repository),
    rows: stepsFields.map((field) =>
      stepsRow(
        field,
        drafts.get(field.key) ?? field.current,
        failure.kind === "shown" && failure.key === field.key
          ? { kind: "shown", text: failure.message }
          : { kind: "none" },
        (next) => {
          setDrafts((previous) => new Map(previous).set(field.key, next))
        },
      ),
    ),
    change: draftChange(dirtyFields, drafts),
    onSave: () => {
      const writes = dirtyFields.flatMap((field) => {
        const draft = drafts.get(field.key)
        return draft === undefined ? [] : [{ key: field.key, value: JSON.stringify(draft) }]
      })
      if (writes.length > 0) {
        mutation.mutate(writes)
      }
    },
    onCancel: () => {
      setDrafts(new Map())
      setFailure({ kind: "none" })
    },
    busy: mutation.isPending,
  }
}

function stepsRow(
  field: WorkflowSettingStepsField,
  draft: readonly string[],
  notice: ScreenNavWorkflowSettingNotice,
  setDraft: (next: readonly string[]) => void,
): ScreenNavWorkflowSettingRow {
  const { items, addable } = workflowSettingSteps({ ...field, current: draft })
  const reorder = (from: number, to: number): void => {
    const next = reorderSteps(draft, from, to)
    if (next !== draft) {
      setDraft(next)
    }
  }
  return {
    key: field.key,
    label: field.label,
    description: field.description,
    notice,
    steps: items.map((item, index) => ({
      ...item,
      canMoveUp: index > 0,
      canMoveDown: index < items.length - 1,
      canRemove: items.length > 1,
      moved: field.current.indexOf(item.value) !== index,
    })),
    addable,
    reorderable: draft.length > 1,
    onMove: (index, to) => {
      reorder(index, moveTarget(index, to, draft.length))
    },
    onReorder: reorder,
    onRemove: (index) => {
      if (draft.length > 1) {
        setDraft(draft.filter((_value, position) => position !== index))
      }
    },
    onAdd: (value) => {
      if (!draft.includes(value)) {
        setDraft([...draft, value])
      }
    },
  }
}

function moveTarget(index: number, to: ScreenNavWorkflowSettingMove, length: number): number {
  switch (to) {
    case "top":
      return 0
    case "up":
      return index - 1
    case "down":
      return index + 1
    case "bottom":
      return length - 1
  }
}

/** 下書きのある欄が1つで、今の値から1つだけ外して順はそのままなら「<名前>を外した」。 */
function draftChange(
  dirtyFields: readonly WorkflowSettingStepsField[],
  drafts: ReadonlyMap<string, readonly string[]>,
): ScreenNavWorkflowSettingDraftChange {
  const [field, ...others] = dirtyFields
  if (field === undefined) {
    return { kind: "none" }
  }
  const draft = drafts.get(field.key) ?? field.current
  const removedValue = field.current.find((value) => !draft.includes(value))
  const onlyRemoved =
    others.length === 0 &&
    draft.length === field.current.length - 1 &&
    isDeepEqual(
      field.current.filter((value) => draft.includes(value)),
      draft,
    )
  if (!onlyRemoved || removedValue === undefined) {
    return { kind: "changed", text: REORDERED_TEXT }
  }
  const title = field.values.find((choice) => choice.value === removedValue)?.title ?? removedValue
  return { kind: "changed", text: `${title}を外した` }
}

function repositoryLine(repository: WorkflowSettingRepository): ScreenNavWorkflowSettingRepository {
  return { name: repository.worktreeName, path: repository.configPath }
}

function unavailableMessage(view: Extract<WorkflowSettingView, { kind: "unavailable" }>): string {
  switch (view.reason) {
    case "tw-missing":
      return `tw コマンドが見つからない（${view.detail}）。ワークフローを取り込むかリンクで入れると、ここでスキルの並びを選べる。`
    case "schema-unsupported":
      return "tw が並び（schema 2）の設定コマンドを返さない。取り込んだワークフローかリンクで入れたワークフローを新しくする。"
    case "config-missing":
      return "このリポジトリに .tw/config.toml が無い。"
    case "config-unreadable":
      return `.tw/config.toml を読めない: ${view.detail}`
  }
}
