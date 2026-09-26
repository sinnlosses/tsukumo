// 成果の画面のロジック（docs/design.md 2章「機能の中を分ける」の container / presenter）。
// 見ている日（hash の `date`。`stores/location-hash.ts`）から手続き `achievement.day` を取りに行き、
// 見た目（`presentational-achievement.tsx` と各区画の部品）がそのまま置ける形へ畳んで返す。
// 暦（`achievement.calendar`）は別のフック `use-achievement-calendar.ts`。
//
// 日の切り替えは、取れた応答の `date`/`today` から計算する（ブラウザは時計を読まないので、
// hash の raw な値だけでは「前の日」「今日」を計算できない。`docs/design.md`「成果の集め方と
// 配り方」）。前の日は常に計算できる（そのまま引くだけ）が、次の日と「今日へ」は「いま見ている日が
// 今日かどうか」が要るので、応答が届くまで押せない。
//
// 「<パックの名前>と振り返る」ボタン（`docs/screen-design.md` 13.10「並べるもの」4）のロジックも
// ここに持つ——押せない条件（ターンが進行中・空の日）は `use-usage-review.ts` の
// `startAvailability` と同じ形。押しても画面は移らない: `session.reflectAchievement { date }` を
// 送るだけで、進みは `SessionState.diaryWriting` から同じ画面の中に出す（`writing`。同節
// 「ボタンを押せないとき・押したあと」）。

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
} from "../../../../../shared/achievement.ts"
import { type CharacterInfo, type CharacterPackEntry } from "../../../../../shared/character.ts"
import {
  type DailyDiaryStatus,
  type DiaryStage,
  type DiaryWriting,
} from "../../../../../shared/diary.ts"
import {
  DEFAULT_CHARACTER_NAME,
  portraitAppearance,
} from "../../../../domain/portrait-appearance.ts"
import { rpc } from "../../../../lib/rpc-client.ts"
import {
  selectAchievementDate,
  selectAchievementToday,
  useAchievementDateSelection,
} from "../../../../stores/screen.tsx"
import {
  useSessionDispatch,
  useSessionSelector,
  type SessionDispatch,
} from "../../../../stores/session.tsx"
import { monthDayLabel } from "../../../../utils/month-day-label.ts"
import { diaryWriterPortraitOf, type DiaryWriterPortrait } from "../domain/diary-writer.ts"

/** 今日を見ているあいだだけ取り直す間隔（13.10「並べるもの」のさらに上、5章「取り直す契機」）。 */
const TODAY_REFETCH_INTERVAL_MS = 60_000

/**
 * 日の切り替えの状態。「いま何日を見ているか」が分かるかどうかで分かれる——main が読めて
 * いても、まだ一度も応答が届いていない・直前の取得が失敗して以前の応答も無い間は分からない
 * （下の「取れなかった」の項）。
 */
export type AchievementDaySwitch =
  | { readonly kind: "unknown" }
  | { readonly kind: "known"; readonly date: string; readonly today: string }

/**
 * 画面の中身（13.10「空の日・数えられないとき」）。日の切り替えとは別に持つ——「main が
 * 読めない」ときだけ日の切り替えも隠すので、`unavailable` はここでも特別に扱う。
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

/** 振り返りのボタンを押せるか（13.10「ボタンを押せないとき・押したあと」）。 */
export type AchievementReviewAvailability =
  | { readonly kind: "available" }
  | { readonly kind: "blocked"; readonly reason: string }

/** 振り返りのボタン1つぶんの見た目と押す口。 */
export type AchievementReviewButton = {
  /** 「<パックの名前>と振り返る」（13.10「並べるもの」4）。 */
  readonly label: string
  readonly availability: AchievementReviewAvailability
  readonly onReview: () => void
}

/**
 * 見ている日を、いま `diary` ツールで書いているか（13.10「ボタンを押せないとき・押したあと」）。
 * `SessionState.diaryWriting` の日付が見ている日と一致するときだけ（別の日を書いている・
 * 書き終えている・そもそも振り返っていないのはどれも `none`——振り返りのボタンそのものが
 * 押せるかどうかは {@link AchievementReviewButton} が別に持つ、常に画面全体で1つの状態）。
 */
export type AchievementWriting =
  | { readonly kind: "none" }
  | { readonly kind: "writing"; readonly stage: DiaryStage }
  | { readonly kind: "failed" }

export type UseAchievementResult = {
  readonly view: AchievementView
  readonly daySwitch: AchievementDaySwitch
  /** 日を切り替えている間、前の日の中身を薄く残す判定に使う（13.10「取りに行っている間」）。 */
  readonly isFetching: boolean
  readonly onPreviousDay: () => void
  readonly onNextDay: () => void
  readonly onToday: () => void
  /** 灯りの暦のマスを押したときに見ている日を切り替える口（13.10「灯りの暦」「押すと」）。 */
  readonly onSelectDate: (date: string) => void
  readonly review: AchievementReviewButton
  readonly writing: AchievementWriting
  /** 日記の区画の立ち絵と名前（書いたパック。13.10「並べるもの」2「書いたパックが無いとき」）。 */
  readonly diaryPortrait: DiaryWriterPortrait
  /**
   * 最新の段落を書き上げの演出で見せてよいか（13.10「書き上がったら」）。この描画で1回だけ
   * `true` になる——同じ段落を日を開き直して見たときは `false`（下の `takeDiaryReveal`）。
   */
  readonly diaryReveal: boolean
}

