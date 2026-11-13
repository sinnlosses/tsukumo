// 舞台のやり取りの流れから「紙のこの段へ」と頼まれたとき、このターンの該当の段まで転がして短い目印を付けるフック。
// 段は `data-step-id`（`MainViewStep.id`）で探す。畳んだ段（`<details>`）と、それを包む経過の畳みは開いてから転がす。
//
// 合図は store を購読して受ける。ターンを切り替えてから付いた受け手のために、付いた時点で残っている合図も1回だけ見る。
// `scrollIntoView` を使うのは、転がる祖先を呼ぶ側が知らなくても全部たどって動かすため。

import { useExternalSync } from "../../../../../../hooks/use-external-sync.ts"
import { useStepJump, type StepJumpState } from "../../../stores/step-jump.ts"

/** 目印（`data-jumped`）を付けておく時間。`turn.css` の `step-jumped` の長さと同じにする。 */
const JUMPED_MARK_MS = 1600

/** 紙を包む `<main>`（旧い器は `data-region="main"`、新しい器は `data-region="paper"`）。 */
const MAIN_REGION_SELECTOR = "main"

export function useStepJumpLanding(turnId: number): void {
  useExternalSync(() => {
    const land = ({ jump, settleJump }: StepJumpState): void => {
      if (jump.kind === "none" || jump.turnId !== turnId) {
        return
      }
      settleJump()
      const target = document.querySelector<HTMLElement>(
        `${MAIN_REGION_SELECTOR} [data-step-id="${String(jump.stepId)}"]`,
      )
      if (target === null) {
        return
      }
      openFolds(target)
      target.scrollIntoView({ block: "start", behavior: "smooth" })
      target.dataset["jumped"] = "true"
      setTimeout(() => {
        delete target.dataset["jumped"]
      }, JUMPED_MARK_MS)
    }
    land(useStepJump.getState())
    return useStepJump.subscribe(land)
  }, [turnId])
}

/** 段そのものと、それを包む `<details>` を全部開く。 */
function openFolds(target: HTMLElement): void {
  const folds = [target, ...ancestorsOf(target)].filter(
    (element): element is HTMLDetailsElement => element instanceof HTMLDetailsElement,
  )
  for (const fold of folds) {
    fold.open = true
  }
}

function ancestorsOf(element: HTMLElement): readonly HTMLElement[] {
  const parent = element.parentElement
  return parent === null ? [] : [parent, ...ancestorsOf(parent)]
}
