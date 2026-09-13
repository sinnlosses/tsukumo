// メインビュー本体（`<MainView>`。docs/design.md 6.1）。**主役はレポート**で、そこに
// `toolVisibility` が絞ったツールの行・質問の記録が挟まる（`docs/requirements.md` 4.2。
// 作業の**進行**はサイドバーが別に持つ）。
//
// **1ターン＝1枚、今回・1つ前・2つ前の3タブ。新しいターンで先頭へ戻すが、利用者が過去の
// タブを見ている間は動かさない**（もとは移行前のブラウザ側スクリプトが持っていた規則を、
// 部品のローカル状態に持ち替えた。docs/design.md 6.2）。
//
// 選んでいるターン（`turnId`）・追従中か（今回を見ていたか）は `<MainView>` のローカル状態
// （docs/design.md 6.2 の表のとおり）。

import { useEffect, useRef, useState, type ReactElement } from "react"

import { mainViewTurns } from "../../protocol/main-view.ts"
import { mainViewEntries } from "../../protocol/session-state.ts"
import { useSession } from "../app.tsx"
import { TurnTabs } from "./turn-tabs.tsx"
import { Turn } from "./turn.tsx"

const EMPTY_MESSAGE = "（まだ作業がありません）"

export function MainView(): ReactElement {
  const { state } = useSession()
  const entries = mainViewEntries(state)
  // mainViewTurns は昇順（古い→新しい）を返す。タブは新しい順に並べるので反転する。
  const turnsNewestFirst = [...mainViewTurns(entries)].reverse()
  const turnIds = turnsNewestFirst.map((turn) => turn.id)
  const newestId = turnIds[0]

  const [selectedTurnId, setSelectedTurnId] = useState<number | undefined>(undefined)
  const lastNewestIdRef = useRef<number | undefined>(undefined)
  const scrollerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previousNewest = lastNewestIdRef.current
    const started =
      previousNewest !== undefined && newestId !== undefined && newestId !== previousNewest
    // 「今回」を見ていた人だけを新しいやり取りへ連れていく。選んでいたやり取りが無い
    // （最初の1回）か、直前の「今回」を選んだままだったときだけ追従する。
    const wasFollowingNewest = selectedTurnId === undefined || selectedTurnId === previousNewest

    if (started && wasFollowingNewest) {
      setSelectedTurnId(newestId)
      if (scrollerRef.current !== null) {
        scrollerRef.current.scrollTop = 0
      }
    }
    lastNewestIdRef.current = newestId
    // 依存はあえて newestId だけ（selectedTurnId は判定に読むだけで、依存に含めると
    // 選択を変えるたびに「新しいターンが始まったか」の判定まで走り直ってしまう）。
  }, [newestId])

  if (turnsNewestFirst.length === 0) {
    return <p className="placeholder">{EMPTY_MESSAGE}</p>
  }

  // 選んでいたやり取りが窓（直近3件）から外れたら今回に戻す。
  const activeTurnId =
    selectedTurnId !== undefined && turnIds.includes(selectedTurnId) ? selectedTurnId : newestId
  const activeTurn = turnsNewestFirst.find((turn) => turn.id === activeTurnId)

  function selectTurn(turnId: number): void {
    setSelectedTurnId(turnId)
    if (scrollerRef.current !== null) {
      scrollerRef.current.scrollTop = 0
    }
  }

  return (
    <div className="main-turns" ref={scrollerRef}>
      <TurnTabs turnIds={turnIds} activeTurnId={activeTurnId} onSelect={selectTurn} />
      {activeTurn !== undefined && <Turn turn={activeTurn} />}
    </div>
  )
}
