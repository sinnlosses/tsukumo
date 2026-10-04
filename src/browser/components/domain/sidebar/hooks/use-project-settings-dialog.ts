// プロジェクトの設定のダイアログの状態。
// 下書き（いまのファイルの状態と欄ごとの初期値）は開くたびに `repository.projectSettingsDraft` で取り直す。
// 欄の値は触るまで下書きのまま持ち、触った欄だけ利用者の値で上書きする（推し量った値の点線は、触った欄から実線になる）。
// 保存は `projectSettings.save` を送って閉じる。書けたことはタスクの節が切り替わることで分かる（ダイアログは待たない）。
// ファイルが読めないときは、保存の前に「上書きする？」の確かめを1回挟む。

import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

import {
  PROJECT_SETTINGS_PATH,
  type ProjectSettingsDraft,
  type ProjectSettingsDraftField,
  type TaskStore,
} from "../../../../../shared/repository/project-settings.ts"
import { rpc } from "../../../../domain/rpc.ts"
import { useSession } from "../../../../stores/session.ts"

/** 欄1つの姿。`inferred` は推し量った値を触らずに出しているときだけ立つ。 */
export type ProjectSettingsFieldModel<T> = {
  readonly value: T
  readonly inferred: boolean
  readonly onChange: (value: T) => void
  readonly onTouch: () => void
}

export type ProjectSettingsFormModel = {
  readonly fileInvalid: boolean
  readonly store: ProjectSettingsFieldModel<TaskStore>
  readonly mainBranch: ProjectSettingsFieldModel<string>
  readonly runPrompt: ProjectSettingsFieldModel<string>
  readonly canSave: boolean
  /** 上書きの確かめを出しているか。 */
  readonly confirming: boolean
  readonly onSave: () => void
  readonly onConfirmOverwrite: () => void
  readonly onCancelOverwrite: () => void
}

export type ProjectSettingsDialogModel = {
  readonly open: boolean
  readonly path: string
  /** 下書きを取り直している間は `loading`。 */
  readonly form:
    | { readonly kind: "loading" }
    | { readonly kind: "ready"; readonly model: ProjectSettingsFormModel }
  readonly onClose: () => void
}

/** 欄を触ったか。触るまでは下書きの値を出す。 */
type FieldEdit<T> = { readonly kind: "draft" } | { readonly kind: "edited"; readonly value: T }

const UNTOUCHED = { kind: "draft" } as const satisfies FieldEdit<never>

export function useProjectSettingsDialog(
  open: boolean,
  onClose: () => void,
): ProjectSettingsDialogModel {
  const dispatch = useSession((session) => session.dispatch)
  const { data, isFetching } = useQuery(
    rpc.repository.projectSettingsDraft.queryOptions({ enabled: open, retry: false, staleTime: 0 }),
  )
  const [store, setStore] = useState<FieldEdit<TaskStore>>(UNTOUCHED)
  const [mainBranch, setMainBranch] = useState<FieldEdit<string>>(UNTOUCHED)
  const [runPrompt, setRunPrompt] = useState<FieldEdit<string>>(UNTOUCHED)
  const [confirming, setConfirming] = useState(false)

  const close = (): void => {
    setStore(UNTOUCHED)
    setMainBranch(UNTOUCHED)
    setRunPrompt(UNTOUCHED)
    setConfirming(false)
    onClose()
  }

  const formModel = (draft: ProjectSettingsDraft): ProjectSettingsFormModel => {
    const fields = {
      store: fieldModel(draft.store, store, setStore),
      mainBranch: fieldModel(draft.mainBranch, mainBranch, setMainBranch),
      runPrompt: fieldModel(draft.runPrompt, runPrompt, setRunPrompt),
    }
    const tasks = {
      store: fields.store.value,
      mainBranch: fields.mainBranch.value.trim(),
      runPrompt: fields.runPrompt.value,
    }
    const canSave = tasks.mainBranch !== "" && tasks.runPrompt.trim() !== ""
    const save = (): void => {
      void dispatch.projectSettings.save(tasks)
      close()
    }
    return {
      ...fields,
      fileInvalid: draft.file === "invalid",
      canSave,
      confirming,
      onSave: () => {
        if (!canSave) {
          return
        }
        if (draft.file === "invalid") {
          setConfirming(true)
          return
        }
        save()
      },
      onConfirmOverwrite: save,
      onCancelOverwrite: () => {
        setConfirming(false)
      },
    }
  }

  return {
    open,
    path: PROJECT_SETTINGS_PATH,
    form:
      isFetching || data === undefined
        ? { kind: "loading" }
        : { kind: "ready", model: formModel(data) },
    onClose: close,
  }
}

function fieldModel<T>(
  draft: ProjectSettingsDraftField<T>,
  edit: FieldEdit<T>,
  setEdit: (edit: FieldEdit<T>) => void,
): ProjectSettingsFieldModel<T> {
  const value = edit.kind === "edited" ? edit.value : draft.value
  return {
    value,
    inferred: edit.kind === "draft" && draft.inferred,
    onChange: (next) => {
      setEdit({ kind: "edited", value: next })
    },
    onTouch: () => {
      setEdit({ kind: "edited", value })
    },
  }
}
