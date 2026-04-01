const { existsSync } = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const jestBin = require.resolve('jest/bin/jest')
const cwd = process.cwd()

function mapArg(arg) {
  if (!arg || arg.startsWith('-')) {
    return arg
  }

  const resolvedPath = path.isAbsolute(arg) ? arg : path.resolve(cwd, arg)

  if (!existsSync(resolvedPath)) {
    return arg
  }

  const relativePath = path.relative(cwd, resolvedPath)

  if (!relativePath.startsWith('tests') || !relativePath.endsWith('.ts')) {
    return arg
  }

  const compiledRelativePath = path.join(
    '.test-dist',
    relativePath.replace(/\.ts$/, '.js'),
  )

  return compiledRelativePath.split(path.sep).join('/')
}

const jestArgs = process.argv.slice(2).map(mapArg)
const result = spawnSync(process.execPath, [jestBin, ...jestArgs], {
  cwd,
  stdio: 'inherit',
})

if (result.error) {
  throw result.error
}

process.exit(result.status ?? 1)