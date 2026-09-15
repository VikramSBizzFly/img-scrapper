// Runs from the husky pre-commit hook (.husky/pre-commit). Enable hooks once with `npm run hooks`.
export default {
  // format every staged file Prettier understands (dist/ is excluded via .prettierignore)
  '*.{ts,js,mjs,json,md,yml,yaml}': 'prettier --write',

  // sources or build config changed: type-check once, rebuild dist/ and stage it in the same commit
  '{src/**/*.ts,tsconfig*.json,obfuscator.config.json,package.json}': () => ['npm run typecheck', 'npm run release'],
};
