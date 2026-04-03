export interface UISchemaNode {
  type:
    | "card"
    | "row"
    | "column"
    | "heading"
    | "text"
    | "input"
    | "textarea"
    | "button"
    | "select"
    | "badge"
    | "separator"
    | "label"
    | "stat"
    | "list"
    | "chat";
  props?: Record<string, unknown>;
  children?: UISchemaNode[];
  content?: string;
  name?: string;
  options?: string[];
  /** stat/list: which ABI function to auto-call on mount and after each write */
  functionName?: string;
  /** stat/list: maps ABI param names to values; use "__walletAddress__" for connected wallet */
  paramMapping?: Record<string, string>;
  /** stat: display label shown above the value */
  label?: string;
  /** list: template node rendered for each item; supports {{value}} and {{index}} tokens */
  itemTemplate?: UISchemaNode;
  /** list: message shown when the array result is empty */
  emptyMessage?: string;
  /** chat: zero-arg view function that returns uint256 total item count */
  countFunctionName?: string;
  /** chat: view function(uint256 index) that returns a single item */
  itemFunctionName?: string;
  /** chat: write/payable function to post a new item */
  postFunctionName?: string;
  /** chat: ABI param name for the message content on postFunctionName */
  postParamName?: string;
  /** chat: ETH to send per post, e.g. "0.0001". Omit or "0" if not payable. */
  postPayableAmount?: string;
  /** chat/input: placeholder text */
  placeholder?: string;
}

export interface UISchema {
  title: string;
  description: string;
  layout: UISchemaNode;
}

export interface GenerateResponse {
  contractCode: string;
  cargoToml: string;
  uiSchema: UISchema;
  abi: AbiItem[];
}

export interface AbiParam {
  name: string;
  type: string;
}

export interface AbiItem {
  type: "function" | "event" | "error";
  name: string;
  inputs: AbiParam[];
  outputs: AbiParam[];
  stateMutability: "view" | "pure" | "nonpayable" | "payable";
}

export interface App {
  id: string;
  name: string;
  description: string;
  contractCode: string;
  cargoToml: string;
  uiSchema: UISchema;
  abi: AbiItem[];
  owner: string;
  status: "draft" | "deploying" | "deployed" | "failed" | "building";
  deployedAddress?: string;
  txHash?: string;
  error?: string;
  tags?: string[];
  logoUrl?: string;
  websiteUrl?: string;
  published?: boolean;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type AgentEvent =
  | { type: "thinking"; message: string }
  | {
      type: "code_update";
      contractCode: string;
      cargoToml: string;
      uiSchema: UISchema;
      abi: AbiItem[];
    }
  | { type: "build_start"; attempt: number }
  | { type: "build_log"; line: string }
  | { type: "build_error"; errors: string; attempt: number }
  | { type: "build_success" }
  | { type: "fix_start"; attempt: number }
  | { type: "app_saved"; app: App }
  | { type: "error"; message: string }
  | { type: "done" };
