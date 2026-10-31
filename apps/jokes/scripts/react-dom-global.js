// Maps react-dom/client to the UMD global loaded from cdnjs in the artifact build.
export const createRoot = (...args) => globalThis.ReactDOM.createRoot(...args);
