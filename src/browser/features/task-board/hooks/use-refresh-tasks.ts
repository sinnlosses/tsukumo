// タスク一覧を今すぐ読み直してもらう。
// 読んでいるあいだ（手続きの応答が返るまで）の状態は、このフックを使うどこでも同じ（mutationKey で数える）。
// 一覧そのものは `tasks-changed` で届くので、ここは依頼と待ちだけを持つ。

import { useIsMutating, useMutation } from "@tanstack/react-query"

import { rpc } from "../../../domain/rpc.ts"

type UseRefreshTasksResult = {
  readonly refreshing: boolean
  readonly refresh: () => void
}

export function useRefreshTasks(): UseRefreshTasksResult {
  const mutation = useMutation(rpc.repository.refreshTasks.mutationOptions())
  const refreshing = useIsMutating({ mutationKey: rpc.repository.refreshTasks.mutationKey() }) > 0
  return {
    refreshing,
    refresh: () => {
      if (!refreshing) {
        mutation.mutate(undefined)
      }
    },
  }
}
