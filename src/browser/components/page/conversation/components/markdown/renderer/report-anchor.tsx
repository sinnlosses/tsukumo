import clsx from "clsx"
import type { JSX, ReactElement } from "react"
import type { ExtraProps } from "react-markdown"

import {
  breakPathText,
  repositoryFileTarget,
  RepositoryFileLinkTarget,
  useRepositoryFileLink,
} from "../../repository-link/repository-link.tsx"
import styles from "./report-notation.module.css"
import { isSourceLink } from "./source-link.ts"

type AnchorProps = JSX.IntrinsicElements["a"] & ExtraProps

/**
 * リンク。
 * スキームの許可は `REPORT_SANITIZE_SCHEMA` の `protocols` が済ませている（通らない `href` はここに来る前に落ちている）ので、`http:` / `https:` / `mailto:` はそのまま `<a>` にする（`rel="noopener noreferrer"` を添えるだけ）。
 *
 * ページ内のリンク（`#` で始まるもの。脚注の往復・合図の行のお願いの口）は、押すと `location.hash` を書かずに飛び先の `id` の要素へ転がす。
 * `location.hash` は画面と見ているターンの経路なので、書くと見ているターンが外れる。
 *
 * スキームの無い相対リンク（`[x](src/foo.ts)`）は `<a>` にしない。
 * `protocols` は相対リンクを素通しするので、`<a>` にすると押したときにページ自身が `/src/foo.ts` へ遷移してしまう。
 * - git 管理下の一覧にあれば、押すと Orca のエディタで開くボタン
 * - 無ければ、ファイルを指さないリンクなので押しても何も起きない素のテキスト（`<span>`）
 */
export function Anchor(props: AnchorProps): ReactElement {
  const { node: _node, children, href, title, className } = props
  const link = useRepositoryFileLink()

  if (href?.startsWith("#") === true) {
    const targetId = href.slice(1)
    return (
      <a
        href={href}
        title={title}
        className={className}
        onClick={(event) => {
          event.preventDefault()
          event.currentTarget.ownerDocument
            .getElementById(targetId)
            ?.scrollIntoView({ block: "start" })
        }}
      >
        {children}
      </a>
    )
  }

  if (href === undefined || hasUrlScheme(href)) {
    const isSource =
      href !== undefined && typeof children === "string" && isSourceLink(href, children)
    return (
      <a
        href={href}
        title={title}
        className={isSource ? clsx(className, styles["report-source"]) : className}
        rel="noopener noreferrer"
      >
        {children}
      </a>
    )
  }

  const target = repositoryFileTarget(href, link.files)
  if (target === undefined) {
    return (
      <span title={title} className={className}>
        {children}
      </span>
    )
  }
  return (
    <RepositoryFileLinkTarget
      target={target}
      title={title}
      className={clsx(styles["report-file-link"], className)}
    >
      {breakPathText(children, styles["report-path-glue"])}
    </RepositoryFileLinkTarget>
  )
}

/** `href` にスキーム（`https:` のような `<scheme>:` の頭）があるかどうか。 */
function hasUrlScheme(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href)
}
