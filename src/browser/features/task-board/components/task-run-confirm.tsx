// 「このタスクを実行しますか」の確認。
// OK まで行くと、設定の文面（`tasks.runPrompt`）の `{id}` を ID にしたものを入力欄を経由せずに dispatch する（`<Composer>` の下書きには触らない）。
// 送ったあとは、サーバから返る `request` イベントがメインビューに依頼として並ぶので、打ったのと同じ見え方になる。
//
// ターンが動いている間は断る（押せなくするのではなく、押したら理由を出す）。
// 送信の口（`<Composer>` の `submit`）は進行中なら黙って送らないので、ここで黙って消えると「押したのに何も起きない」になる。
// 開いたあとに始まったターンもここに出る。

import type { ReactElement } from "react"

import { DEFAULT_RUN_PROMPT, runPromptOf } from "../../../../shared/repository/project-settings.ts"
import { Button } from "../../../components/ui/button/button.tsx"
import { Dialog } from "../../../components/ui/dialog/dialog.tsx"
import { Text } from "../../../components/ui/text/text.tsx"
import { useSession, useTurnRunning } from "../../../stores/session.ts"
import type { TaskRunConfirmOutcome } from "../domain/task-run-confirm-outcome.ts"
import styles from "./task-run-confirm.module.css"

export type TaskRunConfirmProps = {
  readonly taskId: string
  /** 保留のタスクなら真。文面が既定（`/next-task`）のときだけ、着手の前に判断を尋ねることを添える。 */
  readonly held: boolean
  /** 文面のひな形。`{id}` を `taskId` に置き換えて送る。 */
  readonly runPrompt: string
  /**
   * 送ったあと・送らずに閉じたあとのどちらでも呼ばれる（開いているかは呼び出し側が持つ）。
   * タスクのモーダルから開いたときは、`sent` でモーダルも閉じる。
   * 閉じないと、メインビューに並んだ依頼が画面いっぱいのモーダルに隠れて「押したのに何も起きない」に見える。
   */
  readonly onClose: (outcome: TaskRunConfirmOutcome) => void
}

/**
 * 開いた状態で組み立てられる `<dialog>`。タスクのモーダルの上に重ねて開く。
 * `showModal()` は top layer に積むので下のモーダルより必ず上に出て、Esc はいちばん上（この確認）だけを閉じる。
 * モーダルを閉じてから出す形にすると、断ったあとに一覧へ戻れない。
 */
export function TaskRunConfirm(props: TaskRunConfirmProps): ReactElement {
  const dispatch = useSession((session) => session.dispatch)
  const turnInProgress = useTurnRunning()
  const prompt = runPromptOf(props.runPrompt, props.taskId)

  const run = (): void => {
    dispatch.session.prompt({ text: prompt, images: [] })
    props.onClose("sent")
  }
  const dismiss = (): void => {
    props.onClose("dismissed")
  }

  return (
    <Dialog
      open={true}
      ariaLabel="タスクの実行"
      backdrop="dim"
      placement={{ kind: "auto" }}
      onClose={dismiss}
      className={styles["task-run-confirm"]}
    >
      <Text element="p" size="heading" tone="inherit" weight="semibold" className="">
        {props.taskId} を実行しますか
      </Text>
      {turnInProgress ? (
        <Text
          element="p"
          size="inherit"
          tone="ink-quiet"
          weight="inherit"
          className={styles["task-run-note"]}
        >
          いまターンが動いているので送れない。終わってからもう一度押す。
        </Text>
      ) : (
        <Text
          element="p"
          size="inherit"
          tone="ink-quiet"
          weight="inherit"
          className={styles["task-run-note"]}
        >
          入力欄に <code className={styles["task-run-prompt"]}>{prompt}</code> と打つのと同じ。
          {props.held &&
            props.runPrompt === DEFAULT_RUN_PROMPT &&
            "保留のタスクなので、着手の前に判断を聞かれる。"}
        </Text>
      )}
      <div className={styles["task-run-actions"]}>
        <Button
          variant="outline"
          size="secondary"
          pressed="none"
          disabled={false}
          ariaLabel={undefined}
          disclosure={{ kind: "none" }}
          ariaHasPopup={undefined}
          title={undefined}
          className={styles["task-run-cancel"]}
          onClick={dismiss}
        >
          キャンセル
        </Button>
        {!turnInProgress && (
          <Button
            variant="outline-accent"
            size="secondary"
            pressed="none"
            disabled={false}
            ariaLabel={undefined}
            disclosure={{ kind: "none" }}
            ariaHasPopup={undefined}
            title={undefined}
            className={styles["task-run-ok"]}
            onClick={run}
          >
            実行する
          </Button>
        )}
      </div>
    </Dialog>
  )
}
