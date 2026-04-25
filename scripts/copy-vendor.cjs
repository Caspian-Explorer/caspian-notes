// Copies third-party browser-loadable bundles from node_modules into media/vendor/.
// Run by `npm run compile`. Keeps the webview free of CommonJS require() and
// avoids bundling tooling at this stage of the project.

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dest = path.join(root, 'media', 'vendor');
fs.mkdirSync(dest, { recursive: true });

const copies = [
    {
        from: path.join(root, 'node_modules', 'fuse.js', 'dist', 'fuse.min.mjs'),
        to: path.join(dest, 'fuse.min.mjs'),
    },
    {
        from: path.join(root, 'node_modules', 'marked', 'lib', 'marked.esm.js'),
        to: path.join(dest, 'marked.esm.js'),
    },
];

for (const { from, to } of copies) {
    fs.copyFileSync(from, to);
    process.stdout.write(`copied ${path.relative(root, from)} -> ${path.relative(root, to)}\n`);
}
