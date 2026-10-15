/**
 * Test stand-in for Next.js's `server-only` marker. In the app, Next.js makes `import "server-only"` fail
 * the build when a server module is pulled into client code; vitest runs everything in Node, so the
 * marker is simply an empty module here.
 */
export {};
