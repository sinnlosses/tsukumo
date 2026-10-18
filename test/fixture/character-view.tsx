// `<CharacterView>` のテストが共有する、セッションの姿の差し込みと架空のキャラクター・セリフ。

import { QueryClientProvider } from "@tanstack/react-query"
import { render } from "@testing-library/react"

import { CharacterView } from "../../src/browser/components/page/conversation/components/character-view/character-view.tsx"
import { writeHashRoute, type ViewedTurn } from "../../src/browser/stores/location-hash.ts"
import type { Expression } from "../../src/shared/character-pack/expression.ts"
import type { WrittenReactions } from "../../src/shared/recommendation/reaction.ts"
import { INITIAL_SESSION_STATE, type SessionState } from "../../src/shared/session/session-state.ts"
import { createTestQueryClient } from "../browser/query-client.tsx"
import { putSession } from "../browser/session-store.ts"
import { characterInfo, shownPortraits } from "./character.ts"

export const FIXTURE_CHARACTER: NonNullable<SessionState["character"]> = characterInfo({
  ...shownPortraits({ default: "/character/default.png" }),
})

export const REACTIONS = {
  retrying: { text: "架空の再試行反応", expression: "thinking" },
  failed: { text: "架空の失敗の反応", expression: "sad" },
  limited: { text: "架空の上限の反応", expression: "default" },
  idle: { text: "架空の待ちの反応", expression: "default" },
} as const satisfies WrittenReactions

/** 反応の行が書けた姿。 */
export const WRITTEN_REACTIONS: SessionState["writtenReactions"] = {
  kind: "written",
  reactions: REACTIONS,
}

/** `SessionState.speeches` の1件（表情は既定でよいテストのための簡略記法）。 */
export function speech(
  text: string,
  expression: Expression = "default",
): SessionState["speeches"][number] {
  return { text, expression, time: { kind: "stamped", at: 0 } }
}

// `<CharacterView>` は立ち絵に `<Portrait>`（`useQuery`）を使うので `QueryClientProvider` が要る。
// 過去のターンを見るテストは、そのターンの通し番号（`request` の `turnId`）を hash に乗せてから描く。
export function renderCharacterView(
  stateOverrides: Partial<SessionState>,
  viewedTurn: ViewedTurn = "newest",
): void {
  writeHashRoute({
    screen: "conversation",
    turn: viewedTurn,
    pack: { kind: "in-use" },
    achievementDate: { kind: "today" },
  })
  putSession({ ...INITIAL_SESSION_STATE, ...stateOverrides })
  const queryClient = createTestQueryClient()
  render(
    <QueryClientProvider client={queryClient}>
      <CharacterView />
    </QueryClientProvider>,
  )
}
