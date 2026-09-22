const path = require('node:path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

/**
 * monorepo 下的 Metro 配置：npm workspaces 会把依赖提升到仓库根 node_modules，
 * 必须显式声明 watchFolders 与解析路径，否则 JS 打包找不到模块。
 */
const config = {
  watchFolders: [workspaceRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ],
    disableHierarchicalLookup: true,
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
