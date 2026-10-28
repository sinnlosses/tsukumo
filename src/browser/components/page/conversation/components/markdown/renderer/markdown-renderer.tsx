// レポート（ターンの本文の詳細）の Markdown を HTML に描く、unified（react-markdown 一式）の構成。
//
// - `remark-gfm` で表・取り消し線・自動リンク・チェックボックス・列揃え（`:---:` / `---:`）を読む
// - `remark-cjk-friendly` で、CommonMark の delimiter run 規則（強調記号の直前・直後が約物だと強調と認識されない）を日本語向けに補う。
//   無いと `「呼んだか」` のように中身を約物で始める・終える強調が記法のまま出てしまい、レポートは `「…」` を多用する
// - `rehypeCodeFileName` で、フェンスの info 文字列に書いたファイル名を `code` の属性に移す（`rehype-raw` より前）
// - `rehype-raw` で、Markdown の中に直接書いた HTML ブロック・インライン HTML を解釈する
// - `rehypeTaskCheck` で、チェックリストの `<input type="checkbox">` を静的な印に畳む（サニタイズより前）
// - `rehype-sanitize`（`REPORT_SANITIZE_SCHEMA`）で許可リストに無い要素・属性を落とす。サニタイズはここ1箇所に集約
// - `rehypeInlineMark` で、文中の行内の印（`{{12 → 8}}` など）を `span` に替える（サニタイズのあと。`code`・`pre` の中は触らない）
// - `rehype-highlight` でコードの色付け（`pre > code` に `hljs` の class と `<span>` を足す。テーマ CSS は `/vendor/highlight-theme.min.css` としてサーバが配る）
//
// ```mermaid / ```chart のフェンスは「コード」ではなく図・グラフの入れ物にする（`MermaidBlock` / `ChartBlock`）。
// `pre` を上書きし、中の `code` 要素の `className`（`language-mermaid` / `language-chart`）を見て振り分ける。
//
// レポートの記法の class 名は `div` / `aside` / `span` / `ol` / `li` の上書きで部品に解決する
// （`NotationBlock` / `NotationAside` / `NotationInline` / `NotationOrderedList` / `NotationListItem`）。
//
// `img` は `ReportImage` で、棚の画像を起動トークンを付けて読む（読めなければ「出せない」の札）。
// 質問の preview（`QuestionPreviewMarkdown`）は、Markdown の画像を質問の棚の経路に替える段（`remarkPreviewImage`）を足して描く。
//
// 長い表と一覧は `TableBody` / `UnorderedList` / `OrderedList` の上書きが切る。
//
// 表は横スクロールの器で包む（`Table`）。
// 器をここで作るのは、`rehype-raw` が生の HTML も同じ hast の木に入れるので、`table` の上書き1つで Markdown の表とレポートが直接書いた `<table>` の両方に効くため。
//
// git 管理下のパスを押すと Orca のエディタで開ける（inline code・フェンスのファイル名・相対リンクの3か所。判定は `repositoryFileTarget`）。

import clsx from "clsx"
import type { Root } from "hast"
import type { JSX, ReactElement } from "react"
import ReactMarkdown, { type Components, type ExtraProps, type Options } from "react-markdown"
import rehypeHighlight from "rehype-highlight"
import rehypeRaw from "rehype-raw"
import rehypeSanitize from "rehype-sanitize"
import remarkCjkFriendly from "remark-cjk-friendly"
import remarkGfm from "remark-gfm"

