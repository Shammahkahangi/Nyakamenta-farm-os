// ============================================================
// polyfills.js — Early-Injection Polyfills
// ============================================================

// 1. Process getBuiltinModule (Node 20+ compatibility)
if (!process.getBuiltinModule) {
    process.getBuiltinModule = (name) => {
        try {
            // console.log(`[POLYFILL] getBuiltinModule: ${name}`);
            return require(name);
        } catch (e) {
            return null;
        }
    };
}
if (!process.getBuiltInModule) process.getBuiltInModule = process.getBuiltinModule;

// 2. Browser APIs missing in Electron Main Process (for PDF reading libraries)
if (typeof global.DOMMatrix === 'undefined') {
    global.DOMMatrix = class DOMMatrix {
        constructor() {
            this.m11 = 1; this.m12 = 0; this.m13 = 0; this.m14 = 0;
            this.m21 = 0; this.m22 = 1; this.m23 = 0; this.m24 = 0;
            this.m31 = 0; this.m32 = 0; this.m33 = 1; this.m34 = 0;
            this.m41 = 0; this.m42 = 0; this.m43 = 0; this.m44 = 1;
        }
    };
}
if (typeof global.ImageData === 'undefined') { global.ImageData = class ImageData { constructor() { } }; }
if (typeof global.Path2D === 'undefined') { global.Path2D = class Path2D { constructor() { } }; }
if (typeof global.CanvasRenderingContext2D === 'undefined') { global.CanvasRenderingContext2D = class CanvasRenderingContext2D { constructor() { } }; }

// 3. Optional: Fix for certain libraries expecting a global 'require'
if (typeof global.require === 'undefined') {
    global.require = require;
}

console.log('[SYSTEM] Core polyfills injected.');
