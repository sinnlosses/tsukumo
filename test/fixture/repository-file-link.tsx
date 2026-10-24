// レポートのパスを押せる部品にする `<RepositoryFileLinkProvider>` を、サーバを起こさずに描く口。
// 一覧は取得済みとして QueryClient に入れ、抜き書きの手続きは fetch の代役で、開く送信は store の受け口で受ける。

import { QueryClientProvider } from "@tanstack/react-query"
import type { ReactElement, ReactNode } from "react"

import { RepositoryFileLinkProvider } from "../../src/browser/components/page/conversation/components/repository-link/repository-link.tsx"
import { rpc } from "../../src/browser/domain/rpc.ts"
import type { FileExcerpt } from "../../src/shared/repository/file-excerpt.ts"
import { INITIAL_SESSION_STATE } from "../../src/shared/session/session-state.ts"
import { createTestQueryClient } from "../browser/query-client.tsx"
import { rpcError, rpcOutput, stubRpcFetch } from "../browser/rpc-fetch-stub.ts"
import { putSession } from "../browser/session-store.ts"

export type RepositoryFileLinkStub = {
  /** 描く部品を Provider で包む。 */
  readonly wrap: (children: ReactNode) => ReactElement
  /** Orca のエディタで開くよう送ったパス（古い順。送られるたびに伸びる）。 */
  readonly opened: readonly string[]
  /** 抜き書きの手続きに渡った入力（古い順。呼ばれるたびに伸びる）。 */
  readonly excerptRequests: readonly unknown[]
  /** fetch を元に戻す（`afterEach` で呼ぶ）。 */
  readonly restore: () => void
}

/** 一覧を `paths` にし、抜き書きの手続きには `excerpt` を返す。 */
export function stubRepositoryFileLink(
  paths: readonly string[],
  excerpt: FileExcerpt,
): RepositoryFileLinkStub {
  const client = createTestQueryClient()
  client.setQueryData(rpc.repository.listFiles.queryKey(), { paths, omittedCount: 0 })
  const opened: string[] = []
  putSession(INITIAL_SESSION_STATE, (command) => {
    if (command.procedure === "host.openFile" && typeof command["path"] === "string") {
      opened.push(command["path"])
    }
  })
  const excerptRequests: unknown[] = []
  const fetchStub = stubRpcFetch((call) => {
    if (call.procedure !== "repository/fileExcerpt") {
      return rpcError(404)
    }
    excerptRequests.push(call.input)
    return rpcOutput(excerpt)
  })
  return {
    wrap: (children) => (
      <QueryClientProvider client={client}>
        <RepositoryFileLinkProvider>{children}</RepositoryFileLinkProvider>
      </QueryClientProvider>
    ),
    opened,
    excerptRequests,
    restore: fetchStub.restore,
  }
}
