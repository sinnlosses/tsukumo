// 成果の画面のロジック（docs/design.md 2章「機能の中を分ける」の container / presenter）。
// 見ている日（hash の `date`。`stores/location-hash.ts`）から `GET /achievement` を取りに行き、
// 見た目（`presentational-achievement-screen.tsx`）がそのまま置ける形へ畳んで返す。
//
// **日の切り替えは、取れた応答の `date`/`today` から計算する**（ブラウザは時計を読まないので、
// hash の raw な値だけでは「前の日」「今日」を計算できない。`docs/design.md` 5章「成果の集め方と
// 配り方」）。前の日は常に計算できる（そのまま引くだけ）が、次の日と「今日へ」は「いま見ている日が
// 今日かどうか」が要るので、応答が届くまで押せない。

import { useQuery, type Query } from "@tanstack/react-query"

import {
  ACHIEVEMENT_DATE_QUERY_NAME,
  ACHIEVEMENT_PATH,
  nextDateKey,
  previousDateKey,
  readDailyAchievement,
  type AchievementDoneTasks,
  type DailyAchievement,
} from "../../../../shared/achievement.ts"
import { sessionTokenUrl } from "../../../lib/session-token-url.ts"
import { type AchievementDateSelection } from "../../../stores/location-hash.ts"
import {
  selectAchievementDate,
  selectAchievementToday,
  useAchievementDateSelection,
} from "../../../stores/screen.tsx"

/** 今日を見ているあいだだけ取り直す間隔（13.10「並べるもの」のさらに上、5章「取り直す契機」）。 */
const TODAY_REFETCH_INTERVAL_MS = 60_000

/**
 * 日の切り替えの状態。**「いま何日を見ているか」が分かるかどうかで分かれる**——main が読めて
 * いても、まだ一度も応答が届いていない・直前の取得が失敗して以前の応答も無い間は分からない
 * （下の「取れなかった」の項）。
 */
export type AchievementDaySwitch =
  | { readonly kind: "unknown" }
  | { readonly kind: "known"; readonly date: string; readonly today: string }

/**
 * 画面の中身（13.10「空の日・数えられないとき」）。**日の切り替えとは別に持つ**——「main が
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
    }

export type UseAchievementResult = {
  readonly view: AchievementView
  readonly daySwitch: AchievementDaySwitch
  /** 日を切り替えている間、前の日の中身を薄く残す判定に使う（13.10「取りに行っている間」）。 */
  readonly isFetching: boolean
  readonly onPreviousDay: () => void
  readonly onNextDay: () => void
  readonly onToday: () => void
}

export function useAchievement(): UseAchievementResult {
  const selection = useAchievementDateSelection()
  const query = useQuery({
    queryKey: ["achievement", queryDateKey(selection)],
    queryFn: () => fetchAchievement(selection),
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

  return {
    view: viewOf(query.data, query.isPending, query.isError),
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
  }
}

/** `useQuery` の `queryKey` に使う、見ている日の生の値（`"today"` か日付キー）。 */
function queryDateKey(selection: AchievementDateSelection): string {
  return selection.kind === "chosen" ? selection.date : "today"
}

/**
 * 取りに行く。**配られない形だったときは「main が読めない」と同じ扱い**（`readDailyAchievement`。
 * `useTokenUsage` と同じ割り切り）。403 や落ちた応答は例外にして、取れなかったことは呼び出し側の
 * `isError` で伝える。
 */
async function fetchAchievement(selection: AchievementDateSelection): Promise<DailyAchievement> {
  const response = await fetch(achievementUrl(selection))
  if (!response.ok) {
    throw new Error(String(response.status))
  }
  return readDailyAchievement(await response.json())
}

/** 取りに行く URL。**起動トークンを付ける**（`/token-usage` と同じ守り方）。今日を見ている
 * ときはクエリを付けない——サーバの既定も今日なので、hash に何も無いことと揃う。 */
function achievementUrl(selection: AchievementDateSelection): string {
  return selection.kind === "chosen"
    ? sessionTokenUrl(ACHIEVEMENT_PATH, { [ACHIEVEMENT_DATE_QUERY_NAME]: selection.date })
    : sessionTokenUrl(ACHIEVEMENT_PATH)
}

/** 今日を見ているかどうか（`refetchInterval` の判定。まだ分からなければ今日でないとみなす）。 */
function isViewingToday(data: DailyAchievement | undefined): boolean {
  return data !== undefined && data.kind === "known" && data.date === data.today
}

/**
 * 日の切り替えの状態。**直前に届いた応答（同じ日の取得が失敗していても、前に届いていた分は
 * 残る）から計算する**——`data` は `useQuery` の既定の振る舞いで、同じキーの再取得が失敗しても
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
  return { kind: "ready", commitCount: data.commitCount, doneTasks: data.doneTasks }
}
