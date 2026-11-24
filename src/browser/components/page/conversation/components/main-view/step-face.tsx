// ステップの本文の顔（枠・地・角丸・余白）。外側の要素（section・Disclosure）は置き方・役目・状態の class を持ち、中身をこの顔で包む。

import type { ReactElement, ReactNode } from "react"

import { Surface } from "../../../../ui/surface/surface.tsx"
import styles from "./main-view.module.css"

/** 最終レポート・草稿・失敗の表示の顔。 */
export function StepFace(props: { readonly children: ReactNode }): ReactElement {
  return (
    <Surface
      element="div"
      tone="surface"
      space="none"
      radius="md"
      shadow="none"
      className={styles["main-step-face"]}
    >
      {props.children}
    </Surface>
  )
}

/** 中間レポートの顔（破線の枠）。`Disclosure` の外に置く。狭い画面で本文を隠すときは顔ごと隠す。 */
export function InterimStepFace(props: {
  readonly phoneHidden: boolean
  readonly children: ReactNode
}): ReactElement {
  if (props.phoneHidden) {
    return (
      <Surface
        element="div"
        tone="surface"
        space="none"
        radius="md"
        shadow="none"
        className={styles["main-step-face-interim-phone-hidden"]}
      >
        {props.children}
      </Surface>
    )
  }
  return (
    <Surface
      element="div"
      tone="surface"
      space="none"
      radius="md"
      shadow="none"
      className={styles["main-step-face-interim"]}
    >
      {props.children}
    </Surface>
  )
}
