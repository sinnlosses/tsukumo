// 狭い画面（760px 以下）の頭。1行目に顔・状態の語と経過・題・≡、2行目に段の点・n/N・「手順 n」。
// 広い画面では CSS で消える（`phone-head.module.css`）ので、ここは幅を測らない。
//
// 「手順 n」は「いまの作業」の開閉をそのまま使い、開いたら依頼の手順の一覧を頭の下に重ねる。

import clsx from "clsx"
import { useId, type ReactElement, type ReactNode } from "react"

import { CurrentWorkList } from "../../../../features/current-work/components/current-work-list.tsx"
import type { CurrentWork } from "../../../../features/current-work/hooks/use-current-work.ts"
import { CharacterFace } from "../../character-face.tsx"
import type { PhoneHead as Head, PhoneHeadProgress } from "../hooks/use-phone-head.ts"
import styles from "./phone-head.module.css"

export type PhoneHeadProps = {
  readonly head: Head
  readonly work: CurrentWork
  /** 1行目の右端に置く、引き出しを開く ≡。 */
  readonly drawerToggle: ReactNode
}

const BACK_LABEL = "‹ 会話へ"

export function PhoneHead(props: PhoneHeadProps): ReactElement {
  const { head, work } = props
  const listId = useId()

  return (
    <div className={styles["phone-head"]}>
      <div className={styles["phone-head-line"]}>
        {head.lead.kind === "face" ? (
          <CharacterFace
            url={head.lead.face.url}
            alt={head.lead.face.alt}
            className={styles["phone-head-face"]}
          />
        ) : (
          <a className={styles["phone-head-back"]} href={head.lead.href}>
            {BACK_LABEL}
          </a>
        )}
        <div className={styles["phone-head-main"]}>
          {head.status.kind === "shown" && (
            <div
              className={styles["phone-head-status"]}
              data-work-state={head.status.state}
              data-chat-idle={head.status.chatIdle}
            >
              {head.status.mark === "spinner" ? (
                <span className={styles["phone-head-spinner"]} aria-hidden="true" />
              ) : (
                <span className={styles["phone-head-mark"]} aria-hidden="true">
                  {head.status.mark}
                </span>
              )}
              <span className={styles["phone-head-word"]}>{head.status.wordLabel}</span>
              {head.status.elapsedLabel !== "" && (
                <span className={styles["phone-head-elapsed"]}>{head.status.elapsedLabel}</span>
              )}
            </div>
          )}
          <div className={styles["phone-head-title"]}>{head.title}</div>
        </div>
        {props.drawerToggle}
      </div>
      {head.progress.kind !== "none" && (
        <PhoneHeadProgressLine progress={head.progress} work={work} listId={listId} />
      )}
      {work.open && head.progress.kind !== "none" && (
        <CurrentWorkList id={listId} work={work} className={styles["phone-head-steps"]} />
      )}
    </div>
  )
}

function PhoneHeadProgressLine(props: {
  readonly progress: Exclude<PhoneHeadProgress, { readonly kind: "none" }>
  readonly work: CurrentWork
  readonly listId: string
}): ReactElement {
  const { progress, work } = props
  // 預け先はここで分解して受ける（`work.toggleRef` の形のまま `ref` に渡すと `react(refs)` が落ちる）。
  const { toggleRef } = work
  return (
    <div className={styles["phone-head-line"]}>
      {progress.kind === "planned" && (
        <>
          <ol className={styles["phone-head-dots"]} aria-label="段取り">
            {progress.dots.map((dot) => (
              <li
                key={dot.key}
                className={clsx(
                  styles["phone-head-dot"],
                  dot.state === "done" && styles["is-done"],
                  dot.state === "current" && styles["is-current"],
                )}
                aria-label={dot.label}
              >
                {dot.state === "done" && "✓"}
              </li>
            ))}
          </ol>
          <span className={styles["phone-head-position"]}>{progress.positionLabel}</span>
        </>
      )}
      <button
        type="button"
        ref={toggleRef}
        className={styles["phone-head-steps-toggle"]}
        aria-expanded={work.open}
        aria-controls={props.listId}
        onClick={work.onToggle}
      >
        手順 <span className={styles["phone-head-step-count"]}>{progress.stepCount}</span>
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d={work.open ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} />
        </svg>
      </button>
    </div>
  )
}
