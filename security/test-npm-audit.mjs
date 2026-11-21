/** Offline regression checks for the audit policy — no npm registry required. */
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const script = join(fileURLToPath(new URL('.', import.meta.url)), 'check-npm-audit.mjs')
function check(report, shouldPass) {
  const r = spawnSync(process.execPath, [script], { input: JSON.stringify(report), encoding: 'utf8' })
  if ((r.status === 0) !== shouldPass) {
    throw new Error(`Unexpected result: ${r.status}\n${r.stdout}\n${r.stderr}`)
  }
}
check({ vulnerabilities: {} }, true)
check({ error: { code: 'ENOTFOUND' } }, false)
check({ vulnerabilities: { package: { severity: 'critical', via: [] } } }, false)
check({ vulnerabilities: { package: { severity: 'low', via: [] } } }, true)
check({ vulnerabilities: { package: { severity: 'high', via: [{ url: 'https://github.com/advisories/GHSA-unknown', title: 'test' }] } } }, false)
check({ vulnerabilities: {
  dependency: { severity: 'high', via: [{ url: 'https://github.com/advisories/GHSA-2464-fhr4-w9xw', title: 'reviewed' }] },
  parent: { severity: 'high', via: ['dependency'] },
} }, true)
console.log('npm audit policy: six regression cases passed')
