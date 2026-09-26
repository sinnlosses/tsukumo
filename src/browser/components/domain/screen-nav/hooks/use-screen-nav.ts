// 画面のナビの帯のロジック（docs/screen-design.md 13.9 / 2章「機能の中を分ける」）。いま出している
// 画面・3つの口・仕事/雑談のトグル・モデル/許可モードの操作子・狭い画面の「≡」の開閉を、
// 見た目が受け取れる形まで畳んで返す。「いまの作業」の札は `hooks/use-current-work.ts` に
// 分けてある（別の概念なのでファイルを分ける。CLAUDE.md 原則5）。
//
// 帯に出すのは `Screen` の4つすべて（作るダイアログはキャラクター画面から開く一時的な画面
// （13.6「作るダイアログ」）で、独立した画面ではないのでここには挙げない。13.9「帯に何を置くか」）。
// 口は `<a href>` で、画面の正典は `location.hash` のまま（`navigateTo` は使わない）。
//
// 動き方の操作子（仕事/雑談・モデル・許可モード）が送るコマンドは、いままでサイドバーの
// `<select>` が送っていたものと同じ（`session.setChatMode` / `session.setModel` / `session.setPermissionMode`）。
// 表示はサーバから届いた値だけに従い、押した側へ先に倒さない（13.9「動き方の操作子」）。
//
// 2つの面（広い画面の帯・狭い画面の「≡」の面）へは、部品の値を1つの束で配る
// （{@link ScreenNavParts}）。同じ値を項目ごとに配り直さないので、帯に部品を足すときに
// 触るのはこの束の型と2つの置き場の JSX だけになる。
//
// 「≡」を閉じる合図（外側を押した・Esc）は `browser/hooks/use-dismiss-signal.ts` が取る
// （開いている間だけ `document` を購読する）。「いまの作業」の札と歯車も同じフックを使う
// ので、3つの面の閉じ方が1箇所で決まる。

import { useCallback, useRef, useState, type RefObject } from "react"

import { isEffortLevel, isModelAlias, isPermissionMode } from "../../../../../shared/command.ts"
import { FRAME_ERROR_REASON } from "../../../../../shared/frame.ts"
import { roomName } from "../../../../../shared/room.ts"
import { characterFaceInfo, type CharacterFaceInfo } from "../../../../domain/character-face.ts"
import { useDismissSignal } from "../../../../hooks/use-dismiss-signal.ts"
import { SCREEN_NAV_ITEMS, type Screen } from "../../../../stores/location-hash.ts"
import { useScreen, useScreenHref } from "../../../../stores/screen.tsx"
import {
  useSessionDispatch,
  useSessionSelector,
  useTurnRunning,
} from "../../../../stores/session.tsx"
import { resolveEffortSelect, type EffortSelect } from "../domain/effort-label.ts"
import { resolveModelAlias } from "../domain/model-label.ts"
import {
  isDangerousPermissionMode,
  resolvePermissionMode,
} from "../domain/permission-mode-label.ts"
import { useCurrentWork, type ScreenNavCurrentWork } from "./use-current-work.ts"
import { useSettings, type ScreenNavSettings } from "./use-settings.ts"

/** 帯に並ぶ口1つ。「いま出している画面か」は畳んで渡す（部品は判定を持たない）。 */
export type ScreenNavGate = {
  readonly screen: Screen
  readonly label: string
  readonly href: string
  readonly active: boolean
}

/**
 * 仕事 / 雑談のトグルが受け取れる形（13.9「動き方の操作子」）。いまの側を押しても
 * 何も送らない・ターン進行中は送らないは `onChange` の中で決めていて、部品は
 * 「送るかどうか」を持たない。
 */
export type ScreenNavChatMode = {
  readonly chat: boolean
  /** ターン進行中は押せない（起こし直しなので、キャラクターの切り替えと同じ条件）。 */
  readonly disabled: boolean
  /** `disabled` のときだけ理由を持つ（`aria-disabled` の要素はツールチップが出ないブラウザ既定に
   * 頼れないので、`title` に定型文を出す）。 */
  readonly title: string | undefined
  readonly onChange: (chat: boolean) => void
}

/** モデル・effort・許可モードの操作子が受け取れる形。ターン進行中も変えられる（起こし直さない）。 */
export type ScreenNavModelPermission = {
  readonly model: string
  readonly onSetModel: (value: string) => void
  /**
   * effort（{@link EffortSelect}）。押した値へ先に倒さない——選べる段・いまの値は
   * サーバから届いた値（`model-effort-support` / `effort-changed`）だけに従う
   * （`docs/screen-design.md` 13.9「動き方の操作子」）。
   */
  readonly effort: EffortSelect
  readonly onSetEffort: (value: string) => void
  readonly permissionMode: string
  /** 「全部許す」のときだけ字に意味の色を載せる（13.1 原則5）。 */
  readonly permissionModeDangerous: boolean
  readonly onSetPermissionMode: (value: string) => void
}

/** 帯の左端に出す顔（13.9「顔」）。`url` が無ければ `<CharacterFace>` は何も描かない。 */
export type ScreenNavFace = CharacterFaceInfo

/**
 * 帯に並ぶ部品の値ひとそろい（13.9 の表の 2〜9）。広い画面の帯（`presentational-screen-nav.tsx`）
 * と狭い画面の「≡」の面（`components/screen-nav-menu.tsx`）が、この束をそのまま受け取って
 * それぞれの並びで置く——どちらを出すかは CSS が決めるので、値の配り方は1本で足りる。
 * 部品を1つ足すときに触るのは、ここと2つの置き場の JSX だけになる。
 */
