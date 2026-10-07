# 用語集「卒業」の登録日の定義を、Beads の課題を作った日に揃える（振り返り: GH-365）

- 観点: 黄 道案内
- 根拠: `docs/glossary.md`「### 卒業」の定義は「登録日はタスクファイルが初めて `main` に入ったコミットの日付で、新形式（`develop/task/`）で登録したタスクだけが対象」のまま。実装は Beads の課題を作った日を使う（`src/server/achievement/adapter/main-history.ts` の `registeredOnOf`。files 方式は GH-388・GH-389 で消えた）。GH-365 の委譲先が計画の調べで気づいた（friction log）
- 出し先: タスク1件。`docs/glossary.md`「### 卒業」と、そこが引く `docs/requirements.md` 4.11「卒業と節目」の登録日の記述を、Beads の課題を作った日に直す
