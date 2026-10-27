# コーディング規約: 外へ送る操作の承認

ステータス: **正典**。入口は `docs/coding-standards.md`（規約の理由と例外の入口と、子のファイルの一覧）。

責務: 承認が要る外部への操作の一覧と、hook が見分ける形を持つ。
読む時: `gh`・`git push` など外へ送るコマンドを打つ・委譲先に渡すとき、外へ送る操作を見る hook を足す・直すとき。
直す時: 承認が要る操作・その例外・hook が見分ける形を変えたとき。

## 承認が要る外部への操作

次の操作は、人の承認を得てから打つ。承認の範囲と例外の正典は `AGENTS.md`「承認が要ること」で、ここはその中の外部への送信を、打つコマンドの形に開いた一覧。

| 操作                           | 例                                                                                                                                                                                                                                                                                                           | 承認の例外                                                 | hook が見分けるか                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| GitHub への書き込み            | `gh` の群 `issue`・`pr`・`label`・`release`・`repo`・`gist`・`project`・`secret`・`variable`・`workflow`・`run`・`cache`・`ssh-key`・`gpg-key` で、動詞が `list`・`view`・`status`・`diff`・`checks`・`search`・`download`・`watch`・`clone`・`checkout` 以外のもの（`gh issue create`・`gh pr merge` など） | `tw` が行う書き込み（`AGENTS.md`「承認が要ること」の括弧） | サブエージェントの呼び出しで、`deny-external-send` が規則 `gh-write` として log-only で記録する     |
| `gh api` の書き込みの形        | `-X`/`--method` の値が GET 以外、方法の指定が無く `-f`/`-F`/`--field`/`--raw-field`/`--input` がある（gh が POST にする）、`graphql` で `mutation` を送る                                                                                                                                                    | 同上                                                       | サブエージェントの呼び出しで、`deny-external-send` が規則 `gh-api-write` として log-only で記録する |
| `git push`                     | `git push`・`git -C <dir> push origin main`（`--dry-run`/`-n` は送らないので外れる）                                                                                                                                                                                                                         | なし（`tw ship`・`pnpm run ship` は push しない）          | サブエージェントの呼び出しで、`deny-external-send` が規則 `git-push` として log-only で記録する     |
| パッケージ・成果物の公開       | `npm publish`・`pnpm publish` など                                                                                                                                                                                                                                                                           | なし                                                       | 見ない                                                                                              |
| そのほかの外部サービスへの送信 | `curl -X POST` など、外のサービスへ中身を送るもの                                                                                                                                                                                                                                                            | なし                                                       | 見ない                                                                                              |

`gh auth`・`gh config` のように上の群に無いものは外への送信ではない。認証情報や設定の変更は `AGENTS.md`「承認が要ること」の別の項で承認が要る。

## 調べものの委譲先

外部の入力を読む委譲先（調べもの）に、外へ送る操作を持たせない。
ただし hook の入力で調べものの委譲先だけを見分ける値は無い。research スキルは委譲先の種類を名指さないので、`agent_type` はほかの委譲先と同じになる。
そこで、サブエージェントの呼び出し（hook の入力に `agent_id` があるもの）すべてに掛け、主のセッションには掛けない。

- 判定は `scripts/hook/lib/external-send.ts` の `findExternalSendDenial` で、bash-guard が束ねる hook `deny-external-send` として動く
- `gh api graphql` は、`mutation` を送るときに加え、`--input` か `@` で始まる値で中身が読めないときも書き込みと見る
- いまは log-only で、当たっても止めず `hook-denials/` に記録だけ残す
- block か、人の承認に回す形に上げるかは、`docs/coding-standards/hook-rollout.md` の手順で記録を再生したあとに利用者へ聞く

Web を読む WebFetch も、同じくサブエージェントの呼び出しだけに、読むホストを許可リストと照らす hook を掛ける。WebSearch は入力に URL を持たないので掛けない。

- 判定は `scripts/hook/lib/web-fetch-host.ts` の `findWebFetchHostDenial` で、単独の入口 `scripts/hook/deny-web-fetch-host.ts`（`.claude/settings.json` の `PreToolUse` の `WebFetch` の matcher）が hook `deny-web-fetch-host` として動く
- 許可リストは同じファイルの定数 `ALLOWED_FETCH_HOSTS` で、`docs/` が引く URL のうち引用が 5 回以上あるホストから作る。ホストが項目と一致するか、項目のサブドメインなら通す
- `http`・`https` 以外の URL と読めない URL は記録せず通す
- いまは log-only で、許可リストの外のホストを規則 `host-outside-allowlist` として記録だけ残す。URL とホスト名は記録に入れないので、誤検知はその時刻の前後の作業を人が見て当てる
