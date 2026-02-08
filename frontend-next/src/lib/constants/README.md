# Z-Index Scale Documentation

This project uses a consistent z-index scale to prevent layering conflicts.

## Scale Reference

```
0-9     : Base layers
10-39   : Content layers (dropdowns, sticky, fixed)
40-59   : Overlay layers (backdrops)
50-69   : Modal layers (dialogs, sheets, popovers)
70-99   : Top layers (tooltips, notifications, toasts)
```

## Current Usage

| Component | Z-Index | Layer |
|-----------|---------|-------|
| Dropdown | 10 | Content |
| Sticky | 20 | Content |
| Fixed | 30 | Content |
| Backdrop | 40 | Overlay |
| Sidebar Backdrop | 45 | Overlay |
| Dialog | 50 | Modal |
| Sheet | 50 | Modal |
| Mobile Header | 50 | Modal |
| Mobile Sidebar | 50 | Modal |
| Popover | 55 | Modal |
| Tooltip | 70 | Top |
| Notification | 80 | Top |
| Toast | 90 | Top |

## Implementation

All z-index values are defined in `z-index.ts` for consistency.

When adding new components, use the appropriate z-index from this scale.

## Files Using Z-Index

- `components/ui/dialog.tsx` - z-50 (modal)
- `components/ui/sheet.tsx` - z-50 (modal)
- `components/ui/popover.tsx` - z-50/z-55 (modal)
- `components/ui/dropdown-menu.tsx` - z-50 (modal)
- `components/layout/sidebar.tsx` - z-45 (backdrop), z-50 (sidebar/header)

## Rationale

Having a consistent z-index scale prevents:
- Unexpected layering conflicts
- Modal/dialog appearing behind other elements
- Dropdown menus being cut off
- Tooltips appearing under other content

Always reference this scale when adding z-index to new components.
