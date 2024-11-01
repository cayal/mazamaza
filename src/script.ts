import { match3, say } from "./scriptInterpreter";

export function* GameScript() {
    // yield say("I sat there and watched the wind ruffle through the branches.")
    // yield say("I couldn't hear anything.")
    yield [
            say("There were a couple of geese down in the park pecking at some ragged clump in the mud."),
            match3(4, 8)
    ]
}