import HtmlWebpackPlugin from 'html-webpack-plugin'
import webpack from 'webpack'
import config from '../../webpack.config'

export default ({ config: storybookConfig }: { config: webpack.Configuration }) => {
  return {
    ...config,
    ...storybookConfig,
    module: {
      ...storybookConfig.module,
      rules: config.module && config.module.rules,
    },
    plugins: [
      ...storybookConfig.plugins || [],
      ...(config.plugins || []).filter(p => !(
          p instanceof HtmlWebpackPlugin // Storybook handles page generation.
          || p instanceof webpack.HotModuleReplacementPlugin // Already included in the default storybook plugins.
        ),
      ),
    ],
    resolve: {
      ...storybookConfig.resolve,
      extensions: [
        ...(storybookConfig.resolve && storybookConfig.resolve.extensions || []),
        ...(config.resolve && config.resolve.extensions || []),
      ],
    },
  }
}
