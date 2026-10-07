# 5時間枠と週の利用枠をサイドバーに出す（2026-09-27）

**この文書は調査メモであって正典ではない。** `docs/` の他ファイルにある「節の索引」はここには
作らない。採った案は `docs/display.md` 4.2「各表示物」（サイドバー・入力欄）・
`docs/requirements.md` 4.1・`docs/glossary.md`「利用上限」「利用枠」へ移してあり、そちらが正典。
実装はこの文書の外。

**問いの出どころ**: ユーザーの指示（2026-09-27）。入力欄から「利用上限が近い」を消し、サイドバーの
コンテキストの行の下に5時間枠と週の利用枠を出して、再読み込みのボタンを添える。

**一次情報の版は時間が経つと変わる。** 読んだのは 2026-09-27 の手元の
`@anthropic-ai/claude-agent-sdk` 0.3.283（同梱の Claude Code 2.1.283、darwin-arm64 の本体）。
公式ドキュメント（`code.claude.com/docs/en/agent-sdk/typescript`）には、下の口の記述は見当たらなかった。
**生きたセッションでは呼んでいない**（呼ぶと本体が利用状況の口へ取りに行くため。実測は後段の
タスクが本物の tsukumo で行う）。

## 結論

| 論点                                             | 結論                                                                                                                                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 知らせが来ていないときにも取れる出どころがあるか | **ある。** `Query` の `usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true })`（制御要求 `get_usage`）。`/usage` の画面と同じ値を構造で返す |
| `rate_limit_event` の `utilization` の単位       | **0〜1 の割合**（本体のスキーマの説明。1 を超えることもある）。ただし運ぶのは「いま効いている枠」1つだけで、2つの枠を並べる源にはならない                               |
| 「再読み込み」が何を呼び直すか                   | **上の口を呼び直す**（出どころへ取りに行く）。本体は60秒以内の取り直しを手元の控えで答えるので、連打しても利用状況の口は叩かれない                                      |
| `rejected` を入力欄に残すか                      | **残す。** 消すのは `warning`（利用上限が近い）だけ。`warning` は読み手が居なくなるので `RateLimit` から畳む                                                            |

**tsukumo は認証情報を読まない。** 取りに行くのは子プロセスの Claude Code で、自分のログインの
トークンを使う（`/usage` を打ったときと同じ経路）。tsukumo がするのは SDK の制御要求を1本送る
ことだけなので、CLAUDE.md「タスク運用」の「認証情報や権限の変更」には当たらない。

## 論点1. 出どころ

### 採る: `usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET`

`sdk.d.ts` の `Query` に次の口がある（型は `SDKControlGetUsageResponse`）。

- `rate_limits_available: boolean` — API キー・Bedrock・Vertex、または profile の scope が無い
  トークンでは `false`（そのとき `rate_limits` は `null`）
- `rate_limits.five_hour` / `seven_day` / `seven_day_opus` / `seven_day_sonnet` /
  `seven_day_oauth_apps` — それぞれ `{ utilization: number | null; resets_at: string | null }`
  か `null` か無い。**`utilization` は 0〜100 の百分率、`resets_at` は ISO 8601**（型の説明）
- `rate_limits.model_scoped` — モデルごとの週の枠（`display_name` はサーバが付けた名前）
- `rate_limits.extra_usage` — 超過利用の金額
- `session`（このセッションの費用とトークン数）・`subscription_type`・`behaviors`

`skipBehaviors: true` を渡すと `behaviors` を作らない。`behaviors` は**手元の transcript を
7日ぶん走査して作る**（型の説明）ので、**必ず `true` を渡す**（会話の中身の入った物に触る処理を
tsukumo の都合で起こさない。`docs/coding-standards.md`「会話内容の扱い」）。

同梱の本体（`claude` の実行ファイル）の中で確かめたこと:

- 制御要求 `get_usage` の処理は `/usage` の組み立てと同じ関数を呼ぶ。SDK 経由（`--print` の
  制御の口）でも処理され、「この文脈では使えない」と断るのは Remote Control の橋の側だけ
- 取りに行く先は claude.ai の `/api/oauth/usage`（本体が自分の OAuth のトークンで、5秒の
  タイムアウトと再試行つき）
- **直近60秒以内に取った控え**があり、その後に新しい応答の見出しを見ていなければ、口へは行かずに
  控えで答える。控えは本体の全体設定（`cachedUsageUtilization`）に書かれ、1時間まで持ち越す
- 口が落ちた・429 のときは、直前の API 応答の見出し（`anthropic-ratelimit-unified-5h-utilization`
  など。割合 ×100 で百分率に直す）か1時間以内の控えで埋めて答える
- claude.ai の契約でない（`subscription_type` が無い）ときは口へ行かず、`rate_limits_available`
  が `false` になる

**名前のとおり実験中の口**で、どの版でも変わる・消えることがある（型の説明）。それでも採るのは:

- 代わりの口がどれも同じ値を返さない（下の「採らない」）。取れる口が無ければこの機能は作れない
- 変わったときに黙って壊れない。呼ぶのは SDK の `sdk-` で始まるアダプタ1本に閉じ、戻り値は zod で
  確かめて「取れない」に畳む（`sdk-context-usage.ts` と同じ形）。口の名前が変われば
  `pnpm run typecheck` が落ちる（`package.json` は `^0.3.280` で、版は lock が固定する）
- 失うものが小さい。取れないとサイドバーの札が一言になるだけで、会話は止まらない

### 採らない

