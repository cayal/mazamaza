import { gameState } from "./renderer";

export function say(text: string) {
    gameState.set('modalDialogue', text);
}

export function match3(boardWidth: number, boardHeight: number) {
    console.log('Match 3 callback in scriptInterpreter')
    gameState.dispatch('match3.gameStart', { boardWidth, boardHeight })
}