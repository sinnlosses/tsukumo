// レポート（発話の詳細）の Markdown を HTML に描く、unified（react-markdown 一式）の構成。
//
// もとは移行前の自前レンダラ（行ベースのパーサ、約300行）
// だったものを、移行の段6で unified に置き換えた（docs/design.md 6.3）。**対応する記法が広がる**
// （引用・ネストしたリスト・水平線・GFM の列揃えは自前の実装では描けなかった）。
//
// - `remark-gfm` で表・取り消し線・自動リンク・チェックボックス・列揃え（`:---:` / `---:`）を読む
// - `remark-cjk-friendly` で、CommonMark の delimiter run 規則（強調記号の直前・直後が約物だと
//   強調と認識されない）を日本語向けに補う。CommonMark の仕様どおりの挙動として、
//   `**「呼んだか」**` のように中身を約物で始める・終える強調が記法のまま出てしまう
//   （旧レンダラは素朴な正規表現 `/\*\*([^*]+)\*\*/g` だったので、この規則に関係なく通っていた）。
//   このリポジトリのレポートは `**「…」**` を多用するため、このプラグインで直す
// - `rehype-raw` で、Markdown の中に直接書いた HTML ブロック・インライン HTML を解釈する
// - {@link rehypeTaskCheck} で、チェックリストの `<input type="checkbox">` を静的な印に畳む
//   （**サニタイズより前**。理由は `task-check.ts`）
// - `rehype-sanitize`（{@link REPORT_SANITIZE_SCHEMA}）で許可リストに無い要素・属性を落とす。
//   **サニタイズはここ1箇所に集約**（docs/requirements.md 4.2）
// - `rehype-highlight` でコードの色付け（`pre > code` に `hljs` の class と `<span>` を足す。
//   テーマ CSS は `vendor/highlight-theme.min.css` のまま）
//
// **```mermaid / ```chart のフェンスは「コード」ではなく図・グラフの入れ物にする**
// （{@link MermaidBlock} / {@link ChartBlock}）。`pre` を上書きし、中の `code` 要素の
// `className`（`language-mermaid` / `language-chart`）を見て振り分ける。
//
// **レポートの記法の class 名（`note` / `badge` / `cols` / `card` / `stats` / `stat`）は
// `div` / `span` の上書きで部品に解決する**（{@link NotationBlock} / {@link NotationInline}）。
//
// **表は横スクロールの器で包む**（{@link Table}）。器をここで作るのは、**`rehype-raw` が生の
// HTML も同じ hast の木に入れる**ので、`table` の上書き1つで Markdown の表とレポートが直接
// 書いた `<table>` の両方に効くため。

import { type Element } from "hast"
import { type JSX, type ReactElement, type ReactNode } from "react"
import ReactMarkdown, { type Components, type ExtraProps, type Options } from "react-markdown"
import rehypeHighlight from "rehype-highlight"
import rehypeRaw from "rehype-raw"
import rehypeSanitize from "rehype-sanitize"
import remarkCjkFriendly from "remark-cjk-friendly"
import remarkGfm from "remark-gfm"

import styles from "../main-view.module.css"
import { ChartBlock } from "./chart-block.tsx"
import { MermaidBlock } from "./mermaid-block.tsx"
import { NotationBlock, NotationInline } from "./notation.tsx"
import { REPORT_SANITIZE_SCHEMA } from "./sanitize-schema.ts"
import { rehypeTaskCheck } from "./task-check.ts"

/**
 * hast の要素をどの部品で描くか。**レンダーごとに作り直さない**（同じ参照でないと
 * react-markdown が木を作り直す）ので、モジュールの定数に置く。
 */
const REPORT_COMPONENTS = {
  pre: Pre,
  a: Anchor,
  table: Table,
  h2: SectionHeading,
  h3: SubHeading,
  div: NotationBlock,
  span: NotationInline,
} satisfies Components

/**
 * 脚注（`[^1]`）の節に mdast-util-to-hast が付ける英語の語を、日本語に替える。既定は
 * `<h2 class="sr-only">Footnotes</h2>` で、**`sr-only` の CSS はこのページに無い**（機能ごとの
 * CSS Modules は class 名をハッシュ化するので、当てる側で受け取ることもできない）。
 * **そのままだと英語の見出しが本文に見える。**
 *
 * **隠すのではなく見出しとして出す**（`footnoteLabelProperties` を空にして `sr-only` を外す）。
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
      // **効くのは `**` と `*` だけで、GFM の取り消し線 `~~` には効かない**（あちらは
      // micromark-extension-gfm-strikethrough の別の判定を通るため。直すには
      // remark-cjk-friendly-gfm-strikethrough が要る）。取り消し線はレポートの規約
      // （src/core/report-notation.ts）が勧めていないので、穴のまま置いてある。
      remarkPlugins={[remarkGfm, remarkCjkFriendly]}
      rehypePlugins={[
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
  return <pre {...rest} />
}

function findCodeChild(node: Element | undefined): Element | undefined {
  return node?.children.find(
    (child): child is Element => child.type === "element" && child.tagName === "code",
  )
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
 * 利用者の依頼を示す本物の `<h2 className={styles["turn-request"]}>` が1つあるので（`turn.tsx`）、
 * レポートの中の見出しが同じ段に並ぶと見出しの階層が壊れる。**許可リスト
 * （{@link REPORT_SANITIZE_SCHEMA}）には `h2` のまま残す**（サニタイズはここより前に効くので、
 * 落としてしまうと書き替える前に中身が消える）。見た目は `.detail-block h4`
 * （`main-view.module.css`）。
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

type AnchorProps = JSX.IntrinsicElements["a"] & ExtraProps

/**
 * リンク。**スキームの許可は {@link REPORT_SANITIZE_SCHEMA} の `protocols` が済ませている**
 * （通らない `href` はここに来る前に落ちている）ので、ここは外部ページへ飛ぶときの安全策
 * （`rel="noopener noreferrer"`）を添えるだけ。
 */
function Anchor(props: AnchorProps): ReactElement {
  const { node: _node, children, ...rest } = props
  return (
    <a {...rest} rel="noopener noreferrer">
      {children as ReactNode}
    </a>
  )
}

type TableProps = JSX.IntrinsicElements["table"] & ExtraProps

/**
 * 表。**列が多い表は領域の内幅に収まらない**ので、横スクロールの器で包んで表だけを転がす
 * （ページ全体は横スクロールさせない。`.table-scroll` の CSS は `main-view.module.css`）。
 * **器は React 側で作るので、{@link REPORT_SANITIZE_SCHEMA} の許可リストは通らない**
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