import { markdownInline } from "../../../../../../../shared/report/report-inline-markdown.ts"
import {
  breakPathText,
  repositoryFileTarget,
  RepositoryFileLinkTarget,
  useRepositoryFileLink,
} from "../../repository-link/repository-link.tsx"
import { ChartBlock } from "./chart-block.tsx"
import { rehypeCodeFileName } from "./code-file-name.ts"
import { CodeLines } from "./code-line-list.tsx"
import { splitCodeLines } from "./code-line.ts"
import {
  codeFileName,
  codeLanguage,
  codeMarks,
  codeSourceText,
  findCodeChild,
  hastText,
} from "./code-node.ts"
import { CopyButton } from "./copy-button.tsx"
import { diffWordRanges, type DiffWordRanges } from "./diff-pair.ts"
import { OrderedList, TableBody, UnorderedList } from "./folded-block.tsx"
import { GaugeBlock } from "./gauge-block.tsx"
import { REPORT_HAST_CACHE, type HastCache } from "./hast-cache.ts"
import { HistogramBlock } from "./histogram-block.tsx"
import { MermaidBlock } from "./mermaid-block.tsx"
import { NotationAside, NotationBlock, NotationInline, NotationListItem } from "./notation.tsx"
import { remarkPreviewImage } from "./preview-image.ts"
import { rehypeInlineMark } from "./rehype-inline-mark.ts"
import { Anchor } from "./report-anchor.tsx"
import { Code } from "./report-code.tsx"
import { ReportImage } from "./report-image.tsx"
import styles from "./report-notation.module.css"
import { REPORT_SANITIZE_SCHEMA } from "./sanitize-schema.ts"
import { ScatterBlock } from "./scatter-block.tsx"
import { shellCommandText, shellLineKinds } from "./shell-line.ts"
import { rehypeStyleAllowlist } from "./style-allowlist.ts"
import { rehypeTaskCheck } from "./task-check.ts"

/** hast の要素をどの部品で描くか。レンダーごとに作り直さない（同じ参照でないと react-markdown が木を作り直す）ので、モジュールの定数に置く。 */
const REPORT_COMPONENTS = {
  pre: Pre,
  code: Code,
  a: Anchor,
  table: Table,
  h2: SectionHeading,
  h3: SubHeading,
  div: NotationBlock,
  aside: NotationAside,
  span: NotationInline,
  tbody: TableBody,
  ul: UnorderedList,
  ol: OrderedList,
  li: NotationListItem,
  img: ReportImage,
} satisfies Components

/**
 * 脚注（`[^1]`）の節に mdast-util-to-hast が付ける英語の語を、日本語に替える。
 * 既定は `<h2 class="sr-only">Footnotes</h2>` で、`sr-only` の CSS はこのページに無い（CSS Modules は class 名をハッシュ化するので、当てる側で受け取ることもできない）。
 *
 * 隠すのではなく見出しとして出す（`footnoteLabelProperties` を空にして `sr-only` を外す）。
 * 脚注の節は本文の続きに `<ol>` が現れるだけなので、見出しが無いと地の文の箇条書きと見分けが付かない。
 * タグは既定の `h2` のままにして、{@link SectionHeading} の書き替え（`h4`）と同じ段に乗せる。
 */
const FOOTNOTE_OPTIONS = {
  footnoteLabel: "脚注",
  footnoteLabelProperties: {},
  footnoteBackLabel: "参照元へ戻る",
} satisfies NonNullable<Options["remarkRehypeOptions"]>

// remark-cjk-friendly は remark-gfm より後（README の使用例どおり）。
// 効くのは `` と `*` だけで、GFM の取り消し線 `~~` には効かない（あちらは micromark-extension-gfm-strikethrough の別の判定を通るため。直すには remark-cjk-friendly-gfm-strikethrough が要る）。
// 取り消し線はレポートの記法（`REPORT_NOTATION_PROMPT`）が勧めていないので、穴のまま置いてある。
// この2段は、サーバが質問の preview から棚に置く画像を拾う読み方（`questionImagePaths`）とそろえる。
const REPORT_REMARK_PLUGINS = [remarkGfm, remarkCjkFriendly] satisfies NonNullable<
  Options["remarkPlugins"]
>

const REPORT_REHYPE_PLUGINS = [
  // rehype-raw より前（フェンスのファイル名は `data.meta` に入っていて、raw が木を HTML へ書き出して読み直すと落ちるため）。
  rehypeCodeFileName,
  rehypeRaw,
  rehypeTaskCheck,
  // `style` の検査はサニタイザが値の関数を受けないので、ここで済ませる。
  rehypeStyleAllowlist,
  [rehypeSanitize, REPORT_SANITIZE_SCHEMA],
  rehypeInlineMark,
  rehypeHighlight,
] satisfies NonNullable<Options["rehypePlugins"]>

export { InlineCodeText } from "./inline-code-text.tsx"

export type MarkdownProps = {
  readonly text: string
}

