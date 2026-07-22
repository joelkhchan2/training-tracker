/** Maps a dnd-kit drag-end (active/over sortable ids) to a from/to index pair against the
 *  current ordered id list, or null when there's nothing to move. Pure — unit-tested without
 *  simulating pointer drag (jsdom's pointer support for dnd is unreliable). Lives in its own
 *  module (not WorkoutPage.tsx) so the non-component export doesn't trip
 *  react-refresh/only-export-components. */
export function reorderFromDragEnd(
  ids: string[],
  activeId: string | number,
  overId: string | number | null | undefined,
): { from: number; to: number } | null {
  if (overId == null || activeId === overId) return null
  const from = ids.indexOf(String(activeId))
  const to = ids.indexOf(String(overId))
  if (from === -1 || to === -1) return null
  return { from, to }
}
