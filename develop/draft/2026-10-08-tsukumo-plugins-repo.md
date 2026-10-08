# タスク運用のワークフローを専用のリポジトリ tsukumo-plugins へ切り出す

- 根拠: 2026-10-08 の利用者の決定。プラグインを単独で使いたい人に tsukumo を丸ごと取らせるのは手間なので、専用のリポジトリ `tsukumo-plugins` に切り出す。いま一式は claude-skills にある。中身は、スキルの task-workflow・next-task・plan-tasks・list-tasks・setup-tasks・retrospect・retro、Python の CLI `tw`、agent の `no-delegate`・`reviewer`、hook の `tw commit-guard`・`tw handback-guard` など。task-workflow はファイル方式（`.tw/`）と Beads 方式の両方を持っている
- 出し先: `sinnlosses/tsukumo-plugins` を作り、上の一式を Claude Code のプラグインとして移す（GitHub にリポジトリを作るのは外への公開なので、着手する前に利用者の承認を得る）。ファイル方式は削って Beads 方式だけにする。プラグインの中で tsukumo がいる前提を置かず、tsukumo の口はツール一覧にあるときだけ使う。素の Claude Code にマーケットプレイスから入れて単独で動くことを確かめる（`/plugin marketplace add` で git のリポジトリから入れられる、という前提は一次情報で確かめてから書く）。使用量の見直しのスキル `token-usage-diet`（いまは tsukumo の `plugin/skills/`）も移すかどうかを、このとき決める
- 先に済むもの: 2026-10-08-workflow-contract-adr