/** レポート1件分（または `splitReportBlocks` で割った1塊）の Markdown を描く。 */
export function Markdown(props: MarkdownProps): ReactElement {
  return <ReportMarkdown text={props.text} remarkPlugins={[]} cache={REPORT_HAST_CACHE} />
}

export type QuestionPreviewMarkdownProps = {
  readonly text: string
  /** 質問の tool use id。preview の画像はこの id で棚を引く。 */
  readonly toolUseId: string
}

/** 質問の選択肢の `preview` の Markdown を、レポートと同じ経路で描く。手元の画像はその質問の棚から引く。 */
export function QuestionPreviewMarkdown(props: QuestionPreviewMarkdownProps): ReactElement {
  return (
    <ReportMarkdown
      text={props.text}
      remarkPlugins={[remarkPreviewImage(props.toolUseId)]}
      cache={undefined}
    />
  )
}

/**
 * 段落の `p` を外して、行内の記法だけを描く（葉の部品が1行の字を `p` や `li` の中に置くときに使う）。
 * 描き終えた木は覚えない（覚える鍵は塊の Markdown で、段落の木と混ざる）。
 */
export function InlineMarkdown(props: MarkdownProps): ReactElement {
  return (
    <ReactMarkdown
      remarkPlugins={REPORT_REMARK_PLUGINS}
      rehypePlugins={REPORT_REHYPE_PLUGINS}
      remarkRehypeOptions={FOOTNOTE_OPTIONS}
      components={REPORT_COMPONENTS}
      disallowedElements={["p"]}
      unwrapDisallowed
    >
      {markdownInline(props.text)}
    </ReactMarkdown>
  )
}

/**
 * `remarkPlugins` は、共通の段（GFM・CJK）のあとに足す段。
 *
 * `cache` があれば、描き終えた hast を文字列で覚える。
 * 覚えた文字列は、空の本文を読ませて最後の段で覚えた木に差し替えるので、remark の parse もサニタイズも色付けも走らない。
 * 木は react-markdown が後処理で触るが、2回目以降も結果が変わらない処理だけ。
 */
function ReportMarkdown(props: {
  readonly text: string
  readonly remarkPlugins: NonNullable<Options["remarkPlugins"]>
  readonly cache: HastCache | undefined
}): ReactElement {
  const cached = props.cache?.get(props.text)
  if (cached !== undefined) {
    return (
      <ReactMarkdown
        rehypePlugins={[() => () => cached]}
        remarkRehypeOptions={FOOTNOTE_OPTIONS}
        components={REPORT_COMPONENTS}
      >
        {""}
      </ReactMarkdown>
    )
  }
  return (
    <ReactMarkdown
      remarkPlugins={[...REPORT_REMARK_PLUGINS, ...props.remarkPlugins]}
      rehypePlugins={[
        ...REPORT_REHYPE_PLUGINS,
        () => (tree: Root) => {
          props.cache?.set(props.text, tree)
        },
      ]}
      remarkRehypeOptions={FOOTNOTE_OPTIONS}
      components={REPORT_COMPONENTS}
    >
      {props.text}
    </ReactMarkdown>
  )
}

type PreProps = JSX.IntrinsicElements["pre"] & ExtraProps

const NO_WORD_RANGES: DiffWordRanges = new Map()

/**
 * フェンス付きコードブロックの入れ物。
 * `node`（hast の `pre` 要素。react-markdown が渡す）の中の `code` 要素の `className` を見て、`language-mermaid` / `language-chart` なら {@link MermaidBlock} / {@link ChartBlock} に振り、それ以外は素の `<pre>` のまま描く（色付けは `rehype-highlight` がすでにこの木に当ててある）。
 *
 * それ以外のフェンスは頭に帯を1本添え、{@link CopyButton} を常に置く。
 * フェンスにファイル名が書いてあれば（```diff src/foo.ts）、帯の左にラベルとして出す。
 * git 管理下の一覧にあるファイル名は押せるボタンにする。
 * `marks` のある塊と、コマンドの行のある shell の塊は、行ごとに {@link CodeLines} で描く。
 */
