import type { UISchema, UISchemaNode } from "@/types/schema";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";

function renderNode(node: UISchemaNode, index: number): React.ReactNode {
  const key = `${node.type}-${index}`;
  const className = (node.props?.className as string) ?? "";

  switch (node.type) {
    case "card":
      return (
        <Card key={key} className={className}>
          <CardContent className="pt-6">
            {node.children?.map((child, i) => renderNode(child, i))}
          </CardContent>
        </Card>
      );

    case "row":
      return (
        <div key={key} className={cn("flex flex-row gap-4", className)}>
          {node.children?.map((child, i) => renderNode(child, i))}
        </div>
      );

    case "column":
      return (
        <div key={key} className={cn("flex flex-col gap-3", className)}>
          {node.children?.map((child, i) => renderNode(child, i))}
        </div>
      );

    case "heading": {
      const level = (node.props?.level as number) ?? 2;
      const sizes: Record<number, string> = {
        1: "text-3xl font-bold",
        2: "text-2xl font-semibold",
        3: "text-xl font-semibold",
        4: "text-lg font-medium",
      };
      const headingClass = cn(sizes[level] ?? sizes[2], className);
      if (level === 1) return <h1 key={key} className={headingClass}>{node.content}</h1>;
      if (level === 3) return <h3 key={key} className={headingClass}>{node.content}</h3>;
      if (level === 4) return <h4 key={key} className={headingClass}>{node.content}</h4>;
      return <h2 key={key} className={headingClass}>{node.content}</h2>;
    }

    case "text":
      return (
        <p key={key} className={cn("text-muted-foreground", className)}>
          {node.content}
        </p>
      );

    case "input":
      return (
        <Input
          key={key}
          type={(node.props?.type as string) ?? "text"}
          placeholder={(node.props?.placeholder as string) ?? ""}
          className={className}
        />
      );

    case "textarea":
      return (
        <Textarea
          key={key}
          placeholder={(node.props?.placeholder as string) ?? ""}
          className={className}
        />
      );

    case "button":
      return (
        <Button
          key={key}
          variant={
            (node.props?.variant as
              | "default"
              | "secondary"
              | "destructive"
              | "outline") ?? "default"
          }
          className={className}
        >
          {node.content}
        </Button>
      );

    case "select":
      return (
        <Select key={key}>
          <SelectTrigger className={className}>
            <SelectValue
              placeholder={(node.props?.placeholder as string) ?? "Select..."}
            />
          </SelectTrigger>
          <SelectContent>
            {node.options?.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case "badge":
      return (
        <Badge
          key={key}
          variant={
            (node.props?.variant as
              | "default"
              | "secondary"
              | "destructive"
              | "outline") ?? "default"
          }
          className={cn("w-fit", className)}
        >
          {node.content}
        </Badge>
      );

    case "separator":
      return <Separator key={key} className={className} />;

    case "label":
      return (
        <Label key={key} className={className}>
          {node.content}
        </Label>
      );

    default:
      return null;
  }
}

interface DynamicRendererProps {
  schema: UISchema;
}

export function DynamicRenderer({ schema }: DynamicRendererProps) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold">{schema.title}</h2>
        <p className="text-sm text-muted-foreground">{schema.description}</p>
      </div>
      <div className="rounded-lg border border-border bg-card/50 p-6">
        {renderNode(schema.layout, 0)}
      </div>
    </div>
  );
}
