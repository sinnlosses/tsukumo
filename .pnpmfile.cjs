module.exports = {
  hooks: {
    readPackage(pkg) {
      if (pkg.name === "@a2ui/react" && pkg.peerDependencies) {
        delete pkg.peerDependencies.zod
      }
      return pkg
    },
  },
}
