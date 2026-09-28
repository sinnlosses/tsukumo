// タスクのモーダルの右の詳細。ID と status の生の値・タイトル・情報の表・依存の札・本文。
// 内側で縦に転がし、見出しの帯と操作の帯は動かない。
//
// 依存の札はまだ押せない（押してそのタスクへ移る動きは持っていない）。

import { ChevronRight, FileText, Repeat } from "lucide-react"
import type { ReactElement } from "react"

import type { TaskBoardDetail, TaskDependencyCard } from "../hooks/use-task-board.ts"
import styles from "../task-board.module.css"
import { TaskBody } from "./task-body.tsx"
import { TaskDifficulty } from "./task-difficulty.tsx"
import { TaskState } from "./task-state.tsx"
import { TaskSummaryText } from "./task-summary-text.tsx"

export function TaskDetail(props: { readonly detail: TaskBoardDetail }): ReactElement {
  const detail = props.detail
  return (
    <section aria-label={`${detail.id} の詳細`} className={styles["task-detail"]}>
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
        <div className={styles["task-detail-dependencies"]}>
          <p className={styles["task-detail-dependencies-title"]}>先に終わっていてほしいもの</p>
          <ul className={styles["task-detail-dependency-list"]}>
            {detail.dependencies.map((dependency) => (
              <TaskDependency key={dependency.id} dependency={dependency} />
            ))}
          </ul>
        </div>
      )}
      <article aria-label="本文">
        <TaskBody text={detail.body} />
      </article>
    </section>
  )
}

function TaskDependency(props: { readonly dependency: TaskDependencyCard }): ReactElement {
  const dependency = props.dependency
  return (
    <li className={styles["task-detail-dependency"]}>
      <span className={styles["task-detail-dependency-id"]}>{dependency.id}</span>
      {dependency.kind === "listed" && (
        <>
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
        </>
      )}
      {dependency.kind === "unlisted" && (
        <span className={styles["task-detail-dependency-unlisted"]}>一覧に無い</span>
      )}
    </li>
  )
}
