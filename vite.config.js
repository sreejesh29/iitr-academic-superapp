import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDC } from './src/runtime/parser.js';

const runtimePath = fileURLToPath(new URL('./src/runtime/dc.js', import.meta.url));

// Compiles each Claude Design screen (src/screens/*.dc.html) into a JS module.
function dcScreens() {
  return {
    name: 'dc-screens',
    enforce: 'pre',
    // Give screens a virtual id so Vite's own HTML handling leaves them alone.
    async resolveId(source, importer, options) {
      if (!source.split('?')[0].endsWith('.dc.html')) return null;
      const r = await this.resolve(source, importer, { ...options, skipSelf: true });
      return r ? '\0dc:' + r.id.split('?')[0] + '.js' : null;
    },
    load(id) {
      if (!id.startsWith('\0dc:')) return null;
      const file = id.slice(4, -3);
      this.addWatchFile(file);
      const name = basename(file, '.dc.html');
      const dc = parseDC(readFileSync(file, 'utf8'), name);
      const def = {
        name,
        title: dc.title,
        css: dc.css,
        defaults: dc.defaults,
        preview: dc.preview,
        template: dc.template
      };
      return [
        `import { defineDC } from ${JSON.stringify(runtimePath)};`,
        `const def = ${JSON.stringify(def)};`,
        `def.factory = function (DCLogic) {`,
        dc.code,
        `return Component;`,
        `};`,
        `export default defineDC(def);`
      ].join('\n');
    }
  };
}

export default defineConfig({
  plugins: [dcScreens(), react()],
  build: { chunkSizeWarningLimit: 1000 }
});
