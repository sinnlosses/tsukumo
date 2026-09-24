// レポートに書かれたパス（inline code・フェンスのファイル名・相対リンクの3か所。
// `markdown.tsx` の `Code` / `Pre` / `Anchor`）を、押すと Orca のエディタで開ける部品にする
// ための判定と依頼（docs/display.md 4.2「各表示物」・docs/design.md 4.3）。
//
// **押せるのは git 管理下の一覧にあるパスだけ**（誤検出を避ける第一候補。任意の文字列を外部
// コマンドへ渡さないのはサーバ側でも見る。`src/server/core/tracked-file.ts` の `openTrackedFile`）。
// **行番号へは飛ばない**（Orca に口が無い）ので、`:12` / `:12:5` の形は末尾を落として照合し、
// 開くのは裸のパスだけ（表示の `:12` はそのまま残る）。
//
// **一覧と `open-file` の送り先は React Context で配る。** `Markdown` の `components`
// （`REPORT_COMPONENTS`）は同じ参照を保つ必要があってモジュール定数なので、`Code` / `Pre` /
// `Anchor` へ props で渡せない。既定値は「何も一致しない・押しても何もしない」にしてあるので、
// Provider の無い場（`markdown.test.tsx` の既存テストの大半）でもこれまでの見た目のまま描ける。

import { createContext, useContext, useMemo, type ReactElement, type ReactNode } from "react"

import { useRepositoryFilePaths } from "../../../hooks/use-repository-file-paths.ts"
import { useSessionDispatch } from "../../../stores/session.tsx"

/** 末尾の `:行` または `:行:桁`（数字だけ）。 */
const LINE_SUFFIX_PATTERN = /:\d+(?::\d+)?$/

/**
 * 候補の文字列が git 管理下の一覧にあるパスかどうか。**まず候補そのもの**（フェンスのファイル名・
 * 相対リンク）を見て、無ければ**末尾の行番号を落として**（inline code の `src/foo.ts:12`）
 * もう一度見る。一致した裸のパスを返す。
 *
 * **cwd 相対のパスだけを見る**（絶対パスは正規化しない。決めていること: 人格の規約が
 * cwd 相対で書かせているので、素朴な一致で足りる）。
 */
export function repositoryFilePath(
  candidate: string,
  files: ReadonlySet<string>,
): string | undefined {
  if (files.has(candidate)) {
    return candidate
  }
  const withoutLine = candidate.replace(LINE_SUFFIX_PATTERN, "")
  return withoutLine !== candidate && files.has(withoutLine) ? withoutLine : undefined
}

export type RepositoryFileLink = {
  /** git 管理下のファイルのパス（cwd 相対）の一覧。 */
  readonly files: ReadonlySet<string>
  /** このパスを Orca のエディタで開いてもらう（`open-file` を1回送る）。 */
  readonly open: (path: string) => void
}

/**
 * 既定値は「一致しない・押しても何もしない」。**Provider が無い場でも安全に描けるようにする**
 * ための値で、実データは {@link RepositoryFileLinkProvider} だけが差し込む。
 */
const REPOSITORY_FILE_LINK_DEFAULT: RepositoryFileLink = { files: new Set(), open: () => {} }

export const RepositoryFileLinkContext = createContext<RepositoryFileLink>(
  REPOSITORY_FILE_LINK_DEFAULT,
)

/** `Code` / `Pre` / `Anchor` が読む。Provider の外では既定値（一致しない）になる。 */
export function useRepositoryFileLink(): RepositoryFileLink {
  return useContext(RepositoryFileLinkContext)
}

export type RepositoryFileLinkProviderProps = {
  readonly children: ReactNode
}

/**
 * 一覧の取得と `open-file` の送信を配線する Provider。**main-view の入口
 * （`main-view.tsx`）が1回だけ mount する**——レポートを描くのはこの機能の中だけなので、
 * `stores/`（2つ以上の機能が読む状態）へは上げない。
 */
export function RepositoryFileLinkProvider(props: RepositoryFileLinkProviderProps): ReactElement {
  // **常に取りに行く**（`@` 補完と違い、レポートのどこにパスが出るかは描く前に分からない）。
  const paths = useRepositoryFilePaths(true)
  const dispatch = useSessionDispatch()
  const files = useMemo(() => new Set(paths), [paths])
  const link: RepositoryFileLink = {
    files,
    open: (path) => {
      dispatch({ type: "open-file", path })
    },
  }

  return (
    <RepositoryFileLinkContext.Provider value={link}>
      {props.children}
    </RepositoryFileLinkContext.Provider>
  )
}
