// レポート（発話の詳細）の Markdown を HTML に描く、unified（react-markdown 一式）の構成。
//
// もとは移行前の自前レンダラ（行ベースのパーサ、約300行）
// だったものを、移行の段6で unified に置き換えた（docs/design.md 6.3）。対応する記法が広がる
// （引用・ネストしたリスト・水平線・GFM の列揃えは自前の実装では描けなかった）。
//
// - `remark-gfm` で表・取り消し線・自動リンク・チェックボックス・列揃え（`:---:` / `---:`）を読む
// - `remark-cjk-friendly` で、CommonMark の delimiter run 規則（強調記号の直前・直後が約物だと
//   強調と認識されない）を日本語向けに補う。CommonMark の仕様どおりの挙動として、
//   `「呼んだか」` のように中身を約物で始める・終える強調が記法のまま出てしまう
//   （旧レンダラは素朴な正規表現 `/\*\*([^*]+)\*\*/g` だったので、この規則に関係なく通っていた）。
//   このリポジトリのレポートは `「…」` を多用するため、このプラグインで直す
// - {@link rehypeCodeFileName} で、フェンスの info 文字列に書いたファイル名を `code` の属性に移す
//   （`rehype-raw` より前。理由は `code-file-name.ts`）
// - `rehype-raw` で、Markdown の中に直接書いた HTML ブロック・インライン HTML を解釈する
// - {@link rehypeTaskCheck} で、チェックリストの `<input type="checkbox">` を静的な印に畳む
//   （サニタイズより前。理由は `task-check.ts`）
// - `rehype-sanitize`（{@link REPORT_SANITIZE_SCHEMA}）で許可リストに無い要素・属性を落とす。
//   サニタイズはここ1箇所に集約（docs/display.md 4.2）
// - `rehype-highlight` でコードの色付け（`pre > code` に `hljs` の class と `<span>` を足す。
//   テーマ CSS は `/vendor/highlight-theme.min.css` としてサーバが配る。
//   `src/server/view-server/adapter/vendor-asset.ts`）
//
// ```mermaid / ```chart のフェンスは「コード」ではなく図・グラフの入れ物にする
// （{@link MermaidBlock} / {@link ChartBlock}）。`pre` を上書きし、中の `code` 要素の
// `className`（`language-mermaid` / `language-chart`）を見て振り分ける。
//
// レポートの記法の class 名（`note` / `badge` / `cols` / `card` / `stats` / `stat`）は
// `div` / `span` の上書きで部品に解決する（{@link NotationBlock} / {@link NotationInline}）。
//
// 表は横スクロールの器で包む（{@link Table}）。器をここで作るのは、`rehype-raw` が生の
// HTML も同じ hast の木に入れるので、`table` の上書き1つで Markdown の表とレポートが直接
// 書いた `<table>` の両方に効くため。
//
// git 管理下のパスを押すと Orca のエディタで開ける（inline code・フェンスのファイル名・
// 相対リンクの3か所。判定と依頼は {@link repositoryFilePath} / `repository-link.tsx` に
// まとめてある）。

import clsx from "clsx"
import { type Element } from "hast"
import { type JSX, type ReactElement, type ReactNode } from "react"
import ReactMarkdown, { type Components, type ExtraProps, type Options } from "react-markdown"
import rehypeHighlight from "rehype-highlight"
import rehypeRaw from "rehype-raw"
import rehypeSanitize from "rehype-sanitize"
import remarkCjkFriendly from "remark-cjk-friendly"
import remarkGfm from "remark-gfm"

import { optionalString } from "../../../../../../../shared/utils/optional-string.ts"
import { ChartBlock } from "./chart-block.tsx"
import { CODE_FILE_NAME_PROPERTY, rehypeCodeFileName } from "./code-file-name.ts"
import { colorSwatch, readColorToken } from "./color-swatch.ts"
import { MermaidBlock } from "./mermaid-block.tsx"
import { NotationBlock, NotationInline } from "./notation.tsx"
import styles from "./report-notation.module.css"
import { repositoryFilePath, useRepositoryFileLink } from "./repository-link.tsx"
import { REPORT_SANITIZE_SCHEMA } from "./sanitize-schema.ts"
import { rehypeTaskCheck } from "./task-check.ts"

