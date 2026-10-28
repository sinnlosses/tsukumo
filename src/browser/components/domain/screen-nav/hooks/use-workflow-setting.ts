// 設定のダイアログの「ワークフロー」の面のロジック。
// 面を開くたびにワークフローの設定を読み直し（`workflowSetting.read`）、並び・選択・コマンドの操作は下書きだけを変える。
// 保存で、下書きのある欄ごとに1回 `workflowSetting.set` で書き、返った値で描き直す（押した側へ先に倒さない）。
// 書く値は、並びは全体を JSON にした文字列、選択とコマンドは下書きの文字列そのまま。
// 下書きはこのフックの状態なので、面を切り替える・ダイアログを閉じると黙って消える。

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { isDeepEqual } from "remeda"

import type {
  WorkflowSettingChange,
  WorkflowSettingChoiceField,
  WorkflowSettingCommandField,
  WorkflowSettingField,
  WorkflowSettingReadonlyField,
  WorkflowSettingRepository,
  WorkflowSettingStepsField,
  WorkflowSettingView,
} from "../../../../../shared/workflow-setting/workflow-setting.ts"
import { rpc } from "../../../../domain/rpc.ts"
import { useSession } from "../../../../stores/session.ts"
import { reorderSteps } from "../domain/step-reorder.ts"
import {
  isWorkflowCommandSaveable,
  workflowSettingChoiceOptions,
  workflowSettingSteps,
  type WorkflowSettingChoiceOption,
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

type ScreenNavWorkflowSettingRowBase = {
  readonly key: string
  readonly label: string
  readonly description: string
  /** ワークフローが値を断った・書けなかったときの理由。次に書けたときか、やめたときに消える。 */
  readonly notice: ScreenNavWorkflowSettingNotice
}

export type ScreenNavWorkflowSettingRow =
  | ScreenNavWorkflowSettingStepsRow
  | ScreenNavWorkflowSettingChoiceRow
  | ScreenNavWorkflowSettingCommandRow
  | ScreenNavWorkflowSettingReadonlyRow

/** 画面から書けない欄。操作も下書きも断りの理由も持たず、`current` は1行の文字列。 */
export type ScreenNavWorkflowSettingReadonlyRow = {
  readonly kind: "readonly"
  readonly key: string
  readonly label: string
  readonly description: string
  readonly current: string
}

export type ScreenNavWorkflowSettingChoiceRow = ScreenNavWorkflowSettingRowBase & {
  readonly kind: "choice"
  readonly options: readonly WorkflowSettingChoiceOption[]
  readonly onSelect: (value: string) => void
}

export type ScreenNavWorkflowSettingCommandRow = ScreenNavWorkflowSettingRowBase & {
  readonly kind: "command"
  readonly text: string
  readonly onChange: (text: string) => void
}

/** スキルの並びの欄。`steps`・`addable` は下書きの並びから作る。 */
export type ScreenNavWorkflowSettingStepsRow = ScreenNavWorkflowSettingRowBase & {
  readonly kind: "steps"
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
      /** 偽のあいだ「保存」は押せない（空のコマンドが下書きにある）。 */
      readonly canSave: boolean
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
const SEVERAL_CHANGED_TEXT = "設定を変えた"

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
      setTextDrafts(new Map())
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
  const dirtyFields = view.fields.filter((field) => isDirty(field, drafts, textDrafts))
  const setStepsDraft = (key: string, next: readonly string[]): void => {
    setDrafts((previous) => new Map(previous).set(key, next))
  }
  const setTextDraft = (key: string, next: string): void => {
    setTextDrafts((previous) => new Map(previous).set(key, next))
  }
  return {
    kind: "available",
    repository: repositoryLine(view.repository),
    rows: view.fields.map((field): ScreenNavWorkflowSettingRow => {
      if (field.kind === "readonly") {
        return readonlyRow(field)
      }
      const notice: ScreenNavWorkflowSettingNotice =
        failure.kind === "shown" && failure.key === field.key
          ? { kind: "shown", text: failure.message }
          : { kind: "none" }
      switch (field.kind) {
        case "steps":
          return stepsRow(field, drafts.get(field.key) ?? field.current, notice, (next) => {
            setStepsDraft(field.key, next)
          })
        case "choice":
          return choiceRow(field, textDrafts.get(field.key) ?? field.current, notice, (next) => {
            setTextDraft(field.key, next)
          })
        case "command":
          return commandRow(field, textDrafts.get(field.key) ?? field.current, notice, (next) => {
            setTextDraft(field.key, next)
          })
      }
    }),
    change: draftChange(dirtyFields, drafts),
    onSave: () => {
      const writes = dirtyFields.flatMap((field): FieldWrite[] => {
        if (field.kind === "steps") {
          const draft = drafts.get(field.key)
          return draft === undefined ? [] : [{ key: field.key, value: JSON.stringify(draft) }]
        }
        const draft = textDrafts.get(field.key)
        return draft === undefined ? [] : [{ key: field.key, value: draft }]
      })
      if (writes.length > 0) {
        mutation.mutate(writes)
      }
    },
    onCancel: () => {
      setDrafts(new Map())
      setTextDrafts(new Map())
      setFailure({ kind: "none" })
    },
    canSave: dirtyFields.every(
      (field) =>
        field.kind !== "command" ||
        isWorkflowCommandSaveable(textDrafts.get(field.key) ?? field.current),
    ),
    busy: mutation.isPending,
  }
}

function isDirty(
  field: WorkflowSettingField,
  drafts: ReadonlyMap<string, readonly string[]>,
  textDrafts: ReadonlyMap<string, string>,
): boolean {
  if (field.kind === "readonly") {
    return false
  }
  if (field.kind === "steps") {
    const draft = drafts.get(field.key)
    return draft !== undefined && !isDeepEqual(draft, field.current)
  }
  const draft = textDrafts.get(field.key)
  return draft !== undefined && draft !== field.current
}

function readonlyRow(field: WorkflowSettingReadonlyField): ScreenNavWorkflowSettingReadonlyRow {
  return {
    kind: "readonly",
    key: field.key,
    label: field.label,
    description: field.description,
    current: field.current,
  }
}

function choiceRow(
  field: WorkflowSettingChoiceField,
  draft: string,
  notice: ScreenNavWorkflowSettingNotice,
  setDraft: (next: string) => void,
): ScreenNavWorkflowSettingChoiceRow {
  return {
    kind: "choice",
    key: field.key,
    label: field.label,
    description: field.description,
    notice,
    options: workflowSettingChoiceOptions(field, draft),
    onSelect: setDraft,
  }
}

function commandRow(
  field: WorkflowSettingCommandField,
  draft: string,
  notice: ScreenNavWorkflowSettingNotice,
  setDraft: (next: string) => void,
): ScreenNavWorkflowSettingCommandRow {
  return {
    kind: "command",
    key: field.key,
    label: field.label,
    description: field.description,
    notice,
    text: draft,
    onChange: setDraft,
  }
}

function stepsRow(
  field: WorkflowSettingStepsField,
  draft: readonly string[],
  notice: ScreenNavWorkflowSettingNotice,
  setDraft: (next: readonly string[]) => void,
): ScreenNavWorkflowSettingStepsRow {
  const { items, addable } = workflowSettingSteps({ ...field, current: draft })
  const reorder = (from: number, to: number): void => {
    const next = reorderSteps(draft, from, to)
    if (next !== draft) {
      setDraft(next)
    }
  }
  return {
    kind: "steps",
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

/**
 * 下書きのある欄が1つで、並びなら今の値から1つだけ外して順はそのままのとき「<名前>を外した」、
 * 選択・コマンドなら「<欄の名前>を変えた」。並びだけの複数は「並びを変えた」、並び以外を含む複数は「設定を変えた」。
 */
function draftChange(
  dirtyFields: readonly WorkflowSettingField[],
  drafts: ReadonlyMap<string, readonly string[]>,
): ScreenNavWorkflowSettingDraftChange {
  const [field, ...others] = dirtyFields
  if (field === undefined) {
    return { kind: "none" }
  }
  if (others.length > 0) {
    const onlySteps = dirtyFields.every((dirty) => dirty.kind === "steps")
    return { kind: "changed", text: onlySteps ? REORDERED_TEXT : SEVERAL_CHANGED_TEXT }
  }
  if (field.kind !== "steps") {
    return { kind: "changed", text: `${field.label}を変えた` }
  }
  const draft = drafts.get(field.key) ?? field.current
  const removedValue = field.current.find((value) => !draft.includes(value))
  const onlyRemoved =
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
