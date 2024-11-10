/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />
declare module '*?raw' {
    const value: string;
    export default value;
}

declare module '*?url' {
    const value: string;
    export default value;
}

declare module '*.png' {
    const value: string;
    export default value;
}

declare module '*.wgsl' {
    const value: string;
    export default value;
}