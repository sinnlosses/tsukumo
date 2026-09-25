// 雑談中のサイドバーの2段目「最近の話題」（docs/screen-design.md 13.7「雑談のときのサイドバー」）。
// 中身は雑談の要約の写しから取り出した話題の見出し（`SessionState.chatTopics`。新しい順で、
// 並べ替えずに届いた順のまま出す）。**更新されるのは圧縮のときだけ**なので、それまでは前回の
// 話題のまま。区画の枠（`SidebarSection`）はタスクの区画と同じものを借りる。
//
// **空のときは案内を出す。** 一度も圧縮していないパックと、見出しを取り出せなかった要約は
// 同じ空で届き、どちらも次の圧縮で埋まるので、案内も1つにする。

import { type ReactElement } from "react"

import { useSessionSelector } from "../../../stores/session.tsx"
import { SidebarSection } from "./section.tsx"
import styles from "./sidebar.module.css"

export function RecentTopicSection(): ReactElement {
  const topics = useSessionSelector((session) => session.state.chatTopics)
  return (
    <SidebarSection
      title="最近の話題"
      extraClass={styles["sidebar-block-chat"] ?? ""}
      action={undefined}
    >
      {topics.length === 0 ? (
        <p className={styles["sidebar-empty"]}>まだ話題が無い（話が積もると、ここに並ぶ）</p>
      ) : (
        <ul className={styles["sidebar-topic-list"]} aria-label="最近の話題">
          {topics.map((topic, index) => (
            // 並びは届くたびに丸ごと置き換わり、同じ見出しが2つ並ぶこともあるので位置で引く。
            <li key={index} className={styles["sidebar-topic"]}>
              {topic}
            </li>
          ))}
        </ul>
      )}
    </SidebarSection>
  )
}
