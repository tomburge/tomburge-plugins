const f = process.argv.at(-1)!
console.log(JSON.stringify({ results: [{ check_id: "python.lang.security.audit.eval", start: { line: 3 }, extra: { severity: "ERROR", message: "eval on user input in " + f.split(/[\/]/).pop() } }] }))
