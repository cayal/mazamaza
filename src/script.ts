export const script = [
    "Line 1",
    "Then, it was line 2",
    "Shortly thereafter, it was line 3.",
    "Line 4 loomed in the distance.",
]

export const ScriptInterpreter = function*() {
    for (let s of script) {
        yield s
    }
}