function Pre(props: PreProps): ReactElement {
  const codeNode = findCodeChild(props.node)

  if (codeNode !== undefined) {
    const language = codeLanguage(codeNode)
    if (language === "mermaid") {
      const code = hastText(codeNode)
      return <MermaidBlock key={code} code={code} />
    }
    if (language === "chart") {
      return <ChartBlock spec={hastText(codeNode)} />
    }
    if (language === "number-line" || language === "bullet") {
      return <GaugeBlock spec={hastText(codeNode)} />
    }
    if (language === "scatter") {
      return <ScatterBlock spec={hastText(codeNode)} />
    }
    if (language === "histogram") {
      return <HistogramBlock spec={hastText(codeNode)} />
    }
  }

  // eslint 等の警告を避けるため node は展開して渡さない。
  const { node: _node, ...rest } = props

  if (codeNode === undefined) {
    return <pre {...rest} />
  }
  const fileName = codeFileName(codeNode)
  const marks = codeMarks(codeNode)
  const source = codeSourceText(codeNode)
  const kinds = shellLineKinds(codeLanguage(codeNode), source)
  const isDiff = codeLanguage(codeNode) === "diff"
  const wordRanges = isDiff ? diffWordRanges(source) : NO_WORD_RANGES
  return (
    <div className={styles["code-file"]}>
      <div className={styles["code-file-name"]}>
        {fileName !== undefined && <FileNameLabel fileName={fileName} />}
        <CopyButton text={kinds === undefined ? source : shellCommandText(source, kinds)} />
      </div>
      {marks.length === 0 && kinds === undefined && !isDiff ? (
        <pre {...rest} />
      ) : (
        <pre {...rest}>
          <code className={clsx(codeNode.properties.className)}>
            <CodeLines
              lines={splitCodeLines(codeNode.children)}
              marks={marks}
              kinds={kinds}
              wordRanges={wordRanges}
            />
          </code>
        </pre>
      )}
    </div>
  )
}

/** フェンスのファイル名のラベル。一覧にあれば押せるボタン、無ければ素のテキスト。 */
function FileNameLabel(props: { readonly fileName: string }): ReactElement {
  const link = useRepositoryFileLink()
  const target = repositoryFileTarget(props.fileName, link.files)

  if (target === undefined) {
    return <>{props.fileName}</>
  }
  return (
    <RepositoryFileLinkTarget
      target={target}
      title={undefined}
      className={styles["report-file-link"]}
    >
      {breakPathText(props.fileName, styles["report-path-glue"])}
    </RepositoryFileLinkTarget>
  )
}

type SectionHeadingProps = JSX.IntrinsicElements["h2"] & ExtraProps

/**
 * レポートの見出し `##`（mdast の depth 2。hast では `h2`）を `h4` として描く。
 * ページには利用者の依頼を示す本物の `h2` が1つあるので、レポートの中の見出しが同じ段に並ぶと見出しの階層が壊れる。
 * 許可リスト（{@link REPORT_SANITIZE_SCHEMA}）には `h2` のまま残す（サニタイズはここより前に効くので、落としてしまうと書き替える前に中身が消える）。
 */
function SectionHeading(props: SectionHeadingProps): ReactElement {
  const { node: _node, children, ...rest } = props
  return <h4 {...rest}>{children}</h4>
}

type SubHeadingProps = JSX.IntrinsicElements["h3"] & ExtraProps

/** レポートの見出し `###`（hast では `h3`）を `h5` として描く。{@link SectionHeading} と同じ理由。 */
function SubHeading(props: SubHeadingProps): ReactElement {
  const { node: _node, children, ...rest } = props
  return <h5 {...rest}>{children}</h5>
}

type TableProps = JSX.IntrinsicElements["table"] & ExtraProps

/**
 * 表。列が多い表は領域の内幅に収まらないので、横スクロールの器で包んで表だけを転がす（ページ全体は横スクロールさせない）。
 * 器は React 側で作るので、{@link REPORT_SANITIZE_SCHEMA} の許可リストは通らない（レポートの記法は増えない）。
 */
function Table(props: TableProps): ReactElement {
  const { node: _node, children, ...rest } = props
  return (
    <div className={styles["table-scroll"]}>
      <table {...rest}>{children}</table>
    </div>
  )
}
