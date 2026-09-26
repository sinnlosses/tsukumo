// <SessionProvider> の中身。`lib/socket.ts` で接続し、`SessionState` を React の外の store
// （{@link createSessionStore}）に持つ。部品は {@link useSessionSelector} で自分が読む値だけを
// 購読し、送るだけの部品は {@link useSessionDispatch} を読む（docs/design.md 6.1 / 6.2）。
//
// Context に配るのは store そのもの（参照が変わらない）。姿を Context で配ると、読んでいる値が
// 変わっていない部品まで毎フレーム描き直しになる — サーバは 100ms ごとにフレームを押すので、
// ターンが流れている間は毎秒10回それが起きていた（`useSyncExternalStore` へ移した）。
//
// 部品は `SessionState` と `dispatch` だけを見る。 DOM を直接いじる配線は持たない
// （docs/design.md 6.1「部品の木」冒頭）。

import { createORPCClient } from "@orpc/client"
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
import { PROTOCOL_VERSION, type ServerFrame } from "../../shared/frame.ts"
import { type CommandClient } from "../../shared/rpc.ts"
import {
  applySessionEvent,
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../shared/session-state.ts"
import { applyRefresh } from "../lib/refresh.ts"
import { type CommandLink, connectSessionSocket, type ConnectionStatus } from "../lib/socket.ts"

/**
 * コマンドを送る口。契約（`src/shared/rpc.ts` の `commandContract`）から導いた型付きの client
 * で、`dispatch.session.prompt({ text, images })` のように手続きの名前を辿って呼ぶ。参照が
 * 変わらないので、これしか読まない部品は姿の変化で描き直されない。
 *
 * 送りっぱなしで、失敗しても投げない（戻り値の Promise は待たなくてよい）。断られたこと
 * （契約の `REFUSED`）は画面に出さない——画面は同じ条件で先に操作子を塞いでいて、結果はイベントで
 * 戻ってくる。
 */
export type SessionDispatch = CommandClient

/** コマンドの送り先。`lib/socket.ts` の接続がそのまま満たす（閉じるのは store の関心ではない）。 */
export type CommandSocket = {
  readonly commandLink: CommandLink
}

/**
 * サーバの `hello` が名乗った版が、このページの {@link PROTOCOL_VERSION} と合っているか
 * （docs/design.md 4.4）。`mismatched` の間は `events` を畳まない——形の違う記録を読むと、
 * 部品が無いはずのフィールドを読んで壊れる（起こし直さずに画面だけ組み直したときに起きる）。
 * 次の `hello` で合えば `compatible` に戻る。
 */
export type ProtocolAgreement = "compatible" | "mismatched"

/**
 * 部品が読む姿。接続の状態（`connection`）と版の一致（`protocol`）はブラウザだけが持つので
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
  /** 同じ姿なら同じオブジェクトを返す（セレクタの結果が毎回変わると描き直しが止まらない）。 */
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
 * 姿から必要な値だけを取り出して購読する。`select` が返してよいのは
 * 同じ姿なら同じものになる値（そのままのフィールド・プリミティブ・`stores/` が姿ごとに
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
 * 姿とコマンドの口を持つ store を作る。接続はあとから持たせる（繋ぎ直しで入れ替わるのに
 * `dispatch` の参照は変えたくない）。
 */
export function createSessionStore(): SessionStore {
  const listeners = new Set<() => void>()
  let snapshot: SessionSnapshot = {
    state: INITIAL_SESSION_STATE,
    connection: "connecting",
    protocol: "compatible",
  }
  let socket: CommandSocket | undefined = undefined
  // 送った手続きが断られた・接続が切れたときは黙って捨てる（{@link SessionDispatch}）。
  const dispatch: SessionDispatch = createORPCClient({
    call: (path, input, options) =>
      (socket?.commandLink.call(path, input, options) ?? Promise.resolve(undefined)).catch(
        () => undefined,
      ),
  })

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
    dispatch,
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
      // 答え待ち（許可要求・質問）が動いたフレームだけ緊急にする。人が待っている箱なので
      // 遅らせない。レポートやツールの進行は毎秒10回届くので、入力欄の操作を優先できるよう
      // トランジションに載せる。React は `useSyncExternalStore` の描き直しを
      // 同期レーンで走らせる（`forceStoreRerender`）ので、入力欄との競合にいま効いているのは
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

/**
 * パックが差す日記の書体を FontFace API に登録する名前。固定の1つでよい
 * （常に「いまのパック」の1件しか同時に登録しないので、パックごとに名前を分ける必要が無い。
 * 切り替えたときは古い方を `document.fonts.delete` してから差し替える）。
 */
const DIARY_FONT_FAMILY_NAME = "tsukumo-diary"

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
  // （`document.title` を差し替える `src/browser/components/page/conversation/components/dispatch/dispatch.tsx` と同じ、ホスト側の値を
  // コンポーネントの外から書き換える形。使う人が変える `ground` / `surface` / `ink` は同じ
  // 手口で `src/browser/domain/appearance-color.ts` が持つ）。届いていない・パックに `accent`
  // が無いときは既定値（theme.css の `:root`）に戻す。雑談中はパックが `chatAccent` を持てば
  // そちらに切り替わる（`effectiveAccent`。docs/screen-design.md 13.2「雑談中は」/ 13.7）。
  //
  // Context の外なので store を直に読む（自分が配っている Context は自分では読めない）。
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

  // パックが差す背景（docs/screen-design.md 13.8）も同じ手口で流す。敷くのは枠を持たない領域
  // （キャラビューと、雑談中のメインビュー）で、どう敷くか（覆いを1枚重ねる・下端で合わせる）は
  // CSS（`src/browser/components/page/conversation/components/conversation-layout/
  // conversation-layout.module.css` の `.layout-ground`）が持つ。ここは素材の URL と覆いの濃さを
  // 渡すだけ。素材の名前は `character.json` 由来の外部の値だが、
  // `url()` を抜け出せない形であることは境界（`src/shared/character-background.ts` の
  // `isBackgroundFileName`）で見てある。背景が無いパックでは変数ごと外すので、`var()` の
  // フォールバックが効いていままでと同じ見え方（`ground` の上に立ち絵が直接立つ）に戻る。
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

  // パックが差す日記の書体（`docs/screen-design.md` 13.3「例外は日記の本文だけ」）。
  // `background-image` と違い `font-family` は `url()` を直接差せないので、FontFace API で
  // ブラウザに書体として登録してから、登録した名前を `--font-diary` に流す（useEffect の4類型の
  // 「外部からの読み込み」。docs/coding-standards.md「React」節）。読み込めない・無いパックでは
  // 変数ごと外し、`var()` のフォールバックで `--font-serif`（端末の明朝体）に戻る
  // （`src/browser/styles/theme.css`）。
  const diaryFont = useStoreSelector(store, (session) => session.state.character?.diaryFont)
  useEffect(() => {
    const style = document.documentElement.style
    if (diaryFont === undefined) {
      style.removeProperty("--font-diary")
      return
    }

    const face = new FontFace(DIARY_FONT_FAMILY_NAME, `url("${diaryFont}")`)
    let cancelled = false
    document.fonts.add(face)
    face
      .load()
      .then(() => {
        if (!cancelled) {
          style.setProperty("--font-diary", `"${DIARY_FONT_FAMILY_NAME}", var(--font-serif)`)
        }
      })
      .catch(() => {
        // 壊れている・見つからない書体ファイルは既定の明朝体のまま（常駐プロセスは描画1回の
        // 失敗で落ちない。docs/coding-standards.md）。
      })
    return () => {
      cancelled = true
      document.fonts.delete(face)
      style.removeProperty("--font-diary")
    }
  }, [diaryFont])

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
  // "refresh" はここまで来ない（状態を動かさないので、`<SessionProvider>` の `onFrame` が手前で捌く）。
  return state
}
