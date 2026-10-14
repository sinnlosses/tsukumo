// カタログで撮った画像を並べて見る索引 HTML。

import path from "node:path"

import type { CatalogEntry, CatalogSize } from "./catalog-entry.ts"
import { escapeHtml } from "./html-escape.ts"

export type Shot = {
  readonly entry: CatalogEntry
  readonly size: CatalogSize
  readonly file: string
}

/**
 * 並べて見るための索引。画像を1枚ずつ開かずに済ませるのが目的なので、飾りは付けず
 * 見出しと画像だけを縦に並べる（外の CSS も JS も読まない）。
 *
 * 1件のぶんは1つの節にまとめ、頭に行き先の一覧を置く — 件数が増えても、探している件まで
 * 転がし続けずに飛べるようにする。
 */
export function indexHtml(shots: readonly Shot[]): string {
  const entries = catalogEntriesOf(shots)
  const links = entries
    .map((entry) => `<li><a href="#${escapeHtml(entry.name)}">${escapeHtml(entry.label)}</a></li>`)
    .join("\n")
  const sections = entries
    .map((entry) => {
      const images = shots
        .filter((shot) => shot.entry.name === entry.name)
        .map(
          (shot) =>
            `<figure><figcaption>${shot.size.width}x${shot.size.height}</figcaption>` +
            `<img src="${escapeHtml(path.basename(shot.file))}" alt="${escapeHtml(entry.label)}"></figure>`,
        )
        .join("\n")
      return (
        `<section id="${escapeHtml(entry.name)}"><h2>${escapeHtml(entry.label)}</h2>` +
        `<p><code>${escapeHtml(entry.name)}</code>（疑似セッションの場面 <code>${escapeHtml(entry.scene)}</code>）</p>` +
        `${images}</section>`
      )
    })
    .join("\n")

  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>tsukumo 画面の状態のカタログ</title>
<style>body{font-family:sans-serif;margin:2rem;background:#111;color:#eee}img{max-width:100%;border:1px solid #444}section{margin-bottom:2rem}figure{margin:0 0 1rem}figcaption{color:#aaa;font-size:.85rem}a{color:#7fd}</style>
</head><body>
<h1>画面の状態のカタログ（疑似セッションの架空の会話）</h1>
<nav><ul>
${links}
</ul></nav>
${sections}
</body></html>
`
}

/** 撮れた順のまま、1件につき1つだけ取り出す（同じ件は広い窓と狭い窓で2枚ある）。 */
export function catalogEntriesOf(shots: readonly Shot[]): readonly CatalogEntry[] {
  return shots
    .map((shot) => shot.entry)
    .filter((entry, index, all) => all.findIndex((other) => other.name === entry.name) === index)
}
