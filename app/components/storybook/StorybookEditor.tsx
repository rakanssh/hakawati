import React from "react";
import {
  StoryCard,
  StoryCardInput,
  StorybookCategory,
} from "@/types/context.type";
import { CategoryFilter } from "./CategoryFilter";
import { StoryCard as StoryCardComponent } from "./StoryCard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlusIcon } from "lucide-react";

export type StorybookEditorProps = {
  entries: StoryCard[];
  onAdd: (input: StoryCardInput) => void;
  onUpdate: (id: string, update: Partial<StoryCard>) => void;
  onRemove: (id: string) => void;
};

type EntryFormData = {
  title: string;
  content: string;
  triggers: string;
  category: StorybookCategory;
  isPinned: boolean;
};

const CATEGORY_OPTIONS = [
  { value: StorybookCategory.CHARACTER, label: "Character" },
  { value: StorybookCategory.THING, label: "Thing" },
  { value: StorybookCategory.PLACE, label: "Place" },
  { value: StorybookCategory.CONCEPT, label: "Concept" },
  { value: StorybookCategory.UNCATEGORIZED, label: "Uncategorized" },
];

export function StorybookEditor({
  entries,
  onAdd,
  onUpdate,
  onRemove,
}: StorybookEditorProps): React.JSX.Element {
  const [selectedCategory, setSelectedCategory] =
    React.useState<StorybookCategory | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingEntry, setEditingEntry] = React.useState<StoryCard | null>(
    null,
  );
  const [formData, setFormData] = React.useState<EntryFormData>({
    title: "",
    content: "",
    triggers: "",
    category: StorybookCategory.UNCATEGORIZED,
    isPinned: false,
  });

  // Filter entries by selected category
  const filteredEntries = React.useMemo(() => {
    if (!selectedCategory) return entries;
    return entries.filter((entry) => entry.category === selectedCategory);
  }, [entries, selectedCategory]);

  // Organize entries: pinned first, then by category
  const organizedEntries = React.useMemo(() => {
    const pinned = filteredEntries.filter((e) => e.isPinned);
    const unpinned = filteredEntries.filter((e) => !e.isPinned);
    return [...pinned, ...unpinned];
  }, [filteredEntries]);

  const handleOpenDialog = (entry?: StoryCard) => {
    if (entry) {
      setEditingEntry(entry);
      setFormData({
        title: entry.title,
        content: entry.content,
        triggers: entry.triggers.join(", "),
        category: entry.category,
        isPinned: entry.isPinned,
      });
    } else {
      setEditingEntry(null);
      setFormData({
        title: "",
        content: "",
        triggers: "",
        category: StorybookCategory.UNCATEGORIZED,
        isPinned: false,
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingEntry(null);
  };

  const handleSubmit = () => {
    const triggers = formData.triggers
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    if (editingEntry) {
      onUpdate(editingEntry.id, {
        title: formData.title,
        content: formData.content,
        triggers,
        category: formData.category,
        isPinned: formData.isPinned,
      });
    } else {
      onAdd({
        title: formData.title,
        content: formData.content,
        triggers,
        category: formData.category,
        isPinned: formData.isPinned,
      });
    }
    handleCloseDialog();
  };

  const handlePin = (id: string, pinned: boolean) => {
    onUpdate(id, { isPinned: pinned });
  };

  const isFormValid =
    formData.title.trim().length > 0 && formData.content.trim().length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <CategoryFilter
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
        />
        <Button onClick={() => handleOpenDialog()} aria-label="Add entry">
          <PlusIcon />
          <span>Add</span>
        </Button>
      </div>

      {/* Entries Grid */}
      {organizedEntries.length > 0 ? (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          {organizedEntries.map((entry) => (
            <StoryCardComponent
              key={entry.id}
              entry={entry}
              onRemove={onRemove}
              onPin={handlePin}
              onEdit={handleOpenDialog}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-muted-foreground text-sm">
            {selectedCategory
              ? `No entries in ${selectedCategory} category`
              : "No entries yet."}
          </p>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingEntry ? "Edit Entry" : "Add Entry"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                placeholder="Entry title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="content">Content</Label>
              <Textarea
                id="content"
                value={formData.content}
                onChange={(e) =>
                  setFormData({ ...formData, content: e.target.value })
                }
                placeholder="Entry content"
                rows={6}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="triggers">Triggers (comma-separated)</Label>
              <Input
                id="triggers"
                value={formData.triggers}
                onChange={(e) =>
                  setFormData({ ...formData, triggers: e.target.value })
                }
                placeholder="trigger1, trigger2, trigger3"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select
                value={formData.category}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    category: value as StorybookCategory,
                  })
                }
              >
                <SelectTrigger id="category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!isFormValid}>
              {editingEntry ? "Save Changes" : "Add Entry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
