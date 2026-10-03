// 同梱の疑似セッション（test/fixture/fake-session.json）を、読めなければ理由つきで投げて返す。

import {
  type FakeSession,
  readFakeSession,
} from "../../src/server/session-driver/adapter/fake-driver.ts"

export function bundledFakeSession(): FakeSession {
  const reading = readFakeSession()
  if (reading.kind === "unreadable") {
    throw new Error(`疑似セッション（test/fixture/fake-session.json）が読めない: ${reading.reason}`)
  }
  return reading.session
}
