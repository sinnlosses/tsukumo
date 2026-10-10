**配線で駆動のイベントを見る口に、閉じた代のイベントが届かないようにする（振り返り: GH-575）**

- 観点: 赤 仕組みの穴
- 根拠: GH-575 で `src/wiring/session-launch.ts` の `startDriver` の `watched` に足した名乗りの更新が、閉じた代の駆動から後で届く `session-ended` も受けていた。`createSessionManager` 側は `receiveIfCurrent` で古い代を捨てているが、配線で `onEvent` の前に挟む見張り（`options.onLaunch` の返す口・名乗り）は代で絞られず、各見張りが自前で代の印を持つ必要がある。委譲先は計画でも実装でも気づかず、レビューで見つかった（続きの名乗りと予約が消え、2重の `resume` を防ぐ守りに穴が空く形）。見張りを足すたびに同じ穴が開く
- 出し先: タスクにする（difficulty は sonnet）。配線の `startDriver` が受け取る `onEvent` の段で代を絞り、`watched` に足す見張りが閉じた代のイベントを受けない形にする（`session-claim.ts` の代の印はそれで要らなくなるかを見る）。`welcomeGreeting.noteLaunched` の口が古い代のイベントで崩れないかも確かめる
