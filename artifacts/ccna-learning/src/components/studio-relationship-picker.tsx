import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown } from "lucide-react";
import {
  adminContentRequest,
  type StudioLookup,
  type StudioLookupItem,
} from "@workspace/api-client-react";
import { useAdminSession } from "./admin-session-boundary";
import { adminQueryOptions } from "../lib/admin-session";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandItem } from "./ui/command";
/** Only a bounded server lookup is loaded, even with thousands of topics. */
export function StudioRelationshipPicker({
  kind,
  label,
  value,
  selectedLabel,
  domainId,
  chapterId,
  onSelect,
  disabled = false,
}: {
  kind: "topics" | "objectives";
  label: string;
  value: string;
  selectedLabel?: string;
  domainId?: string;
  chapterId?: string;
  onSelect: (item: StudioLookupItem | null) => void;
  disabled?: boolean;
}) {
  const session = useAdminSession();
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState(""),
    [debounced, setDebounced] = useState(""),
    [page, setPage] = useState(1);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => setPage(1), [domainId, chapterId]);
  const params = new URLSearchParams({
    kind,
    page: String(page),
    search: debounced,
    ...(domainId ? { domainId } : {}),
    ...(chapterId ? { chapterId } : {}),
  });
  const query = useQuery({
    ...adminQueryOptions(["/api/admin/questions", "lookup", params.toString()], session.identity)
      .query,
    enabled: open,
    queryFn: ({ signal }) =>
      adminContentRequest<StudioLookup>("/api/admin/questions/studio/lookup?" + params, { signal }),
  });
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          disabled={disabled}
          className="studio-picker"
        >
          {selectedLabel ||
            query.data?.items.find((i) => i.id === value)?.label ||
            (value ? "Selected " + kind.slice(0, -1) : label)}
          <ChevronsUpDown size={16} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[min(90vw,440px)]">
        <Command shouldFilter={false}>
          <CommandInput value={search} onValueChange={setSearch} placeholder={"Search " + kind} />
          <CommandList>
            {query.isPending ? (
              <p className="p-3" role="status">
                Loading…
              </p>
            ) : query.isError ? (
              <p className="p-3" role="alert">
                Could not load relationships.{" "}
                <button onClick={() => void query.refetch()}>Retry</button>
              </p>
            ) : (
              <>
                <CommandItem
                  value="none"
                  onSelect={() => {
                    if (disabled) return;
                    onSelect(null);
                    setOpen(false);
                  }}
                >
                  Clear selection
                </CommandItem>
                {!query.data?.items.length && <CommandEmpty>No matches.</CommandEmpty>}
                {query.data?.items.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={item.id}
                    onSelect={() => {
                      if (disabled) return;
                      onSelect(item);
                      setOpen(false);
                    }}
                  >
                    <Check size={14} className={value === item.id ? "opacity-100" : "opacity-0"} />
                    {item.label}
                    {item.status === "DISABLED" ? " (disabled)" : ""}
                  </CommandItem>
                ))}
              </>
            )}
          </CommandList>
        </Command>
        <div className="studio-picker-pages">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={page === 1 || query.isFetching}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span>{page}</span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={!query.data?.hasMore || query.isFetching}
            onClick={() => setPage((p) => p + 1)}
          >
            More
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
