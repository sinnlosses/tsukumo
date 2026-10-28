// A2UI の基本カタログから取る 5 部品（配置と選択）の JSON Schema。
// `@a2ui/web_core` の基本カタログの公開物を、次の 3 点だけ変えて写している。
// 共有層は `@a2ui/*` を読めないので定数で持ち、公開物との一致はブラウザ側のテストが確かめる。
// - 共通型の参照を絶対 URL から相対の `common_types.json#` にする
// - 部品直下の `DynamicString`・`DynamicStringList` を、リテラルと `{path}` だけの定義に替える
// - `ChoicePicker` の `Checkable`（関数を要する `checks`）の参照を外す

const COMMON = [
  { $ref: "common_types.json#/$defs/ComponentCommon" },
  { $ref: "#/$defs/CatalogComponentCommon" },
] as const

const MAIN_AXIS_ENUM = [
  "start",
  "center",
  "end",
  "spaceBetween",
  "spaceAround",
  "spaceEvenly",
  "stretch",
] as const

export const BASIC_PART_DEFS = {
  CatalogComponentCommon: {
    type: "object",
    properties: {
      weight: {
        type: "number",
        description:
          "The relative weight of this component within a Row or Column. This is similar to the CSS 'flex-grow' property. Note: this may ONLY be set when the component is a direct descendant of a Row or Column.",
      },
    },
  },
  LiteralOrPathString: {
    description: "Represents a string",
    oneOf: [{ type: "string" }, { $ref: "common_types.json#/$defs/DataBinding" }],
  },
  LiteralOrPathStringList: {
    description:
      "Represents a value that can be either a literal array of strings or a path to a string array in the data model.",
    oneOf: [
      { type: "array", items: { type: "string" } },
      { $ref: "common_types.json#/$defs/DataBinding" },
    ],
  },
} as const

export const BASIC_PARTS = {
  Row: {
    type: "object",
    allOf: [
      ...COMMON,
      {
        type: "object",
        description:
          "A layout component that arranges its children horizontally. To create a grid layout, nest Columns within this Row.",
        properties: {
          component: { const: "Row" },
          children: {
            description:
              "Defines the children. Use an array of strings for a fixed set of children, or a template object to generate children from a data list. Children cannot be defined inline, they must be referred to by ID.",
            $ref: "common_types.json#/$defs/ChildList",
          },
          justify: {
            type: "string",
            description:
              "Defines the arrangement of children along the main axis (horizontally). Use 'spaceBetween' to push items to the edges, or 'start'/'end'/'center' to pack them together.",
            enum: [
              "center",
              "end",
              "spaceAround",
              "spaceBetween",
              "spaceEvenly",
              "start",
              "stretch",
            ],
            default: "start",
          },
          align: {
            type: "string",
            description:
              "Defines the alignment of children along the cross axis (vertically). This is similar to the CSS 'align-items' property, but uses camelCase values (e.g., 'start').",
            enum: ["start", "center", "end", "stretch"],
            default: "stretch",
          },
        },
        required: ["component", "children"],
      },
    ],
    unevaluatedProperties: false,
  },
  Column: {
    type: "object",
    allOf: [
      ...COMMON,
      {
        type: "object",
        description:
          "A layout component that arranges its children vertically. To create a grid layout, nest Rows within this Column.",
        properties: {
          component: { const: "Column" },
          children: {
            description:
              "Defines the children. Use an array of strings for a fixed set of children, or a template object to generate children from a data list. Children cannot be defined inline, they must be referred to by ID.",
            $ref: "common_types.json#/$defs/ChildList",
          },
          justify: {
            type: "string",
            description:
              "Defines the arrangement of children along the main axis (vertically). Use 'spaceBetween' to push items to the edges (e.g. header at top, footer at bottom), or 'start'/'end'/'center' to pack them together.",
            enum: MAIN_AXIS_ENUM,
            default: "start",
          },
          align: {
            type: "string",
            description:
              "Defines the alignment of children along the cross axis (horizontally). This is similar to the CSS 'align-items' property.",
            enum: ["center", "end", "start", "stretch"],
            default: "stretch",
          },
        },
        required: ["component", "children"],
      },
    ],
    unevaluatedProperties: false,
  },
  Card: {
    type: "object",
    allOf: [
      ...COMMON,
      {
        type: "object",
        properties: {
          component: { const: "Card" },
          child: {
            $ref: "common_types.json#/$defs/ComponentId",
            description:
              "The ID of the single child component to be rendered inside the card. To display multiple elements, you MUST wrap them in a layout component (like Column or Row) and pass that container's ID here. Do NOT pass multiple IDs or a non-existent ID.",
          },
        },
        required: ["component", "child"],
      },
    ],
    unevaluatedProperties: false,
  },
  Tabs: {
    type: "object",
    allOf: [
      ...COMMON,
      {
        type: "object",
        properties: {
          component: { const: "Tabs" },
          tabs: {
            type: "array",
            description:
              "An array of objects, where each object defines a tab with a title and a child component.",
            minItems: 1,
            items: {
              type: "object",
              properties: {
                title: { description: "The tab title.", $ref: "#/$defs/LiteralOrPathString" },
                child: {
                  $ref: "common_types.json#/$defs/ComponentId",
                  description: "The ID of the child component.",
                },
              },
              required: ["title", "child"],
              additionalProperties: false,
            },
          },
        },
        required: ["component", "tabs"],
      },
    ],
    unevaluatedProperties: false,
  },
  ChoicePicker: {
    type: "object",
    allOf: [
      ...COMMON,
      {
        type: "object",
        description: "A component that allows selecting one or more options from a list.",
        properties: {
          component: { const: "ChoicePicker" },
          label: {
            $ref: "#/$defs/LiteralOrPathString",
            description: "The label for the group of options.",
          },
          variant: {
            type: "string",
            description: "A hint for how the choice picker should be displayed and behave.",
            enum: ["multipleSelection", "mutuallyExclusive"],
            default: "mutuallyExclusive",
          },
          options: {
            type: "array",
            description: "The list of available options to choose from.",
            items: {
              type: "object",
              properties: {
                label: {
                  description: "The text to display for this option.",
                  $ref: "#/$defs/LiteralOrPathString",
                },
                value: {
                  type: "string",
                  description: "The stable value associated with this option.",
                },
              },
              required: ["label", "value"],
              additionalProperties: false,
            },
          },
          value: {
            $ref: "#/$defs/LiteralOrPathStringList",
            description:
              "The list of currently selected values. This should be bound to a string array in the data model.",
          },
          displayStyle: {
            type: "string",
            description: "The display style of the component.",
            enum: ["checkbox", "chips"],
            default: "checkbox",
          },
          filterable: {
            type: "boolean",
            description: "If true, displays a search input to filter the options.",
            default: false,
          },
        },
        required: ["component", "options", "value"],
      },
    ],
    unevaluatedProperties: false,
  },
} as const
