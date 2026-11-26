# 自動判定の拒否を画面の許可へ回せるかの実機の確認（2026-11-26）

ステータス: 調査（実機で確かめた結果の記録）。
責務: auto mode の分類器に拒否されたとき、拒否を拾い、画面の許可（`canUseTool`）へ回して実行まで進められるかを、Agent SDK の試作で確かめた結果を持つ。
読む時: 拒否を画面のお願いに変える設計（案A）と、拒否のあとの振る舞いの規則（案B）を決めるとき。
直す時: SDK を上げて挙動が変わったとき、確かめられなかった項目（下の「未確認」）を確かめたとき。

使い捨ての試作（`/tmp` の下の node スクリプト）は確かめたあとに残していない。会話の実物は写さず、欄の有無と型と架空の値だけを書く。環境は Agent SDK 0.3.332、`permissionMode: "auto"`、`settingSources: []`、`cwd` は `/tmp` の下の空のディレクトリ。

## 拒ませ方

PreToolUse フックで `updatedInput` だけを返し（`permissionDecision` は付けない）、分類器が見たあとに入力を書き換える。auto mode は「フックが審査のあとに入力を変えた」として拒む。

- Write は、`cwd` の外のファイルへの書き込みで確実に拒まれた（試した6回すべて）。`cwd` の中への Write は、内容を書き換えても拒まれなかった（分類器を通らずに許可される）
- Bash は、`curl`・`git init`・`git status`・`touch` の書き換えで拒まれなかった。分類器を通らずに許可される形（読み取りに近い命令・既知の安全な命令）では書き換えが通る。Bash の拒否を試作で起こす条件は確かめきれていない

## 結果

| 確かめたこと                                                               | 打った手                                                                                                                     | 結果                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) 拒否で `system` / `permission_denied` が流れるか                       | `cwd` の外への Write を、書き換えるフックで拒ませた                                                                          | **流れた**。欄は `tool_name`（`"Write"`）・`tool_use_id`・`decision_reason_type`（`"classifier"`）・`decision_reason`（`"Classifier unavailable"`）・`message`・`uuid`・`session_id`。`agent_id` は主の呼び出しでは無い                                                                                                                                                    |
| (a) `message` の中身                                                       | 同上                                                                                                                         | モデルへ返す `tool_result` と同じ文。「分類器は判定を返さなかった。フックが審査のあとに入力を変えたため。危険と判断したわけではない」と、書き換え後の入力そのもの、「次の応答で同じ入力でもう一度呼べ」という指示を含む。**書き換え後の入力（ファイルの中身を含みうる）が入る**ので、そのまま記録・ログへ写さない                                                          |
| (a) サブエージェントの中の拒否でも流れるか                                 | サブエージェント（Write だけ持つ）に Write を打たせ、同じフックで拒ませた                                                    | **流れた**。`agent_id` に架空の ID 文字列が入る。`PermissionDenied` フックの入力にも `agent_id`・`agent_type` が入る                                                                                                                                                                                                                                                       |
| (a) `result.permission_denials`                                            | 同上                                                                                                                         | 主の拒否の1件は入る（欄は `tool_name`・`tool_use_id`・`tool_input`）。**サブエージェントの拒否は最初に届いた `result` には入らなかった**（サブエージェントが完了する前に result が届く並びだった。最終の `result` を確かめていないので、正典と言えるかは未確認）                                                                                                           |
| (a) `PermissionDenied` フックが同じ拒否で呼ばれるか                        | 同上                                                                                                                         | **呼ばれた**（主・サブエージェントとも1回ずつ）。入力は `tool_name`・`tool_input`・`tool_use_id`・`reason`（`"Classifier unavailable"`）と共通欄（`session_id`・`transcript_path`・`cwd`・`permission_mode`・`effort`・`prompt_id`）。サブエージェントの分は `agent_id`・`agent_type` も入る                                                                               |
| (b) PreToolUse の `permissionDecision: "ask"` で `canUseTool` が呼ばれるか | 書き換えをやめ、フックが `ask` を返す。Bash・Write・Edit を1回ずつ                                                           | **3つとも呼ばれた**。`canUseTool` に許可を返すと3つとも実行まで進んだ（Edit は Read のあと）。`canUseTool` の第3引数の欄は `signal`・`suggestions`・`blockedPath`・`decisionReason`・`decisionReasonType`・`title`・`displayName`・`description`・`defaultToNo`・`suppressAlwaysAllowRule`・`toolUseID`・`agentID`・`requestId`。分類器が `ask` を覆して通した例は無かった |
| (c) 拒否のあとの同じ入力の打ち直しが `canUseTool` 経由で許可・実行できるか | 1回目の Write は書き換えで拒ませ、2回目以降はフックが `ask` を返す。モデルには「拒否されたら同じ呼び出しをもう一度」と頼んだ | **進んだ**。1回目は `permission_denied` で拒否、モデルが同じ入力で打ち直し（2回目）、フックが `ask`、`canUseTool` が呼ばれ、許可で実行まで進んでファイルができた。2回実施して同じ                                                                                                                                                                                          |
| (c) `retry: true` の要否                                                   | `PermissionDenied` フックが `{ hookEventName: "PermissionDenied", retry: true }` を返す回と、返さない回を比べた              | **どちらも同じ流れ**。返さなくても、モデルは `message` の指示に従って自分で打ち直した。`retry: true` を返しても、SDK が自動で再試行する挙動は見えず、`tool_result` は同じ拒否のエラーだった。要否は、モデルが打ち直さない場合の保険としてしか確かめられていない                                                                                                            |

