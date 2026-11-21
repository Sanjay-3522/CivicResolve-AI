#!/usr/bin/env node
/**
 * Fail closed on invalid audit reports or unreviewed high/critical advisories.
 * Consumes the JSON that `npm audit --json` prints even when its exit code is 1.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const allow = JSON.parse(readFileSync(join(here, 'npm-audit-allowlist.json'), 'utf8')).advisories
let report
try {
  report = JSON.parse(readFileSync(0, 'utf8'))
} catch (error) {
  console.error('npm audit: cannot parse audit output:', error.message)
  process.exit(1)
}

if (report.error || !report.vulnerabilities || typeof report.vulnerabilities !== 'object') {
  console.error('npm audit: audit unavailable, incomplete, or errored; refusing to report success')
  process.exit(1)
}

function allAdvisories(pkg, seen = new Set()) {
  if (seen.has(pkg)) return []
  seen.add(pkg)
  const vuln = report.vulnerabilities[pkg]
  if (!vuln || !Array.isArray(vuln.via)) return []
  return vuln.via.flatMap((entry) => {
    if (typeof entry === 'string') return allAdvisories(entry, seen)
    return entry && typeof entry.url === 'string' ? [entry] : []
  })
}

const blocking = new Map()
for (const [pkg, vuln] of Object.entries(report.vulnerabilities)) {
  if (!['high', 'critical'].includes(vuln.severity)) continue
  const advisories = allAdvisories(pkg)
  // A transitive/high severity without an advisory ID cannot be assumed safe.
  if (!advisories.length) {
    blocking.set(pkg, `${pkg} [${vuln.severity}] missing advisory details`)
    continue
  }
  for (const advisory of advisories) {
    const id = new URL(advisory.url).pathname.split('/').pop()
    if (!(id in allow)) blocking.set(id, `${pkg} [${vuln.severity}] ${advisory.title}`)
  }
}

if (blocking.size) {
  console.error('Unreviewed high/critical advisories:')
  for (const [id, desc] of blocking) console.error(`  ${id}: ${desc}`)
  process.exit(1)
}
console.log(`npm audit: no unreviewed high/critical advisories (${Object.keys(allow).length} reviewed exceptions).`)
