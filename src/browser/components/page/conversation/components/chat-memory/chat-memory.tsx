// 雑談中の欄外。上から「覚えていること」「最近の話題」の2区画を並べる。
// 区画は自分では転がらないので、転がすのは並べた先の入れ物。

import type { ReactElement } from "react"

import { PersonaMemorySection } from "./persona-memory-section.tsx"
import { RecentTopicSection } from "./recent-topic-section.tsx"

export function ChatMemory(): ReactElement {
  return (
    <>
      <PersonaMemorySection />
      <RecentTopicSection />
    </>
  )
}
