// The icon of each sidebar page (router.js NAV `icon`), shared by the sidebar and Home's cards.
import { Boxes, Database, ListChecks, User, ArrowDownToLine, Network, Fingerprint, Users, Send, Calculator, LayoutTemplate, GitCompare, Terminal, HeartPulse, Plug, Blocks, Share2, Home, Gauge, Workflow, Megaphone, Circle } from 'lucide-vue-next'

export const NAV_ICONS = { Boxes, Database, ListChecks, User, ArrowDownToLine, Network, Fingerprint, Users, Send, Calculator, LayoutTemplate, GitCompare, Terminal, HeartPulse, Plug, Blocks, Share2, Home, Gauge, Workflow, Megaphone }
export const navIcon = (name) => NAV_ICONS[name] || Circle

// Help text per sidebar page (the help topic is the page path without its slash). Every page
// needs one, or its Home card shows no description (feedback #1057; a test checks it).
export const PAGE_TOPIC = { '/credits': 'credits', '/objects': 'objects', '/sql': 'sql', '/sql/builder': 'builder', '/bulk': 'bulk', '/profile': 'people', '/streams': 'streams', '/models': 'models', '/identity': 'identity', '/graphs': 'graphs', '/segments': 'segments', '/activations': 'activations', '/insights': 'insights', '/personalization': 'personalization', '/flows': 'flows', '/campaigns': 'campaigns', '/compare': 'compare', '/explore': 'explore', '/health': 'health', '/connection': 'connection' }

// One colour per page (Home cards and page headers); the shadow is the same hue (r,g,b).
export const TONES = {
  violet: ['bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300', 'border-violet-100 dark:border-violet-500/25', '124,58,237'],
  blue: ['bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300', 'border-blue-100 dark:border-blue-500/25', '37,99,235'],
  teal: ['bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300', 'border-teal-100 dark:border-teal-500/25', '13,148,136'],
  orange: ['bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300', 'border-orange-100 dark:border-orange-500/25', '234,88,12'],
  pink: ['bg-pink-50 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300', 'border-pink-100 dark:border-pink-500/25', '219,39,119'],
  indigo: ['bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300', 'border-indigo-100 dark:border-indigo-500/25', '79,70,229'],
  sky: ['bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300', 'border-sky-100 dark:border-sky-500/25', '2,132,199'],
}
export const PAGE_TONE = {
  '/profile': 'violet', '/sql': 'blue', '/objects': 'teal', '/segments': 'orange', '/health': 'pink', '/models': 'indigo',
  '/streams': 'blue', '/activations': 'sky', '/insights': 'violet', '/identity': 'teal', '/graphs': 'indigo', '/bulk': 'violet',
  '/personalization': 'pink', '/flows': 'sky', '/campaigns': 'orange', '/explore': 'indigo', '/credits': 'teal', '/compare': 'sky', '/connection': 'teal',
}
const ORDER = Object.keys(TONES)
export const toneOf = (path, i = 0) => TONES[PAGE_TONE[path] || ORDER[i % ORDER.length]]
