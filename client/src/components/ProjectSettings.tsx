import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Save, X, Plus, Globe, Image } from "lucide-react";
import { cn } from "@/lib/utils";
import type { App } from "@/types/schema";

interface ProjectSettingsProps {
  app: App;
  isOwner: boolean;
  onSave: (patch: Partial<Pick<App, "name" | "description" | "tags" | "logoUrl" | "websiteUrl">>) => Promise<void>;
}

export function ProjectSettings({ app, isOwner, onSave }: ProjectSettingsProps) {
  const [name, setName] = useState(app.name);
  const [description, setDescription] = useState(app.description);
  const [tags, setTags] = useState<string[]>(app.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [logoUrl, setLogoUrl] = useState(app.logoUrl ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(app.websiteUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Sync if app changes externally
  useEffect(() => {
    setName(app.name);
    setDescription(app.description);
    setTags(app.tags ?? []);
    setLogoUrl(app.logoUrl ?? "");
    setWebsiteUrl(app.websiteUrl ?? "");
  }, [app.id]);

  const dirty =
    name !== app.name ||
    description !== app.description ||
    JSON.stringify(tags) !== JSON.stringify(app.tags ?? []) ||
    logoUrl !== (app.logoUrl ?? "") ||
    websiteUrl !== (app.websiteUrl ?? "");

  const addTag = () => {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, "-");
    if (t && !tags.includes(t) && tags.length < 10) {
      setTags([...tags, t]);
    }
    setTagInput("");
  };

  const removeTag = (tag: string) => setTags(tags.filter((t) => t !== tag));

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        name: name.trim() || app.name,
        description,
        tags,
        logoUrl: logoUrl.trim() || undefined,
        websiteUrl: websiteUrl.trim() || undefined,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto px-6 py-8 space-y-7">
      <div>
        <h3 className="text-sm font-semibold mb-0.5">Project Settings</h3>
        <p className="text-xs text-muted-foreground">Metadata stored on the server alongside your contract.</p>
      </div>

      {/* Name */}
      <div className="space-y-1.5">
        <Label className="text-xs">Project name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!isOwner}
          placeholder="My dApp"
          className="h-8 text-sm"
        />
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label className="text-xs">Description</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={!isOwner}
          placeholder="What does this contract do?"
          className="text-sm resize-none min-h-[80px]"
        />
      </div>

      {/* Tags */}
      <div className="space-y-1.5">
        <Label className="text-xs">Tags <span className="text-muted-foreground/60">(up to 10)</span></Label>
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1 text-xs pr-1">
              {tag}
              {isOwner && (
                <button onClick={() => removeTag(tag)} className="hover:text-destructive transition-colors">
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </Badge>
          ))}
        </div>
        {isOwner && tags.length < 10 && (
          <div className="flex gap-2">
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              placeholder="nft, defi, token… (Enter to add)"
              className="h-8 text-sm flex-1"
            />
            <Button size="sm" variant="outline" onClick={addTag} className="h-8 w-8 p-0">
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Logo URL */}
      <div className="space-y-1.5">
        <Label className="text-xs flex items-center gap-1.5">
          <Image className="h-3 w-3" />
          Logo URL <span className="text-muted-foreground/60">(optional)</span>
        </Label>
        <div className="flex gap-2 items-start">
          {logoUrl && (
            <img
              src={logoUrl}
              alt="Logo"
              className="h-8 w-8 rounded-md object-cover border border-border/60 shrink-0"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          )}
          <Input
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            disabled={!isOwner}
            placeholder="https://example.com/logo.png"
            className="h-8 text-sm"
          />
        </div>
      </div>

      {/* Website URL */}
      <div className="space-y-1.5">
        <Label className="text-xs flex items-center gap-1.5">
          <Globe className="h-3 w-3" />
          Website <span className="text-muted-foreground/60">(optional)</span>
        </Label>
        <Input
          value={websiteUrl}
          onChange={(e) => setWebsiteUrl(e.target.value)}
          disabled={!isOwner}
          placeholder="https://myproject.xyz"
          className="h-8 text-sm"
        />
      </div>

      {/* Info row */}
      <div className="rounded-lg border border-border/40 bg-muted/20 px-3.5 py-2.5 space-y-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>App ID</span>
          <span className="font-mono">{app.id}</span>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Owner</span>
          <span className="font-mono">{app.owner.slice(0, 6)}…{app.owner.slice(-4)}</span>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Status</span>
          <Badge
            variant={app.status === "deployed" ? "default" : app.status === "failed" ? "destructive" : "secondary"}
            className="text-[10px] h-4"
          >
            {app.status}
          </Badge>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Created</span>
          <span>{new Date(app.createdAt).toLocaleDateString()}</span>
        </div>
      </div>

      {/* Save */}
      {isOwner && (
        <Button
          onClick={handleSave}
          disabled={!dirty || saving}
          className={cn("w-full gap-2", saved && "border-green-500/40 text-green-400")}
          variant={saved ? "outline" : "default"}
          size="sm"
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? "Saving…" : saved ? "Saved!" : "Save settings"}
        </Button>
      )}
    </div>
  );
}
