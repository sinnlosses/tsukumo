// 書き終わりの知らせ（`../diary-notice.tsx`。`docs/screen-design.md` 13.10「書き終わりの知らせ」）の
// ロジック。`SessionState.diaryWriting` を読み、`written` になったら画面の下中央に浮く札を出す。
//
// **出すのは成果の画面だけ**で、それを決めるのは `main.tsx` の `<Root>`（ほかの画面では
// `<Activity>` で隠す）。`diaryWriting` はセッションの状態（`useSessionSelector`）なので、
// 隠れているあいだも読み続け、「×」で消したかどうかも失わない。
//
// **消えるのは「×」・「日記帳で開く」・次の振り返りを押したとき・起こし直したとき**（同節）。
// 「次の振り返りを押したとき」は `diaryWriting.kind` が `writing` に変わることで、「起こし直した
// とき」は新しいセッションの既定値（`idle`）に戻ることで、どちらも `shared/session-state.ts` の
// 畳み込みが自然に片付ける。ここで持つのは「×」「日記帳で開く」による**この起動の間だけの既読**
// （タブのメモリ）だけ——`useState` に置き、React の外へは持たない（リロードすると同じ知らせが
// もう一度出る。同節「消したかどうかはタブのメモリにだけ持つ」）。既読の鍵は日付＋書いた時刻
// （書き足すたびに変わる）で、前に消した知らせと次の知らせを区別する。

import { useState } from "react"

import { selectAchievementDate } from "../../../../../../stores/screen.tsx"
import { useSessionSelector } from "../../../../../../stores/session.tsx"
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
  const diaryWriting = useSessionSelector((session) => session.state.diaryWriting)
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
