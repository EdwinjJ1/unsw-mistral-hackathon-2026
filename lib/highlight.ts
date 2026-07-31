function normaliseNodeIds(nodeIds: Iterable<string>): string[] {
  return [...new Set([...nodeIds].map((id) => id.trim()).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right),
  );
}

export function buildHighlightHref(nodeIds: Iterable<string>): string {
  const highlightedNodeIds = normaliseNodeIds(nodeIds);
  if (highlightedNodeIds.length === 0) {
    return '/';
  }

  const searchParams = new URLSearchParams();
  searchParams.set('highlight', highlightedNodeIds.join(','));
  return `/?${searchParams.toString()}`;
}

export function parseHighlightedNodeIds(
  value: string | null | undefined,
): string[] {
  return value ? normaliseNodeIds(value.split(',')) : [];
}
