// 最終レポートを HTML の1ファイルに書き出すコマンドと、書き出したファイルを開く・Finder で表示するコマンドの契約。
// 写しの本文と CSS は `/rpc` の上限を超えうるので、ほかのコマンドと同じく `/ws` に載る。
//
// 書き出しは書いたパスを応答で返す（イベントにしない。押したタブだけが結果を出し、状態にも記録にも残さない）。
// 開く・表示するは、そのプロセスが書き出したパスだけを受け付け、ほかのパスは断る（画面から届いた任意のパスを `open` へ渡さない）。

import { z } from "zod"

import { commandBase } from "../command.ts"

/** 写しの本文（レポートの根の `outerHTML`）の字数の上限。棚の画像はまだ埋めていない形で届く。 */
const MAX_REPORT_EXPORT_BODY_LENGTH = 8 * 1024 * 1024

/** 画面で集めた CSS の字数の上限。 */
const MAX_REPORT_EXPORT_CSS_LENGTH = 2 * 1024 * 1024

/** 開く・表示するに渡すパスの字数の上限。 */
const MAX_REPORT_EXPORT_PATH_LENGTH = 4096

const exportedPathSchema = z.object({ path: z.string().min(1).max(MAX_REPORT_EXPORT_PATH_LENGTH) })

export const reportExportContract = {
  /**
   * `turnId` のターンの最終レポートを、画面が描いた写しから1つの HTML 文書にして保存先に書き、書いたパスとファイル名を返す。
   * 断るのは、ターンが無い・閉じていない・最終レポートを持たない・雑談のとき、文書が大きすぎるとき、保存先に書けないとき。
   */
  save: commandBase
    .input(
      z.object({
        turnId: z.number().int(),
        bodyHtml: z.string().min(1).max(MAX_REPORT_EXPORT_BODY_LENGTH),
        css: z.string().max(MAX_REPORT_EXPORT_CSS_LENGTH),
      }),
    )
    .output(z.object({ path: z.string(), fileName: z.string() })),
  /** 書き出したファイルを既定のブラウザで開く（`open <パス>`）。 */
  openInBrowser: commandBase.input(exportedPathSchema),
  /** 書き出したファイルを Finder で表示する（`open -R <パス>`）。 */
  revealInFinder: commandBase.input(exportedPathSchema),
}
