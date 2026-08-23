import * as React from "react";

import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Command, CommandList, CommandEmpty, CommandItem } from "@/components/ui/command";
import { cn } from "@/lib/utils";

function highlightMatch(name: string, query: string): React.ReactNode {
  const i = name.toLowerCase().indexOf(query.toLowerCase());
  if (!query || i === -1) return name;
  return (
    <>
      {name.slice(0, i)}
      <mark className="bg-transparent font-semibold text-primary">{name.slice(i, i + query.length)}</mark>
      {name.slice(i + query.length)}
    </>
  );
}

interface BuildingComboboxProps {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  buildingNames: string[];
  placeholder?: string;
  className?: string;
}

export function BuildingCombobox({ id, value, onValueChange, buildingNames, placeholder, className }: BuildingComboboxProps) {
  const [open, setOpen] = React.useState(false);

  const matches = React.useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return [];
    return buildingNames.filter((n) => n.toLowerCase().includes(q)).slice(0, 8);
  }, [value, buildingNames]);
  const showPopover = open && matches.length > 0;

  return (
    <Popover open={showPopover} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Input
          id={id}
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={showPopover}
          className={className}
          onChange={(e) => {
            onValueChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        />
      </PopoverAnchor>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if (e.target instanceof HTMLElement && e.target.id === id) e.preventDefault();
        }}
      >
        <Command shouldFilter={false}>
          <CommandList>
            <CommandEmpty>No matching building.</CommandEmpty>
            {matches.map((name) => (
              <CommandItem
                key={name}
                value={name}
                onSelect={() => {
                  onValueChange(name);
                  setOpen(false);
                }}
                className={cn(name === value && "bg-accent text-accent-foreground")}
              >
                {highlightMatch(name, value)}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
