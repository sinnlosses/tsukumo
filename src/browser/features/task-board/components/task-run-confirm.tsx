// 「このタスクを実行しますか」の確認。
// OK まで行くと、頼む口の文面（`requestPromptOf`）を入力欄を経由せずに dispatch する（`<Composer>` の下書きには触らない）。
// 送ったあとは、サーバから返る `request` イベントがメインビューに依頼として並ぶので、打ったのと同じ見え方になる。
//
// ターンが動いている間は断る（押せなくするのではなく、押したら理由を出す）。
// 送信の口（`<Composer>` の `submit`）は進行中なら黙って送らないので、ここで黙って消えると「押したのに何も起きない」になる。
// 開いたあとに始まったターンもここに出る。

import type { ReactElement } from "react"

import {
  ConfirmDialog,
  ConfirmDialogCode,
} from "../../../components/ui/confirm-dialog/confirm-dialog.tsx"
import { SendIcon } from "../../../components/ui/icon/icon.tsx"
import { currentGearPreferences } from "../../../stores/gear-preference-seed.ts"
import { useSession, useTurnRunning } from "../../../stores/session.ts"
import type { TaskRunConfirmOutcome } from "../domain/task-run-confirm-outcome.ts"
import { requestPromptOf, type TaskRequest, type TaskRunTarget } from "../domain/task-run-prompt.ts"

type TaskRunConfirmProps = {
  /** 頼みの対象と種類。送る文面を決める（保留の着手には、着手の前に判断を聞く旨が添わる）。 */
  readonly target: TaskRunTarget
  /**
   * 送ったあと・送らずに閉じたあとのどちらでも呼ばれる（開いているかは呼び出し側が持つ）。
   * タスクのモーダルから開いたときは、`sent` でモーダルも閉じる。
   * 閉じないと、メインビューに並んだ依頼が画面いっぱいのモーダルに隠れて「押したのに何も起きない」に見える。
   */
  readonly onClose: (outcome: TaskRunConfirmOutcome) => void
}

/**
 * 開いた状態で組み立てられる `<dialog>`。タスクのモーダルの上に重ねて開く。
 * Esc はいちばん上（この確認）だけを閉じる。
 * モーダルを閉じてから出す形にすると、断ったあとに一覧へ戻れない。
 */
export function TaskRunConfirm(props: TaskRunConfirmProps): ReactElement {
  const dispatch = useSession((session) => session.dispatch)
  const turnInProgress = useTurnRunning()
  const { target } = props
  const prompt = requestPromptOf(target, currentGearPreferences().launchSkill)

  const run = (): void => {
    void dispatch.session.prompt({ text: prompt, images: [] })
    props.onClose("sent")
  }
  const dismiss = (): void => {
    props.onClose("dismissed")
  }

  return (
    <ConfirmDialog
      ariaLabel="タスクの実行"
      heading={headingOf(target)}
      note={
        turnInProgress ? (
          "いまターンが動いているので送れない。終わってからもう一度押す。"
        ) : (
          <>
            <ConfirmDialogCode>{prompt}</ConfirmDialogCode> が実行されます。
          </>
        )
      }
      cancelLabel="キャンセル"
      {...(!turnInProgress && {
        confirm: {
          label: OK_LABEL_OF[target.request.kind],
          ...(target.request.kind !== "sort" && { icon: <SendIcon /> }),
          onPress: run,
        },
      })}
      onClose={dismiss}
    />
  )
}

const HEADING_OF = {
  start: "を実行しますか",
  plan: "の計画を頼みますか",
  drop: "の却下を頼みますか",
} satisfies Record<Exclude<TaskRequest["kind"], "sort">, string>

function headingOf(target: TaskRunTarget): string {
  if (target.kind === "sort") {
    return `ドラフト ${target.request.plans.length + target.request.drops.length} 件を仕分けますか`
  }
  return `${target.taskId} ${HEADING_OF[target.request.kind]}`
}

const OK_LABEL_OF = {
  start: "頼む",
  plan: "頼む",
  drop: "頼む",
  sort: "仕分ける",
} satisfies Record<TaskRequest["kind"], string>
