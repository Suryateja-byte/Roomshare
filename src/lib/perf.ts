export function safeMark(name: string): void {
    if (typeof performance === 'undefined') return;
    try { performance.mark(name); } catch { /* WebView or unsupported */ }
}
export function safeMeasure(name: string, startMark: string, endMark: string): void {
    if (typeof performance === 'undefined') return;
    try { performance.measure(name, startMark, endMark); } catch { /* WebView or unsupported */ }
}
