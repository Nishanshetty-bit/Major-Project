const PATHS = {
  book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z" /><path d="M4 5.5v16M8 7h8M8 11h7" /></>,
  wallet: <><rect x="3" y="6" width="18" height="14" rx="3" /><path d="M3 9V6a3 3 0 0 1 3-3h12M15 13h6v4h-6a2 2 0 0 1 0-4z" /></>,
  brain: <><path d="M12 5a3 3 0 0 0-5.8-1 3.5 3.5 0 0 0-2 5.6A3.5 3.5 0 0 0 6 16a3 3 0 0 0 6 0zM12 5a3 3 0 0 1 5.8-1 3.5 3.5 0 0 1 2 5.6A3.5 3.5 0 0 1 18 16a3 3 0 0 1-6 0z" /><path d="M8 9h.01M16 9h.01M8 14h.01M16 14h.01M12 6v13" /></>,
  shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z" /><path d="m9 12 2 2 4-4" /></>,
  chart: <><path d="M3 3v18h18" /><path d="m7 14 4-4 4 3 6-7" /><path d="M17 6h4v4" /></>,
  building: <><path d="M4 21V4l8-2 8 2v17M2 21h20" /><path d="M8 7h1m6 0h1M8 11h1m6 0h1M10 21v-5h4v5" /></>,
  basket: <><path d="m3 9 2 11h14l2-11zM2 9h20M8 9l4-6 4 6" /><path d="m9 12 1 5m5-5-1 5" /></>,
  index: <><path d="M4 5h16M4 12h16M4 19h16" /><circle cx="8" cy="5" r="2" /><circle cx="15" cy="12" r="2" /><circle cx="10" cy="19" r="2" /></>,
  bolt: <path d="m13 2-3 8H5l6 12 2-9h6z" />,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  bulb: <><path d="M9 18h6m-5 4h4m-2-20a7 7 0 0 0-4 12.7c.8.6 1 1.3 1 2.3h6c0-1 .2-1.7 1-2.3A7 7 0 0 0 12 2z" /></>,
  question: <><circle cx="12" cy="12" r="9" /><path d="M9.6 9a2.5 2.5 0 1 1 4.3 1.8c-1.1 1-1.9 1.3-1.9 3M12 17h.01" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12a2 2 0 0 0 4 0" /></>,
  message: <><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z" /></>,
  phone: <><rect x="6" y="2" width="12" height="20" rx="2" /><path d="M11 18h2" /></>,
  people: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m6-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm10 10v-2a4 4 0 0 0-3-3.9m-1-12a4 4 0 0 1 0 7.8" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  warning: <><path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0z" /><path d="M12 9v4m0 4h.01" /></>,
  play: <path d="m8 5 12 7-12 7z" />,
  pause: <><path d="M8 5h3v14H8zM15 5h3v14h-3z" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></>,
  coin: <><circle cx="12" cy="12" r="9" /><path d="M15 8.5c-.7-.7-1.7-1-3-1-1.7 0-3 1-3 2.3 0 3.5 6 1.5 6 5 0 1.3-1.3 2.2-3 2.2-1.3 0-2.3-.3-3-1m3-10v10" /></>,
  spark: <><path d="m12 2 1.8 7.2L21 12l-7.2 2.8L12 22l-1.8-7.2L3 12l7.2-2.8z" /><path d="m19 2 .7 2.3L22 5l-2.3.7L19 8l-.7-2.3L16 5l2.3-.7z" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18m-13 4h2m4 0h2m-8 3h2" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.7 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.7-1l-1.7.7-1.4-2.4L7.3 15a8 8 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.7-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.7 1l1.7-.7 1.4 2.4-1.4 1.1a8 8 0 0 1-.1 2z" /></>,
  sparkle: <><path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z" /><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></>,
  moon: <path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13z" />,
  scale: <><path d="m16 3 5 5M3 21l8-8m-4-7 11 11M5 6l14 14m-12-9 5-5m3 11 5-5" /><path d="M2 22h7M15 22h7" /></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>,
  close: <path d="m18 6-12 12M6 6l12 12" />,
}

export function Icon({ name = 'spark', size = 18, className = '', ...props }) {
  return <svg className={`icon-svg ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>{PATHS[name] || PATHS.spark}</svg>
}

export const TYPE_ICON = { stock: 'building', mf: 'basket', index: 'index', etf: 'bolt' }
