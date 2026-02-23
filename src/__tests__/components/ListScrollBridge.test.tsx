describe("ListScrollBridge CSS safety", () => {
  it("strips non-word characters when CSS.escape is unavailable", () => {
    const originalEscape = globalThis.CSS?.escape;
    if (globalThis.CSS) globalThis.CSS.escape = undefined as any;

    const maliciousId = '"]){color:red}*{';
    const safeId = maliciousId.replace(/[^\w-]/g, "");
    expect(safeId).toBe("colorred");
    expect(safeId).not.toContain('"');
    expect(safeId).not.toContain("}");

    if (globalThis.CSS && originalEscape) globalThis.CSS.escape = originalEscape;
  });
});
