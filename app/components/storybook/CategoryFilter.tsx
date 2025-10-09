import React from "react";
import { StorybookCategory } from "@/types/context.type";
import { Button } from "@/components/ui/button";
import {
  CircleSlash2Icon,
  UserIcon,
  BoxIcon,
  MapIcon,
  BrainIcon,
  CircleIcon,
} from "lucide-react";
import {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

export type CategoryFilterProps = {
  selectedCategory: StorybookCategory | null;
  onCategoryChange: (category: StorybookCategory | null) => void;
};

const CATEGORIES = [
  { value: null, label: "All", icon: <CircleIcon /> },
  {
    value: StorybookCategory.CHARACTER,
    label: "Char",
    icon: <UserIcon />,
  },
  { value: StorybookCategory.THING, label: "Thing", icon: <BoxIcon /> },
  { value: StorybookCategory.PLACE, label: "Place", icon: <MapIcon /> },
  { value: StorybookCategory.CONCEPT, label: "Concept", icon: <BrainIcon /> },
  {
    value: StorybookCategory.UNCATEGORIZED,
    label: "Other",
    icon: <CircleSlash2Icon />,
  },
];

export function CategoryFilter({
  selectedCategory,
  onCategoryChange,
}: CategoryFilterProps): React.JSX.Element {
  return (
    <div className="flex flex-wrap gap-2">
      {CATEGORIES.map((category) => {
        const isSelected = selectedCategory === category.value;
        return (
          <TooltipProvider key={String(category.value ?? "all")}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={isSelected ? "default" : "outline"}
                  onClick={() => onCategoryChange(category.value)}
                >
                  {category.icon}
                  <span>{category.label}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{category.label}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}
    </div>
  );
}
