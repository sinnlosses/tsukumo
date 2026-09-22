// 入力欄の `@` ファイル補完。**キャレットの直前の語が「行頭または空白の直後の `@`」で始まり、
// まだ空白を含まないときだけ**候補を出す（docs/requirements.md 4.2「入力欄」）。候補は
// git 管理下のファイルのパス（`GET /repository-file`。サーバ側は
// `src/server/adapter/repository-file.ts` の `git ls-files`）で、**中身は読まない**。
//
// **一覧は1回取ってブラウザ側で絞る**（打鍵のたびにサーバへ問い合わせない。`git ls-files` を
// 打鍵ごとに起こすと子プロセスがその回数だけ立つ）。取得は TanStack Query に任せるので、
// 呼び出し側（`hooks/use-composer.ts`）に取得の配線は無い。
//
// **絞り方は `/` 補完と同じ**（前方一致を先に、続けて部分一致。各グループの中は辞書順で、合計
// 最大 {@link MAX_FILE_SUGGESTIONS} 件）。違うのは**大文字小文字を区別しない**ことだけで、
// 打った綴りのまま `README.md` のようなパスに当てられるようにしてある。
//
// キー操作（上下・Tab・Enter・Esc）と確定は呼び出し側（`hooks/use-composer.ts`）が持つ（`/` 補完と同じ）。

import { useQuery } from "@tanstack/react-query"
import { type ReactElement } from "react"

import { readRepositoryFileList, REPOSITORY_FILE_PATH } from "../../../shared/repository-file.ts"
import { SESSION_TOKEN_QUERY_NAME } from "../../../shared/session-socket.ts"
import styles from "./dispatch.module.css"

export const MAX_FILE_SUGGESTIONS = 10

/**
 * 一覧を取り直す間隔。**0 でも `Infinity` でもない**のは、セッションの間にファイルが増える
 * （キャラクターが作る）一方で、打鍵のたびに `git ls-files` を起こしたくないため。`@` を打った
 * 最初の1回で取り、この時間が過ぎてから次に `@` を打つと取り直す。
 */
const FILE_LIST_STALE_TIME_MS = 30_000

/** 一覧をキャッシュに残す時間。`@` を使い終わってしばらくは取り直さずに済む。 */
const FILE_LIST_GC_TIME_MS = 5 * 60_000

/**
 * いま打っている `@<パス>`。**`start` から `end` までを確定後の文字列で置き換える**
 * （`end` はキャレットの位置で、その後ろに書きかけの文字があっても触らない）。
 */
export type FilePathQuery = {
  /** `@` そのものの位置。 */
  readonly start: number
  /** キャレットの位置（`@` の後ろに打った分の終わり）。 */
  readonly end: number
  /** `@` の後ろに打った文字列（絞り込みに使う）。 */
  readonly term: string
}

/**
 * キャレットの直前の語が `@` 補完の合図かを見る。合図でなければ undefined。
 *
 * **`@` は文中にも出る**ので `/` 補完の「先頭かつ空白なし」は使えない。行頭または空白の直後の
 * `@` だけを合図とみなし（`foo@example` のような語中の `@` は拾わない）、`@` からキャレットまでに
 * 空白が入ったら合図が終わったものとして扱う。
 */
export function filePathQuery(text: string, caret: number): FilePathQuery | undefined {
  const before = text.slice(0, caret)
  const start = before.lastIndexOf("@")
  if (start < 0) {
    return undefined
  }

  const preceding = start === 0 ? undefined : before[start - 1]
  if (preceding !== undefined && !/\s/.test(preceding)) {
    return undefined
  }

  const term = before.slice(start + 1)
  return /\s/.test(term) ? undefined : { start, end: caret, term }
}

/**
 * 打った文字列に前方一致→部分一致で絞り込んだパス。合計最大 {@link MAX_FILE_SUGGESTIONS} 件。
 * 大文字小文字は区別しない。
 */
export function matchingFilePaths(paths: readonly string[], term: string): readonly string[] {
  const needle = term.toLowerCase()
  const sorted = paths.toSorted(byPath)
  const prefixMatches = sorted.filter((path) => path.toLowerCase().startsWith(needle))
  const partialMatches = sorted.filter(
    (path) => !path.toLowerCase().startsWith(needle) && path.toLowerCase().includes(needle),
  )
  return [...prefixMatches, ...partialMatches].slice(0, MAX_FILE_SUGGESTIONS)
}

/**
 * git 管理下のファイルのパスを取る。**`enabled` が false の間は取りに行かない**（`@` を
 * 一度も打たない利用者のために、起動しただけでは一覧を作らせない）。
 *
 * **読めなかったときは空**（git リポジトリでないときもサーバが空を返す）。候補が出ないだけで、
 * 入力欄はそのまま使える。
 */
export function useRepositoryFilePaths(enabled: boolean): readonly string[] {
  const { data } = useQuery({
    queryKey: [REPOSITORY_FILE_PATH] as const,
    queryFn: async () => {
      const response = await fetch(repositoryFileUrl())
      return response.ok ? readRepositoryFileList(await response.json()) : []
    },
    enabled,
    staleTime: FILE_LIST_STALE_TIME_MS,
    gcTime: FILE_LIST_GC_TIME_MS,
  })

  return data ?? []
}

/**
 * 一覧の URL。**起動トークンを付ける**（`/ws` と同じ守り方で、値は今開いているページの URL から
 * 引く。`lib/socket.ts` の `socketUrl` と同じ）。
 */
function repositoryFileUrl(): string {
  const token = new URL(window.location.href).searchParams.get(SESSION_TOKEN_QUERY_NAME) ?? ""
  return `${REPOSITORY_FILE_PATH}?${SESSION_TOKEN_QUERY_NAME}=${encodeURIComponent(token)}`
}

function byPath(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export type FileSuggestionsProps = {
  readonly matches: readonly string[]
  readonly selectedIndex: number
  /** マウスで押した（`mousedown`）。既定動作（フォーカス移動）は呼び出し側で止める。 */
  readonly onSelect: (index: number) => void
}

/**
 * `@` 補完の候補一覧。`matches` が空のときは何も出さない（`/` 補完と同じ重ねポップアップの
 * 見た目を使う。dispatch.module.css）。
 */
export function FileSuggestions(props: FileSuggestionsProps): ReactElement | null {
  if (props.matches.length === 0) {
    return null
  }

  return (
    <ul className={styles["dispatch-suggestions"]}>
      {props.matches.map((path, index) => (
        <li
          key={path}
          className={`${styles["dispatch-suggestion-item"]}${
            index === props.selectedIndex ? ` ${styles["is-selected"]}` : ""
          }`}
          onMouseDown={(event) => {
            // mousedown の既定動作（フォーカス移動）を止め、textarea にフォーカスを残す
            // （`/` 補完の候補一覧と同じ理由）。
            event.preventDefault()
            props.onSelect(index)
          }}
        >
          <span className={styles["dispatch-suggestion-path"]}>{path}</span>
        </li>
      ))}
    </ul>
  )
}
