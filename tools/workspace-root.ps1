# Bound to this script's canonical checkout, not the caller's working directory.
$CcnaWorkspaceRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path.TrimEnd('\')
if (!(Test-Path -LiteralPath (Join-Path $CcnaWorkspaceRoot 'pnpm-lock.yaml')) -or !(Test-Path -LiteralPath (Join-Path $CcnaWorkspaceRoot 'lib\db\drizzle\meta\_journal.json'))) {
  throw 'Repository markers missing; do not run guarded operations from another directory.'
}
