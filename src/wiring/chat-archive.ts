// 会話のアーカイブを、駆動に合わせて切り替える。
// 疑似セッションの作り物の会話を、利用者のホームの記憶（作業記憶・あらすじの元）に混ぜない。

import { createChatArchive } from "../server/chat/adapter/chat-archive.ts"
import type { ChatArchive } from "../server/chat/core/archive/chat-archive-port.ts"
import type { WiringContext } from "./wiring-context.ts"

export function switchedChatArchive(driver: WiringContext["driver"]): ChatArchive {
  switch (driver.kind) {
    case "sdk":
      return createChatArchive()
    case "fake":
      return silentChatArchive()
    default:
      return driver satisfies never
  }
}

/**
 * 書きは捨て、読みは空を返す。置き場のディレクトリも作らない。
 * 画像の書きは失敗として知らせず、書いたことにする（行は append が捨てるのでファイル名は残らない）。
 */
function silentChatArchive(): ChatArchive {
  return {
    append: () => undefined,
    writeImage: () => Promise.resolve({ kind: "written", fileName: "fake-session-image" }),
    readRecent: () => [],
    unconsolidated: () => ({ entries: [], usedBytes: 0, overflowed: false }),
    appendedBytes: () => 0,
  }
}
