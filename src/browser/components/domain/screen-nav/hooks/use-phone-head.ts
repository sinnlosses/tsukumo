// 狭い画面（760px 以下）の頭のロジック。
// いまの作業（`CurrentWork`）・依頼の手順・ターンの経過から、頭の2行に出す形へ畳む。
//
// 1行目は顔・状態の語と経過・題、2行目は段の点・n/N・「手順 n」。
// 会話の画面でないときは、1行目の左が「‹ 会話へ」と画面の名前になり、2行目を出さない。

import type { SessionRecord } from "../../../../../shared/session/session-state.ts"
import type { TurnStepList } from "../../../../../shared/session/turn-step.ts"
import {
  currentPhaseOf,
  phasePosition,
  plannedPhasesOf,
  type PlannedPhaseState,
} from "../../../../../shared/session/work-plan.ts"
import type { CharacterFaceInfo } from "../../../../domain/character-face.ts"
import { isTurnCounting, turnElapsedClock } from "../../../../domain/turn-elapsed.ts"
import type {
  CurrentWork,
  CurrentWorkState,
} from "../../../../features/current-work/hooks/use-current-work.ts"
import { useNowWhile } from "../../../../hooks/use-now-while.ts"
import { useCurrentTurnSteps } from "../../../../stores/current-turn-steps.ts"
import { SCREEN_NAV_ITEMS, type Screen } from "../../../../stores/location-hash.ts"
import { useSession } from "../../../../stores/session.ts"

/** 1行目の左。会話の画面は顔、ほかの画面は会話へ戻る口（画面の名前は題が運ぶ）。 */
export type PhoneHeadLead =
  | { readonly kind: "face"; readonly face: CharacterFaceInfo }
  | { readonly kind: "back"; readonly href: string }

/** 状態の印。作業中と振り返り中は回る輪、ほかは「いまの作業」の札と同じ字。 */
export type PhoneHeadMark = "spinner" | "○" | "●"

/** 状態の語と経過。会話の画面でないときは答え待ちのときだけ出す。 */
export type PhoneHeadStatus =
  | { readonly kind: "none" }
  | {
      readonly kind: "shown"
      readonly state: CurrentWorkState
      readonly chatIdle: boolean
      readonly mark: PhoneHeadMark
      readonly wordLabel: string
      /** 「20:03」の形。数えていないときは空。 */
      readonly elapsedLabel: string
    }

/** 段の点1つ。 */
export type PhoneHeadDot = {
  readonly key: string
  readonly state: PlannedPhaseState
  /** 読み上げに渡す「2. 段の名前（今の段）」。 */
  readonly label: string
}

/**
 * 2行目。
 *
 * - `none`: 出さない（依頼待ち・雑談中・会話の画面でないとき）
 * - `steps`: 段取りの無いターン。「手順 n」だけ
 * - `planned`: 段の点・「n/N」・「手順 n」
 */
export type PhoneHeadProgress =
  | { readonly kind: "none" }
  | { readonly kind: "steps"; readonly stepCount: number }
  | {
      readonly kind: "planned"
      readonly dots: readonly PhoneHeadDot[]
      readonly positionLabel: string
      readonly stepCount: number
    }

export type PhoneHead = {
  readonly lead: PhoneHeadLead
  readonly status: PhoneHeadStatus
  /** 1行目の太字の題（会話の画面でないときは画面の名前）。 */
  readonly title: string
  readonly progress: PhoneHeadProgress
}

export type PhoneHeadSource = {
  readonly current: Screen
  readonly work: CurrentWork
  readonly face: CharacterFaceInfo
  readonly roomName: string
  /** 会話の画面の href（「‹ 会話へ」の行き先）。 */
  readonly conversationHref: string
}

const CHAT_TITLE = "雑談"

const DOT_STATE_SUFFIX = {
  done: "（済）",
  current: "（今の段）",
  upcoming: "",
} satisfies Record<PlannedPhaseState, string>

export function usePhoneHead(source: PhoneHeadSource): PhoneHead {
  const turnStepList = useCurrentTurnSteps()
  const turn = useSession((session) => session.state.turn)
  const backgroundTaskCount = useSession((session) => session.state.backgroundTasks.length)
  const records = useSession((session) => session.state.records)
  const chatMode = useSession((session) => session.state.chatMode)
  const counting = isTurnCounting(turn, backgroundTaskCount)
  const now = useNowWhile(counting)
  const { work } = source

  const status: PhoneHeadStatus = {
    kind: "shown",
    state: work.state,
    chatIdle: work.chatIdle,
    mark: work.state === "running" || work.state === "diary" ? "spinner" : work.mark,
    wordLabel: work.wordLabel,
    elapsedLabel: counting ? turnElapsedClock(turn, backgroundTaskCount, now) : "",
  }

  if (source.current !== "conversation") {
    return {
      lead: { kind: "back", href: source.conversationHref },
      status: work.state === "pending" ? status : { kind: "none" },
      title: screenLabelOf(source.current),
      progress: { kind: "none" },
    }
  }

  return {
    lead: { kind: "face", face: source.face },
    status,
    title: chatMode ? CHAT_TITLE : titleOf(turnStepList, work.state, records, source.roomName),
    progress: chatMode || work.state === "idle" ? { kind: "none" } : progressOf(turnStepList),
  }
}

function screenLabelOf(screen: Screen): string {
  return SCREEN_NAV_ITEMS.find((item) => item.screen === screen)?.label ?? ""
}

/**
 * 題。走っているか答え待ちで段取りがあれば今の段の名前（全部済みなら「n段すべて済み」）。
 * それ以外は最後の依頼の1行目、依頼が無ければ部屋の名前。
 */
function titleOf(
  turnStepList: TurnStepList,
  state: CurrentWorkState,
  records: readonly SessionRecord[],
  roomName: string,
): string {
  if (
    turnStepList.kind === "turn" &&
    turnStepList.plan.kind === "planned" &&
    (state === "running" || state === "pending")
  ) {
    const phase = currentPhaseOf(turnStepList.plan)
    return phase.kind === "phase"
      ? phase.name
      : `${String(plannedPhasesOf(turnStepList.plan).length)}段すべて済み`
  }
  const request = records.findLast((record) => record.kind === "request")?.text ?? ""
  const firstLine = request.split("\n").find((line) => line.trim() !== "")
  return firstLine ?? roomName
}

function progressOf(turnStepList: TurnStepList): PhoneHeadProgress {
  if (turnStepList.kind !== "turn") {
    return { kind: "none" }
  }
  const stepCount = turnStepList.steps.length
  const { plan } = turnStepList
  if (plan.kind === "none") {
    return { kind: "steps", stepCount }
  }
  const phases = plannedPhasesOf(plan)
  const phase = currentPhaseOf(plan)
  const count = String(phases.length)
  return {
    kind: "planned",
    dots: phases.map((entry) => ({
      key: entry.key,
      state: entry.state,
      label: `${String(entry.index + 1)}. ${entry.name}${DOT_STATE_SUFFIX[entry.state]}`,
    })),
    positionLabel: phase.kind === "phase" ? phasePosition(phase) : `${count}/${count}`,
    stepCount,
  }
}
