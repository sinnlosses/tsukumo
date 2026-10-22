// レポートの記法の見本。文面はすべて架空で、実物の会話は使わない。
// 記法の名前は `src/shared/report/report-notation.ts` の語彙に揃える。

import type { Meta, StoryObj } from "@storybook/react-vite"

import { Report } from "../../../../../../../../../src/browser/components/page/conversation/components/main-view/components/report/report.tsx"
import { loadMarkdown } from "../../../../../../../../../src/browser/components/page/conversation/components/markdown/markdown.tsx"
import type { ReportSection } from "../../../../../../../../../src/shared/report/report-block.ts"
import type { ReportImageSource } from "../../../../../../../../../src/shared/report/report-image-markdown.ts"
import { reportSectionsMarkdown } from "../../../../../../../../../src/shared/report/report-markdown.ts"
import type { MainViewReportBody } from "../../../../../../../../../src/shared/session/main-view-shape.ts"

/** 見本の本文は欄に分けず、Markdown 1本の欄で渡す。 */
function markdownBody(markdown: string): MainViewReportBody {
  return { kind: "markdown", markdown }
}

/** 見本の本文は棚に画像を置いていない。 */
const NO_IMAGES = { kind: "none" } as const satisfies ReportImageSource

const meta = {
  component: Report,
  args: { body: markdownBody(""), reveal: false, turnId: 1, className: "" },
  loaders: [loadMarkdown],
} satisfies Meta<typeof Report>

export default meta

type Story = StoryObj<typeof meta>

export const Note = {
  args: {
    body: markdownBody(
      [
        '<div class="note">結論：ここに並べた記法はすべて架空の例。</div>',
        '<div class="note note-warn">この見本は疑似の文面で、実際の作業は1つもしていない。</div>',
        '<div class="note note-ng">架空の数値なので実際の判断には使えない。</div>',
        '<div class="note note-ask">この一覧に抜けている記法があるかは確かめていない。</div>',
        '<div class="note note-memo">この見本は Storybook の題材として置いている。</div>',
        '<div class="note note-favor">見え方に気づいた点があれば教えてください（架空の例）。</div>',
      ].join("\n\n"),
    ),
  },
} satisfies Story

export const Badge = {
  args: {
    body: markdownBody(
      [
        '状態:<span class="badge badge-ok">OK</span> <span class="badge badge-warn">要注意</span> <span class="badge badge-ng">NG</span>',
        '素の札: <span class="badge">未分類</span>',
      ].join("\n\n"),
    ),
  },
} satisfies Story

export const Table = {
  args: {
    body: markdownBody(
      [
        "| 項目 | 状態 | 値 |",
        "| --- | :---: | ---: |",
        '| A | <span class="badge badge-ok">ok</span> | 12 |',
        '| B | <span class="badge badge-ng">ng</span> | 3 |',
        "| とても長い項目の名前で折り返しを見る（架空） | 保留 | 1,024 |",
      ].join("\n"),
    ),
  },
} satisfies Story

/** 型から揃えた表の見本。数だけの列は右揃え、状態の列は中央揃えのバッジになる。 */
export const AutoAlignedTable = {
  args: {
    body: markdownBody(
      reportSectionsMarkdown(
        [
          {
            heading: "",
            shapeTag: "unspecified",
            blocks: [
              {
                kind: "table",
                title: "",
                columns: ["項目", "件数", "状態"],
                rows: [
                  ["架空の一", "312", { status: "ok", text: "通過" }],
                  ["架空の二", "8", { status: "warn", text: "要注意" }],
                  ["架空の三で長い項目名（折り返しの見本）", "1,024", { status: "ng", text: "NG" }],
                ],
                rest: "",
                fold: "",
                aside: "",
              },
            ],
          },
        ] satisfies readonly ReportSection[],
        NO_IMAGES,
      ),
    ),
  },
} satisfies Story

/** 見出しのある節と無い節を並べた見本（Markdown 1本の欄に組むので、節の欄の入れ物は作らない）。 */
export const Sections = {
  args: {
    body: markdownBody(
      reportSectionsMarkdown(
        [
          {
            heading: "架空の一の節",
            shapeTag: "unspecified",
            blocks: [
              { kind: "text", text: "この節には見出しがある（架空）。", fold: "", aside: "" },
            ],
          },
          {
            heading: "",
            shapeTag: "unspecified",
            blocks: [
              {
                kind: "text",
                text: "この節には見出しが無い（架空）。",
                fold: "",
                aside: "",
              },
            ],
          },
          {
            heading: "架空の三の節",
            shapeTag: "unspecified",
            blocks: [
              {
                kind: "markdown",
                markdown:
                  "### 節の中の副見出し\n\n---\n\n副見出しと水平線は節の境目にしない（架空）。",
                fold: "",
                aside: "",
              },
            ],
          },
        ] satisfies readonly ReportSection[],
        NO_IMAGES,
      ),
    ),
  },
} satisfies Story

export const Mermaid = {
  args: {
    body: markdownBody(
      ["```mermaid", "flowchart TD", "  A[開始] --> B[確認]", "  B --> C[完了]", "```"].join("\n"),
    ),
  },
} satisfies Story

export const Chart = {
  args: {
    body: markdownBody(
      [
        "```chart",
        '{"type":"bar","data":{"labels":["A","B","C"],"datasets":[{"label":"架空の値","data":[1,2,3]}]}}',
        "```",
      ].join("\n"),
    ),
  },
} satisfies Story

export const FullReport = {
  args: {
    body: markdownBody(
      [
        "## 記法の一覧（架空）",
        "> これは引用の見本。実物の会話ではない。",
        "- 項目1\n  - 子項目1\n  - 子項目2\n- 項目2",
        "- [x] 済みの項目（架空）\n- [ ] 未了の項目（架空）",
        "| 項目 | 値 |\n| --- | ---: |\n| A | 12 |\n| B | 3 |",
        '<div class="note note-warn">架空の数値なので実際の判断には使えない。</div>',
        '<div class="cols"><div class="card">案A（架空）</div><div class="card">案B（架空）</div></div>',
        '<div class="stats"><div class="stat"><b>4</b>色</div><div class="stat"><b>9</b>種類</div><div class="stat"><b>2</b>段階</div></div>',
        "```ts\nconst answer = 42\n```",
        "```mermaid\nsequenceDiagram\n  あるじ->>精霊: 依頼\n  精霊-->>あるじ: 報告\n```",
        '```chart\n{"type":"line","data":{"labels":["月","火","水"],"datasets":[{"label":"架空の件数","data":[3,5,2]}]}}\n```',
      ].join("\n\n"),
    ),
  },
} satisfies Story
