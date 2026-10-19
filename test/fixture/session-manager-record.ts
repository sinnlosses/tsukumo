import type { SessionDriver } from "../../src/server/session-driver/core/session-driver.ts"
import type { SessionManagerOptions } from "../../src/server/session/core/session-manager-port.ts"
import type { SessionEvent } from "../../src/shared/session/session-event.ts"
import type { createStubDriver } from "./session-driver.ts"

export function sessionInfo(sessionId: string): SessionEvent {
  return {
    kind: "session-info",
    sessionId,
    model: "opus",
    permissionMode: "auto",
    slashCommands: [],
    terminalSlashCommands: [],
    skillNames: [],
    agentNames: [],
  }
}

export function launchWith(
  stub: ReturnType<typeof createStubDriver>,
  driver: SessionDriver = stub.driver,
): SessionManagerOptions["launchSession"] {
  return (onEvent, onRestoredEvents) => {
    stub.attach(onEvent)
    stub.attachRestored(onRestoredEvents)
    return Promise.resolve(driver)
  }
}

export function collector<T>(): {
  readonly entries: T[]
  readonly append: (entry: T) => void
} {
  const entries: T[] = []
  return {
    entries,
    append: (entry) => {
      entries.push(entry)
    },
  }
}
