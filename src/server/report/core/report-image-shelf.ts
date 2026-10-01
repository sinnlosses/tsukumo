// `image` の塊の画像の棚。描いた `report` を受けた時点で書き手のファイルを1回読み、プロセスのメモリにだけ持つ。
// 画像には会話の中身が写るので、tsukumo はどこにも書き出さない。
//
// 鍵は `report` の呼び出しの id と、塊に書かれたままのパスの組（`reportImagePath` と同じ組）。
// 捨てる契機は3つ:
//   - 記録の窓（`MAX_SESSION_STATE_TURNS`）からレポートが落ちたとき（`releasedReportToolUseIds`）
//   - 持っている画像の合計が `MAX_SHELVED_REPORT_IMAGE_BYTES` を超えたとき（古いレポートから）
//   - プロセスの終わり

import { sumBy } from "remeda"

import type { ReportSection } from "../../../shared/report/report-block.ts"
import type { PromptImageMediaType } from "../../../shared/session-driver/prompt-image.ts"
import type { SessionRecord } from "../../../shared/session/session-state.ts"

/** 1枚の上限。これを超えるファイルは読まない。 */
export const MAX_REPORT_IMAGE_BYTES = 5 * 1024 * 1024

/** 棚に置く画像の合計の上限。 */
export const MAX_SHELVED_REPORT_IMAGE_BYTES = 64 * 1024 * 1024

export type ReportImage = {
  readonly mediaType: PromptImageMediaType
  readonly content: Uint8Array
}

/** 塊に書かれたパスを読む。読めない・画像でない・大きすぎるときは undefined。 */
export type ReadReportImage = (path: string) => ReportImage | undefined

export type ReportImageShelf = {
  /**
   * レポートの `image` の塊が指す画像を読んで置く（同じパスは1回だけ読む）。
   * 合計が上限を超えるあいだ、いま置いたレポートを除いて古いレポートから捨てる。
   */
  readonly shelve: (
    toolUseId: string,
    sections: readonly ReportSection[],
    read: ReadReportImage,
  ) => void
  /** 鍵が指す画像。棚に無ければ undefined（配る側が 404 にする）。 */
  readonly find: (toolUseId: string, path: string) => ReportImage | undefined
  /** レポートの画像をまとめて捨てる（棚に無い id は黙って無視する）。 */
  readonly release: (toolUseIds: readonly string[]) => void
}

export function createReportImageShelf(): ReportImageShelf {
  // `Map` は入れた順を保つので、先頭がいちばん古いレポート。
  const shelved = new Map<string, ReadonlyMap<string, ReportImage>>()

  return {
    shelve: (toolUseId, sections, read) => {
      const images = new Map(
        imagePathsOf(sections).flatMap((path) => {
          const image = read(path)
          return image === undefined ? [] : [[path, image] as const]
        }),
      )
      if (images.size === 0) {
        return
      }
      shelved.delete(toolUseId)
      shelved.set(toolUseId, images)
      let total = sumBy([...shelved.values()], shelfBytes)
      for (const [id, older] of shelved) {
        if (total <= MAX_SHELVED_REPORT_IMAGE_BYTES || id === toolUseId) {
          break
        }
        shelved.delete(id)
        total -= shelfBytes(older)
      }
    },
    find: (toolUseId, path) => shelved.get(toolUseId)?.get(path),
    release: (toolUseIds) => {
      for (const id of toolUseIds) {
        shelved.delete(id)
      }
    },
  }
}

/**
 * 記録が `before` から `after` へ変わったときに、記録から消えたレポートの呼び出しの id。
 * 「前にあって後に無い」で取るのは、棚に置いてからイベントが畳まれるまでの間に別のイベントが畳まれても、置いたばかりの画像を捨てないため。
 */
export function releasedReportToolUseIds(
  before: readonly SessionRecord[],
  after: readonly SessionRecord[],
): readonly string[] {
  const remaining = new Set(reportToolUseIds(after))
  return reportToolUseIds(before).filter((id) => !remaining.has(id))
}

function imagePathsOf(sections: readonly ReportSection[]): readonly string[] {
  return [
    ...new Set(
      sections
        .flatMap((section) => section.blocks)
        .flatMap((block) => (block.kind === "image" && block.path !== "" ? [block.path] : [])),
    ),
  ]
}

function shelfBytes(images: ReadonlyMap<string, ReportImage>): number {
  return sumBy([...images.values()], (image) => image.content.byteLength)
}

function reportToolUseIds(records: readonly SessionRecord[]): readonly string[] {
  return records.flatMap((record) => (record.kind === "report" ? [record.toolUseId] : []))
}
