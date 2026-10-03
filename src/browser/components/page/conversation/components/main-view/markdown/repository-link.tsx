// レポートに書かれたパス（inline code・フェンスのファイル名・相対リンクの3か所。`Code` / `Pre` / `Anchor`）を、押すと Orca のエディタで開ける部品にするための判定と依頼。
//
// 押せるのは git 管理下の一覧にあるパスだけ（任意の文字列を外部コマンドへ渡さないのはサーバ側の `openTrackedFile` でも見る）。
// 行番号へは飛ばない（Orca に口が無い）ので、`:12` / `:12:5` の形は末尾を落として照合し、開くのは裸のパスだけ（表示の `:12` はそのまま残る）。
//
// 一覧と `host.openFile` の送り先は React Context で配る。
// `Markdown` の `components`（`REPORT_COMPONENTS`）は同じ参照を保つ必要があってモジュール定数なので、`Code` / `Pre` / `Anchor` へ props で渡せない。
// 既定値は「何も一致しない・押しても何もしない」にしてあるので、Provider の無い場（テストの大半）でもそのまま描ける。

import { createContext, useContext, type ReactElement, type ReactNode } from "react"

import { useSession } from "../../../../../../stores/session.ts"
import { isActivationKey } from "../../hooks/activation-key.ts"
import { useRepositoryFilePaths } from "../../hooks/use-repository-file-paths.ts"

/** 末尾の `:行` または `:行:桁`（数字だけ）。 */
const LINE_SUFFIX_PATTERN = /:\d+(?::\d+)?$/

/**
 * 候補の文字列が git 管理下の一覧にあるパスかどうか。一致した裸のパスを返す。
 * まず候補そのもの（フェンスのファイル名・相対リンク）を見て、無ければ末尾の行番号を落として（inline code の `src/foo.ts:12`）もう一度見る。
 *
 * cwd 相対のパスだけを見る（絶対パスは正規化しない。人格の指示が cwd 相対で書かせているので、素朴な一致で足りる）。
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
  /** このパスを Orca のエディタで開いてもらう（`host.openFile` を1回送る）。 */
  readonly open: (path: string) => void
}

/**
 * 既定値は「一致しない・押しても何もしない」。
 * Provider が無い場でも安全に描けるようにするための値で、実データは {@link RepositoryFileLinkProvider} だけが差し込む。
 */
const REPOSITORY_FILE_LINK_DEFAULT: RepositoryFileLink = { files: new Set(), open: () => {} }

export const RepositoryFileLinkContext = createContext<RepositoryFileLink>(
  REPOSITORY_FILE_LINK_DEFAULT,
)

/** Provider の外では既定値（一致しない）になる。 */
export function useRepositoryFileLink(): RepositoryFileLink {
  return useContext(RepositoryFileLinkContext)
}

export type RepositoryFileLinkTargetProps = {
  /** 開く裸のパス（{@link repositoryFilePath} の戻り値）。 */
  readonly path: string
  readonly title?: string | undefined
  readonly className: string
  readonly children: ReactNode
}

/**
 * 押せるパス。
 * `<button>` は Chrome が inline-block に強制して文の中で折り返せないので、`role="button"` の `<span>` にする。
 * 文字が選べるので、選び終えた click では開かない。
 */
export function RepositoryFileLinkTarget(props: RepositoryFileLinkTargetProps): ReactElement {
  const link = useRepositoryFileLink()

  return (
    <span
      role="button"
      tabIndex={0}
      title={props.title}
      className={props.className}
      onClick={(event) => {
        if (event.currentTarget.ownerDocument.getSelection()?.isCollapsed === false) {
          return
        }
        link.open(props.path)
      }}
      onKeyDown={(event) => {
        if (!isActivationKey(event.key)) {
          return
        }
        // Space はページを送る既定の動作を持つ。
        event.preventDefault()
        link.open(props.path)
      }}
    >
      {props.children}
    </span>
  )
}

export type RepositoryFileLinkProviderProps = {
  readonly children: ReactNode
}

/** 一覧の取得と `host.openFile` の送信を配線する Provider。 */
export function RepositoryFileLinkProvider(props: RepositoryFileLinkProviderProps): ReactElement {
  // 常に取りに行く（`@` 補完と違い、レポートのどこにパスが出るかは描く前に分からない）。
  const paths = useRepositoryFilePaths(true)
  const dispatch = useSession((session) => session.dispatch)
  const files = new Set(paths)
  const link: RepositoryFileLink = {
    files,
    open: (path) => {
      dispatch.host.openFile({ path })
    },
  }

  return (
    <RepositoryFileLinkContext.Provider value={link}>
      {props.children}
    </RepositoryFileLinkContext.Provider>
  )
}
