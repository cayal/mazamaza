import { gameState } from "./gameState/gameState";

export function say(text: string) {
    gameState.set('modalDialogue', text);
}

export function flappy(boardWidth: number, boardHeight: number) {
    console.log('Flappt gane callback in scriptInterpreter')
    gameState.dispatch('flappy.gameStart', { boardWidth, boardHeight })
}