export type ScreenNavParts = {
  /** この tsukumo の部屋の名前（`src/shared/room.ts`。13.9）。 */
  readonly room: string
  /** いまのパックのキャラクターの顔（`CharacterInfo.face`。13.9「顔」）。 */
  readonly face: ScreenNavFace
  readonly gates: readonly ScreenNavGate[]
  readonly chatMode: ScreenNavChatMode
  readonly modelPermission: ScreenNavModelPermission
  /** 帯のまん中の札「いまの作業」（`hooks/use-current-work.ts`）。 */
  readonly work: ScreenNavCurrentWork
  /** 帯の右端の歯車で開く設定（`hooks/use-settings.ts`）。 */
  readonly settings: ScreenNavSettings
  /** 口を押したあとに「≡」を閉じる呼び先（広い画面では開いていないので何も起きない）。 */
  readonly onSelect: () => void
}

/** 狭い画面の「≡」そのもの（広い画面では CSS が消す。13.9「狭い画面」）。 */
export type ScreenNavMenu = {
  readonly open: boolean
  /** 閉じている間だけ「≡」に添える答え待ちの印（●）。13.9「いまの作業」。 */
  readonly pendingActive: boolean
  readonly onToggle: () => void
}

export type ScreenNavView = {
  /** いま出している画面。狭い画面での帯の置き方（タブ帯へ畳むか）を CSS が決めるのに使う。 */
  readonly current: Screen
  readonly parts: ScreenNavParts
  readonly menu: ScreenNavMenu
  /** 帯の外側を押したかを見るための入れ物（「≡」を閉じる判定に使う）。 */
  readonly ref: RefObject<HTMLElement | null>
}

export function useScreenNav(): ScreenNavView {
  const dispatch = useSessionDispatch()
  const current = useScreen()
  const screenHref = useScreenHref()
  const pendingActive = useSessionSelector((session) => session.state.pending.length > 0)
  const chatMode = useSessionSelector((session) => session.state.chatMode)
  const turnInProgress = useTurnRunning()
  const model = useSessionSelector((session) => session.state.model)
  const modelEffortSupport = useSessionSelector((session) => session.state.modelEffortSupport)
  const effort = useSessionSelector((session) => session.state.effort)
  const permissionMode = useSessionSelector((session) =>
    session.state.session.kind === "running" ? session.state.session.permissionMode : undefined,
  )
  const character = useSessionSelector((session) => session.state.character)
  // `init`（`session-info`）が届くまでの畳み先は、このセッションを起こした既定
  // （`docs/screen-design.md` 13.6）。同梱の既定に倒すと、歯車で Sonnet にして起こし直した直後の
  // 帯だけが Opus を名乗る。
  const sessionDefault = useSessionSelector((session) => session.state.sessionDefault)
  const [menuOpen, setMenuOpen] = useState(false)
  const ref = useRef<HTMLElement>(null)
  const work = useCurrentWork(ref)
  const settings = useSettings(ref)

  const onSelect = useCallback((): void => {
    setMenuOpen(false)
  }, [])

  const onToggleMenu = useCallback((): void => {
    setMenuOpen((open) => !open)
  }, [])

  const onDismissMenu = useCallback((): void => {
    setMenuOpen(false)
  }, [])

  useDismissSignal({ open: menuOpen, rootRef: ref, onDismiss: onDismissMenu })

  const shownPermissionMode =
    permissionMode === undefined
      ? sessionDefault.permissionMode
      : resolvePermissionMode(permissionMode)
  // effort の選べる段は「いま帯に出しているモデル」で決まるので、model の畳み込みと同じ値を使う
  // （`modelPermission.model` と二重の畳み方にしない）。
  const shownModel = model === undefined ? sessionDefault.model : resolveModelAlias(model)

  return {
    current,
    parts: {
      room: currentRoomName(),
      face: characterFaceInfo(character),
      gates: SCREEN_NAV_ITEMS.map((entry) => ({
        screen: entry.screen,
        label: entry.label,
        href: screenHref(entry.screen),
        active: entry.screen === current,
      })),
      chatMode: {
        chat: chatMode,
        disabled: turnInProgress,
        title: turnInProgress ? FRAME_ERROR_REASON.chatModeSwitchDuringTurn : undefined,
        onChange: (chat) => {
          if (turnInProgress || chat === chatMode) {
            return
          }
          dispatch.session.setChatMode({ chat })
        },
      },
      modelPermission: {
        model: shownModel,
        onSetModel: (value) => {
          if (isModelAlias(value)) {
            dispatch.session.setModel({ model: value })
          }
        },
        effort: resolveEffortSelect(shownModel, modelEffortSupport, effort),
        onSetEffort: (value) => {
          if (isEffortLevel(value)) {
            dispatch.session.setEffort({ effort: value })
          }
        },
        permissionMode: shownPermissionMode,
        permissionModeDangerous: isDangerousPermissionMode(shownPermissionMode),
        onSetPermissionMode: (value) => {
          if (isPermissionMode(value)) {
            dispatch.session.setPermissionMode({ mode: value })
          }
        },
      },
      work,
      settings,
      onSelect,
    },
    menu: { open: menuOpen, pendingActive, onToggle: onToggleMenu },
    ref,
  }
}

/** `location.port` が空文字のときに補う、http の既定ポート（URL がポートを省いた形のとき）。 */
const DEFAULT_HTTP_PORT = 80

/**
 * この tsukumo の部屋の名前。どの部屋かの正典は、このページを配っている URL のポート
 * （サーバがそのポートで待っている。`src/server/view-server/core/port-resolution.ts`）——サーバから
 * 送り直してもらう値ではないので、状態には乗せない。
 *
 * 購読はしない（ポートはページの一生の間変わらない）。
 */
function currentRoomName(): string {
  const port = window.location.port
  return roomName(port === "" ? DEFAULT_HTTP_PORT : Number(port))
}
