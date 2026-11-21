export const ROWS = [
  ["ぼ", "甲", "10"],
  ["あ", "乙", "9"],
  ["ん", "甲", "100"],
]

export const INTERACTIVE = { sortable: true, filterable: true }

export function reportParts(table: Readonly<Record<string, unknown>>, withPicker = true) {
  return [
    { id: "root", component: "Report", conclusion: ["架空の結論。"], children: ["s1"] },
    {
      id: "s1",
      component: "Section",
      heading: "架空の操作",
      children: withPicker ? ["pick", "t1"] : ["t1"],
    },
    {
      id: "pick",
      component: "ChoicePicker",
      label: "架空の種別",
      options: [
        { label: "甲", value: "甲" },
        { label: "乙", value: "乙" },
        { label: "丙", value: "丙" },
      ],
      value: { path: "/view/t1/filter" },
    },
    {
      id: "t1",
      component: "Table",
      title: "架空の表",
      columns: ["架空の名", "架空の種別", "架空の数"],
      rows: ROWS,
      ...table,
    },
  ].filter((part) => withPicker || part.id !== "pick")
}
