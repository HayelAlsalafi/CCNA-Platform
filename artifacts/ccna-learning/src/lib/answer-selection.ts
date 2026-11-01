/** Canonical set encoding keeps the established optionKey contract compatible.
 * Keys are never inferred from correctness; the delivered selection count is public. */
export function selectedKeys(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const keys: unknown = value.startsWith("[") ? JSON.parse(value) : [value];
    return Array.isArray(keys) && keys.every((k) => typeof k === "string") ? keys : [];
  } catch {
    return [];
  }
}
export function toggleSelection(
  value: string | null | undefined,
  key: string,
  multiple: boolean,
  count = 1,
): string | null {
  if (!multiple) return key;
  const current = selectedKeys(value),
    next = current.includes(key)
      ? current.filter((k) => k !== key)
      : current.length < count
        ? [...current, key]
        : current;
  return next.length ? JSON.stringify([...next].sort()) : null;
}
export function completeSelection(q: {
  type?: string;
  requiredSelectionCount?: number;
  selected?: string | null;
}) {
  return (
    selectedKeys(q.selected).length ===
    (q.type === "MULTIPLE_CHOICE_MULTIPLE" ? (q.requiredSelectionCount ?? 0) : 1)
  );
}
export function answerLabel(value: string | null | undefined) {
  return selectedKeys(value).join(", ") || "None";
}
