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
import { useLingui } from "@lingui/react/macro";

export type CategoryFilterProps = {
  selectedCategory: StorybookCategory | null;
  onCategoryChange: (category: StorybookCategory | null) => void;
};

export function CategoryFilter({
  selectedCategory,
  onCategoryChange,
}: CategoryFilterProps): React.JSX.Element {
  const { t } = useLingui();

  const CATEGORIES = [
    { value: null, label: t`All`, icon: <CircleIcon /> },
    {
      value: StorybookCategory.CHARACTER,
      label: t`Character`,
      icon: <UserIcon />,
    },
    { value: StorybookCategory.THING, label: t`Thing`, icon: <BoxIcon /> },
    { value: StorybookCategory.PLACE, label: t`Place`, icon: <MapIcon /> },
    {
      value: StorybookCategory.CONCEPT,
      label: t`Concept`,
      icon: <BrainIcon />,
    },
    {
      value: StorybookCategory.UNCATEGORIZED,
      label: t`Uncategorized`,
      icon: <CircleSlash2Icon />,
    },
  ];

  return (
    <TooltipProvider>
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((category) => {
          const isSelected = selectedCategory === category.value;
          return (
            <Tooltip key={String(category.value ?? "all")}>
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
          );
        })}
      </div>
    </TooltipProvider>
  );
}
