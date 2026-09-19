import { promises as fs } from 'node:fs'
import { join } from 'node:path'

/**
 * The run's only "after everything". Each test makes its own directory under `/tmp` — its own app
 * data, its own sessions — and nothing else ever removes them: 27,000 accumulated here before the
 * disk noticed. One test's data is never another test's business (each names its own prefix), so
 * sweeping them at the end of a run is safe, and this is the only place a sweep can live.
 */
export default async function (): Promise<void> {
  for (const entry of await fs.readdir('/tmp')) {
    if (
      /^alpha-(e2e|look|shots|data|workspace|runtime|frames|bundle|channels|decisions|live|network|outside|providers|server|sessions|tasks|vault|packaged)-/.test(
        entry,
      )
    ) {
      await fs.rm(join('/tmp', entry), { recursive: true, force: true })
    }
  }
}
