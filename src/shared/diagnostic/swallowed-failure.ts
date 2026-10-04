// 握りつぶしていた失敗の足跡（`swallowed-failure`）の形。`error.name` と `code` は決まった語に写し、
// `message` は持たない。

/** 失敗が起きた場所。機能ごとの語を1つの表で持ち、型と判定（{@link isSwallowedFailurePlace}）を両方そこから作る。 */
const SWALLOWED_FAILURE_PLACES = {
  session: [
    "restart",
    "read-context-usage",
    "read-plan-usage",
    "read-session-digest",
    "restore-events",
    "event-handler",
  ],
  "view-server": ["socket-message", "http-server-error"],
  chat: [
    "consolidation-aborted",
    "consolidation-threw",
    "consolidation-unreadable-result",
    "consolidation-summary-write",
    "persona-remember",
    "persona-forget",
  ],
  recommendation: ["recommend-aborted", "recommend-failed"],
  repository: ["task-summary-poll"],
  process: ["unhandled-rejection", "uncaught-exception"],
} as const satisfies Record<string, readonly string[]>

type SwallowedFailureFeature = keyof typeof SWALLOWED_FAILURE_PLACES

/** 失敗が起きた場所。 */
export type SwallowedFailurePlace = {
  readonly [F in SwallowedFailureFeature]: {
    readonly feature: F
    readonly place: (typeof SWALLOWED_FAILURE_PLACES)[F][number]
  }
}[SwallowedFailureFeature]

const SWALLOWED_FAILURE_PLACE_KEYS = new Set(
  Object.entries(SWALLOWED_FAILURE_PLACES).flatMap(([feature, places]) =>
    places.map((place) => `${feature}:${place}`),
  ),
)

/** `SwallowedFailurePlace` の形か。 */
export function isSwallowedFailurePlace(value: unknown): value is SwallowedFailurePlace {
  if (typeof value !== "object" || value === null) {
    return false
  }
  const feature = Reflect.get(value, "feature")
  const place = Reflect.get(value, "place")
  return (
    typeof feature === "string" &&
    typeof place === "string" &&
    SWALLOWED_FAILURE_PLACE_KEYS.has(`${feature}:${place}`)
  )
}

const KNOWN_ERROR_NAMES = {
  Error: true,
  TypeError: true,
  RangeError: true,
  SyntaxError: true,
  ReferenceError: true,
  AbortError: true,
} satisfies Record<string, true>

/** 握りつぶした失敗の `error.name` を写した形。知らない名前は `"other"`。 */
export type DiagnosedErrorName = keyof typeof KNOWN_ERROR_NAMES | "other"

/** `DiagnosedErrorName` の形か。 */
export function isDiagnosedErrorName(value: unknown): value is DiagnosedErrorName {
  return typeof value === "string" && (value === "other" || Object.hasOwn(KNOWN_ERROR_NAMES, value))
}

const KNOWN_ERROR_CODES = {
  ENOENT: true,
  EACCES: true,
  EPERM: true,
  ECONNRESET: true,
  ETIMEDOUT: true,
  EADDRINUSE: true,
} satisfies Record<string, true>

/** 握りつぶした失敗の `error.code`（Node の `ErrnoException` など）を写した形。無ければ `"none"`、知らない値は `"other"`。 */
export type DiagnosedErrorCode = "none" | keyof typeof KNOWN_ERROR_CODES | "other"

/** `DiagnosedErrorCode` の形か。 */
export function isDiagnosedErrorCode(value: unknown): value is DiagnosedErrorCode {
  return (
    typeof value === "string" &&
    (value === "none" || value === "other" || Object.hasOwn(KNOWN_ERROR_CODES, value))
  )
}

/** 握りつぶしていた失敗を1件畳んだこと。場所の名前と `error.name`・`code` だけを持つ。 */
export type SwallowedFailureFootprint = {
  readonly flow: "swallowed-failure"
  /** 畳んだ時刻（エポックミリ秒）。 */
  readonly at: number
  readonly place: SwallowedFailurePlace
  readonly errorName: DiagnosedErrorName
  readonly errorCode: DiagnosedErrorCode
}

/** 握りつぶした失敗1件を足跡にする。`error.message` は読まない。 */
export function swallowedFailureFootprint(
  at: number,
  place: SwallowedFailurePlace,
  error: unknown,
): SwallowedFailureFootprint {
  return {
    flow: "swallowed-failure",
    at,
    place,
    errorName: nameOf(error),
    errorCode: codeOf(error),
  }
}

function nameOf(error: unknown): DiagnosedErrorName {
  if (!(error instanceof Error)) {
    return "other"
  }
  return isDiagnosedErrorName(error.name) ? error.name : "other"
}

function codeOf(error: unknown): DiagnosedErrorCode {
  if (!(error instanceof Error)) {
    return "none"
  }
  const code = Reflect.get(error, "code")
  if (code === undefined) {
    return "none"
  }
  return typeof code === "string" && isDiagnosedErrorCode(code) ? code : "other"
}
