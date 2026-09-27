# 利用枠の行が「取得中…」のまま撮られる E2E の揺れを塞ぐ（振り返り: T-795）

- 根拠: T-795 の委譲先と受け入れの `pnpm run check` で、差分と無関係に E2E が3回落ちた（負荷は load average 22 前後）。`background-task-running` と `final-report-label-waiting` は、利用枠の行が「10:00 時点」ではなく「取得中…」（取り直しボタンが `aria-disabled="true"`）のまま撮られた食い違いで、控えは `/tmp/tsukumo-e2e/failures/` に残った。`src/browser/components/domain/sidebar/plan-usage-row.tsx` は、`turn-finished` が続くと取り直しが重なり `settledDom` が時間切れになるという理由で、わざと `aria-busy` を付けていない。そのため `docs/design.md` 10章「E2E の揺れを生まない書き方」の「撮る前に非同期の取得が済んだことを DOM の印で待つ」条が効かない。残りの1回は `report-tidied` が「DOM が落ち着かない（15000ms）」で落ち、最後の2回の DOM に差分は無かった（何かの `aria-busy` が15秒残ったとみられる。どの要素かは確かめていない）
- 出し先: 新しいタスク（利用枠の取り直しを E2E が待てる印を出す。重なる取り直しで印が外れない問題は、取り直しを畳む・最新の1回だけを印にするなど、印を付けない以外の形で解く。`report-tidied` の15秒の時間切れで何が busy だったかを `settle-diff` に残す）