/**
 * hast の要素をどの部品で描くか。レンダーごとに作り直さない（同じ参照でないと
 * react-markdown が木を作り直す）ので、モジュールの定数に置く。
 */
const REPORT_COMPONENTS = {
  pre: Pre,
  code: Code,
  a: Anchor,
  table: Table,
  h2: SectionHeading,
  h3: SubHeading,
  div: NotationBlock,
  span: NotationInline,
} satisfies Components

/**
 * 脚注（`[^1]`）の節に mdast-util-to-hast が付ける英語の語を、日本語に替える。既定は
 * `<h2 class="sr-only">Footnotes</h2>` で、`sr-only` の CSS はこのページに無い（機能ごとの
 * CSS Modules は class 名をハッシュ化するので、当てる側で受け取ることもできない）。
 * そのままだと英語の見出しが本文に見える。
 *
 * 隠すのではなく見出しとして出す（`footnoteLabelProperties` を空にして `sr-only` を外す）。
 * 脚注の節は本文の続きに `<ol>` が現れるだけなので、見出しが無いと地の文の箇条書きと
 * 見分けが付かない。タグは既定の `h2` のままにして、{@link SectionHeading} の書き替え
 * （`h4`）と同じ段に乗せる。
 */
const FOOTNOTE_OPTIONS = {
  footnoteLabel: "脚注",
  footnoteLabelProperties: {},
  footnoteBackLabel: "参照元へ戻る",
} satisfies NonNullable<Options["remarkRehypeOptions"]>

export type MarkdownProps = {
  readonly text: string
}

/** レポート1件分（または `split-blocks.ts` の `splitReportBlocks` で割った1塊）の Markdown を描く。 */
export function Markdown(props: MarkdownProps): ReactElement {
  return (
    <ReactMarkdown
      // remark-cjk-friendly は remark-gfm より後（README の使用例どおり）。
      // 効くのは `` と `*` だけで、GFM の取り消し線 `~~` には効かない（あちらは
      // micromark-extension-gfm-strikethrough の別の判定を通るため。直すには
      // remark-cjk-friendly-gfm-strikethrough が要る）。取り消し線はレポートの規約
      // （src/server/report/core/report-notation.ts）が勧めていないので、穴のまま置いてある。
      remarkPlugins={[remarkGfm, remarkCjkFriendly]}
      rehypePlugins={[
        // rehype-raw より前（フェンスのファイル名は `data.meta` に入っていて、raw が木を
        // HTML へ書き出して読み直すと落ちるため。`code-file-name.ts`）。
        rehypeCodeFileName,
        rehypeRaw,
        rehypeTaskCheck,
        [rehypeSanitize, REPORT_SANITIZE_SCHEMA],
        rehypeHighlight,
      ]}
      remarkRehypeOptions={FOOTNOTE_OPTIONS}
      components={REPORT_COMPONENTS}
    >
      {props.text}
    </ReactMarkdown>
  )
}

type PreProps = JSX.IntrinsicElements["pre"] & ExtraProps

/**
 * フェンス付きコードブロックの入れ物。`node`（hast の `pre` 要素。react-markdown が渡す）の
 * 中の `code` 要素の `className` を見て、`language-mermaid` / `language-chart` なら
 * {@link MermaidBlock} / {@link ChartBlock} に振り、それ以外は素の `<pre>` のまま描く
 * （色付けは `rehype-highlight` がすでにこの木に当ててある）。
 *
 * フェンスにファイル名が書いてあれば、ブロックの左上にラベルとして出す
 * （```diff src/foo.ts。{@link rehypeCodeFileName} が属性に移してある）。差分だけを見て
 * どのファイルか分からない、を防ぐため。書いていないフェンスは素の `<pre>` のままで、
 * ラベルの行は出ない。git 管理下の一覧にあるファイル名は押せるボタンにする
 * （`repository-link.tsx`）。
 */
