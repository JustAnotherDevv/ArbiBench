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
  contract: string;
  uiSchema: UISchema;
}
