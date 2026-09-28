// 成果の画面のロジック。
// 見ている日（hash の `date`）から手続き `achievement.day` を取りに行き、見た目がそのまま置ける形へ畳んで返す。
//
// 日の切り替えは、取れた応答の `date`/`today` から計算する。
// ブラウザは時計を読まないので、hash の raw な値だけでは「前の日」「今日」を計算できない。
// 次の日と「今日へ」は「いま見ている日が今日かどうか」が要るので、応答が届くまで押せない。
//
// 「<パックの名前>と振り返る」ボタンのロジックもここに持つ。
// 押しても画面は移らない。`session.reflectAchievement { date }` を送るだけで、進みは `SessionState.diaryWriting` から同じ画面の中に出す。

import { useQuery, useQueryClient, type Query } from "@tanstack/react-query"
import { useEffect } from "react"

import {
  isEmptyAchievementDay,
  nextDateKey,
  previousDateKey,
  type AchievementDoneTasks,
  type AchievementGraduation,
  type AchievementMilestone,
  type DailyAchievement,
} from "../../../../../shared/achievement/achievement.ts"
import type {
  CharacterInfo,
  CharacterPackEntry,
} from "../../../../../shared/character-pack/character.ts"
import type {
  DailyDiaryStatus,
  DiaryStage,
  DiaryWriting,
} from "../../../../../shared/diary/diary.ts"
import {
  DEFAULT_CHARACTER_NAME,
  portraitAppearance,
} from "../../../../domain/portrait-appearance.ts"
import { rpc } from "../../../../domain/rpc.ts"
import {
  selectAchievementDate,
  selectAchievementToday,
  useAchievementDateSelection,
} from "../../../../stores/screen.tsx"
import { useSession, type SessionDispatch } from "../../../../stores/session.ts"
import { monthDayLabel } from "../../../../utils/month-day-label.ts"
import { diaryWriterPortraitOf, type DiaryWriterPortrait } from "../domain/diary-writer.ts"

/** 今日を見ているあいだだけ取り直す間隔。 */
const TODAY_REFETCH_INTERVAL_MS = 60_000

/**
 * 日の切り替えの状態。「いま何日を見ているか」が分かるかどうかで分かれる。
 * main が読めていても、まだ一度も応答が届いていない・直前の取得が失敗して以前の応答も無い間は分からない。
 */
export type AchievementDaySwitch =
  | { readonly kind: "unknown" }
  | { readonly kind: "known"; readonly date: string; readonly today: string }

/**
 * 画面の中身。日の切り替えとは別に持つ。
 * 「main が読めない」ときだけ日の切り替えも隠すので、`unavailable` はここでも特別に扱う。
 */
export type AchievementView =
  | { readonly kind: "loading" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "failed" }
  | {
      readonly kind: "ready"
      readonly commitCount: number
      readonly doneTasks: AchievementDoneTasks
      readonly graduations: readonly AchievementGraduation[]
      readonly milestones: readonly AchievementMilestone[]
      readonly diary: DailyDiaryStatus
    }

/** 振り返りのボタンを押せるか。 */
export type AchievementReviewAvailability =
  | { readonly kind: "available" }
  | { readonly kind: "blocked"; readonly reason: string }

/** 振り返りのボタン1つぶんの見た目と押す口。 */
export type AchievementReviewButton = {
  /** 「<パックの名前>と振り返る」。 */
  readonly label: string
  readonly availability: AchievementReviewAvailability
  readonly onReview: () => void
}

/**
 * 見ている日を、いま `diary` ツールで書いているか。
 * `SessionState.diaryWriting` の日付が見ている日と一致するときだけで、別の日を書いている・書き終えている・そもそも振り返っていないのはどれも `none`。
 * 振り返りのボタンそのものが押せるかどうかは {@link AchievementReviewButton} が別に持つ。
 */
export type AchievementWriting =
  | { readonly kind: "none" }
  | { readonly kind: "writing"; readonly stage: DiaryStage }
  | { readonly kind: "failed" }

export type UseAchievementResult = {
  readonly view: AchievementView
  readonly daySwitch: AchievementDaySwitch
  /** 日を切り替えている間、前の日の中身を薄く残す判定に使う。 */
  readonly isFetching: boolean
  readonly onPreviousDay: () => void
  readonly onNextDay: () => void
  readonly onToday: () => void
  /** 見ている日を切り替える口。 */
  readonly onSelectDate: (date: string) => void
  readonly review: AchievementReviewButton
  readonly writing: AchievementWriting
  /** 日記の区画の立ち絵と名前。 */
  readonly diaryPortrait: DiaryWriterPortrait
  /**
   * 最新の段落を書き上げの演出で見せてよいか。
   * この起動で1回だけ `true` になり、同じ段落を日を開き直して見たときは `false`。
   */
  readonly diaryReveal: boolean
}

