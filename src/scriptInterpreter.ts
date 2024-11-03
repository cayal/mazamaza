import { gameState } from "./gameState/gameState";

export function say(text: string) {
    gameState.set('shownScreen', 'modalDialogue');
    gameState.dispatch('visibilityChange', 'modal-dialogue');
    gameState.set('modalDialogue', text);
}

export function flappy(boardWidth: number, boardHeight: number) {
    console.log('Flappt gane callback in scriptInterpreter')
    gameState.set('shownScreen', 'flappy');
    gameState.dispatch('visibilityChange', 'flappy-game');
    gameState.dispatch('flappy.gameStart', { boardWidth, boardHeight })
}

export function history(queryKey: string) {
    let historyEntries = gameState.get('history')
    return historyEntries.includes(queryKey)
}