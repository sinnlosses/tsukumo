// `image` の塊と、質問の選択肢の `preview` に書いた画像の棚。
// 描いた `report` と積まれた質問を受けた時点で書き手のファイルを1回読み、プロセスのメモリにだけ持つ。
// 画像には会話の中身が写るので、tsukumo はどこにも書き出さない。
//
// 鍵は `report` の呼び出しか質問の tool use id と、書かれたままのパスの組（`reportImagePath` と同じ組）。
// 捨てる契機は3つ:
//   - レポートか質問が、記録（窓は `MAX_SESSION_STATE_TURNS`）にも答え待ちにも無くなったとき（`releasedImageToolUseIds`）
//   - 持っている画像の合計が `MAX_SHELVED_REPORT_IMAGE_BYTES` を超えたとき（古く置いたものから）
//   - プロセスの終わり

import { sumBy } from "remeda"

import type { ReportSection } from "../../../shared/report/report-block.ts"
import type { PromptImageMediaType } from "../../../shared/session-driver/prompt-image.ts"
import type { SessionState } from "../../../shared/session/session-state.ts"

/** 1枚の上限。これを超えるファイルは読まない。 */
export const MAX_REPORT_IMAGE_BYTES = 5 * 1024 * 1024

/** 棚に置く画像の合計の上限。 */
export const MAX_SHELVED_REPORT_IMAGE_BYTES = 64 * 1024 * 1024

export type ReportImage = {
  readonly mediaType: PromptImageMediaType
  readonly content: Uint8Array
}

/** 書かれたパスを読む。読めない・画像でない・大きすぎるときは undefined。 */
export type ReadReportImage = (path: string) => ReportImage | undefined

export type ReportImageShelf = {
  /**
   * 1つの tool use id が指す画像を読んで置く（同じパスは1回だけ読む）。
   * 合計が上限を超えるあいだ、いま置いた id を除いて古く置いたものから捨てる。
   */
  readonly shelve: (toolUseId: string, paths: readonly string[], read: ReadReportImage) => void
  /** 鍵が指す画像。棚に無ければ undefined（配る側が 404 にする）。 */
  readonly find: (toolUseId: string, path: string) => ReportImage | undefined
  /** id ごとの画像をまとめて捨てる（棚に無い id は黙って無視する）。 */
  readonly release: (toolUseIds: readonly string[]) => void
}

export function createReportImageShelf(): ReportImageShelf {
  // `Map` は入れた順を保つので、先頭がいちばん古く置いたもの。
  const shelved = new Map<string, ReadonlyMap<string, ReportImage>>()

  return {
    shelve: (toolUseId, paths, read) => {
      const images = new Map(
        [...new Set(paths)].flatMap((path) => {
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

/** レポートの `image` の塊が指すパス（空のパスは除く）。 */
export function reportImagePaths(sections: readonly ReportSection[]): readonly string[] {
  return sections
    .flatMap((section) => section.blocks)
    .flatMap((block) => (block.kind === "image" && block.path !== "" ? [block.path] : []))
}

/**
 * 状態が `before` から `after` へ変わったときに、記録にも答え待ちにも無くなったレポートと質問の id。
 * 「前にあって後に無い」で取るのは、棚に置いてからイベントが畳まれるまでの間に別のイベントが畳まれても、置いたばかりの画像を捨てないため。
 * 答えた質問は記録が先に積まれてから答え待ちを抜けるので、答えたあとも捨てない。
 */
export function releasedImageToolUseIds(
  before: Pick<SessionState, "records" | "pending">,
  after: Pick<SessionState, "records" | "pending">,
): readonly string[] {
  const remaining = new Set(imageToolUseIds(after))
  return imageToolUseIds(before).filter((id) => !remaining.has(id))
}

function shelfBytes(images: ReadonlyMap<string, ReportImage>): number {
  return sumBy([...images.values()], (image) => image.content.byteLength)
}

function imageToolUseIds(state: Pick<SessionState, "records" | "pending">): readonly string[] {
  return [
    ...state.records.flatMap((record) =>
      record.kind === "report" || record.kind === "question" ? [record.toolUseId] : [],
    ),
    ...state.pending.flatMap((ask) => (ask.kind === "question" ? [ask.id] : [])),
  ]
}