/** ほかの日の日記を書いている最中に出す理由。 */
function busyOnAnotherDayReason(date: string): string {
  return `いま${monthDayLabel(Temporal.PlainDate.from(date))}の日記を書いているので送れない`
}
const EMPTY_DAY_BLOCKED_REASON = "振り返る成果が無い"

/**
 * 書き上がった日記の演出を、この起動のあいだ1回だけ見せたことを覚える（React の外の値）。
 * 成果の画面は見ていないときアンマウントされるので、React の状態に持つとページを移っただけで忘れる。
 * 鍵は日付と最新段落の書いた時刻で、書き足すたびに変わるので、同じ日を再訪しても前の段落までは再生しない。
 */
const revealedDiaryKeys = new Set<string>()

export function useAchievement(): UseAchievementResult {
  const selection = useAchievementDateSelection()
  const dispatch = useSession((session) => session.dispatch)
  const queryClient = useQueryClient()
  const character = useSession((session) => session.state.character)
  const characterPacks = useSession((session) => session.state.characterPacks)
  const diaryWriting = useSession((session) => session.state.diaryWriting)
  const query = useQuery({
    // 見ている日の選び方をそのまま入力にする。
    // 今日を見ているときは日付を送らない（サーバの既定も今日なので、hash に何も無いことと揃う）。
    // 403・503 は例外になり、取れなかったことは `isError` で伝わる。
    ...rpc.achievement.day.queryOptions({ input: selection }),
    // 開くたびに・日を切り替えるたびに取り直す（前の日の分もあとから main に入った分で変わりうる）。
    staleTime: 0,
    // 日を切り替えた直後は、前の日の中身を薄く残したまま新しい日を待つ。
    // 新しく開いた日には無関係な値なので、呼ぶ側は `isFetching` と組んで使う。
    placeholderData: (previous: DailyAchievement | undefined) => previous,
    refetchInterval: (current: Query<DailyAchievement>) =>
      isViewingToday(current.state.data) ? TODAY_REFETCH_INTERVAL_MS : false,
  })

  const daySwitch = daySwitchOf(query.data)
  const view = viewOf(query.data, query.isPending, query.isError)
  const writing = writingViewOf(diaryWriting, daySwitch)

  const latestParagraph =
    view.kind === "ready" && view.diary.kind === "written"
      ? view.diary.diary.paragraphs.at(-1)
      : undefined
  const justWritten =
    daySwitch.kind === "known" &&
    diaryWriting.kind === "written" &&
    diaryWriting.date === daySwitch.date
  const revealKey =
    latestParagraph === undefined || daySwitch.kind !== "known"
      ? undefined
      : `${daySwitch.date}:${latestParagraph.writtenAt}`
  const diaryReveal = revealKey !== undefined && justWritten && !revealedDiaryKeys.has(revealKey)

  // 見せたことを描画のあとで覚える。覚えたあとの描画では「見せてよい」が `false` になる。
  // 次に書き上げの演出を見るのは、書き足しで `revealKey` が変わったとき（新しい段落）か、次に別の日で書き上がったときだけ。
  useEffect(() => {
    if (revealKey !== undefined && justWritten) {
      revealedDiaryKeys.add(revealKey)
    }
  }, [revealKey, justWritten])

  // 日記が書き上がったとき、その日の1日ぶんと暦を取り直す。
  // 書いた日と見ている日が違っても広く無効化する。
  // 1日ぶんのクエリキーは日付ごとに分かれるが、同時に描かれているのは見ている日の1件だけなので、広く無効化しても取り直しは1回で済む。
  // 暦は常に今日を含む固定範囲なので、書いた日を問わず鈴が変わりうる。
  useEffect(() => {
    if (diaryWriting.kind === "written") {
      void queryClient.invalidateQueries({ queryKey: rpc.achievement.key() })
    }
  }, [queryClient, diaryWriting])

  return {
    view,
    daySwitch,
    isFetching: query.isFetching,
    onPreviousDay: () => {
      if (daySwitch.kind === "known") {
        selectAchievementDate(previousDateKey(daySwitch.date))
      }
    },
    onNextDay: () => {
      if (daySwitch.kind === "known" && daySwitch.date !== daySwitch.today) {
        selectAchievementDate(nextDateKey(daySwitch.date))
      }
    },
    onToday: () => {
      selectAchievementToday()
    },
    onSelectDate: (date: string) => {
      selectAchievementDate(date)
    },
    review: reviewButtonOf(view, daySwitch, diaryWriting, character, dispatch),
    writing,
    diaryPortrait: diaryPortraitOf(view, character, characterPacks),
    diaryReveal,
  }
}

