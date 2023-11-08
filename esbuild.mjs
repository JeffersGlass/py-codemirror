import { build } from 'esbuild'
await build({
    entryPoints: ['py-codemirror.js', 'mini-coi.js'],
    bundle: true,
    format: 'esm',
    outdir: 'dist',
    external: ['@pyscript*']
})