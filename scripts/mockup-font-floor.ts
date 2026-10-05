// デザインの見本の HTML を実ブラウザで描き、文字を持つ要素の computed の `font-size` のうち、
// 字の下限を下回るものを一覧する。
// 引数は HTML ファイル1つか、直下に HTML を置いたディレクトリ。1件でもあれば終了コード1、ブラウザを起こせなければ2。

import { existsSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import process from "node:process"
import { pathToFileURL } from "node:url"

import { chromium } from "playwright-core"

import { MIN_FONT_SIZE } from "./lib/minimum-font-size.ts"

type SmallFont = {
  readonly size: number
  readonly count: number
  readonly nearText: string
}

const NEAR_TEXT_LENGTH = 20

function listHtmlFiles(target: string): string[] {
  if (!statSync(target).isDirectory()) {
    return [target]
  }
  return readdirSync(target)
    .filter((name) => name.endsWith(".html"))
    .toSorted()
    .map((name) => path.join(target, name))
}

const target = process.argv[2]
if (target === undefined) {
  process.stderr.write("使い方: node scripts/mockup-font-floor.ts <見本の HTML かディレクトリ>\n")
  process.exit(2)
}

const files = existsSync(target)
  ? listHtmlFiles(target).filter((file) => file.endsWith(".html"))
  : []
if (files.length === 0) {
  process.stderr.write(`見本の HTML が無い: ${target}\n`)
  process.exit(2)
}

let total = 0
try {
  const browser = await chromium.launch({ channel: "chrome", headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    for (const file of files) {
      await page.goto(pathToFileURL(path.resolve(file)).href, { waitUntil: "load" })
      const smalls: readonly SmallFont[] = await page.evaluate(
        ([min, length]: readonly [number, number]) => {
          const found = new Map<number, { size: number; count: number; nearText: string }>()
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
          for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
            const text = (node.textContent ?? "").trim().replace(/\s+/gu, " ")
            const element = node.parentElement
            if (text === "" || element === null || element.closest("script, style") !== null) {
              continue
            }
            const rect = element.getBoundingClientRect()
            const style = getComputedStyle(element)
            if (
              rect.width === 0 ||
              rect.height === 0 ||
              style.visibility === "hidden" ||
              style.display === "none"
            ) {
              continue
            }
            const size = Number.parseFloat(style.fontSize)
            if (size >= min) {
              continue
            }
            const earlier = found.get(size)
            found.set(size, {
              size,
              count: (earlier?.count ?? 0) + 1,
              nearText: earlier?.nearText ?? text.slice(0, length),
            })
          }
          return [...found.values()].toSorted((a, b) => a.size - b.size)
        },
        [MIN_FONT_SIZE, NEAR_TEXT_LENGTH] as const,
      )
      for (const small of smalls) {
        total += small.count
        process.stdout.write(
          `${file}: ${small.size.toString()}px ${small.count.toString()}箇所 "${small.nearText}"\n`,
        )
      }
    }
  } finally {
    await browser.close()
  }
} catch (error) {
  process.stderr.write(`見本を描けなかった: ${error instanceof Error ? error.message : "不明"}\n`)
  process.exit(2)
}
process.stdout.write(`${MIN_FONT_SIZE.toString()}px 未満: ${total.toString()}箇所\n`)
process.exit(total === 0 ? 0 : 1)