/**
 * 振り返りのボタン。
 * 会話のターン中・答え待ちでも押せる（振り返りは会話とは別の使い捨ての問い合わせ）。
 * 押せないのは、日記を書いている最中（`diaryWriting.kind === "writing"`）と空の日のとき。
 * 書いているのがこの日なら `Controls` が「振り返り中…」に出し分けるので、ここの理由文は他の日のときだけ見える。
 * 両方成り立つときは空の日の理由だけを出す。
 * 押すと日付だけを送り、依頼文はサーバがその日の成果を数え直して組む。
 */
function reviewButtonOf(
  view: AchievementView,
  daySwitch: AchievementDaySwitch,
  diaryWriting: DiaryWriting,
  character: CharacterInfo | undefined,
  dispatch: SessionDispatch,
): AchievementReviewButton {
  const label = `${character?.name ?? DEFAULT_CHARACTER_NAME}と振り返る`

  if (view.kind !== "ready" || daySwitch.kind !== "known") {
    return { label, availability: { kind: "blocked", reason: "" }, onReview: () => {} }
  }

  const availability: AchievementReviewAvailability = isEmptyAchievementDay(
    view.commitCount,
    view.doneTasks,
  )
    ? { kind: "blocked", reason: EMPTY_DAY_BLOCKED_REASON }
    : diaryWriting.kind === "writing"
      ? { kind: "blocked", reason: busyOnAnotherDayReason(diaryWriting.date) }
      : { kind: "available" }

  return {
    label,
    availability,
    // 押せないときは何も送らない。
    // `aria-disabled` はフォーカスを通すための見た目の扱いで、クリックそのものは止めないので、guard はここに要る。
    onReview: () => {
      if (availability.kind !== "available") {
        return
      }
      dispatch.session.reflectAchievement({ date: daySwitch.date })
    },
  }
}

/** 見ている日を、いま `diary` ツールで書いているか。 */
function writingViewOf(
  diaryWriting: DiaryWriting,
  daySwitch: AchievementDaySwitch,
): AchievementWriting {
  if (daySwitch.kind !== "known") {
    return { kind: "none" }
  }
  if (diaryWriting.kind === "writing" && diaryWriting.date === daySwitch.date) {
    return { kind: "writing", stage: diaryWriting.stage }
  }
  if (diaryWriting.kind === "failed" && diaryWriting.date === daySwitch.date) {
    return { kind: "failed" }
  }
  return { kind: "none" }
}

/**
 * 日記の区画の立ち絵と名前。
 * その日の日記が書き上がっていれば書いたパック、そうでなければいまのパックを `default` の表情で。
 */
function diaryPortraitOf(
  view: AchievementView,
  character: CharacterInfo | undefined,
  characterPacks: readonly CharacterPackEntry[],
): DiaryWriterPortrait {
  if (view.kind === "ready" && view.diary.kind === "written") {
    const latest = view.diary.diary.paragraphs.at(-1)
    if (latest !== undefined) {
      return diaryWriterPortraitOf(latest, characterPacks)
    }
  }
  return {
    name: character?.name ?? DEFAULT_CHARACTER_NAME,
    portrait: portraitAppearance(character, "default", "default"),
  }
}

/** 今日を見ているかどうか（`refetchInterval` の判定。まだ分からなければ今日でないとみなす）。 */
function isViewingToday(data: DailyAchievement | undefined): boolean {
  return data !== undefined && data.kind === "known" && data.date === data.today
}

/**
 * 日の切り替えの状態。直前に届いた応答から計算する。
 * `data` は `useQuery` の既定の振る舞いで、同じキーの再取得が失敗しても前回成功時の値のまま残る（`isError` は別に立つ）。
 */
function daySwitchOf(data: DailyAchievement | undefined): AchievementDaySwitch {
  if (data === undefined || data.kind === "unknown") {
    return { kind: "unknown" }
  }
  return { kind: "known", date: data.date, today: data.today }
}

function viewOf(
  data: DailyAchievement | undefined,
  isPending: boolean,
  isError: boolean,
): AchievementView {
  if (isPending) {
    return { kind: "loading" }
  }
  if (data === undefined) {
    return { kind: "failed" }
  }
  if (data.kind === "unknown") {
    return { kind: "unavailable" }
  }
  if (isError) {
    return { kind: "failed" }
  }
  return {
    kind: "ready",
    commitCount: data.commitCount,
    doneTasks: data.doneTasks,
    graduations: data.graduations,
    milestones: data.milestones,
    diary: data.diary,
  }
}
