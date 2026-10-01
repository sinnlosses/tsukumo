// `image` の塊が指す画像のファイルを読む。ホスト・OS に触るのはここだけ。
//
// 場所では絞らず、拡張子と先頭の印が4形式のどれかに合う、上限以下の普通のファイルだけを読む。
// 同期で読むのは、イベントを束に積む前に棚へ置き、ブラウザが取りに来たときに必ず棚にあるようにするため。

import { readFileSync, statSync } from "node:fs"
import { extname, resolve } from "node:path"

import type { PromptImageMediaType } from "../../../shared/session-driver/prompt-image.ts"
import { MAX_REPORT_IMAGE_BYTES, type ReportImage } from "../core/report-image-shelf.ts"

type ImageSignature = { readonly offset: number; readonly bytes: readonly number[] }

type ImageFormat = {
  readonly mediaType: PromptImageMediaType
  /** どれか1つの並びが全部合えば、その形式とみなす（並びの中の印は全部合う必要がある）。 */
  readonly signatures: readonly (readonly ImageSignature[])[]
}

const PNG = {
  mediaType: "image/png",
  signatures: [[{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }]],
} as const satisfies ImageFormat

const JPEG = {
  mediaType: "image/jpeg",
  signatures: [[{ offset: 0, bytes: [0xff, 0xd8, 0xff] }]],
} as const satisfies ImageFormat

const GIF = {
  mediaType: "image/gif",
  signatures: [
    [{ offset: 0, bytes: asciiBytes("GIF87a") }],
    [{ offset: 0, bytes: asciiBytes("GIF89a") }],
  ],
} as const satisfies ImageFormat

const WEBP = {
  mediaType: "image/webp",
  signatures: [
    [
      { offset: 0, bytes: asciiBytes("RIFF") },
      { offset: 8, bytes: asciiBytes("WEBP") },
    ],
  ],
} as const satisfies ImageFormat

/** 拡張子（小文字）→ 形式。 */
const IMAGE_FORMATS: ReadonlyMap<string, ImageFormat> = new Map<string, ImageFormat>([
  [".png", PNG],
  [".jpg", JPEG],
  [".jpeg", JPEG],
  [".gif", GIF],
  [".webp", WEBP],
])

/** `path` を cwd から解いて画像1枚として読む。読めなければ undefined。 */
export function readReportImageFile(cwd: string, path: string): ReportImage | undefined {
  const format = IMAGE_FORMATS.get(extname(path).toLowerCase())
  if (format === undefined) {
    return undefined
  }
  const resolved = resolve(cwd, path)
  try {
    const info = statSync(resolved)
    if (!info.isFile() || info.size > MAX_REPORT_IMAGE_BYTES) {
      return undefined
    }
    const content = new Uint8Array(readFileSync(resolved))
    return matchesFormat(content, format) ? { mediaType: format.mediaType, content } : undefined
  } catch {
    return undefined
  }
}

function matchesFormat(content: Uint8Array, format: ImageFormat): boolean {
  return format.signatures.some((signature) =>
    signature.every(({ offset, bytes }) =>
      bytes.every((byte, index) => content[offset + index] === byte),
    ),
  )
}

function asciiBytes(text: string): readonly number[] {
  return [...text].map((char) => char.charCodeAt(0))
}
