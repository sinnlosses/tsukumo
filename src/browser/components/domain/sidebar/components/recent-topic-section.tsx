// 雑談中のサイドバーの2段目「最近の話題」。
// 中身はあらすじの写しから取り出した話題の見出し（`SessionState.chatTopics`。新しい順で、届いた順のまま出す）。
// 更新されるのは圧縮のときだけなので、それまでは前回の話題のまま。
//
// 空のときは案内を出す。
// 一度も圧縮していないパックと、見出しを取り出せなかった要約は同じ空で届き、どちらも次の圧縮で埋まるので、案内も1つにする。

import type { ReactElement } from "react"

import { withOccurrenceKeys } from "../../../../domain/occurrence-key.ts"
import { useSession } from "../../../../stores/session.ts"
import { Text } from "../../../ui/text/text.tsx"
import sidebarStyles from "../sidebar.module.css"
import styles from "./recent-topic-section.module.css"
import { SidebarSection } from "./section.tsx"

export function RecentTopicSection(): ReactElement {
  const topics = useSession((session) => session.state.chatTopics)
  return (
    <SidebarSection
      title="最近の話題"
      extraClass={sidebarStyles["sidebar-block-chat"]}
      action={undefined}
      headerExtra={undefined}
      filters={undefined}
    >
      {topics.length === 0 ? (
        <Text element="p" size="inherit" tone="ink-quiet" weight="inherit" className="">
          まだ話題が無い（話が積もると、ここに並ぶ）
        </Text>
      ) : (
        <ul className={styles["sidebar-topic-list"]} aria-label="最近の話題">
          {withOccurrenceKeys(topics, (topic) => topic).map(({ key, item }) => (
            <li key={key} className={styles["sidebar-topic"]}>
              {item}
            </li>
          ))}
        </ul>
      )}
    </SidebarSection>
  )
}
