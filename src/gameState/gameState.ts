export type GameStateUnit<K extends string, T> = {
    key: K,
    put: (gameState: any, value: T) => object & { [key in K]: T }
    pik: (gameState: any) => T
}

export type Signal<Ps extends object> = {
    name: string,
    payloadSchema: Ps
}

export type Reflex<Pr extends Partial<Signal<any>['payloadSchema']>> = {
    observedSignal: string,
    callback: (payload: Pr) => void
}

const _gameState = () => {
    let _signals: Record<string, Signal<any>> = {}
    let _reflexes: Reflex<any>[] = []
    let _units: Record<string, GameStateUnit<any, any>> = {}
    let _state: any = {}

    return ({
        registerSignal: <P>(message: string, payload: P) => {
            _signals[message] = {
                name: message,
                payloadSchema: payload
            }
        },
        dispatch: (message: string, payload: any) => {
            let _signal = _signals[message]
            if (!_signal) {
                throw new RangeError(`No signal found for ${message}`)
            }
            _reflexes.forEach(reflex => {
                if (reflex.observedSignal === message) {
                    reflex.callback(payload)
                }
            })
        },
        useReflex: (reflex: Reflex<any>) => {
            _reflexes.push(reflex)
        },
        use: (unit: GameStateUnit<any, any>) => {
            if (!_units[unit.key]) {
                _units[unit.key] = unit
            }
        },
        set: (key: string, value: any) => {
            let u = _units[key]
            if (!u) {
                throw new RangeError(`No unit found for key ${key}`)
            }
            _state = u.put(_state, value)
        },
        get: (key: string) => {
            let _unit = _units[key]
            if (!_unit) {
                throw new RangeError(`No unit found for key ${key}`)
            }
            return _unit.pik(_state)
        }
    })
}

export const gameState = _gameState()
