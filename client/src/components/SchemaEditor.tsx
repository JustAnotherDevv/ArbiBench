import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import type { UISchema } from "@/types/schema";

interface SchemaEditorProps {
  schema: UISchema;
  onChange: (schema: UISchema) => void;
}

export function SchemaEditor({ schema, onChange }: SchemaEditorProps) {
  const [text, setText] = useState(JSON.stringify(schema, null, 2));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(JSON.stringify(schema, null, 2));
  }, [schema]);

  const handleBlur = () => {
    try {
      const parsed = JSON.parse(text) as UISchema;
      if (!parsed.layout) {
        setError("Missing 'layout' field");
        return;
      }
      setError(null);
      onChange(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid JSON");
    }
  };

  const handleFormat = () => {
    try {
      const parsed = JSON.parse(text);
      setText(JSON.stringify(parsed, null, 2));
      setError(null);
    } catch {
      // keep current text if invalid
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">JSON Schema</span>
        <Button variant="ghost" size="sm" onClick={handleFormat}>
          Format
        </Button>
      </div>
      <div
        className={`rounded-lg border ${error ? "border-destructive" : "border-border"} bg-background`}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={handleBlur}
          className="w-full min-h-[500px] bg-transparent p-4 font-mono text-sm leading-relaxed text-foreground resize-y focus:outline-none"
          spellCheck={false}
        />
      </div>
      {error && (
        <p className="text-xs text-destructive-foreground">{error}</p>
      )}
    </div>
  );
}
