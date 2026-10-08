# ADR 0024 を「ワークフローの契約」の形に書き直し、契約を1か所の文書にする

- 根拠: 2026-10-08 の利用者との議論で境界を改めた。tsukumo は Beads 専用で、ファイル方式には対応しない。tsukumo が定めるのはワークフローの契約（段があり、並列に走る部分があり、パイプラインのように流れることを受ける口）だけ。タスクを段に分けて送り出すワークフロー（next-task・tw・agent・hook）は専用のリポジトリ `tsukumo-plugins` に置く。同梱のものも契約に型の合う1つの例で、Beads などの依存さえ満たせば単独で動く。いまの ADR 0024 の文言「特定のスキルに依存しない」は、この位置づけを言い切れていない。契約も `work_plan`・`report` の説明とシステムプロンプトに散らばっていて、独自のワークフローを当てたい人が合わせる相手が1か所に無い
- 出し先: `docs/architecture/adr/0024-no-skill-dependency.md` を書き直す（新しい ADR を起こして 0024 を置き換える形でもよい）。書くことは3つ。外のスキルの持ち物は読まない。`tsukumo-plugins` も外のものと同じ立場で、core は契約だけを見る。Beads 専用でファイル方式は持たない。あわせて、契約の正典の節を docs に1つ立てる。中身は `work_plan` の `phases`・`current`・`finishedInGroup`、`report.task`・`workPlanClosing`、Beads の組み込みの欄。`docs/requirements.md` と `docs/architecture.md` の該当箇所はその節を指す形に揃える
- 先に済むもの: なし（以下の3件の前提）