function Pre(props: PreProps): ReactElement {
  const codeNode = findCodeChild(props.node)

  if (codeNode !== undefined) {
    const language = codeLanguage(codeNode)
    if (language === "mermaid") {
      return <MermaidBlock code={hastText(codeNode)} />
    }
    if (language === "chart") {
      return <ChartBlock spec={hastText(codeNode)} />
    }
  }

  // eslint 等の警告を避けるため node は展開して渡さない。
  const { node: _node, ...rest } = props
  const fileName = codeNode === undefined ? undefined : codeFileName(codeNode)

  if (fileName === undefined) {
    return <pre {...rest} />
  }
  return (
    <div className={styles["code-file"]}>
      <div className={styles["code-file-name"]}>
        <FileNameLabel fileName={fileName} />
      </div>
      <pre {...rest} />
    </div>
  )
}

/** フェンスのファイル名のラベル。一覧にあれば押せるボタン、無ければ素のテキスト。 */
function FileNameLabel(props: { readonly fileName: string }): ReactElement {
  const link = useRepositoryFileLink()
  const path = repositoryFilePath(props.fileName, link.files)

  if (path === undefined) {
    return <>{props.fileName}</>
  }
  return (
    <button
      type="button"
      className={styles["report-file-link"]}
      onClick={() => {
        link.open(path)
      }}
    >
      {props.fileName}
    </button>
  )
}

function findCodeChild(node: Element | undefined): Element | undefined {
  return node?.children.find(
    (child): child is Element => child.type === "element" && child.tagName === "code",
  )
}

/**
 * フェンスに書かれたファイル名。`code-file-name.ts` が属性に移し、サニタイザが通したものだけが
 * ここに来る（モデルが書いた文字列なので、型の上では何が入っていてもよい形で受ける）。
 */
function codeFileName(codeNode: Element): string | undefined {
  return optionalString(codeNode.properties[CODE_FILE_NAME_PROPERTY])
}

function codeLanguage(codeNode: Element): string | undefined {
  const match = (codeNode.properties.className ?? []).find((name) => name.startsWith("language-"))
  return match?.slice("language-".length)
}

/** hast の要素の中身を、素のテキストとして連結する（highlight.js が足した `<span>` も無視する）。 */
function hastText(node: Element): string {
  return node.children.map(hastNodeText).join("")
}

function hastNodeText(node: Element["children"][number]): string {
  if (node.type === "text") {
    return node.value
  }
  return node.type === "element" ? node.children.map(hastNodeText).join("") : ""
}

type SectionHeadingProps = JSX.IntrinsicElements["h2"] & ExtraProps

/**
 * レポートの見出し `##`（mdast の depth 2。hast では `h2`）を `h4` として描く。ページには
 * 利用者の依頼を示す本物の `<h2 className={styles["turn-title"]}>` が1つあるので（`turn-header.tsx`）、
 * レポートの中の見出しが同じ段に並ぶと見出しの階層が壊れる。許可リスト
 * （{@link REPORT_SANITIZE_SCHEMA}）には `h2` のまま残す（サニタイズはここより前に効くので、
 * 落としてしまうと書き替える前に中身が消える）。見た目は `.detail-block h4`
 * （`report-notation.module.css`）。
 */
function SectionHeading(props: SectionHeadingProps): ReactElement {
  const { node: _node, children, ...rest } = props
  return <h4 {...rest}>{children as ReactNode}</h4>
}

type SubHeadingProps = JSX.IntrinsicElements["h3"] & ExtraProps

/** レポートの見出し `###`（hast では `h3`）を `h5` として描く。{@link SectionHeading} と同じ理由。 */
function SubHeading(props: SubHeadingProps): ReactElement {
  const { node: _node, children, ...rest } = props
  return <h5 {...rest}>{children as ReactNode}</h5>
}

type CodeProps = JSX.IntrinsicElements["code"] & ExtraProps

