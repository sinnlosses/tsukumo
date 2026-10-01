import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { readReportImageFile } from "../../../../src/server/report/adapter/report-image-file.ts"
import { MAX_REPORT_IMAGE_BYTES } from "../../../../src/server/report/core/report-image-shelf.ts"

// 画像は先頭の印だけを手で組んだ架空のバイト列（実物の画像は使わない）。
const PNG_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]
const JPEG_BYTES = [0xff, 0xd8, 0xff, 0x01]
const GIF_BYTES = [...Buffer.from("GIF89a"), 0x01]
const WEBP_BYTES = [...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP"), 0x01]

function tempCwd(): string {
  return mkdtempSync(join(tmpdir(), "tsukumo-report-image-"))
}

function writeBytes(cwd: string, name: string, bytes: readonly number[]): string {
  const path = join(cwd, name)
  writeFileSync(path, Uint8Array.from(bytes))
  return path
}

describe("readReportImageFile", () => {
  it.each([
    ["a.png", PNG_BYTES, "image/png"],
    ["a.JPG", JPEG_BYTES, "image/jpeg"],
    ["a.jpeg", JPEG_BYTES, "image/jpeg"],
    ["a.gif", GIF_BYTES, "image/gif"],
    ["a.webp", WEBP_BYTES, "image/webp"],
  ] as const)("%s を拡張子と先頭の印で読む", (name, bytes, mediaType) => {
    const cwd = tempCwd()
    const path = writeBytes(cwd, name, bytes)

    expect(readReportImageFile("/", path)).toEqual({
      mediaType,
      content: Uint8Array.from(bytes),
    })
  })

  it("相対のパスは cwd から解く", () => {
    const cwd = tempCwd()
    mkdirSync(join(cwd, "架空"))
    writeBytes(cwd, "架空/after.png", PNG_BYTES)

    expect(readReportImageFile(cwd, "架空/after.png")?.mediaType).toBe("image/png")
  })

  it("拡張子の外・印の不一致・上限超え・ディレクトリ・無いファイルは読まない", () => {
    const cwd = tempCwd()
    writeBytes(cwd, "a.svg", PNG_BYTES)
    writeBytes(cwd, "jpeg.png", JPEG_BYTES)
    writeFileSync(
      join(cwd, "huge.png"),
      Buffer.concat([Buffer.from(PNG_BYTES), Buffer.alloc(MAX_REPORT_IMAGE_BYTES)]),
    )
    mkdirSync(join(cwd, "dir.png"))

    expect(readReportImageFile(cwd, "a.svg")).toBeUndefined()
    expect(readReportImageFile(cwd, "jpeg.png")).toBeUndefined()
    expect(readReportImageFile(cwd, "huge.png")).toBeUndefined()
    expect(readReportImageFile(cwd, "dir.png")).toBeUndefined()
    expect(readReportImageFile(cwd, "missing.png")).toBeUndefined()
  })
})
