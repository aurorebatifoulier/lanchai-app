// Privacy: reviews show only a first name + last-initial ("Aurore B."), never the
// full last name.
export function formatReviewerName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  const [firstName, ...rest] = parts;
  const lastName = rest[rest.length - 1];
  return `${firstName} ${lastName[0]}.`;
}
