// `develop/progress.md` に近い形の最小フィクスチャ（docs/coding-standards.md「消すかどうか」の
// 「同じモックの準備が複数ファイルに重複している → 準備を共通のフィクスチャに寄せる」）。
// `test/scripts/progress-done-section.test.ts`（純粋関数）と
// `test/scripts/merge-progress.test.ts`（ドライバを起こす結合テスト）の両方が使う。

/** 「## 完了したこと」に小節2つ・前文・「## 未解決」「## 注意」を持つ最小のサンプル。 */
export function sampleProgressDoc(): string {
  return `# 現在の状態

前文。

## 完了したこと（このセッション）

### 2026-09-20 古い1（T-100）

本文1。

### 2026-09-19 古い2（T-099）

本文2。

## 未解決

- 未解決1

## 注意

- 注意1
`
}

/** サンプルの「## 完了したこと」直下に新しい小節を1つ足す。 */
export function withPrependedSection(doc: string, date: string, label: string): string {
  return doc.replace(
    "## 完了したこと（このセッション）\n\n",
    `## 完了したこと（このセッション）\n\n### ${date} ${label}\n\n本文（新規）。\n\n`,
  )
}

/** サンプルから指定した見出しの小節を1つ丸ごと落とす（アーカイブの模擬）。 */
export function withoutSection(doc: string, heading: string): string {
  const lines = doc.split("\n")
  const start = lines.findIndex((line) => line === heading)
  if (start === -1) {
    throw new Error(`見出しが見つからない: ${heading}`)
  }
  const end = lines.findIndex(
    (line, i) => i > start && (line.startsWith("### ") || line.startsWith("## ")),
  )
  return [...lines.slice(0, start), ...lines.slice(end)].join("\n")
}

/** サンプルの本文の1行を書き換える（同じ見出しのまま中身だけ変える）。 */
export function withEditedBody(doc: string, from: string, to: string): string {
  if (!doc.includes(from)) {
    throw new Error(`書き換え元が見つからない: ${from}`)
  }
  return doc.replace(from, to)
}
