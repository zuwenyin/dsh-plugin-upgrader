import test from 'node:test'
import assert from 'node:assert/strict'

import { Config, registryKey, savedRegistry } from '../src/host/config.ts'

/**
 * Validate a config the way the loader does.
 *
 * The schema's `~standard` interface is typed as possibly-async; the loader
 * rejects an async answer outright, so a sync read here matches what it does.
 */
function validate(value: unknown): { issues?: unknown; value?: Record<string, { get: () => unknown }> } {
  const result = Config['~standard'].validate(value) as { issues?: unknown; value?: Record<string, { get: () => unknown }> }
  return result
}

/** A live reference, shaped like the one the loader hands `apply`. */
function live(value: string): { get: () => string } {
  return { get: () => value }
}

test('the schema has a default for every field, so a bare patch row still loads', () => {
  /*
   * `cordis.patch.yml` inserts this bundle with no `config:` block. A required
   * field would fail validation there and the whole tab would disappear, so
   * every field must carry a default.
   */
  const result = validate(undefined)
  assert.equal(result.issues, undefined)
  assert.equal(result.value?.registry?.get(), '')
})

test('the registry field is volatile, which is what exposes it to the settings page', () => {
  /*
   * `toJSON()` is a reference table: the root schema is `refs[uid]`, and each
   * field points at another entry. Resolve the root before reading `dict`, or
   * the assertion silently passes on `undefined` for the wrong reason.
   */
  const json = Config.toJSON() as {
    uid: number
    refs: Record<string, { dict?: Record<string, number>; meta?: { volatile?: boolean } }>
  }
  const root = json.refs[String(json.uid)]
  const field = root?.dict?.registry
  assert.equal(typeof field, 'number', 'the root schema has a registry field')
  assert.equal(json.refs[String(field)]?.meta?.volatile, true)
})

test('the schema accepts an http(s) registry and an empty value', () => {
  for (const value of ['', 'https://registry.npmmirror.com/', 'http://npm.internal:4873']) {
    assert.equal(validate({ registry: value }).issues, undefined, value)
  }
})

test('the schema rejects what the manager would reject', () => {
  /*
   * The form must not accept a value `installBundle` would then throw on: the
   * user would see "saved" and the next install would fail with a manager
   * error they cannot connect to the setting.
   */
  for (const value of ['not a url', 'ftp://registry.example.com/', 'registry.npmjs.org']) {
    assert.notEqual(validate({ registry: value }).issues, undefined, value)
  }
})

test('savedRegistry reads through the live reference', () => {
  assert.equal(savedRegistry({ registry: live('https://registry.npmmirror.com/') }), 'https://registry.npmmirror.com/')
  assert.equal(savedRegistry({ registry: live('  https://registry.npmjs.org/  ') }), 'https://registry.npmjs.org/')
})

test('savedRegistry treats a missing config as no choice', () => {
  assert.equal(savedRegistry(undefined), '')
  assert.equal(savedRegistry(null), '')
  assert.equal(savedRegistry({} as never), '')
  assert.equal(savedRegistry({ registry: live('') }), '')
})

test('savedRegistry survives a config object from an older host', () => {
  /*
   * Before this version the field did not exist. A plain string (a schema
   * without `.volatile()`) and an accessor that throws must both read as "no
   * choice" rather than redirecting an install to `undefined`.
   */
  assert.equal(savedRegistry({ registry: 'https://registry.npmmirror.com/' } as never), '')
  assert.equal(
    savedRegistry({
      registry: {
        get: () => {
          throw new Error('detached')
        },
      },
    }),
    '',
  )
})

test('registryKey collapses the spellings a registry treats as one', () => {
  assert.equal(registryKey('https://registry.npmjs.org/'), 'https://registry.npmjs.org')
  assert.equal(registryKey('HTTPS://Registry.NPMJS.org'), 'https://registry.npmjs.org')
  assert.equal(registryKey('  https://registry.npmmirror.com///  '), 'https://registry.npmmirror.com')
})
