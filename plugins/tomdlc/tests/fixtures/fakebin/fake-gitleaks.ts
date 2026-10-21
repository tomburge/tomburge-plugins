const a = process.argv; const out = a[a.indexOf("--report-path") + 1]
await Bun.write(out, JSON.stringify([{ RuleID: "generic-api-key", StartLine: 2, Description: "Generic API Key", Secret: "SHOULD-NOT-APPEAR" }]))
