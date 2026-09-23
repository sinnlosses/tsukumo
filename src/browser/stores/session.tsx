// <SessionProvider> の中身。`lib/socket.ts` で接続し、`SessionState` を **React の外の store**
// （{@link createSessionStore}）に持つ。部品は {@link useSessionSelector} で**自分が読む値だけ**を
// 購読し、送るだけの部品は {@link useSessionDispatch} を読む（docs/design.md 6.1 / 6.2）。
//
// **Context に配るのは store そのもの**（参照が変わらない）。姿を Context で配ると、読んでいる値が
// 変わっていない部品まで毎フレーム描き直しになる — サーバは 100ms ごとにフレームを押すので、
// ターンが流れている間は毎秒10回それが起きていた（`useSyncExternalStore` へ移した）。
//
// **部品は `SessionState` と `dispatch` だけを見る。** DOM を直接いじる配線は持たない
// （docs/design.md 6.1「部品の木」冒頭）。

import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from "react"

import { effectiveAccent } from "../../shared/character.ts"
import { type ClientCommand } from "../../shared/command.ts"
import { PROTOCOL_VERSION, type ServerFrame } from "../../shared/frame.ts"
import {
  applySessionEvent,
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../shared/session-state.ts"
import { applyRefresh } from "../lib/refresh.ts"
import { connectSessionSocket, type ConnectionStatus } from "../lib/socket.ts"

/**
 * `dispatch` に渡すコマンド。`commandId` は `<SessionProvider>` が `crypto.randomUUID()` で
 * 作るので、呼び出し側は持たない（{@link ClientCommand} から `commandId` を引いた形。分配法則が効くよう
 * 条件型で書く — 単純な `Omit<ClientCommand, "commandId">` だと discriminated union が
 * 潰れて `type` で絞り込めなくなる）。
 */
type DispatchableCommand<T = ClientCommand> = T extends { readonly commandId: string }
  ? Omit<T, "commandId">
  : never

/** コマンドを1件送る口。**参照が変わらない**ので、これしか読まない部品は姿の変化で描き直されない。 */
export type SessionDispatch = (command: DispatchableCommand) => void

/** コマンドの送り先。`lib/socket.ts` の接続がそのまま満たす（閉じるのは store の関心ではない）。 */
export type CommandSocket = {
  readonly send: (command: ClientCommand) => void
}

/**
 * サーバの `hello` が名乗った版が、このページの {@link PROTOCOL_VERSION} と合っているか
 * （docs/design.md 4.4）。`mismatched` の間は `events` を畳まない——形の違う記録を読むと、
 * 部品が無いはずのフィールドを読んで壊れる（起こし直さずに画面だけ組み直したときに起きる）。
 * 次の `hello` で合えば `compatible` に戻る。
 */
export type ProtocolAgreement = "compatible" | "mismatched"

/**
 * 部品が読む姿。**接続の状態（`connection`）と版の一致（`protocol`）はブラウザだけが持つ**ので
 * `SessionState` には入れず、同じ購読に相乗りさせる（docs/design.md 4.2 / 4.4 / 6.2）。
 * `connection` はまだ画面には出していない。
 */
export type SessionSnapshot = {
  readonly state: SessionState
  readonly connection: ConnectionStatus
  readonly protocol: ProtocolAgreement
}

/**
 * React の外に姿を持つ store。`subscribe` / `getSnapshot` は `useSyncExternalStore` の口そのもので、
 * `receive` と `setConnection` は接続（`lib/socket.ts`）から呼ばれる。
 */
export type SessionStore = {
  readonly subscribe: (onStoreChange: () => void) => () => void
  /** **同じ姿なら同じオブジェクト**を返す（セレクタの結果が毎回変わると描き直しが止まらない）。 */
  readonly getSnapshot: () => SessionSnapshot
  readonly dispatch: SessionDispatch
  /** 届いたフレームを畳む。`refresh` は姿を動かさないので呼び出し側が手前で捌く。 */
  readonly receive: (frame: ServerFrame) => void
  readonly setConnection: (status: ConnectionStatus) => void
  /** いま繋がっている接続を持たせる（切れたら undefined）。{@link SessionStore.dispatch} の送り先。 */
  readonly attachSocket: (socket: CommandSocket | undefined) => void
}

/**
 * 部品のテストが本物の WebSocket 接続を経由せず姿を差し込めるよう、Context 自体を公開する
 * （`<SessionStoreContext.Provider value={createSessionStore(...)}>` で包む。`src/browser/stores/` の外は
 * この Context を直接読まず、必ず {@link useSessionSelector} / {@link useSessionDispatch} を通す）。
 */
export const SessionStoreContext = createContext<SessionStore | undefined>(undefined)

/**
 * 姿から**必要な値だけ**を取り出して購読する。`select` が返してよいのは
 * **同じ姿なら同じものになる値**（そのままのフィールド・プリミティブ・`stores/` が姿ごとに
 * 覚えている導出）だけで、その場で作った配列やオブジェクトを返すと描き直しが止まらなくなる。
 * 複数のフィールドが要るなら、その数だけ呼ぶ。
 */
export function useSessionSelector<T>(select: (session: SessionSnapshot) => T): T {
  return useStoreSelector(useSessionStore(), select)
}

/** ターンが進行中かどうか。 */
export function useTurnRunning(): boolean {
  return useSessionSelector((session) => session.state.turn.kind === "running")
}

/** コマンドを送る口だけを受け取る（姿を購読しない）。 */
export function useSessionDispatch(): SessionDispatch {
  return useSessionStore().dispatch
}

/**
 * 姿とコマンドの口を持つ store を作る。**接続はあとから持たせる**（繋ぎ直しで入れ替わるのに
 * `dispatch` の参照は変えたくない。`commandId` を振るのもここ）。
 */
export function createSessionStore(): SessionStore {
  const listeners = new Set<() => void>()
  let snapshot: SessionSnapshot = {
    state: INITIAL_SESSION_STATE,
    connection: "connecting",
    protocol: "compatible",
  }
  let socket: CommandSocket | undefined = undefined

  const publish = (next: SessionSnapshot): void => {
    snapshot = next
    for (const listener of listeners) {
      listener()
    }
  }

  return {
    subscribe: (onStoreChange) => {
      listeners.add(onStoreChange)
      return () => {
        listeners.delete(onStoreChange)
      }
    },
    getSnapshot: () => snapshot,
    dispatch: (command) => {
      socket?.send({ ...command, commandId: crypto.randomUUID() })
    },
    receive: (frame) => {
      if (frame.type === "hello" && frame.protocolVersion !== PROTOCOL_VERSION) {
        publish({ ...snapshot, state: INITIAL_SESSION_STATE, protocol: "mismatched" })
        return
      }
      if (frame.type === "hello" && snapshot.protocol === "mismatched") {
        publish({ ...snapshot, state: frame.state, protocol: "compatible" })
        return
      }
      if (snapshot.protocol === "mismatched") {
        return
      }
      const state = applyFrame(snapshot.state, frame)
      if (state === snapshot.state) {
        return
      }
      // **答え待ち（許可要求・質問）が動いたフレームだけ緊急**にする。人が待っている箱なので
      // 遅らせない。レポートやツールの進行は毎秒10回届くので、入力欄の操作を優先できるよう
      // トランジションに載せる。**React は `useSyncExternalStore` の描き直しを
      // 同期レーンで走らせる**（`forceStoreRerender`）ので、入力欄との競合にいま効いているのは
      // 購読の絞り込み（セレクタ）のほう。緊急かどうかの境目はここ1箇所に置く。
      if (state.pending !== snapshot.state.pending) {
        publish({ ...snapshot, state })
        return
      }
      startTransition(() => {
        publish({ ...snapshot, state })
      })
    },
    setConnection: (status) => {
      if (status !== snapshot.connection) {
        publish({ ...snapshot, connection: status })
      }
    },
    attachSocket: (next) => {
      socket = next
    },
  }
}

export type SessionProviderProps = {
  readonly children: ReactNode
}

export function SessionProvider(props: SessionProviderProps): ReactElement {
  // store は1つのままにする（作り直すと購読も姿も切れる）。
  const [store] = useState(createSessionStore)

  useEffect(() => {
    const socket = connectSessionSocket({
      // `refresh` は状態ではなくブラウザへの指示なので、畳み込みに入れず手前で捌く
      // （開発中だけ届く。docs/design.md 11章）。
      onFrame: (frame) => {
        if (frame.type === "refresh") {
          applyRefresh(frame.target)
          return
        }
        store.receive(frame)
      },
      onStatusChange: store.setConnection,
    })
    store.attachSocket(socket)
    return () => {
      socket.close()
      store.attachSocket(undefined)
    }
  }, [store])

  // パックが差す `accent`（docs/screen-design.md 13.2 / 13.5）を、`:root` の既定値の上から
  // `document.documentElement` に差し替える。`<Layout>` の外まで届く唯一の場所がここ
  // （`document.title` を差し替える `src/browser/features/dispatch/dispatch.tsx` と同じ、ホスト側の値を
  // コンポーネントの外から書き換える形。使う人が変える `ground` / `surface` / `ink` は同じ
  // 手口で `src/browser/domain/appearance-color.ts` が持つ）。届いていない・パックに `accent`
  // が無いときは既定値（theme.css の `:root`）に戻す。**雑談中はパックが `chatAccent` を持てば
  // そちらに切り替わる**（`effectiveAccent`。docs/screen-design.md 13.2「雑談中は」/ 13.7）。
  //
  // **Context の外なので store を直に読む**（自分が配っている Context は自分では読めない）。
  const accent = useStoreSelector(store, (session) =>
    effectiveAccent(session.state.character, session.state.chatMode),
  )
  useEffect(() => {
    if (accent === undefined) {
      document.documentElement.style.removeProperty("--accent")
    } else {
      document.documentElement.style.setProperty("--accent", accent)
    }
  }, [accent])

  // パックが差す背景（docs/screen-design.md 13.8）も同じ手口で流す。**敷くのは枠を持たない領域**
  // （キャラビューと、雑談中のメインビュー）で、どう敷くか（覆いを1枚重ねる・下端で合わせる）は
  // CSS（`src/browser/features/layout/layout.module.css` の `.layout-ground`）が持つ。ここは
  // 素材の URL と覆いの濃さを渡すだけ。**素材の名前は `character.json` 由来の外部の値**だが、
  // `url()` を抜け出せない形であることは境界（`src/shared/character-background.ts` の
  // `isBackgroundFileName`）で見てある。背景が無いパックでは変数ごと外すので、`var()` の
  // フォールバックが効いて**いままでと同じ見え方**（`ground` の上に立ち絵が直接立つ）に戻る。
  const background = useStoreSelector(store, (session) => session.state.character?.background)
  const backgroundImage = background?.image
  const backgroundVeil = background?.veil
  useEffect(() => {
    const style = document.documentElement.style
    if (backgroundImage === undefined || backgroundVeil === undefined) {
      style.removeProperty("--character-background-image")
      style.removeProperty("--character-background-veil")
      return
    }
    style.setProperty("--character-background-image", `url("${backgroundImage}")`)
    style.setProperty("--character-background-veil", String(backgroundVeil))
  }, [backgroundImage, backgroundVeil])

  return <SessionStoreContext.Provider value={store}>{props.children}</SessionStoreContext.Provider>
}

/** `<SessionProvider>` の内側でだけ呼べる。外で呼ぶのは配線の誤りなので例外にする。 */
function useSessionStore(): SessionStore {
  const store = useContext(SessionStoreContext)
  if (store === undefined) {
    throw new Error(
      "useSessionSelector / useSessionDispatch は <SessionProvider> の内側でだけ呼べる",
    )
  }
  return store
}

function useStoreSelector<T>(store: SessionStore, select: (session: SessionSnapshot) => T): T {
  // サーバ側で描くことは無いので、スナップショットは3つとも同じ読み取りでよい（`stores/screen.tsx` と同じ）。
  return useSyncExternalStore(
    store.subscribe,
    () => select(store.getSnapshot()),
    () => select(store.getSnapshot()),
  )
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
  // "refresh" はここまで来ない（状態を動かさないので、`<SessionProvider>` の `onFrame` が手前で捌く）。
  return state
}
