// UI component library — shadcn/ui + Radix primitives
// Components added in Phase 4 (Full UX)
// Phase 0: stub only

export function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ');
}
