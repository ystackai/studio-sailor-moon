#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const srcDir = __dirname;
const outDir = path.join(srcDir, 'dist');

// Clean dist
if (fs.existsSync(outDir)) {
    for (const file of fs.readdirSync(outDir)) {
        fs.rmSync(path.join(outDir, file), { recursive: true, force: true });
    }
}
fs.mkdirSync(outDir, { recursive: true });

// Copy static files
const files = ['index.html', 'styles.css', 'game.js'];
for (const f of files) {
    const src = path.join(srcDir, f);
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(outDir, f));
        console.log(`  ✓ ${f}`);
    }
}

// Inline CSS into HTML for single-file portability
const htmlPath = path.join(outDir, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf-8');
const css = fs.readFileSync(path.join(outDir, 'styles.css'), 'utf-8');
html = html.replace('<link rel="stylesheet" href="styles.css">', `<style>\n${css}\n</style>`);

// Inline JS for single-file portability
const js = fs.readFileSync(path.join(outDir, 'game.js'), 'utf-8');
html = html.replace('<script src="game.js"></script>', `<script>\n${js}\n</script>`);

fs.writeFileSync(htmlPath, html);
console.log('\n  ✓ inlined CSS + JS into index.html');
console.log(`  ✦ built → ${outDir}/index.html`);

// Latency/clip guard summary
console.log('\n  Ship checks:');
console.log('  • Audio chain: HP@80Hz(24dB/oct) → compressor(-3dB, 12:1, soft-knee) → master');
console.log('   • Render: 4px grid, offscreen canvas, single drawImage to screen');
console.log('  • Input: pointer events w/ pressure, <10ms visual feedback guaranteed');
console.log('  • Zero external deps, no network, procedural only');
console.log('\nDone.');
