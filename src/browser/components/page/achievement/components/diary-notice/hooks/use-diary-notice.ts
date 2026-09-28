// 書き終わりの知らせのロジック。
// `SessionState.diaryWriting` を読み、`written` になったら画面の下中央に浮く札を出す。
//
// 出すのは成果の画面だけで、ほかの画面では `<Layout>` が `<Activity>` で隠す。
// 隠れているあいだも状態を持ち続けるので、「×」で消したかどうかを画面の行き来で失わない。
//
// 消えるのは「×」・「日記帳で開く」・次の振り返りを押したとき・起こし直したとき。
// あとの2つは `diaryWriting` が `writing` か既定値の `idle` に変わることで `applySessionEvent` の側が片付ける。
// ここで持つのは「×」「日記帳で開く」によるこの起動の間だけの既読だけで、`useState` に置き、React の外へは持たない（リロードすると同じ知らせがもう一度出る）。
// 既読の鍵は日付＋書いた時刻（書き足すたびに変わる）で、前に消した知らせと次の知らせを区別する。

import { useState } from "react"

import { selectAchievementDate } from "../../../../../../stores/screen.tsx"
import { useSession } from "../../../../../../stores/session.ts"
import { monthDayLabel } from "../../../../../../utils/month-day-label.ts"
import { requestDiaryBookOpen } from "../../../hooks/use-diary-book-open-request.ts"

export type DiaryNoticeView =
  | { readonly kind: "hidden" }
  | {
      readonly kind: "shown"
      /** 「<日付>のページができました」の日付（「9月23日」の形。今日でも言い換えない）。 */
      readonly dateLabel: string
      /** 「日記帳で開く」。その日の見開きを開き、知らせも消える。 */
      readonly onOpen: () => void
      /** 「×」。知らせだけを消す。 */
      readonly onDismiss: () => void
    }

export function useDiaryNotice(): DiaryNoticeView {
  const diaryWriting = useSession((session) => session.state.diaryWriting)
  const [dismissedKey, setDismissedKey] = useState<string | undefined>(undefined)

  if (diaryWriting.kind !== "written") {
    return { kind: "hidden" }
  }
  const key = `${diaryWriting.date}:${String(diaryWriting.writtenAt)}`
  if (key === dismissedKey) {
    return { kind: "hidden" }
  }

  return {
    kind: "shown",
    dateLabel: monthDayLabel(Temporal.PlainDate.from(diaryWriting.date)),
    onOpen: () => {
      setDismissedKey(key)
      selectAchievementDate(diaryWriting.date)
      requestDiaryBookOpen(diaryWriting.date)
    },
    onDismiss: () => {
      setDismissedKey(key)
    },
  }
}
