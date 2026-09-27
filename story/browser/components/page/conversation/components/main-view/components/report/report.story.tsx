// レポートの記法の見本。文面はすべて架空で、実物の会話は使わない。
// 記法の名前は `src/shared/report/report-notation.ts` の語彙に揃える。

import type { Meta, StoryObj } from "@storybook/react-vite"

import { Report } from "../../../../../../../../../src/browser/components/page/conversation/components/main-view/components/report/report.tsx"

const meta = {
  component: Report,
  args: { markdown: "", reveal: false, turnId: 1 },
} satisfies Meta<typeof Report>

export default meta

type Story = StoryObj<typeof meta>

export const Note = {
  args: {
    markdown: [
      '<div class="note">結論：ここに並べた記法はすべて架空の例。</div>',
      '<div class="note note-warn">この見本は疑似の文面で、実際の作業は1つもしていない。</div>',
      '<div class="note note-ng">架空の数値なので実際の判断には使えない。</div>',
      '<div class="note note-ask">この一覧に抜けている記法があるかは確かめていない。</div>',
      '<div class="note note-memo">この見本は Storybook の題材として置いている。</div>',
      '<div class="note note-favor">見え方に気づいた点があれば教えてください（架空の例）。</div>',
    ].join("\n\n"),
  },
} satisfies Story

export const Badge = {
  args: {
    markdown: [
      '状態: <span class="badge badge-ok">OK</span> <span class="badge badge-warn">要注意</span> <span class="badge badge-ng">NG</span>',
      '素の札: <span class="badge">未分類</span>',
    ].join("\n\n"),
  },
} satisfies Story

export const Table = {
  args: {
    markdown: [
      "| 項目 | 状態 | 値 |",
      "| --- | :---: | ---: |",
      '| A | <span class="badge badge-ok">ok</span> | 12 |',
      '| B | <span class="badge badge-ng">ng</span> | 3 |',
      "| とても長い項目の名前で折り返しを見る（架空） | 保留 | 1,024 |",
    ].join("\n"),
  },
} satisfies Story

export const Mermaid = {
  args: {
    markdown: [
      "```mermaid",
      "flowchart TD",
      "  A[開始] --> B[確認]",
      "  B --> C[完了]",
      "```",
    ].join("\n"),
  },
} satisfies Story

export const Chart = {
  args: {
    markdown: [
      "```chart",
      '{"type":"bar","data":{"labels":["A","B","C"],"datasets":[{"label":"架空の値","data":[1,2,3]}]}}',
      "```",
    ].join("\n"),
  },
} satisfies Story

export const FullReport = {
  args: {
    markdown: [
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
  },
} satisfies Story
