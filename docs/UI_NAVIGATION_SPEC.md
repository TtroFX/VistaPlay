# UI and Navigation Specification

## Shell

- Landscape: 184px sidebar, 72px compact state, sticky 72px top command bar, flexible content.
- Portrait tablet: 72px icon rail; Watch right pane reflows below content.
- Phone: bottom navigation for the first five visible primary items.
- Home, Search, Library and Settings remain available. Optional entries disappear with their features.

## Player placement

`PersistentPlayer` is mounted once above the route outlet. Opening Watch changes its layout class to a full reserved region; leaving Watch docks the same engine at the edge or portrait top. Closing stops playback and clears the persisted player reference. Back navigation never implicitly closes the mini player.

The YouTube iframe is never covered by gesture interception or custom controls. All VistaPlay controls render outside the frame.

## Interaction contract

- Card tap: open/play. Long press or overflow: organize and manage.
- Search requests occur only on submit. Result state, filters, and scroll live in session storage so Back restores context.
- Modal/temporary UI is visually layered. Browser Back handles route state; player state remains independent.
- Shared video URLs route to Watch. Channel and Playlist links route to their canonical screens.
- `/settings/features` and `/settings/connections` are focused settings routes; the general `/settings` route remains the complete control center.

## Watch layouts

Landscape: persistent player, external controls and metadata in the main column; Queue/Chapters/Comments/Captions/Live Chat/Overview in a configurable right pane. Portrait: player, controls, metadata, tabs, content.

Focus Mode hides the top bar and optional Watch pane. Cinema Mode increases visual focus without entering fullscreen.
