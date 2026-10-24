import { QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach } from "vitest"

import { CharacterEdit } from "../../../../../../../src/browser/components/page/character/components/character-edit/character-edit.tsx"
import type { CharacterPackEntry } from "../../../../../../../src/shared/character-pack/character.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../../src/shared/session/session-state.ts"
import { characterInfo, shownPortraits } from "../../../../../../fixture/character.ts"
import { createTestQueryClient } from "../../../../../query-client.tsx"
import { type CommandSpy, putSession } from "../../../../../session-store.ts"

// `character-edit` の各ファイルが共有する画面の準備。テストごとに同じ画面を開くための口だけを持つ。

export const FIXTURE_CHARACTER: NonNullable<SessionState["character"]> = characterInfo({
  expressions: [
    { name: "default", label: "通常" },
    { name: "thinking", label: "作業中" },
    { name: "proud", label: "どや顔" },
  ],
  ...shownPortraits({
    default: "/character/default.png?v=fictional@1",
    thinking: "/character/thinking.png?v=fictional@1",
    proud: "/character/proud.png?v=fictional@1",
  }),
})

let themeStyleElement: HTMLStyleElement | undefined

/** 各テストの前後に、差し色の初期値の準備と後片付けを足す。 */
export function setUpCharacterEditScreen(): void {
  beforeEach(() => {
    // `--accent` は差し色が定義に無いパックの初期値として読まれる（theme.css の代役）。
    themeStyleElement = document.createElement("style")
    themeStyleElement.textContent = ":root { --accent: #f2b0a0; }"
    document.head.appendChild(themeStyleElement)
  })

  afterEach(() => {
    cleanup()
    themeStyleElement?.remove()
    themeStyleElement = undefined
    window.location.hash = ""
  })
}

// `<CharacterEdit>` は立ち絵に `<Portrait>`（`useQuery`）を使うので `QueryClientProvider` が要る
// （このフィクスチャの立ち絵はラスタなので実際には fetch しないが、hook 自体は呼ばれる）。
export function renderCharacterEdit(
  character: SessionState["character"],
  dispatch: CommandSpy = () => {},
  characterPacks: readonly CharacterPackEntry[] = [],
): void {
  putSession({ ...INITIAL_SESSION_STATE, character, characterPacks }, dispatch)
  const queryClient = createTestQueryClient()
  render(
    <QueryClientProvider client={queryClient}>
      <CharacterEdit />
    </QueryClientProvider>,
  )
}

/** 表情を消す前の確かめ（`PortraitClearConfirm`）。開いていなければ `null`。 */
export function clearConfirmDialog(): Element | null {
  return document.querySelector(".character-clear-confirm")
}

/** キャラクターを消す前の確かめ（`CharacterDeleteConfirm`）。開いていなければ `null`。 */
export function deleteConfirmDialog(): Element | null {
  return document.querySelector(".character-delete-dialog")
}

/**
 * 名前と自己紹介文を設定するダイアログ（`CharacterProfileEditDialog`）。開いていなければ
 * `null`。作るダイアログと同じ `.character-create-dialog` を流用しているので `aria-label` で見分ける。
 */
export function profileEditDialog(): Element | null {
  return document.querySelector('dialog[aria-label="名前と自己紹介文を設定する"]')
}
