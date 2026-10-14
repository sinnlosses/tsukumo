// 設定のダイアログの「ワークフロー」の面のロジック。
// 面を開くたびにワークフローの設定を読み直し（`workflowSetting.read`）、選んだ値を `workflowSetting.set` で書く。
// 表示はサーバから返った値だけに従い、押した側へ先に倒さない。

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import {
  workflowSettingOptions,
  type WorkflowSettingOption,
} from "../../../../../shared/workflow-setting/workflow-setting-option.ts"
import type {
  WorkflowSettingRepository,
  WorkflowSettingView,
} from "../../../../../shared/workflow-setting/workflow-setting.ts"
import { rpc } from "../../../../domain/rpc.ts"
import { useSession } from "../../../../stores/session.ts"

/** 面の見出しの下に出す、どのリポジトリの設定か。 */
export type ScreenNavWorkflowSettingRepository = {
  readonly name: string
  readonly path: string
}

export type ScreenNavWorkflowSettingNotice =
  | { readonly kind: "none" }
  | { readonly kind: "shown"; readonly text: string }

export type ScreenNavWorkflowSettingRow = {
  readonly key: string
  readonly label: string
  readonly description: string
  readonly value: string
  readonly options: readonly WorkflowSettingOption[]
  /** ワークフローが値を断った・書けなかったときの理由。次に書けたときに消える。 */
  readonly notice: ScreenNavWorkflowSettingNotice
}

export type ScreenNavWorkflowSetting =
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
      /** 書いている最中は選び直させない。 */
      readonly busy: boolean
      readonly onChange: (key: string, value: string) => void
    }

type SetFailure =
  | { readonly kind: "none" }
  | { readonly kind: "shown"; readonly key: string; readonly message: string }

const UNREACHABLE_MESSAGE = "ワークフローの設定を読めなかった（サーバに届かない）。"
const SEND_FAILED_MESSAGE = "書けなかった（サーバに届かない）。"

export function useWorkflowSetting(): ScreenNavWorkflowSetting {
  const dispatchAwaited = useSession((session) => session.dispatchAwaited)
  const skillNames = useSession((session) => session.state.skillNames)
  const agentNames = useSession((session) => session.state.agentNames)
  const queryClient = useQueryClient()
  // 面は選んだときだけマウントされるので、開くたびに `tw` を打ち直して `.tw/config.toml` の今を読む。
  const query = useQuery(rpc.workflowSetting.read.queryOptions({ retry: false, staleTime: 0 }))
  const [failure, setFailure] = useState<SetFailure>({ kind: "none" })
  const mutation = useMutation({
    mutationFn: (change: { readonly key: string; readonly value: string }) =>
      dispatchAwaited.workflowSetting.set(change),
    onSuccess: (result) => {
      if (result.kind === "view") {
        queryClient.setQueryData(rpc.workflowSetting.read.queryKey(), result.view)
        setFailure({ kind: "none" })
        return
      }
      setFailure({ kind: "shown", key: result.key, message: result.message })
    },
    onError: (_error, change) => {
      setFailure({ kind: "shown", key: change.key, message: SEND_FAILED_MESSAGE })
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
  const words = { defaultWord: view.defaultWord, noneWord: view.noneWord }
  return {
    kind: "available",
    repository: repositoryLine(view.repository),
    rows: view.fields.map((field) => ({
      key: field.key,
      label: field.label,
      description: field.description,
      value: field.current,
      options: workflowSettingOptions(field, words, { skillNames, agentNames }),
      notice:
        failure.kind === "shown" && failure.key === field.key
          ? { kind: "shown", text: failure.message }
          : { kind: "none" },
    })),
    busy: mutation.isPending,
    onChange: (key, value) => {
      const field = view.fields.find((candidate) => candidate.key === key)
      if (field === undefined || field.current === value) {
        return
      }
      mutation.mutate({ key, value })
    },
  }
}

function repositoryLine(repository: WorkflowSettingRepository): ScreenNavWorkflowSettingRepository {
  return { name: repository.worktreeName, path: repository.configPath }
}

function unavailableMessage(view: Extract<WorkflowSettingView, { kind: "unavailable" }>): string {
  switch (view.reason) {
    case "tw-missing":
      return `tw コマンドが見つからない（${view.detail}）。ワークフローを取り込むかリンクで入れると、ここで流れとパーツを選べる。`
    case "schema-unsupported":
      return "tw が設定の口（tw config --schema の schema: 1）を持たない。取り込んだワークフローかリンクで入れたワークフローを新しくする。"
    case "config-missing":
      return "このリポジトリに .tw/config.toml が無い。"
    case "config-unreadable":
      return `.tw/config.toml を読めない: ${view.detail}`
  }
}
