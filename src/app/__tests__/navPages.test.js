import { describe, it, expect } from 'vitest'
import { ALL_NAV } from '../router.js'
import { PAGE_TOPIC, NAV_ICONS } from '../navIcons.js'
import { HELP } from '../../lib/help.js'

describe('every page has a name, a description and an icon (feedback #1057)', () => {
  it.each(ALL_NAV.filter((n) => n.path !== '/'))('$path', (n) => {
    expect(n.label).toBeTruthy()
    expect(NAV_ICONS[n.icon]).toBeTruthy()
    expect(HELP[PAGE_TOPIC[n.path]]?.text).toBeTruthy()
  })
})
