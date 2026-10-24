// レポートに書かれたパス（inline code・フェンスのファイル名・相対リンクの3か所。`Code` / `Pre` / `Anchor`）を、押すと Orca のエディタで開ける部品にするための判定と依頼。
//
// 押せるのは git 管理下の一覧にあるパスだけ（任意の文字列を外部コマンドへ渡さないのはサーバ側の `openTrackedFile` でも見る）。
// 行番号へは飛ばない（Orca に口が無い）ので、`:12` / `:12:5` / `:10-14` の形は末尾を落として照合し、開くのは裸のパスだけ（表示の `:12` はそのまま残る）。
// 行番号のあるパスは、重ねるかフォーカスして待つと、その行の前後の抜き書きを浮かせて出す（`FileExcerptPeek`）。
//
// 一覧と `host.openFile` の送り先と抜き書きの読み口は React Context で配る。
// `Markdown` の `components`（`REPORT_COMPONENTS`）は同じ参照を保つ必要があってモジュール定数なので、`Code` / `Pre` / `Anchor` へ props で渡せない。
// 既定値は「何も一致しない・押しても何もしない」にしてあるので、Provider の無い場（テストの大半）でもそのまま描ける。

import {
  Children,
  createContext,
  Fragment,
  useContext,
  useId,
  type ReactElement,
  type ReactNode,
} from "react"

import {
  type FileExcerpt,
  type FileExcerptRequest,
  UNREADABLE_FILE_EXCERPT,
} from "../../../../../../shared/repository/file-excerpt.ts"
import { withOccurrenceKeys } from "../../../../../domain/occurrence-key.ts"
import { rpc } from "../../../../../domain/rpc.ts"
import { useSession } from "../../../../../stores/session.ts"
import { isActivationKey } from "../hooks/activation-key.ts"
import { useRepositoryFilePaths } from "../hooks/use-repository-file-path-list.ts"
import { FileExcerptPeek } from "./components/file-excerpt-peek/file-excerpt-peek.tsx"
import type { PointedLines } from "./domain/pointed-line-range.ts"
import { useFileExcerptPeek } from "./hooks/use-file-excerpt-peek.ts"

/** 末尾の `:行`・`:行:桁`・`:行-行`（数字だけ）。1つ目の組が頭の行、2つ目の組が範囲の終わりの行。 */
const LINE_SUFFIX_PATTERN = /:(\d+)(?::\d+|-(\d+))?$/

/** 押せるパス。開くのは `path`（裸のパス）で、抜き書きは `pointed` の行の前後。 */
type RepositoryFileTarget = {
  readonly path: string
  readonly pointed: PointedLines
}

const NO_POINTED_LINES = { kind: "none" } as const satisfies PointedLines

/**
 * 候補の文字列が git 管理下の一覧にあるパスかどうか。一致したら裸のパスと、末尾に書かれた行を返す。
 * まず候補そのもの（フェンスのファイル名・相対リンク）を見て、無ければ末尾の行番号を落として（inline code の `src/foo.ts:12`）もう一度見る。
 *
 * cwd 相対のパスだけを見る（絶対パスは正規化しない。人格の指示が cwd 相対で書かせているので、素朴な一致で足りる）。
 */
export function repositoryFileTarget(
  candidate: string,
  files: ReadonlySet<string>,
): RepositoryFileTarget | undefined {
  if (files.has(candidate)) {
    return { path: candidate, pointed: NO_POINTED_LINES }
  }
  const match = LINE_SUFFIX_PATTERN.exec(candidate)
  if (match === null) {
    return undefined
  }
  const path = candidate.slice(0, match.index)
  return files.has(path) ? { path, pointed: pointedLinesOf(match) } : undefined
}

/**
 * パスの文字列で、折り返しの機会を `/` の直後（`<wbr>`）だけにする。
 * ハイフンの直後には、`glueClassName` の空の span を置く（CSS が見えない結合子を生成して折れなくする）。
 * 文字列でない子（強調など）はそのまま通す。表示の字は変わらない。
 */
