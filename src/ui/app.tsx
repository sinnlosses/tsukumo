// <App> の中身。`socket.ts` で接続し、`SessionState` を `useReducer(applySessionEvent)` で持つ。
// `dispatch(command)` は Context で子孫へ配る（docs/design.md 6.1 / 6.2）。
//
// **部品は `SessionState` と `dispatch` だけを見る。** DOM を直接いじる配線は持たない
// （docs/design.md 6.1「部品の木」冒頭）。

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react"

import { type ClientCommand } from "../protocol/command.ts"
import { type ServerFrame } from "../protocol/frame.ts"
import {
  applySessionEvent,
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../protocol/session-state.ts"
import { connectSessionSocket, type ConnectionStatus } from "./socket.ts"

/**
 * `dispatch` に渡すコマンド。`commandId` は `<App>` が `crypto.randomUUID()` で作るので、
 * 呼び出し側は持たない（{@link ClientCommand} から `commandId` を引いた形。分配法則が効くよう
 * 条件型で書く — 単純な `Omit<ClientCommand, "commandId">` だと discriminated union が
 * 潰れて `type` で絞り込めなくなる）。
 */
type DispatchableCommand<T = ClientCommand> = T extends { readonly commandId: string }
  ? Omit<T, "commandId">
  : never

export type SessionContextValue = {
  readonly state: SessionState
  readonly connection: ConnectionStatus
  readonly dispatch: (command: DispatchableCommand) => void
}

/**
 * 部品のテストが本物の WebSocket 接続を経由せず値を差し込めるよう、Context 自体を公開する
 * （`<SessionContext.Provider value={...}>` で包む。`src/ui/app.tsx` 以外はこの Context を
 * 直接読まず、必ず {@link useSession} を通す）。
 */
export const SessionContext = createContext<SessionContextValue | undefined>(undefined)

/** `<App>` の内側でだけ呼べる。外で呼ぶのは配線の誤りなので例外にする。 */
export function useSession(): SessionContextValue {
  const value = useContext(SessionContext)
  if (value === undefined) {
    throw new Error("useSession は <App> の内側でだけ呼べる")
  }
  return value
}

function applyFrame(state: SessionState, frame: ServerFrame): SessionState {
  if (frame.type === "hello") {
    return frame.state
  }
  if (frame.type === "events") {
    return frame.events.reduce(
      (next, stamped) => applySessionEvent(next, stamped.event, stamped.at),
      state,
    )
  }
  // "error" は commandId の突き合わせだけに使う（8章以降）。段3の時点では状態を変えない。
  return state
}

export type AppProps = {
  readonly children: ReactNode
}

export function App(props: AppProps): ReactElement {
  const [state, applyOne] = useReducer(applyFrame, INITIAL_SESSION_STATE)
  const [connection, setConnection] = useState<ConnectionStatus>("connecting")
  const socketRef = useRef<ReturnType<typeof connectSessionSocket> | undefined>(undefined)

  useEffect(() => {
    const socket = connectSessionSocket({
      onFrame: (frame) => applyOne(frame),
      onStatusChange: setConnection,
    })
    socketRef.current = socket
    return () => {
      socket.close()
      socketRef.current = undefined
    }
  }, [])

  const dispatch = useCallback((command: DispatchableCommand) => {
    socketRef.current?.send({ ...command, commandId: crypto.randomUUID() })
  }, [])

  return (
    <SessionContext.Provider value={{ state, connection, dispatch }}>
      {props.children}
    </SessionContext.Provider>
  )
}
