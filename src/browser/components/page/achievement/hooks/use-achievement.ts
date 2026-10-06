// 成果の画面のロジック。
// 見ている日（hash の `date`）から手続き `achievement.day` を取りに行き、見た目がそのまま置ける形へ畳んで返す。
//
// 日の切り替えは、取れた応答の `date`/`today` から計算する。
// ブラウザは時計を読まないので、hash の raw な値だけでは「前の日」「今日」を計算できない。
// 次の日と「今日へ」は「いま見ている日が今日かどうか」が要るので、応答が届くまで押せない。
//
// 「<パックの名前>と振り返る」ボタンのロジックもここに持つ。
// 押しても画面は移らない。`session.reflectAchievement { date }` を送るだけで、進みは `SessionState.diaryWriting` から同じ画面の中に出す。

import { useQuery, type Query } from "@tanstack/react-query"

import {
  isEmptyAchievementDay,
  nextDateKey,
  previousDateKey,
  type AchievementCommits,
  type AchievementDoneTasks,
  type AchievementGraduation,
  type AchievementMilestone,
  type DailyAchievement,
} from "../../../../../shared/achievement/achievement.ts"
import type { CharacterInfo } from "../../../../../shared/character-pack/character.ts"
import type {
  DailyDiaryStatus,
  DiaryStage,
  DiaryWriting,
} from "../../../../../shared/diary/diary.ts"
import { DEFAULT_CHARACTER_NAME } from "../../../../domain/portrait-appearance.ts"
import { rpc } from "../../../../domain/rpc.ts"
import {
  selectAchievementDate,
  selectAchievementToday,
  useAchievementDateSelection,
} from "../../../../stores/screen.tsx"
import { useSession, type SessionDispatch } from "../../../../stores/session.ts"
import { currentWriterPortraitOf, type DiaryWriterPortrait } from "../domain/diary-writer.ts"
import {
  reviewAvailabilityOf,
  type AchievementReviewAvailability,
} from "../domain/review-availability.ts"
import {
  EMPTY_DAY_NOTE,
  LOADING_VALUE,
  NO_DIARY_NOTE,
  UNKNOWN_TASKS_NOTE,
  UNKNOWN_VALUE,
  WRITE_FAILED_NOTE,
} from "../domain/review-note.ts"
import { writtenTimeOf } from "../domain/written-time.ts"

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
      readonly commits: AchievementCommits
      readonly doneTasks: AchievementDoneTasks
      readonly graduations: readonly AchievementGraduation[]
      readonly milestones: readonly AchievementMilestone[]
      readonly diary: DailyDiaryStatus
    }

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

/** 日記の区画の吹き出し。 */
export type DiarySectionBubble =
  | { readonly kind: "blank" }
  | { readonly kind: "notes"; readonly notes: readonly string[] }
  | {
      readonly kind: "written"
      readonly key: string
      readonly body: string
      readonly revisionId: number
    }

export type DiarySectionCard = {
  readonly key: string
  readonly label: string
  readonly value: string
  readonly note: string
}

/** 日記の区画が置く値。`view` から畳んだもの。 */
export type DiarySectionModel =
  | { readonly kind: "failed" }
  | {
      readonly kind: "shown"
      /** 取れていて、振り返りのボタンを出してよいか。 */
      readonly ready: boolean
      /** 見出しの「振り返り [21:40]」。最後の段落が無ければ `none`。 */
      readonly reviewedLabel:
        | { readonly kind: "none" }
        | { readonly kind: "shown"; readonly label: string }
      readonly canOpenBook: boolean
      readonly bubble: DiarySectionBubble
      readonly cards: readonly DiarySectionCard[]
    }

export type UseAchievementResult = {
  readonly view: AchievementView
  readonly diarySection: DiarySectionModel
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
  /** 書き上げの演出を見せる側に立った合図。この段落を「もう見せた」として覚える。 */
  readonly onDiaryRevealed: () => void
}

