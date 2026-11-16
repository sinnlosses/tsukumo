// 操作の口に添える線のアイコン。絵は lucide-react で、描くのは Astryx の `Icon`。大きさ（sm）と線の太さをここで揃える。
// 読み上げの名前は口の側が持つので、ここは絵だけ。線の色は読み手の `currentColor`。

import { Icon } from "@astryxdesign/core/Icon"
import {
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  Briefcase,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleDot,
  CirclePause,
  Coins,
  Copy,
  ExternalLink,
  Hourglass,
  Infinity as InfinityGlyph,
  List,
  ListChecks,
  Maximize2,
  MessageCircle,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  Trophy,
  Upload,
  UserRound,
  X,
} from "lucide-react"
import type { ReactElement } from "react"

/** 差し替える（上向きの矢印と下の線）。 */
export function UploadIcon(): ReactElement {
  return <Icon icon={Upload} {...ICON_ATTRIBUTES} />
}

/** 消す（くず入れ）。 */
export function TrashIcon(): ReactElement {
  return <Icon icon={Trash2} {...ICON_ATTRIBUTES} />
}

/** 足す・作る（十字）。 */
export function PlusIcon(): ReactElement {
  return <Icon icon={Plus} {...ICON_ATTRIBUTES} />
}

/** 切り替える（左右の矢印）。 */
export function SwitchIcon(): ReactElement {
  return <Icon icon={ArrowLeftRight} {...ICON_ATTRIBUTES} />
}

/** 名乗りを変える（鉛筆）。 */
export function PencilIcon(): ReactElement {
  return <Icon icon={Pencil} {...ICON_ATTRIBUTES} />
}

/** 取り直す（円を巡る矢印）。 */
export function RefreshIcon(): ReactElement {
  return <Icon icon={RefreshCw} {...ICON_ATTRIBUTES} />
}

/** 始める・進む（右向きの矢印）。 */
export function ArrowRightIcon(): ReactElement {
  return <Icon icon={ArrowRight} {...ICON_ATTRIBUTES} />
}

/** 広げる（四隅を指す矢印）。 */
export function MaximizeIcon(): ReactElement {
  return <Icon icon={Maximize2} {...ICON_ATTRIBUTES} />
}

/** 一覧から選ぶ（行の並び）。 */
export function ListIcon(): ReactElement {
  return <Icon icon={List} {...ICON_ATTRIBUTES} />
}

/** 前のやり取りへ戻る（左回りの矢印）。 */
export function HistoryIcon(): ReactElement {
  return <Icon icon={RotateCcw} {...ICON_ATTRIBUTES} />
}

/** 仕事の口（かばん）。 */
export function WorkIcon(): ReactElement {
  return <Icon icon={Briefcase} {...ICON_ATTRIBUTES} />
}

/** 雑談の口（吹き出し）。 */
export function ChatIcon(): ReactElement {
  return <Icon icon={MessageCircle} {...ICON_ATTRIBUTES} />
}

/** キャラクターの口（人影）。 */
export function CharacterIcon(): ReactElement {
  return <Icon icon={UserRound} {...ICON_ATTRIBUTES} />
}

/** トークンの口（硬貨）。 */
export function TokenIcon(): ReactElement {
  return <Icon icon={Coins} {...ICON_ATTRIBUTES} />
}

/** 成果の口（トロフィー）。 */
export function AchievementIcon(): ReactElement {
  return <Icon icon={Trophy} {...ICON_ATTRIBUTES} />
}

/** 輪（空の円）。 */
export function CircleIcon(): ReactElement {
  return <Icon icon={Circle} {...ICON_ATTRIBUTES} />
}

/** 中を塗った円（円の中の点）。 */
export function CircleDotIcon(): ReactElement {
  return <Icon icon={CircleDot} {...ICON_ATTRIBUTES} />
}

/** 砂時計。 */
export function HourglassIcon(): ReactElement {
  return <Icon icon={Hourglass} {...ICON_ATTRIBUTES} />
}

/** 円に二本線。 */
export function CirclePauseIcon(): ReactElement {
  return <Icon icon={CirclePause} {...ICON_ATTRIBUTES} />
}

/** 破線の輪。 */
export function CircleDashedIcon(): ReactElement {
  return <Icon icon={CircleDashed} {...ICON_ATTRIBUTES} />
}

/** 円にチェック。 */
export function CircleCheckIcon(): ReactElement {
  return <Icon icon={CircleCheck} {...ICON_ATTRIBUTES} />
}

/** 頼む・送る（上向きの矢印。入力欄の送信と同じ絵）。 */
export function SendIcon(): ReactElement {
  return <Icon icon={ArrowUp} {...ICON_ATTRIBUTES} />
}

/** 選んだ印（チェック）。 */
export function CheckIcon(): ReactElement {
  return <Icon icon={Check} {...ICON_ATTRIBUTES} />
}

/** 仕分ける（チェックの並んだ一覧）。 */
export function ListChecksIcon(): ReactElement {
  return <Icon icon={ListChecks} {...ICON_ATTRIBUTES} />
}

/** 閉じる（×）。 */
export function CloseIcon(): ReactElement {
  return <Icon icon={X} {...ICON_ATTRIBUTES} />
}

/** 写す（重なった四角）。 */
export function CopyIcon(): ReactElement {
  return <Icon icon={Copy} {...ICON_ATTRIBUTES} />
}

/** 外のページを開く（四角から出る矢印）。 */
export function ExternalLinkIcon(): ReactElement {
  return <Icon icon={ExternalLink} {...ICON_ATTRIBUTES} />
}

/** 戻る（左向きの山形）。 */
export function ChevronLeftIcon(): ReactElement {
  return <Icon icon={ChevronLeft} {...ICON_ATTRIBUTES} />
}

/** 先へ進む（右向きの山形）。 */
export function ChevronRightIcon(): ReactElement {
  return <Icon icon={ChevronRight} {...ICON_ATTRIBUTES} />
}

/** ループで回せる（∞）。 */
export function InfinityIcon(): ReactElement {
  return <Icon icon={InfinityGlyph} {...ICON_ATTRIBUTES} />
}

/** 円に感嘆符。 */
export function CircleAlertIcon(): ReactElement {
  return <Icon icon={CircleAlert} {...ICON_ATTRIBUTES} />
}

const ICON_ATTRIBUTES = { size: "sm", strokeWidth: 1.9 } as const