/**
 * コード（inline code・フェンスの中の `<code>` の両方がここを通る）。中身の文字が git 管理下の
 * 一覧にあるパスなら、押せるボタンで包む（人格の規約が `file_path:line_number` の形で書く
 * inline code）。フェンスの中の複数行のコードは1つのパスと一致しないので、そのまま
 * `<code>` になる（色付け・言語の `className` は変えない）。
 *
 * 中身の文字が1つの色（カラーコードか色のトークン名）なら、その色を地にする
 * （{@link colorSwatch}）。「`ink-quiet`（灰）」のように言葉で色を言い添えなくても見て分かる。
 */
function Code(props: CodeProps): ReactElement {
  const { node, children, className, ...rest } = props
  const link = useRepositoryFileLink()
  const text = node === undefined ? "" : hastText(node)
  const path = node === undefined ? undefined : repositoryFilePath(text, link.files)

  if (path === undefined) {
    const swatch = node === undefined ? undefined : colorSwatch(text, readColorToken)
    return swatch === undefined ? (
      <code className={className} {...rest}>
        {children as ReactNode}
      </code>
    ) : (
      <code
        {...rest}
        className={clsx(
          className,
          styles["report-color"],
          styles[`report-color-ink-${swatch.ink}`],
        )}
        style={{ background: swatch.background }}
      >
        {children as ReactNode}
      </code>
    )
  }
  const code = (
    <code className={className} {...rest}>
      {children as ReactNode}
    </code>
  )
  return (
    <button
      type="button"
      className={styles["report-file-link"]}
      onClick={() => {
        link.open(path)
      }}
    >
      {code}
    </button>
  )
}

type AnchorProps = JSX.IntrinsicElements["a"] & ExtraProps

/**
 * リンク。スキームの許可は {@link REPORT_SANITIZE_SCHEMA} の `protocols` が済ませている
 * （通らない `href` はここに来る前に落ちている）ので、`http:` / `https:` / `mailto:` と、
 * ページ内の合図（`#fnref` のような脚注の往復）はそのまま `<a>` にする（外部へ飛ぶときの
 * 安全策 `rel="noopener noreferrer"` を添えるだけ）。
 *
 * スキームの無い相対リンク（`[x](src/foo.ts)`）は別扱い。 押すとページ自身が
 * `/src/foo.ts` へ遷移してしまう不具合があった（`sanitize-schema.ts` の `protocols` は相対
 * リンクを素通しするため）ので、`<a>` にしない:
 * - git 管理下の一覧にあれば、押すと Orca のエディタで開くボタン
 * - 無ければ、ファイルを指さないリンクなので押しても何も起きない素のテキスト（`<span>`）
 */
function Anchor(props: AnchorProps): ReactElement {
  const { node: _node, children, href, title, className } = props
  const link = useRepositoryFileLink()

  if (href === undefined || href.startsWith("#") || hasUrlScheme(href)) {
    return (
      <a href={href} title={title} className={className} rel="noopener noreferrer">
        {children as ReactNode}
      </a>
    )
  }

  const path = repositoryFilePath(href, link.files)
  if (path === undefined) {
    return (
      <span title={title} className={className}>
        {children as ReactNode}
      </span>
    )
  }
  return (
    <button
      type="button"
      title={title}
      className={clsx(styles["report-file-link"], className)}
      onClick={() => {
        link.open(path)
      }}
    >
      {children as ReactNode}
    </button>
  )
}

/** `href` にスキーム（`https:` のような `<scheme>:` の頭）があるかどうか。 */
function hasUrlScheme(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href)
}

type TableProps = JSX.IntrinsicElements["table"] & ExtraProps

/**
 * 表。列が多い表は領域の内幅に収まらないので、横スクロールの器で包んで表だけを転がす
 * （ページ全体は横スクロールさせない。`.table-scroll` の CSS は `report-notation.module.css`）。
 * 器は React 側で作るので、{@link REPORT_SANITIZE_SCHEMA} の許可リストは通らない
 * （レポートの記法は増えない）。
 */
function Table(props: TableProps): ReactElement {
  const { node: _node, children, ...rest } = props
  return (
    <div className={styles["table-scroll"]}>
      <table {...rest}>{children as ReactNode}</table>
    </div>
  )
}