サブエージェントの中の打ち直しは、書き換えるフックを掛けたままの3回目で通った（フックは再び書き換えたが、拒否されなかった）。書き換えが審査の入力と食い違わない場合（空白の追加のみ・同じ書き換えの繰り返し）の判定は未確認。

## 案A の経路は成り立つか

「拒否 → 画面で一度だけ許可 → 同じ入力で再試行 → PreToolUse フックが `ask` を返して `canUseTool` に回し、そこで許可」は、**Write で成り立つ**。Bash・Edit は、フックの `ask` が `canUseTool` に届くところまでは確かめた。Bash の拒否そのものは試作で再現できず、拒否のあとの打ち直しは未確認。

要点:

- 拒否は `system` / `permission_denied` で拾える。ただし型の説明どおり best-effort で、PreToolUse フックの deny・パス規則の deny は流れない。`tool_use_id` で `tool_result`（`is_error`）と突き合わせると確かな合図になる
- 拾った拒否を画面の許可に回すには、(1) 拒否を拾い `tool_name`・`tool_use_id`・`agent_id` を持つ「許可待ち」を画面に出す、(2) 利用者が許可したら、次に同じ `tool_name` と同じ入力が来たとき PreToolUse フックが `ask` を返す印（一度きりの許可札）を持つ、(3) モデルに「同じ入力で打ち直す」を伝える、の3つが要る
- (3) は、`message` に打ち直しの指示がもとから入っていて、モデルは頼まなくても従った。画面で許可したことを知らせる手は別に要る（モデルは拒否の理由しか知らない）。許可の知らせは、ユーザー発言の差し込みか、次の `tool_result` の文でしか届けられない
- 同じ入力かを見る鍵は、`tool_name` と `tool_input` の正規化形（拒否の `tool_input` は `permission_denials` と `PermissionDenied` フックの入力にある。`permission_denied` メッセージ自体には `tool_input` が無い）

## 成り立たない部分の代わりの経路

- `permission_denied` に `tool_input` が無い。入力は `PermissionDenied` フック（`tool_input` を持つ）か、直前の `assistant` の `tool_use`（`tool_use_id` で突き合わせ）から取る。`PermissionDenied` フックのほうが確かな出どころ
- 拒否の取りこぼしは `result.permission_denials` で埋められるが、サブエージェントの拒否が入るかは未確認。サブエージェント分はフックと `permission_denied` の `agent_id` で拾う
- `retry: true` は要らない。モデルが自分で打ち直す
- Bash を拒ませて確かめる手は、試作の書き換えでは見つからなかった。Bash の分類器の拒否は、tsukumo の実際の会話で現れたものを `permission_denied` で拾って確かめるのが近道

## 後段へ

- 案A（拒否を画面のお願いに変える）: 起点は `permission_denied` の `system` メッセージ（`sdk-message.ts` に subtype を足す）と `PermissionDenied` フック。`message` は書き換え後の入力を含むので、そのまま画面・ログへ出さず、`tool_name` と画面に要る欄だけを写す。一度きりの許可札で PreToolUse フックが `ask` を返す。`agent_id` を許可待ちに持たせる
- 案B（拒否のあとの振る舞いの規則）: モデルは `message` の指示で自分から打ち直す。規則は「拒否を見たら、理由をそのまま利用者に伝え、画面の許可の知らせがあるまで別の手を探さない」といった、打ち直しを待つ側に置ける。書き換えの拒否（フックが入力を変えた）と、分類器が危険と判断した拒否は文面で区別できる（前者は「危険と判断したわけではない」を含む）

## 未確認

- Bash・Edit の分類器の拒否のあとの打ち直し（Bash は拒否が再現しなかった。Edit は拒否を試していない）
- 分類器が実際に「危険」と判断して拒んだ場合（`decision_reason_type: "classifier"` で `decision_reason` が理由文になる場合）の欄の中身と、フックの `ask` が同じ入力でその拒否を覆すか。`~/.claude/cache/changelog.md` の記述は、サンドボックスの外の Bash を対象にしている
- 最終の `result.permission_denials` にサブエージェントの拒否が入るか
- 利用者が許可したと知らせる手の効き目（モデルの打ち直しの確実さ）
