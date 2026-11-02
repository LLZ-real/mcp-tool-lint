/**
 * Single-process test entry.
 *
 * `node --test` runs every test file in its own child process, which fails
 * with `spawn EPERM` in sandboxes that forbid pipes to child processes.
 * Importing the suites here runs them all in one process instead, so
 * `npm test` works everywhere Node itself runs. Each suite uses the
 * `node:test` API, which still reports per-test results and sets the exit
 * code.
 */
import "./text.test.ts";
import "./rules.test.ts";
import "./probe.test.ts";
