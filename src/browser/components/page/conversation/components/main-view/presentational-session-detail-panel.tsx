// 札のセッション側の行を押すと、札の右隣に開く詳細。
// 中身は切り替え画面の右の欄と同じ部品（`SessionSwitcherDetail`）で、ここでは題を足し、足元にキーの印を添える。

import type { ReactElement } from "react"

import { SessionSwitcherDetail } from "../../../../../features/session-switcher/session-switcher-detail.tsx"
import { CharacterFace } from "../../../../frame/character-face.tsx"
import { Kbd } from "../../../../ui/kbd/kbd.tsx"
import { Popover } from "../../../../ui/popover/popover.tsx"
import { SESSION_DETAIL_ATTRIBUTE, type SessionDetailPop } from "./hooks/use-session-detail-pop.ts"
import type { SessionDetailModel } from "./hooks/use-session-outline.ts"
import styles from "./main-view.module.css"

type PresentationalSessionDetailPanelProps = {
  readonly detail?: SessionDetailModel
  readonly pop: SessionDetailPop
}

export function PresentationalSessionDetailPanel({
  detail,
  pop,
}: PresentationalSessionDetailPanelProps): ReactElement {
  return (
    <Popover
      open={detail !== undefined}
      anchorRef={pop.anchorRef}
      ariaLabel={
        detail === undefined ? "セッションの詳細" : `セッション ${detail.row.shortId} の詳細`
      }
      width={pop.place.width}
      placement={{ kind: "at", left: pop.place.left, top: pop.place.top }}
      onClose={() => {
        if (detail !== undefined && pop.shouldClose()) {
          detail.onClose()
        }
      }}
      className=""
    >
      {detail !== undefined && (
        <div
          {...{ [SESSION_DETAIL_ATTRIBUTE]: "" }}
          className={styles["session-detail-panel"]}
          style={{ maxBlockSize: `${String(pop.place.maxHeight)}px` }}
        >
          <SessionSwitcherDetail
            row={detail.row}
            digest={detail.digest}
            characterName={detail.characterName}
            face={
              <CharacterFace
                url={detail.faceUrl}
                alt=""
                className={styles["session-detail-face"]}
              />
            }
            showTitle={true}
            blocked={detail.blocked}
            blockedTitle={detail.blockedTitle}
            className={styles["session-detail-body"]}
            footNote={
              <>
                <span>
                  <Kbd keys="↑" /> <Kbd keys="↓" /> 選ぶ
                </span>
                <span>
                  <Kbd keys="Esc" /> 閉じる
                </span>
              </>
            }
            onSwitch={detail.onSwitch}
          />
        </div>
      )}
    </Popover>
  )
}
