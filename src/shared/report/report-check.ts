// `report` の検証結果の欄 `checks` の形。形の出どころはここだけ。

import { z } from "zod"

import { REPORT_CHECK_STATUSES } from "./report-check-view.ts"

export const reportCheckSchema = z.object({
  status: z.enum(REPORT_CHECK_STATUSES),
  label: z.string().describe("何で確かめたか（コマンド・テスト・手で見た場面）"),
  figure: z
    .string()
    .describe(
      "結果を1つの数で言う短い文字列（例: 単体 2855・E2E 57、56 件中 1 件、ずれ 2px）。" +
        "数だけを書き、「が通過」のような述語は付けない。「2849 / 56」のような割り算や分数に見える" +
        "書き方はしない。行の右に描く。数で言えなければ空文字",
    ),
  command: z
    .string()
    .describe(
      "確かめるのに打った Bash のコマンドを、打った文字列のまま（tsukumo が同じターンの呼び出しと完全一致で突き合わせ、測った所要時間を添える）。コマンドでない確認は空文字",
    ),
  detail: z
    .string()
    .describe(
      "ng・unobserved は理由、blocked は止めている前提を1文で。ok の行には描かないので書かない。直した経緯や打ち直した回数は書かない。無ければ空文字",
    ),
  howToVerify: z
    .string()
    .describe(
      "unobserved のとき必須。知らない人が繰り返せる確かめ方を1〜2文で（何を開いて・何をして・何が見えれば良いか）。ok・ng・blocked は空文字",
    ),
})

export type ReportCheck = z.infer<typeof reportCheckSchema>

/**
 * `figure`・`command`・`howToVerify` を足す前の記録（transcript からの復元）も読めるように、3つは欠けていたら空文字に畳む。
 * 状態・ラベル・補足が崩れた呼び出しは handler に届く前に SDK が差し戻すので、ここで欠けるのは古い記録だけ。
 */
const storedReportCheckSchema = z.preprocess(
  readLegacyStatus,
  reportCheckSchema.extend({
    figure: z.string().catch(""),
    command: z.string().catch(""),
    howToVerify: z.string().catch(""),
  }),
)

/** `report` の引数の `checks` を取り出す。「無い」と形の崩れは空の配列に畳む。 */
export function parseReportChecks(value: unknown): readonly ReportCheck[] {
  const parsed = z.array(storedReportCheckSchema).safeParse(value)
  return parsed.success ? parsed.data : []
}

/** 状態が `unobserved` になる前の記録の `unverified` は、同じ意味の `unobserved` として読む。 */
function readLegacyStatus(value: unknown): unknown {
  return typeof value === "object" &&
    value !== null &&
    "status" in value &&
    value.status === "unverified"
    ? { ...value, status: "unobserved" }
    : value
}
