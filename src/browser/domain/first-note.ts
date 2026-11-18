// 初めて出たときだけ面の下端に1行で添える説明の種類と文言。
// 見たことの記憶は端末の好み（`localStorage`）に説明ごとに持ち、サーバへ送らない。
// 文言は印のツールチップと `aria-description` にも同じものを使う。

import { z } from "zod"

import { localPreference } from "../utils/local-preference.ts"

const FIRST_NOTE_IDS = ["inquiry-terms", "report-terms"] as const

export type FirstNoteId = (typeof FIRST_NOTE_IDS)[number]

export const FIRST_NOTE_TEXT = {
  "inquiry-terms":
    "「確かめた」は今回の作業で実行して確認した事実、「確度」はおすすめへの自信の程度",
  "report-terms": "「記録あり」は実行の記録と照合できた確認、「申告のみ」は記録と照合できない申告",
} satisfies Record<FirstNoteId, string>

// 端末には、もう無い説明の鍵が残っていることがある。知らない鍵だけを落とし、ほかの記憶は保つ。
const seenPreference = localPreference(
  "tsukumo-first-note-seen:v1",
  z.array(z.string()).transform((ids) => ids.filter(isFirstNoteId)),
  [],
)

export const loadSeenFirstNotes: () => readonly FirstNoteId[] = seenPreference.load

export function saveSeenFirstNotes(value: readonly FirstNoteId[]): void {
  seenPreference.save([...value])
}

function isFirstNoteId(id: string): id is FirstNoteId {
  return FIRST_NOTE_IDS.some((known) => known === id)
}