/**
 * 書き上がった日記の演出を、この起動のあいだ1回だけ見せたことを覚える（React の外の値）。
 * 成果の画面は見ていないときアンマウントされるので、React の状態に持つとページを移っただけで忘れる。
 * 鍵は日付と最新段落の書いた時刻で、書き足すたびに変わるので、同じ日を再訪しても前の段落までは再生しない。
 */
const revealedDiaryKeys = new Set<string>()

export function useAchievement(): UseAchievementResult {
  const selection = useAchievementDateSelection()
  const dispatch = useSession((session) => session.dispatch)
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
    // 画面を離れている間も前回の結果を捨てない（既定の `gcTime` では5分で捨てる）。
    gcTime: Infinity,
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

  return {
    view,
    diarySection: diarySectionOf(view, writing),
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
    diaryPortrait: currentWriterPortraitOf(
      view.kind === "ready" ? view.diary : { kind: "none" },
      character,
      characterPacks,
    ),
    diaryReveal,
    onDiaryRevealed: () => {
      if (revealKey !== undefined) {
        revealedDiaryKeys.add(revealKey)
      }
    },
  }
}

function diarySectionOf(view: AchievementView, writing: AchievementWriting): DiarySectionModel {
  if (view.kind === "failed") {
    return { kind: "failed" }
  }

  const written =
    view.kind === "ready" && view.diary.kind === "written" ? view.diary.diary : undefined
  const latest = written?.paragraphs.at(-1)

  return {
    kind: "shown",
    ready: view.kind === "ready",
    reviewedLabel:
      latest === undefined
        ? { kind: "none" }
        : { kind: "shown", label: `振り返り [${writtenTimeOf(latest.writtenAt) ?? ""}]` },
    canOpenBook: latest !== undefined,
    bubble: bubbleOf(view, writing, written, latest),
    cards: cardsOf(view),
  }
}

function bubbleOf(
  view: AchievementView,
  writing: AchievementWriting,
  written: Extract<DailyDiaryStatus, { readonly kind: "written" }>["diary"] | undefined,
  latest: { readonly writtenAt: string; readonly body: string } | undefined,
): DiarySectionBubble {
  if (view.kind !== "ready") {
    return { kind: "blank" }
  }
  const latestBodies = latest === undefined ? [] : [latest.body]
  if (writing.kind === "writing") {
    return { kind: "notes", notes: latestBodies }
  }
  if (writing.kind === "failed") {
    return { kind: "notes", notes: [WRITE_FAILED_NOTE, ...latestBodies] }
  }
  if (isEmptyAchievementDay(view.commits, view.doneTasks)) {
    return { kind: "notes", notes: [EMPTY_DAY_NOTE] }
  }
  if (latest === undefined) {
    return { kind: "notes", notes: [NO_DIARY_NOTE] }
  }
  return {
    kind: "written",
    key: `${written?.date ?? ""}-${latest.writtenAt}`,
    body: latest.body,
    revisionId: written?.paragraphs.length ?? 0,
  }
}

/** 数の札。コミットの数が分からない日は「コミット」の札を並べない。 */
function cardsOf(view: AchievementView): readonly DiarySectionCard[] {
  const ready = view.kind === "ready" ? view : undefined
  const doneTasks = ready?.doneTasks
  const doneTasksCard = {
    key: "done-tasks",
    label: "終えたタスク",
    value:
      doneTasks === undefined
        ? LOADING_VALUE
        : doneTasks.kind === "unknown"
          ? UNKNOWN_VALUE
          : String(doneTasks.items.length),
    note: doneTasks?.kind === "unknown" ? UNKNOWN_TASKS_NOTE : "",
  }
  if (ready === undefined) {
    return [doneTasksCard, { key: "commits", label: "コミット", value: LOADING_VALUE, note: "" }]
  }
  return ready.commits.kind === "unknown"
    ? [doneTasksCard]
    : [
        doneTasksCard,
        { key: "commits", label: "コミット", value: String(ready.commits.count), note: "" },
      ]
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

  const availability = reviewAvailabilityOf(view.commits, view.doneTasks, diaryWriting)

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
    commits: data.commits,
    doneTasks: data.doneTasks,
    graduations: data.graduations,
    milestones: data.milestones,
    diary: data.diary,
  }
}
