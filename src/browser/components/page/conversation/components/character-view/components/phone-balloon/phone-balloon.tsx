// 狭い画面（760px 以下）の、入力欄の上の顔と最新の1件の吹き出し。
// 広い画面では CSS で消える（`phone-balloon.module.css`）ので、ここは幅を測らない。
//
// 吹き出しを押すとセリフのログが開く。1件も無ければ顔だけを出す。

import type { ReactElement } from "react"

import type { CharacterFaceInfo } from "../../../../../../../domain/character-face.ts"
import { CharacterFace } from "../../../../../../domain/character-face.tsx"
import type { PhoneBalloonLine } from "../../hooks/use-character-view.ts"
import styles from "./phone-balloon.module.css"

export type PhoneBalloonProps = {
  readonly face: CharacterFaceInfo
  readonly line: PhoneBalloonLine
  readonly onOpenLog: () => void
}

/** 吹き出しを押すと開くものを読み上げに伝える名前。 */
const OPEN_LOG_LABEL = "セリフのログを開く"

const WRITING_TEXT = "…"

export function PhoneBalloon(props: PhoneBalloonProps): ReactElement {
  const { line } = props
  return (
    <div className={styles["phone-balloon"]}>
      <CharacterFace
        url={props.face.url}
        alt={props.face.alt}
        className={styles["phone-balloon-face"]}
      />
      {line.kind !== "none" && (
        <button
          type="button"
          className={styles["phone-balloon-bubble"]}
          title={OPEN_LOG_LABEL}
          onClick={props.onOpenLog}
        >
          <span className={styles["phone-balloon-text"]}>
            {line.kind === "text" ? line.text : WRITING_TEXT}
          </span>
        </button>
      )}
    </div>
  )
}
