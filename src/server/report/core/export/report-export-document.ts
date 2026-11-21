// 最終レポートの書き出し。画面が描いた DOM の写しと集めた CSS から、外部の読み込みを持たない1つの HTML 文書を組む。
// 時計も棚の読み出しも持たない。画像を引く関数は呼ぶ側が渡す。

import {
  readReportImageRoute,
  REPORT_IMAGE_PATH_PREFIX,
} from "../../../../shared/report/report-image.ts"
import { escapeHtml } from "../../../../shared/utils/escape-html.ts"
import { escapeRegExp } from "../../../../shared/utils/escape-regexp.ts"
import type { ReportImageShelf } from "../image/report-image-shelf.ts"
import { REPORT_EXPORT_LIGHT_TOKENS, REPORT_EXPORT_STYLE } from "./report-export-style.ts"

/** 表紙の帯に出す値。`title` 以外は無ければ行ごと出さない。 */
export type ReportExportMasthead = {
  readonly kind: string
  readonly taskId?: string
  readonly outcome?: string
  readonly title: string
  readonly request?: string
  readonly at?: string
}

export type ReportExportInput = {
  /** 画面が描いたレポートの DOM の写し（`/report-image/` の `img` を含む）。 */
  readonly bodyHtml: string
  /** 画面で集めた CSS。 */
  readonly css: string
  readonly masthead: ReportExportMasthead
  readonly findImage: ReportImageShelf["find"]
}

const SHELF_IMG = new RegExp(
  `<img\\b[^>]*?\\bsrc="(${escapeRegExp(REPORT_IMAGE_PATH_PREFIX)}[^"]*)"[^>]*>`,
  "g",
)

export function buildReportExportDocument(input: ReportExportInput): string {
  const { masthead } = input
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="tsukumo">
<title>${escapeHtml(masthead.title)} — ${escapeHtml(masthead.kind)}</title>
<style>${styleText(REPORT_EXPORT_STYLE)}${styleText(input.css)}${styleText(REPORT_EXPORT_LIGHT_TOKENS)}</style>
</head>
<body>
<main>
${mastheadHtml(masthead)}
${embedImages(input.bodyHtml, input.findImage)}
</main>
</body>
</html>
`
}

function mastheadHtml(masthead: ReportExportMasthead): string {
  const kicker = [
    `<span>${escapeHtml(masthead.kind)}</span>`,
    ...(masthead.taskId === undefined
      ? []
      : [`<span class="id">${escapeHtml(masthead.taskId)}</span>`]),
    ...(masthead.outcome === undefined
      ? []
      : [`<span class="outcome">${escapeHtml(masthead.outcome)}</span>`]),
  ]
  const meta = [
    ["依頼", masthead.request],
    ["日時", masthead.at],
  ].flatMap(([label, value]) =>
    value === undefined || value === ""
      ? []
      : [`<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`],
  )
  return [
    `<header class="masthead">`,
    `<div class="kicker">${kicker.join("")}</div>`,
    `<h1>${escapeHtml(masthead.title)}</h1>`,
    ...(meta.length === 0 ? [] : [`<dl class="meta">${meta.join("")}</dl>`]),
    `</header>`,
  ].join("\n")
}

function embedImages(html: string, findImage: ReportExportInput["findImage"]): string {
  return html.replace(SHELF_IMG, (tag, src: string) => {
    const route = readReportImageRoute(
      decodeEntities(src).slice(REPORT_IMAGE_PATH_PREFIX.length).replace(/\?.*$/, ""),
    )
    const image = route === undefined ? undefined : findImage(route.toolUseId, route.path)
    if (route === undefined || image === undefined) {
      return `<p class="export-missing-image">画像を読めなかった: ${escapeHtml(route?.path ?? "")}</p>`
    }
    return `<img src="data:${image.mediaType};base64,${base64Of(image.content)}"${altOf(tag)}>`
  })
}

// `String.fromCharCode(...bytes)` は大きい画像で引数の数の上限を超えるので、塊に分けて渡す。
const BASE64_CHUNK_BYTES = 0x8000

function base64Of(content: Uint8Array): string {
  const chunks: string[] = []
  for (let offset = 0; offset < content.length; offset += BASE64_CHUNK_BYTES) {
    chunks.push(String.fromCharCode(...content.subarray(offset, offset + BASE64_CHUNK_BYTES)))
  }
  return btoa(chunks.join(""))
}

function altOf(tag: string): string {
  const alt = /\balt="([^"]*)"/.exec(tag)
  return alt === null ? ' alt=""' : ` alt="${alt[1]}"`
}

function decodeEntities(value: string): string {
  return value.replaceAll("&amp;", "&")
}

function styleText(css: string): string {
  return css.replaceAll(/<\/style/gi, "<\\/style")
}
