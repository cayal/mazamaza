import { readFileSync } from 'fs';
import { defineConfig, PluginOption, transformWithEsbuild } from 'vite';

// const blobLoader: PluginOption = {
//     name: 'blob-loader',
//     transform(code, id) {
//         const [path, query] = id.split('?')
//         if (query !== 'raw-blob')
//             return null

//         const iv = readFileSync(path)
//         const blob = new Blob([iv])
//         return `export default ${JSON.stringify(blob)}`
//     }
// }

// https://vitejs.dev/config
export default defineConfig({
    publicDir: 'static',
    esbuild: {
        target: 'es2023'
    }
    // plugins: [blobLoader]
});
