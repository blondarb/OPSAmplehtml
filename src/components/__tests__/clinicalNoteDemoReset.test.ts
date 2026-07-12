import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('ClinicalNote destructive demo reset containment', () => {
  it('does not expose, advertise, or call a self-service demo reset action', () => {
    const productionSources: Array<{ path: string; source: string }> = []
    const retiredRoutes = new Set([
      'src/app/api/admin/reset-demo/route.ts',
      'src/app/api/demo/reset/route.ts',
    ])

    const collectProductionSources = (relativeDirectory: string) => {
      for (const entry of readdirSync(resolve(process.cwd(), relativeDirectory))) {
        const relativePath = `${relativeDirectory}/${entry}`
        const absolutePath = resolve(process.cwd(), relativePath)

        if (statSync(absolutePath).isDirectory()) {
          if (entry !== '__tests__') collectProductionSources(relativePath)
          continue
        }

        if (!/\.(ts|tsx)$/.test(entry) || retiredRoutes.has(relativePath)) continue
        productionSources.push({
          path: relativePath,
          source: readFileSync(absolutePath, 'utf8'),
        })
      }
    }

    collectProductionSources('src')

    for (const retiredSurface of [
      'handleResetDemo',
      'executeResetDemo',
      '/api/demo/reset',
      'onResetDemo=',
      'onResetDemo?:',
      'Reset Demo Confirmation Modal',
      'Reset Demo',
      'reset-demo',
      'restores the original demo state',
    ]) {
      for (const { path, source } of productionSources) {
        expect(source, path).not.toContain(retiredSurface)
      }
    }
  })
})
