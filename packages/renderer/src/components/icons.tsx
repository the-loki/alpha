/**
 * The app's icons, drawn rather than imported: a dozen 16px line glyphs do not need a dependency,
 * and hand-drawn ones keep the 1.5px stroke and the square-ish geometry the window controls use.
 *
 * They are decorative by default (`aria-hidden`): every one of them sits next to a label or inside
 * a button that has one. An icon that carries meaning on its own takes a `title` instead.
 */
import type { JSX } from 'solid-js'

interface IconProps {
  /** Shown as the accessible name; without it the glyph is decoration. */
  title?: string
  class?: string
}

function Glyph(props: IconProps & { children: JSX.Element }) {
  const named = () => props.title !== undefined
  return (
    <svg
      viewBox="0 0 16 16"
      width="1rem"
      height="1rem"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={`shrink-0 ${props.class ?? ''}`}
      role={named() ? 'img' : undefined}
      aria-hidden={named() ? undefined : true}
      aria-label={props.title}
    >
      {props.children}
    </svg>
  )
}

export const PlusIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M8 3.5v9M3.5 8h9" />
  </Glyph>
)

export const SearchIcon = (props: IconProps) => (
  <Glyph {...props}>
    <circle cx="7" cy="7" r="4.25" />
    <path d="M10.2 10.2 13.5 13.5" />
  </Glyph>
)

export const SlidersIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M2.5 5h11M2.5 11h11" />
    <circle cx="6" cy="5" r="1.75" fill="currentColor" stroke="none" />
    <circle cx="10.5" cy="11" r="1.75" fill="currentColor" stroke="none" />
  </Glyph>
)

export const ShieldIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M8 2.2 3.4 4v3.6c0 2.6 1.9 4.9 4.6 6 2.7-1.1 4.6-3.4 4.6-6V4L8 2.2Z" />
  </Glyph>
)

export const PaletteIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M8 2.2a5.8 5.8 0 1 0 0 11.6c.9 0 1.4-.6 1.4-1.3 0-.8-.6-1.2-.6-1.9 0-.6.5-1 1.2-1h1.3c1.3 0 2.3-1 2.3-2.3A5.9 5.9 0 0 0 8 2.2Z" />
    <circle cx="5.6" cy="6.4" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="8.6" cy="5.2" r="0.9" fill="currentColor" stroke="none" />
  </Glyph>
)

export const GlobeIcon = (props: IconProps) => (
  <Glyph {...props}>
    <circle cx="8" cy="8" r="5.75" />
    <path d="M2.5 8h11M8 2.25c1.6 1.7 2.4 3.7 2.4 5.75S9.6 12.05 8 13.75C6.4 12.05 5.6 10.05 5.6 8S6.4 3.95 8 2.25Z" />
  </Glyph>
)

/**
 * The workbench's settings: three tracks with their stops at different heights. A knob on a track
 * is a thing you set — unlike the cog it replaces, it does not read as machinery, and unlike the
 * two-track sliders the panels below use, it is the mark of the room the panels are in.
 */
export const TuneIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M4 13.5V2.5M8 13.5V2.5M12 13.5V2.5" />
    <circle cx="4" cy="10.5" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="8" cy="5.5" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="12" cy="9" r="1.6" fill="currentColor" stroke="none" />
  </Glyph>
)

export const FolderIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M2.2 4.6c0-.7.5-1.2 1.2-1.2h2.3l1.3 1.5h4.6c.7 0 1.2.5 1.2 1.2v5.3c0 .7-.5 1.2-1.2 1.2H3.4c-.7 0-1.2-.5-1.2-1.2V4.6Z" />
  </Glyph>
)

export const ChevronDownIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M4.5 6.5 8 10l3.5-3.5" />
  </Glyph>
)

/** The mark of the chosen one: a choice is not only a colour. */
export const CheckIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M3.5 8.5 6.5 11.5 12.5 5" />
  </Glyph>
)

export const ArrowLeftIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M12.5 8h-9M7 4.5 3.5 8 7 11.5" />
  </Glyph>
)

export const ArrowUpIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M8 13V3.5M4 7.5 8 3.5l4 4" />
  </Glyph>
)

export const StopIcon = (props: IconProps) => (
  <Glyph {...props}>
    <rect x="4.5" y="4.5" width="7" height="7" rx="1.2" fill="currentColor" stroke="none" />
  </Glyph>
)

export const ClockIcon = (props: IconProps) => (
  <Glyph {...props}>
    <circle cx="8" cy="8" r="5.5" />
    <path d="M8 4.8V8l2.2 1.4" />
  </Glyph>
)

export const MoreIcon = (props: IconProps) => (
  <Glyph {...props}>
    <circle cx="3.5" cy="8" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="8" cy="8" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="12.5" cy="8" r="0.9" fill="currentColor" stroke="none" />
  </Glyph>
)

export const BranchIcon = (props: IconProps) => (
  <Glyph {...props}>
    <circle cx="4.5" cy="4" r="1.6" />
    <circle cx="4.5" cy="12" r="1.6" />
    <circle cx="11.5" cy="7" r="1.6" />
    <path d="M4.5 5.6v4.8M6.1 7h3.8" />
  </Glyph>
)

export const CloseIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
  </Glyph>
)

export const PaperclipIcon = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M14 7.7 8.3 13.3a3.7 3.7 0 0 1-5.2-5.2L8.8 2.4a2.3 2.3 0 0 1 3.3 3.3l-5.7 5.7a1 1 0 0 1-1.4-1.4l5-5" />
  </Glyph>
)
