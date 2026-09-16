#!/usr/bin/env node
// Bumps the patch version on any commit that touches shipped code.
//
// Runs from .husky/pre-commit AFTER `npx lint-staged`, so it never races
// lint-staged's concurrent `prettier --write` on package.json, and the
// resulting `git add` still lands in the commit being made.
//
// package.json and package-lock.json are written directly rather than through
// `npm version`, so there is no dependence on npm's dirty-tree checks or its
// version lifecycle scripts. If the lockfile ever drifted out of sync with
// package.json, CI's `npm ci` would fail with EUSAGE.
//
// Set NO_BUMP=1 to skip it for one commit.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gitDir = path.join(repoRoot, '.git');

function git(args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
}

/** Replaying history should not inflate the version, and neither should CI. */
function skipReason() {
  if (process.env.NO_BUMP) return 'NO_BUMP is set';
  if (process.env.CI) return 'running in CI';
  for (const marker of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply']) {
    if (existsSync(path.join(gitDir, marker))) return `${marker} in progress`;
  }
  return null;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** Matches Prettier's JSON output and npm's own writer: 2 spaces, LF, trailing newline. */
function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function nextPatch(version) {
  const parts = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  // A version we cannot parse is worth stopping the commit for.
  if (!parts) throw new Error(`Cannot bump "${version}": expected a plain major.minor.patch version.`);
  return `${parts[1]}.${parts[2]}.${Number(parts[3]) + 1}`;
}

const skip = skipReason();
if (skip) process.exit(0);

const staged = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR']).split('\n').filter(Boolean);

// dist/ never triggers on its own - it only changes because src/ did.
if (!staged.some((file) => file.startsWith('src/') || file === 'package.json')) process.exit(0);

const pkgPath = path.join(repoRoot, 'package.json');
const lockPath = path.join(repoRoot, 'package-lock.json');

const pkg = readJson(pkgPath);
const version = nextPatch(pkg.version);
pkg.version = version;
writeJson(pkgPath, pkg);

const staging = [pkgPath];
if (existsSync(lockPath)) {
  const lock = readJson(lockPath);
  lock.version = version;
  if (lock.packages?.['']) lock.packages[''].version = version;
  writeJson(lockPath, lock);
  staging.push(lockPath);
}

git(['add', ...staging]);
console.log(`bump-version: ${pkg.name} ${version}`);
