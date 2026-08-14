# What and why

<!-- What problem does this solve? Link the issue if there is one. -->

# Evidence

<!--
Paste the test output. If this fixes a bug, add a test that fails without the
fix — then revert the fix once and confirm that test actually fails, so we know
it is not vacuous.
-->

```
$ npm test

```

# Checklist

- [ ] `npm test` passes locally
- [ ] A test covers the change (and fails without it)
- [ ] No new runtime dependencies
- [ ] No user config key is overwritten; writes are backed up
- [ ] `CHANGELOG.md` updated under *unreleased*
