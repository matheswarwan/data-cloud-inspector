// The icon of each sidebar page (router.js NAV `icon`), shared by the sidebar and Home's cards.
import { Boxes, Database, ListChecks, User, ArrowDownToLine, Network, Fingerprint, Users, Send, Calculator, LayoutTemplate, GitCompare, Terminal, HeartPulse, Plug, Blocks, Share2, Home, Gauge, Workflow, Megaphone, Circle } from 'lucide-vue-next'

export const NAV_ICONS = { Boxes, Database, ListChecks, User, ArrowDownToLine, Network, Fingerprint, Users, Send, Calculator, LayoutTemplate, GitCompare, Terminal, HeartPulse, Plug, Blocks, Share2, Home, Gauge, Workflow, Megaphone }
export const navIcon = (name) => NAV_ICONS[name] || Circle

// Help text per sidebar page (the help topic is the page path without its slash).
export const PAGE_TOPIC = { '/objects': 'objects', '/sql': 'sql', '/sql/builder': 'builder', '/bulk': 'bulk', '/profile': 'profile', '/streams': 'streams', '/models': 'models', '/identity': 'identity', '/graphs': 'graphs', '/segments': 'segments', '/activations': 'activations', '/insights': 'insights', '/personalization': 'personalization', '/flows': 'flows', '/campaigns': 'campaigns', '/compare': 'compare', '/explore': 'explore', '/health': 'health', '/connection': 'connection' }
