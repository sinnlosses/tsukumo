// タスクのモーダルの右の詳細。ID と status の生の値・タイトル・情報の表・つながりの札・本文。
// 内側で縦に転がし、見出しの帯と操作の帯は動かない。
//
// つながりの札（依存・依存元）と本文中の ID は `onJump` で選んでいるタスクを切り替える
// （`docs/architecture/display.md`「タスクのモーダル」の「つながりをたどる」）。

import { ChevronLeft, ChevronRight, FileText, Repeat } from "lucide-react"
import type { ReactElement } from "react"

import { Button } from "../../../components/ui/button/button.tsx"
import type {
  TaskBoardBreadcrumb,
  TaskBoardDetail,
  TaskDependencyCard,
} from "../domain/task-board-view.ts"
import taskBoardStyles from "../task-board.module.css"
import { TaskBody } from "./deferred-task-body.tsx"
import styles from "./task-detail.module.css"
import { TaskDifficulty } from "./task-difficulty.tsx"
import { TaskState } from "./task-state.tsx"
import { TaskSummaryText } from "./task-summary-text.tsx"

export function TaskDetail(props: {
  readonly detail: TaskBoardDetail
  readonly breadcrumb: TaskBoardBreadcrumb
  readonly knownIds: ReadonlySet<string>
  readonly onJump: (id: string) => void
}): ReactElement {
  const detail = props.detail
  return (
    <section aria-label={`${detail.id} の詳細`} className={styles["task-detail"]}>
      {props.breadcrumb.kind === "some" && (
        <TaskDetailBreadcrumb breadcrumb={props.breadcrumb} currentId={detail.id} />
      )}
      <div className={styles["task-detail-head"]}>
        <span className={styles["task-detail-id"]}>{detail.id}</span>
        <span className={styles["task-detail-status"]}>{detail.status}</span>
      </div>
      <h3 className={styles["task-detail-title"]}>
        <TaskSummaryText parts={detail.title} />
      </h3>
      <dl className={styles["task-detail-info"]}>
        <dt>着手</dt>
        <dd>
          <TaskState state={detail.state} />
        </dd>
        <dt>難易度</dt>
        <dd>
          <TaskDifficulty difficulty={detail.difficulty} />
        </dd>
        <dt>ループ</dt>
        <dd className={styles["task-detail-loop"]}>
          {detail.loop.on && <Repeat size={12} strokeWidth={2} aria-hidden="true" />}
          {detail.loop.text}
        </dd>
        {detail.location.kind === "file" && (
          <>
            <dt>ファイル</dt>
            <dd className={styles["task-detail-location"]}>
              <FileText size={14} strokeWidth={2} aria-hidden="true" />
              {detail.location.path}
            </dd>
          </>
        )}
        {detail.location.kind === "issue" && (
          <>
            <dt>Issue</dt>
            <dd className={styles["task-detail-location"]}>
              <a href={detail.location.url} target="_blank" rel="noreferrer">
                {detail.location.url}
              </a>
            </dd>
          </>
        )}
      </dl>
      {detail.dependencies.length > 0 && (
        <TaskDependencyGroup
          headingId="task-detail-dependencies-heading"
          title="先に終わっていてほしいもの"
          titleClassName={styles["task-detail-dependencies-title"]}
          dependencies={detail.dependencies}
          onJump={props.onJump}
        />
      )}
      {detail.dependents.length > 0 && (
        <TaskDependencyGroup
          headingId="task-detail-dependents-heading"
          title="これを待っているもの"
          titleClassName={styles["task-detail-dependents-title"]}
          dependencies={detail.dependents}
          onJump={props.onJump}
        />
      )}
      <article aria-label="本文">
        <TaskBody
          text={detail.body}
          typesetting="detail"
          knownIds={props.knownIds}
          onJump={props.onJump}
        />
      </article>
    </section>
  )
}

function TaskDetailBreadcrumb(props: {
  readonly breadcrumb: Extract<TaskBoardBreadcrumb, { readonly kind: "some" }>
  readonly currentId: string
}): ReactElement {
  return (
    <nav aria-label="タスクのつながり" className={styles["task-detail-breadcrumb"]}>
      <Button
        variant="text-accent"
        size="action"
        pressed="none"
        disabled={false}
        ariaLabel={undefined}
        disclosure={{ kind: "none" }}
        ariaHasPopup={undefined}
        title={undefined}
        className={styles["task-detail-breadcrumb-back"]}
        onClick={props.breadcrumb.onBack}
      >
        <ChevronLeft
          size={14}
          strokeWidth={2}
          aria-hidden="true"
          className={styles["task-detail-breadcrumb-back-chevron"]}
        />
        {props.breadcrumb.previousId} に戻る
      </Button>
      <span className={styles["task-detail-breadcrumb-separator"]}>›</span>
      <span className={styles["task-detail-breadcrumb-current"]}>{props.currentId}</span>
    </nav>
  )
}

function TaskDependencyGroup(props: {
  readonly headingId: string
  readonly title: string
  readonly titleClassName: string
  readonly dependencies: readonly TaskDependencyCard[]
  readonly onJump: (id: string) => void
}): ReactElement {
  return (
    <div
      className={styles["task-detail-dependencies"]}
      role="group"
      aria-labelledby={props.headingId}
    >
      <p id={props.headingId} className={props.titleClassName}>
        {props.title}
      </p>
      <ul className={styles["task-detail-dependency-list"]}>
        {props.dependencies.map((dependency) => (
          <TaskDependency key={dependency.id} dependency={dependency} onJump={props.onJump} />
        ))}
      </ul>
    </div>
  )
}

function TaskDependency(props: {
  readonly dependency: TaskDependencyCard
  readonly onJump: (id: string) => void
}): ReactElement {
  const dependency = props.dependency
  if (dependency.kind === "unlisted") {
    return (
      <li className={taskBoardStyles["task-detail-dependency"]}>
        <span className={styles["task-detail-dependency-id"]}>{dependency.id}</span>
        <span className={styles["task-detail-dependency-unlisted"]}>一覧に無い</span>
      </li>
    )
  }
  return (
    <li>
      <button
        type="button"
        className={taskBoardStyles["task-detail-dependency"]}
        onClick={() => props.onJump(dependency.id)}
      >
        <span className={styles["task-detail-dependency-id"]}>{dependency.id}</span>
        <TaskState state={dependency.state} />
        <span className={styles["task-detail-dependency-summary"]}>
          <TaskSummaryText parts={dependency.summary} />
        </span>
        <ChevronRight
          size={12}
          strokeWidth={2}
          aria-hidden="true"
          className={styles["task-detail-dependency-chevron"]}
        />
      </button>
    </li>
  )
}
