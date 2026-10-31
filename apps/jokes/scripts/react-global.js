// Maps `import ... from "react"` to the UMD global loaded from cdnjs in the artifact build.
const R = globalThis.React;
export default R;
export const { StrictMode, useCallback, useEffect, useMemo, useRef, useState, Fragment } = R;
export const jsx = (type, props, key) => R.createElement(type, key === undefined ? props : { ...props, key });
export const jsxs = jsx;
