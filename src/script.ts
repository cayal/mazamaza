import { flappy, say, history } from "./scriptInterpreter";

export function* GameScript() {
    yield say("I sat there and watched the wind ruffle through the branches.")
    yield say("I couldn't hear anything.")
    yield [
            say("There were a couple of geese down in the park pecking at some ragged clump in the mud."),
            flappy(4, 8)
    ]
    if (history('flappyGameFailed')) {
        yield say("The geese thought I was a bagel and they attacked me.")
        yield say("Oh, man, they attacked. I become a bagel.")
        yield say("I am a bagel.")
    } else {
        yield say("After I finished watching the geese, I thought about bagels.")
        yield say("I dreamt of bagels.")
    }
}