| 案                                                            | 採らない理由                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rate_limit_event` だけで出す                                 | 公開の型（`SDKRateLimitInfo`）が運ぶのは「いま効いている枠」の `status` / `resetsAt` / `utilization` だけで、5時間枠と週の枠を並べられない。知らせが来るまで何も無い                                                                                                       |
| `rate_limit_info.unifiedWindows`                              | 本体のスキーマには2つの枠を毎回運ぶ欄があり、割合が動くたびに知らせが出る。だが `@internal` で `sdk.d.ts` から消されている（型の無い値を読むことになり、予告なく消えうる）。実験中の口より弱い                                                                             |
| `/usage` を依頼として送り、`usage_report` を読む              | 会話の流れにコマンドを差し込むことになり、ターン・本文・transcript が汚れる。構造の中身も「サーバの行をそのまま描く」汎用の形で、2つの枠を名指しできない                                                                                                                   |
| `getSessionCost`（`get_session_cost`）                        | このセッションの費用の文だけで、枠を持たない                                                                                                                                                                                                                               |
| **認証情報を読んで `/api/oauth/usage` を tsukumo が直接呼ぶ** | **要承認のため採らない（提案だけ）。** Keychain か `~/.claude/.credentials.json` から OAuth のトークンを読むことになり、認証情報の扱い（CLAUDE.md「タスク運用」の IMPORTANT）に当たる。口も文書化されていない。上の SDK の口が同じ値を返すので、これを採る理由がいまは無い |

## 論点2. 再読み込みのボタン

**押すと上の口を呼び直す**（最後に届いた知らせを出し直すのではない）。本体の60秒の控えがあるので、
連打しても claude.ai の口へは60秒に1回までしか行かない。tsukumo 側で間引く仕組みは足さない。

取り直す契機はコンテキストの行に揃える: **開いたとき・ターンが終わるたび**（ターンが終わった回数
`state.finishedTurnCount` を合図にする。`browser/domain/context-usage.ts` の内訳と同じ合図）、
**加えて再読み込みのボタン**。ターンの途中と、何もしていない間は取り直さない（時計で回すと、
何もしていない tsukumo が本体に口を叩かせ続けるため）。

**戻る時刻を過ぎた枠も、取り直すまで取ったときの値のまま出す。** 戻ったかどうかは tsukumo からは
分からない（入力欄の「利用上限に達した」が次の知らせまで残るのと同じ）。取った時刻を添えて、古さを
読めるようにする。

経路はコンテキストの内訳と同じ形になる:

| 段                                          | コンテキストの内訳（いま）        | 利用枠（足すもの）                          |
| ------------------------------------------- | --------------------------------- | ------------------------------------------- |
| SDK に問い合わせて写す（`sdk-` のアダプタ） | `sdk-context-usage.ts`            | `sdk-plan-usage.ts`（仮）                   |
| 駆動の口（`SessionDriver`）                 | `readContextUsage`                | `readPlanUsage`（偽の駆動は固定の値を返す） |
| セッションの持ち主                          | `SessionManager.readContextUsage` | `SessionManager.readPlanUsage`              |
| 手続き（`shared/contract/` と `adapter/`）  | `contextUsage.report`             | `planUsage.report`（仮）                    |
| ブラウザの取得                              | `useContextUsage(refetchKey)`     | `usePlanUsage(refetchKey)` と `refetch`     |
| 画面                                        | `context-usage-row.tsx`           | その下の札（新しいファイル）                |

配るのは5時間枠と週の枠（`five_hour` / `seven_day`）の使用率と戻る時刻、取った時刻だけにする。
`session`・`subscription_type`・`extra_usage`・`model_scoped` は運ばない（画面が要らない。
`model_scoped` の名前はサーバが決める自由な語で、出す理由がいまは無い）。

## 論点3. 「利用上限に達した」の置き場所

**入力欄の経過時間の行に残す。** 消すのは「利用上限が近い」（`warning`）だけ。

- `rejected` は「いま送っても通らない」で、送る手の目の前に要る。サイドバーは狭い画面で
  隠れる（`docs/requirements.md` 4.7）が、入力欄の行はいつも見えている
- `warning` は「近い」を知らせるだけで、サイドバーの割合が同じことをもっと細かく言う
- ユーザーの指示が消すと言ったのは「利用上限が近い」だけ

`warning` は画面の読み手が居なくなるので、**`RateLimit` から `warning` を外し、
`allowed_warning` は `clear` に畳む**（読まれない状態を持ち回らない）。

サイドバーの札には**警告の色を付けない**（割合の数字が言う。境目を tsukumo が決めると
本体の判断とずれる。本体の境目は見出しの `surpassed-threshold` で、`get_usage` は運ばない）。

## 見直す条件

- SDK の版を上げて口の名前か形が変わったとき（`typecheck` か zod の検証が落ちる）。
  安定した名前になったら付け替える
- `rate_limit_info.unifiedWindows` が公開の型に載ったとき。知らせで押してくる形に変えられる
  （取りに行く口を呼ばずに済む）

## 参照

- `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` — `Query.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET`、
  `SDKControlGetUsageRequest`、`SDKControlGetUsageResponse`、`SDKRateLimitInfo`、`SDKUsageReport`
- 同梱の本体（`@anthropic-ai/claude-agent-sdk-darwin-arm64` の `claude`）の文字列 — `get_usage` の処理、
  `/api/oauth/usage` の取得、60秒と1時間の控え、`rate_limit_info` のスキーマ（`unifiedWindows` の説明）
- `src/server/session-driver/adapter/sdk-context-usage.ts` — 同じ形の問い合わせの前例
