// Real social-media canvas sizes. `shape` drives which adaptive layout the
// design system uses; `safe` is the inset (px) to keep content clear of the
// platform's UI chrome (story top/bottom bars, etc.).
export type Shape = "square" | "portrait" | "wide" | "landscape"

export interface Format {
  key: string
  label: string
  w: number
  h: number
  shape: Shape
  safe: number
}

export const FORMATS: Format[] = [
  {
    key: "ig-post",
    label: "Instagram Post",
    w: 1080,
    h: 1080,
    shape: "square",
    safe: 72,
  },
  {
    key: "ig-story",
    label: "Instagram Story",
    w: 1080,
    h: 1920,
    shape: "portrait",
    safe: 180,
  },
  {
    key: "fb-cover",
    label: "Facebook Cover",
    w: 1640,
    h: 624,
    shape: "wide",
    safe: 80,
  },
  {
    key: "x-header",
    label: "X / Twitter Header",
    w: 1500,
    h: 500,
    shape: "wide",
    safe: 72,
  },
  {
    key: "og",
    label: "Link Preview (1200×630)",
    w: 1200,
    h: 630,
    shape: "landscape",
    safe: 64,
  },
  {
    key: "pin",
    label: "Pinterest Pin",
    w: 1000,
    h: 1500,
    shape: "portrait",
    safe: 110,
  },
  {
    key: "yt",
    label: "YouTube Thumbnail",
    w: 1280,
    h: 720,
    shape: "landscape",
    safe: 64,
  },
]

export const formatByKey = (key: string): Format =>
  FORMATS.find((f) => f.key === key) ?? FORMATS[0]
