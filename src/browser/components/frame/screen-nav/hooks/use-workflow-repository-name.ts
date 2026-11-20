// ナビの「このリポジトリ」の見出しの右に出す、リポジトリの名前。
// 面の読み取り（`workflowSetting.read`）と同じ取得を共有し、読めないあいだは空の文字列。

import { useQuery } from "@tanstack/react-query"

import { rpc } from "../../../../stores/rpc.ts"

export function useWorkflowRepositoryName(): string {
  const query = useQuery(rpc.workflowSetting.read.queryOptions({ retry: false }))
  return query.data?.repository.worktreeName ?? ""
}
