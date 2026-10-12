/**
 * Generator version — the number that governs *output* stability, not the npm
 * package version.
 *
 * The contract: for a given major version, a seed renders the same building
 * forever. Anything that changes what an existing seed draws is a major bump,
 * and `test/goldens.json` is what makes that visible rather than accidental.
 * Games bake `meta.generator.version` into saved worlds so they can detect that
 * their cached sprites were made by a generator that no longer exists.
 *
 * Kept as a literal rather than read from package.json: `import ... with { type:
 * 'json' }` is still awkward across bundlers, and reading the file at runtime
 * would break in the browser, where this library is expected to work untouched.
 */
export const GENERATOR_VERSION = '1.0.0';

export const GENERATOR_NAME = 'iso-building-generator';