export function breakPathText(children: ReactNode, glueClassName: string): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child !== "string") {
      return child
    }
    return withOccurrenceKeys(child.split(/(?<=[/-])/), (piece) => piece).map(
      ({ key, item: piece }) => (
        <Fragment key={key}>
          {piece}
          {piece.endsWith("/") && <wbr />}
          {piece.endsWith("-") && <span className={glueClassName} />}
        </Fragment>
      ),
    )
  })
}

type RepositoryFileLink = {
  /** git 管理下のファイルのパス（cwd 相対）の一覧。 */
  readonly files: ReadonlySet<string>
  /** このパスを Orca のエディタで開いてもらう（`host.openFile` を1回送る）。 */
  readonly open: (path: string) => void
  /** 指した行の前後の抜き書きを読む（手続き `repository.fileExcerpt`）。 */
  readonly readExcerpt: (request: FileExcerptRequest) => Promise<FileExcerpt>
}

/**
 * 既定値は「一致しない・押しても何もしない」。
 * Provider が無い場でも安全に描けるようにするための値で、実データは {@link RepositoryFileLinkProvider} だけが差し込む。
 */
const REPOSITORY_FILE_LINK_DEFAULT: RepositoryFileLink = {
  files: new Set(),
  open: () => {},
  readExcerpt: () => Promise.resolve(UNREADABLE_FILE_EXCERPT),
}

const RepositoryFileLinkContext = createContext<RepositoryFileLink>(REPOSITORY_FILE_LINK_DEFAULT)

/** Provider の外では既定値（一致しない）になる。 */
export function useRepositoryFileLink(): RepositoryFileLink {
  return useContext(RepositoryFileLinkContext)
}

type RepositoryFileLinkTargetProps = {
  /** 開くパスと指した行（{@link repositoryFileTarget} の戻り値）。 */
  readonly target: RepositoryFileTarget
  readonly title: string | undefined
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
  const { state, anchorRef, ...peek } = useFileExcerptPeek(
    props.target.pointed,
    props.target.path,
    link.readExcerpt,
  )
  const peekId = useId()

  // 浮きは押せるパスの子にしない（浮きの中の押下が押せるパスの click として届くと開いてしまう）。
  return (
    <>
      <span
        ref={anchorRef}
        role="button"
        tabIndex={0}
        title={props.title}
        className={props.className}
        aria-describedby={state.kind === "shown" ? peekId : undefined}
        onClick={(event) => {
          if (event.currentTarget.ownerDocument.getSelection()?.isCollapsed === false) {
            return
          }
          link.open(props.target.path)
        }}
        onKeyDown={(event) => {
          if (!isActivationKey(event.key)) {
            return
          }
          // Space はページを送る既定の動作を持つ。
          event.preventDefault()
          link.open(props.target.path)
        }}
        onPointerEnter={(event) => {
          peek.onPointerEnter(event.pointerType)
        }}
        onPointerLeave={peek.dismiss}
        onFocus={(event) => {
          peek.onFocus(event.currentTarget)
        }}
        onBlur={peek.dismiss}
      >
        {props.children}
      </span>
      {state.kind === "shown" && (
        <FileExcerptPeek
          id={peekId}
          path={props.target.path}
          pointed={state.pointed}
          excerpt={state.excerpt}
          anchor={state.anchor}
        />
      )}
    </>
  )
}

type RepositoryFileLinkProviderProps = {
  readonly children: ReactNode
}

/** 一覧の取得と `host.openFile` の送信と抜き書きの読み口を配線する Provider。 */
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
    readExcerpt: (request) => rpc.repository.fileExcerpt.call(request),
  }

  return (
    <RepositoryFileLinkContext.Provider value={link}>
      {props.children}
    </RepositoryFileLinkContext.Provider>
  )
}

/** 末尾の行番号の組から行を作る。0 行目や、終わりが頭より前の範囲は行が無いものとして扱う。 */
function pointedLinesOf(match: RegExpExecArray): PointedLines {
  const startLine = Number(match[1])
  const endLine = match[2] === undefined ? startLine : Number(match[2])
  return startLine >= 1 && endLine >= startLine
    ? { kind: "lines", startLine, endLine }
    : NO_POINTED_LINES
}
