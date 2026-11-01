// `Code` の塊の頭の行が、管理下のファイルの何行目かを聞くフック（行番号の列の始まり）。
// 聞くのは `path` が管理下の一覧にあるときだけで、答えが来るまでと決められないときは `undefined`。
// 塊の中身が変わったら聞き直し、古い問いの答えは捨てる。

import { useState } from "react"

import { useExternalSync } from "../../../../../../hooks/use-external-sync.ts"
import { useRepositoryFileLink } from "../../repository-link/repository-link.tsx"

type Answer = { readonly key: string; readonly startLine: number | undefined }

export function useCodeStartLine(block: {
  readonly path: string | undefined
  readonly language: string
  readonly source: string
}): number | undefined {
  const link = useRepositoryFileLink()
  const { path, language, source } = block
  const tracked = path !== undefined && link.files.has(path)
  const key = JSON.stringify([path, language, source])
  const [answer, setAnswer] = useState<Answer | undefined>(undefined)

  useExternalSync(() => {
    if (!tracked) {
      return undefined
    }
    let live = true
    link.codeBlockStart({ path, language, source }).then(
      (start) => {
        if (live) {
          setAnswer({ key, startLine: start.kind === "line" ? start.startLine : undefined })
        }
      },
      () => {},
    )
    return () => {
      live = false
    }
  }, [tracked, key, link, path, language, source])

  return tracked && answer?.key === key ? answer.startLine : undefined
}
