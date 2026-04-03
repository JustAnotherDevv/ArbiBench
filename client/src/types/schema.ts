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
    | "label";
  props?: Record<string, unknown>;
  children?: UISchemaNode[];
  content?: string;
  name?: string;
  options?: string[];
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
}

export interface App {
  id: string;
  name: string;
  description: string;
  contractCode: string;
  cargoToml: string;
  uiSchema: UISchema;
  owner: string;
  status: "draft" | "deploying" | "deployed" | "failed";
  deployedAddress?: string;
  txHash?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}
