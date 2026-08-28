module.exports = function (api) {
  api.cache(true);
  /*
   * The staking package is loaded with `await import()` so that a reader who
   * never opens the stake form never downloads it. Metro understands that;
   * Jest runs on CommonJS and would need `--experimental-vm-modules` to,
   * which is a lot of machinery for one call shape. Under test the dynamic
   * import becomes a require, and the module graph is otherwise identical.
   */
  const testing = process.env.NODE_ENV === 'test';
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ...(testing ? ['dynamic-import-node'] : []),
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            // The guide's own pure modules, shared with the web app rather
            // than copied: one answer to "what does this contract do" for
            // both. See metro.config.js, which lets the bundler out of the
            // project root to reach them.
            '@guide': '../src',
          },
          extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
        },
      ],
    ],
  };
};
