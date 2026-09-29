# 進行中カードの ID の見た目（字の大きさと差し色寄りの色）が T-607 から効いていないのを直す（振り返り: GH-93）

- 札: 黄 実装の誤り（3回目）
- 根拠: `task-board.module.css` の `.task-running-head .task-id-button` は、T-607（39418f6a）で `task-running-card.tsx` の `task-running-head` の span を HStack（`className=""`）に置き換えたときに、祖先の class を失って当たらなくなった。GH-93 の委譲先はこれを未使用の規則として消そうとしたが、受け入れで戻した（見た目の退行の手がかりなので、消さずに残す）
- 出し先: 仕組みで塞ぐ。CSS モジュールの class 名がどの tsx からも参照されていなければ落ちる検査を `test/architecture.test.ts` に足す（rehype や CodeMirror が付ける class は許可リストで除く）。そのうえで、進行中カードの ID に規則が再び当たるようにする（HStack に class を渡すか、規則を `.task-running-card .task-id-button` に付け替える）。目視で差し色寄りの ID を確かめる
