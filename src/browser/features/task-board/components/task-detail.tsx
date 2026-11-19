// タスクのモーダルの右の詳細。押すと番号を写す ID・タイトル・情報の表・つながりの札・本文。
// 内側で縦に転がし、見出しの帯と操作の帯は動かない。
//
// つながりの札（依存・依存元）と本文中の ID は `onJump` で選んでいるタスクを切り替える
// （`docs/architecture/display.md`「タスクのモーダル」の「つながりをたどる」）。

import type { ReactElement } from "react"

import { Button } from "../../../components/ui/button/button.tsx"
import { HStack } from "../../../components/ui/h-stack/h-stack.tsx"
import { ChevronLeftIcon, ChevronRightIcon, CopyIcon } from "../../../components/ui/icon/icon.tsx"
import { Surface } from "../../../components/ui/surface/surface.tsx"
import { Text } from "../../../components/ui/text/text.tsx"
import { TaskBody } from "../deferred-task-body.tsx"
import type {
  TaskBoardBreadcrumb,
  TaskBoardDetail,
  TaskDependencyCard,
} from "../domain/task-board-view.ts"
import taskBoardStyles from "../task-board.module.css"
import { TaskSummaryText } from "../task-summary-text.tsx"
import { TaskDifficultyWord, TaskLoopableText } from "./task-attribute.tsx"
import styles from "./task-detail.module.css"
import { TaskState } from "./task-state.tsx"

export function TaskDetail(props: {
  readonly detail: TaskBoardDetail
  /** 題の見出しの DOM の id。置き場の器が `aria-labelledby` で指す。 */
  readonly titleId: string
  readonly breadcrumb: TaskBoardBreadcrumb
  readonly knownIds: ReadonlySet<string>
  readonly onJump: (id: string) => void
  readonly onCopy: () => void
}): ReactElement {
  const detail = props.detail
  return (
    <section aria-label={`${detail.id} の詳細`} className={styles["task-detail"]}>
      {props.breadcrumb.kind === "some" && (
        <TaskDetailBreadcrumb breadcrumb={props.breadcrumb} currentId={detail.id} />
      )}
      <div className={styles["task-detail-head"]}>
        <Button
          variant="ghost"
          size="action"
          pressed="none"
          disabled={false}
          disclosure={{ kind: "none" }}
          title="番号を写す"
          className={styles["task-detail-id"]}
          onClick={props.onCopy}
        >
          {detail.id}
          <CopyIcon />
        </Button>
      </div>
      <h3 id={props.titleId} className={styles["task-detail-title"]}>
        <TaskSummaryText parts={detail.title} />
      </h3>
      <dl className={styles["task-detail-info"]}>
        <dt>状態</dt>
        <dd>
          <TaskState state={detail.state} display="labeled" />
        </dd>
        {detail.difficulty !== undefined && (
          <>
            <dt>難しさ</dt>
            <dd>
              <TaskDifficultyWord difficulty={detail.difficulty} scale />
            </dd>
          </>
        )}
        {detail.loopable !== undefined && (
          <>
            <dt>ループ</dt>
            <dd>
              <TaskLoopableText loopable={detail.loopable} />
            </dd>
          </>
        )}
        {detail.labels.length > 0 && (
          <>
            <dt>ラベル</dt>
            <dd>
              <HStack
                element="span"
                name={{ kind: "none" }}
                gap="xs"
                align="center"
                justify="start"
                wrap="wrap"
                className={styles["task-detail-labels"]}
              >
                {detail.labels.map((label) => (
                  <Text
                    key={label}
                    element="span"
                    size="label"
                    tone="ink-quiet"
                    weight="normal"
                    className={styles["task-detail-label"]}
                  >
                    {label}
                  </Text>
                ))}
              </HStack>
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
        <TaskBody text={detail.body} knownIds={props.knownIds} onJump={props.onJump} />
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
        disclosure={{ kind: "none" }}
        className={styles["task-detail-breadcrumb-back"]}
        onClick={props.breadcrumb.onBack}
      >
        <span className={styles["task-detail-breadcrumb-back-chevron"]} aria-hidden="true">
          <ChevronLeftIcon />
        </span>
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
      <li>
        <Surface
          element="div"
          tone="ground"
          space="none"
          radius="md"
          shadow="none"
          className={taskBoardStyles["task-detail-dependency-face"]}
        >
          <div className={taskBoardStyles["task-detail-dependency"]}>
            <span className={styles["task-detail-dependency-id"]}>{dependency.id}</span>
            <span className={styles["task-detail-dependency-unlisted"]}>一覧に無い</span>
          </div>
        </Surface>
      </li>
    )
  }
  return (
    <li>
      <Surface
        element="div"
        tone="ground"
        space="none"
        radius="md"
        shadow="none"
        className={taskBoardStyles["task-detail-dependency-face"]}
      >
        <button
          type="button"
          className={taskBoardStyles["task-detail-dependency"]}
          onClick={() => props.onJump(dependency.id)}
        >
          <span className={styles["task-detail-dependency-id"]}>{dependency.id}</span>
          <TaskState state={dependency.state} display="labeled" />
          <span className={styles["task-detail-dependency-summary"]}>
            <TaskSummaryText parts={dependency.summary} />
          </span>
          <span className={styles["task-detail-dependency-chevron"]} aria-hidden="true">
            <ChevronRightIcon />
          </span>
        </button>
      </Surface>
    </li>
  )
}
