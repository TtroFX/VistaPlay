# Motion Specification

## Tokens

| Token | Duration |
|---|---:|
| Tap feedback | 90ms |
| Small state | 140ms |
| Standard | 180ms |
| Panel | 220ms |
| Page | 260ms |
| Drag settle | up to 320ms |

Default easing: `cubic-bezier(0.2, 0.8, 0.2, 1)`.

## Coverage

Buttons scale on press; toggles slide; cards lift and reveal play feedback; menus, modals, filters, comments, toasts and route content use short opacity/transform transitions. Queue reorder is continuous through row translation. Sidebar changes width without remounting. Player full/mini placement uses one persistent container. Theme uses color/surface crossfades. Errors use one small shake; success uses restrained color and arrival.

Animations are interruptible CSS transitions, so reverse input retargets from the current computed state. Transform and opacity are preferred over layout-heavy animation.

## Reduced motion

`prefers-reduced-motion: reduce` removes page movement, scale, bounce and large layout motion. Necessary state, opacity, border and color feedback remain and complete within 80ms.