/** ほかの日の日記を書いている最中に出す理由（13.10「ボタンを押せないとき・押したあと」）。 */
function busyOnAnotherDayReason(date: string): string {
  return `いま${monthDayLabel(Temporal.PlainDate.from(date))}の日記を書いているので送れない`
}
const EMPTY_DAY_BLOCKED_REASON = "振り返る成果が無い"

/**
 * 書き上がった日記の演出を、この起動のあいだ1回だけ見せたことを覚える（React の外の値。
 * 成果の画面はアンマウントされうる——`components/app/layout.tsx` の `OVERLAY_SCREEN` は見ていない画面を描かない
 * ——ので、React の状態に持つとページを移っただけで忘れる。`domain/reveal/brush-tip.ts` と同じ
 * 「React の外に1つだけ持つ」考え方）。鍵は日付と最新段落の書いた時刻——書き足すたびに変わる
 * ので、同じ日を再訪しても前の段落までは再生しない。
 */
const revealedDiaryKeys = new Set<string>()

export function useAchievement(): UseAchievementResult {
  const selection = useAchievementDateSelection()
  const dispatch = useSessionDispatch()
  const queryClient = useQueryClient()
  const character = useSessionSelector((session) => session.state.character)
  const characterPacks = useSessionSelector((session) => session.state.characterPacks)
  const diaryWriting = useSessionSelector((session) => session.state.diaryWriting)
  const query = useQuery({
    // 見ている日の選び方をそのまま入力にする（今日を見ているときは日付を送らない——サーバの
    // 既定も今日なので、hash に何も無いことと揃う）。403・503 は例外になり、取れなかったことは
    // `isError` で伝わる。
    ...rpc.achievement.day.queryOptions({ input: selection }),
    // 開くたびに・日を切り替えるたびに取り直す（前の日の分もあとから main に入った分で変わりうる。
    // `docs/design.md` 5章）。
    staleTime: 0,
    // 日を切り替えた直後は、前の日の中身を薄く残したまま新しい日を待つ（同じ「取りに行っている
    // 間」の見せ方。新しく開いた日には無関係な値だが、`isFetching` と組んで使うのは呼ぶ側）。
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

  // React の外にある状態への書き込み（4類型の1つ）。ここで覚えてから返すと、同じ描画の中で
  // 「見せてよい」が2回目以降 `false` になる——次に書き上げの演出を見るのは、書き足しで
  // `revealKey` が変わったとき（新しい段落）か、次に別の日で書き上がったときだけ。
  useEffect(() => {
    if (revealKey !== undefined && justWritten) {
      revealedDiaryKeys.add(revealKey)
    }
  }, [revealKey, justWritten])

  // 日記が書き上がったとき、その日の1日ぶんと暦を取り直す（`docs/design.md`「成果の集め方と
  // 配り方」の「取り直す契機」）。書いた日と見ている日が違っても広く無効化する——1日ぶんの
  // クエリキーは日付ごとに分かれるが、同時に描かれているのは見ている日の1件だけなので、
  // 広く無効化しても取り直しは1回で済む。暦は常に今日を含む固定範囲なので、書いた日を問わず
  // 鈴が変わりうる。
  useEffect(() => {
    if (diaryWriting.kind === "written") {
      // 1日ぶんと暦の両方（手続き `achievement` の下のすべて）。
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
 * 振り返りのボタン（13.10「並べるもの」4・「ボタンを押せないとき・押したあと」）。会話のターン
 * 中・答え待ちでも押せる（振り返りは会話とは別の使い捨ての問い合わせ）。押せないのは、
 * 日記を書いている最中（`diaryWriting.kind === "writing"`。書いているのがこの日なら
 * `Controls` が「振り返り中…」に出し分けるので、ここの理由文は他の日のときだけ見える）と、
 * 空の日のとき。空の日の理由を先に見る——両方成り立つときは空の日の理由だけを出す決まり
 * （同節）。押すと日付だけを送る（`session.reflectAchievement`。依頼文は session-manager が
 * その日の成果を数え直して組む。`docs/design.md`「日記の受け取りと保存」「コマンドと依頼」）。
 * 画面は移らない。
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
    // 押せないときは何も送らない（`use-screen-nav.ts` の `onChange` と同じく、guard は
    // ここに置き、部品は「押した事実を渡すだけ」。`aria-disabled` はフォーカスを通すための
    // 見た目の扱いで、クリックそのものは止めない）。
    onReview: () => {
      if (availability.kind !== "available") {
        return
      }
      dispatch.session.reflectAchievement({ date: daySwitch.date })
    },
  }
}

/** 見ている日を、いま `diary` ツールで書いているか（`SessionState.diaryWriting` と見ている日の
 * 日付が一致するときだけ拾う。他の日を書いている・書いていないはどちらも `none`）。 */
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
 * 日記の区画の立ち絵と名前（13.10「並べるもの」2）。その日の日記が書き上がっていれば書いた
 * パック（`diary-writer.ts`）、そうでなければいまのパックを `default` の表情で
 * （13.10「並べるもの」2「立ち絵」）。
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
 * 日の切り替えの状態。直前に届いた応答（同じ日の取得が失敗していても、前に届いていた分は
 * 残る）から計算する——`data` は `useQuery` の既定の振る舞いで、同じキーの再取得が失敗しても
 * 前回成功時の値のまま残る（`isError` は別に立つ）。
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
