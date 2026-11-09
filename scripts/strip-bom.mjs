/**
 * Remove a UTF-8 byte order mark from the front of the files named on the
 * command line.
 *
 * The repair half of `scripts/verify-bom.mjs`. Kept separate because the check
 * must never write anything, and because the files that need repair are named by
 * the check's output — a tool that does exactly what the error message says is
 * one someone will actually run.
 *
 * Only the byte order mark is touched. The rest of the file is copied through
 * unchanged, so an unrelated encoding is not silently rewritten: reading as UTF-8
 * and writing back would "fix" a file that was never a BOM problem by mangling
 * every byte it could not decode.
 *
 * Usage: node scripts/strip-bom.mjs <file> [file...]
 */
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { BOM_BYTES } from './bom.mjs'

const paths = process.argv.slice(2)
if (paths.length === 0) {
  console.error('usage: node scripts/strip-bom.mjs <file> [file...]')
  process.exit(2)
}

let changed = 0
for (const path of paths) {
  const absolute = resolve(path)
  const bytes = readFileSync(absolute)
  if (bytes.length < BOM_BYTES.length) {
    console.log(`  unchanged  ${path}`)
    continue
  }
  if (!BOM_BYTES.every((byte, index) => bytes[index] === byte)) {
    console.log(`  unchanged  ${path}`)
    continue
  }
  /*
   * Write beside the target and rename, so an interrupted run cannot leave a
   * half-written source file behind. The temporary name is derived from the target
   * rather than random so a leftover is obviously ours.
   */
  const temporary = `${absolute}.bom-tmp`
  try {
    writeFileSync(temporary, bytes.subarray(BOM_BYTES.length))
    renameSync(temporary, absolute)
  } catch (error) {
    try {
      rmSync(temporary, { force: true })
    } catch {
      // The original error is the one worth reporting.
    }
    console.error(`  FAILED     ${path}: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
    continue
  }
  changed += 1
  console.log(`  stripped   ${path}`)
}

/*
 * Say what was done even when nothing changed, so a green run is not mistaken for
 * a scan. This is a repair tool, not a check.
 */
console.log(changed === 0 ? 'no byte order marks found' : `stripped ${changed} file(s)`)
