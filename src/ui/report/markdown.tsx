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
// - `rehype-sanitize`（{@link REPORT_SANITIZE_SCHEMA}）で許可リストに無い要素・属性を落とす。
//   **サニタイズはここ1箇所に集約**（docs/requirements.md 4.2）
// - `rehype-highlight` でコードの色付け（`pre > code` に `hljs` の class と `<span>` を足す。
//   テーマ CSS は `vendor/highlight-theme.min.css` のまま）
//
// **```mermaid / ```chart のフェンスは「コード」ではなく図・グラフの入れ物にする**
// （{@link MermaidBlock} / {@link ChartBlock}）。`pre` を上書きし、中の `code` 要素の
// `className`（`language-mermaid` / `language-chart`）を見て振り分ける。

import { type Element } from "hast"
import { type JSX, type ReactElement, type ReactNode } from "react"
import ReactMarkdown, { type ExtraProps } from "react-markdown"
import rehypeHighlight from "rehype-highlight"
import rehypeRaw from "rehype-raw"
import rehypeSanitize from "rehype-sanitize"
import remarkCjkFriendly from "remark-cjk-friendly"
import remarkGfm from "remark-gfm"

import { ChartBlock } from "./chart-block.tsx"
import { MermaidBlock } from "./mermaid-block.tsx"
import { REPORT_SANITIZE_SCHEMA } from "./sanitize-schema.ts"

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
      rehypePlugins={[rehypeRaw, [rehypeSanitize, REPORT_SANITIZE_SCHEMA], rehypeHighlight]}
      components={{ pre: Pre, a: Anchor }}
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
