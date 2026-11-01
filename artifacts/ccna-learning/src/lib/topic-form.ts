export type TopicForm = {
  name: string;
  slug: string;
  description: string;
  displayOrder: string;
  status: "ACTIVE" | "DISABLED";
};
export function validateTopicForm(form: TopicForm) {
  const errors: Record<string, string> = {};
  if (!form.name.trim() || form.name.trim().length > 180)
    errors.name = "Enter a name of 1–180 characters.";
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug) ||
    form.slug.length < 2 ||
    form.slug.length > 120
  )
    errors.slug = "Use 2–120 lowercase letters, numbers and single hyphens.";
  if (form.description.length > 2000)
    errors.description = "Description must be at most 2,000 characters.";
  if (
    !form.displayOrder.trim() ||
    !Number.isInteger(Number(form.displayOrder)) ||
    Number(form.displayOrder) < 0 ||
    Number(form.displayOrder) > 100000
  )
    errors.displayOrder = "Enter a whole number from 0 to 100,000.";
  return errors;
}
export function initialTopicSlug(name: string) {
  const value = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 108)
    .replace(/-$/, "");
  return value.length >= 2 ? value : value ? "topic-" + value : "topic";
}
export function topicRequestError(error: unknown) {
  const value = error as {
    data?: { message?: string; error?: { message?: string } };
    message?: string;
  };
  return (
    value?.data?.error?.message ||
    value?.data?.message ||
    value?.message ||
    "Request failed. No success is assumed; refresh before retrying."
  );
}
