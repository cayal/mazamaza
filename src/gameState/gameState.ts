import { Mesh } from "src/mesh/mesh"

export type ResidualStateUnit<K extends string, T> = {
    key: K,
    put: (gameState: any, value: T) => object & { [key in K]: T }
    pik: (gameState: any) => T
}

export type ResidualSignal<Ps extends object> = {
    name: string,
    payloadSchema: Ps
}

export type ResidualReflex<Pr extends Partial<ResidualSignal<any>['payloadSchema']>> = {
    observedSignal: string,
    callback: (payload: Pr) => void
}

const _gameState = () => {
    let _nextRealtimeEntity = 0
    let _realtimeEntities = new Uint8Array(8192)

    let _residualStateUnits: Record<string, ResidualStateUnit<any, any>> = {}
    let _residualState: any = {}

    let _residualStateSignals: Record<string, ResidualSignal<any>> = {}
    let _residualStateReflexes: ResidualReflex<any>[] = []

    let _timeId: NodeJS.Timeout | null = null;
    let _shouldRunGame = false
    let _t_last = performance.now()

    return ({
        registerSignal: <P>(message: string, payload: P) => {
            _residualStateSignals[message] = {
                name: message,
                payloadSchema: payload
            }
        },
        dispatch: (message: string, payload: any) => {
            let _signal = _residualStateSignals[message]
            if (!_signal) {
                throw new RangeError(`No signal found for ${message}`)
            }
            _residualStateReflexes.forEach(reflex => {
                if (reflex.observedSignal === message) {
                    reflex.callback(payload)
                }
            })
        },
        useReflex: (reflex: ResidualReflex<any>) => {
            _residualStateReflexes.push(reflex)
        },
        use: (unit: ResidualStateUnit<any, any>) => {
            if (!_residualStateUnits[unit.key]) {
                _residualStateUnits[unit.key] = unit
            }
        },
        set: (key: string, value: any) => {
            let u = _residualStateUnits[key]
            if (!u) {
                throw new RangeError(`No unit found for key ${key}`)
            }
            _residualState = u.put(_residualState, value)
        },
        get: (key: string) => {
            let _unit = _residualStateUnits[key]
            if (!_unit) {
                throw new RangeError(`No unit found for key ${key}`)
            }
            return _unit.pik(_residualState)
        },
        entities: _realtimeEntities,
        addEntity() {
            const eid = _nextRealtimeEntity
            _realtimeEntities[eid] = 1
            _nextRealtimeEntity++
            return eid
        },
        components: _components(),
        systems: _systems(),
        initRealtime: (drawFrame: any) => {
            _shouldRunGame = true

            const reRender = async () => {
                const t_now = performance.now()
                const dt = t_now - _t_last

                gameState.systems.tick(gameState, dt)

                _t_last = t_now
                drawFrame(gameState)
                if (_timeId) {
                    clearTimeout(_timeId);
                }
                if (_shouldRunGame) {
                    _timeId = setTimeout(() => {
                        requestAnimationFrame(reRender);
                    }, 17);
                }
            }

            requestAnimationFrame(reRender);
            
        },
        stopRealtime: () => {
            clearTimeout(_timeId)
            _shouldRunGame = false
        }
    })
}

const _gs = _gameState()
_gs.registerSignal('visibilityChange', '')
_gs.use({ key: 'shownScreen', put: (state, value) => ({...state, shownScreen: value }), pik: (state) => state.shownScreen })
_gs.use({ key: 'history', put: (state, value) => ({...state, history: value }), pik: (state) => state.history })
_gs.set('history', [])

export const gameState = _gs
export type GameState = ReturnType<typeof _gameState>

export type RealtimeSystem<K extends keyof RealtimeComponents> = {
    componentNames: K[],
    update: (gameState: GameState, delta_t: number, components: ComponentQueriedEntities<K>[]) => void
}

export type RealtimeComponent<N extends number, T> = { bit: N, data: T }

export type RealtimeComponents = {
    MeshBundle: RealtimeComponent<0b00000010, Mesh.MeshData>,
    Position3d: {
        bit: 0b00000100,
        data: {
            angleX: number,
            angleY: number,
            angleZ: number,
            positionX: number,
            positionY: number,
            positionZ: number
        }
    },
    Gravity: {
        bit: 0b00001000,
        data: { accel: number }
    },
    PlayerControl: {
        bit: 0b00010000,
        data: { jumpForce: number }
    },
    Velocity: {
        bit: 0b00100000,
        data: { velocityX: number, velocityY: number, velocityZ: number }
    },
    Acceleration: {
        bit: 0b01000000,
        data: { accelX: number, accelY: number, accelZ: number }
    }
}

type RealtimeComponentBitmap = { [key in keyof RealtimeComponents]: RealtimeComponents[key]['bit'] }
type RealtimeEntityComponentData = { [key in keyof RealtimeComponents]: { [eid: number]: RealtimeComponents[key]['data'] } }
type ComponentQueriedEntities<K extends keyof RealtimeComponents> = { eid: number, datas: { [Ki in K]: RealtimeComponents[Ki]['data'] } }
type RealtimeComponentUnit = {
    attach: (entities: Uint8Array, eid: number, componentName: keyof RealtimeComponents, data: RealtimeComponents[typeof componentName]['data']) => void
    query: <K extends keyof RealtimeComponents>(entities: Uint8Array, ...componentNames: K[]) => Array<ComponentQueriedEntities<K>>
}

function _components(): RealtimeComponentUnit {
    const _cbitmap: RealtimeComponentBitmap = {
        MeshBundle: 0b00000010,
        Position3d: 0b00000100,
        Gravity: 0b00001000,
        PlayerControl: 0b00010000,
        Velocity: 0b00100000,
        Acceleration: 0b01000000
    }

    const _ecdata: RealtimeEntityComponentData = {
        MeshBundle: {},
        Position3d: {},
        Gravity: {},
        PlayerControl: {},
        Velocity: {},
        Acceleration: {}
    }

    return {
        attach(
            entities: Uint8Array, 
            eid: number, 
            componentName: keyof RealtimeComponents, 
            data: RealtimeComponents[typeof componentName]['data']
        ) {
            entities[eid] |= _cbitmap[componentName]
            _ecdata[componentName][eid] = data
        },
        
        query<K extends keyof RealtimeComponents>(
            entities: Uint8Array, 
            ...componentNames: K[]
        ): Array<ComponentQueriedEntities<K>> {
            const componentBits = componentNames.reduce((acc, componentName) => acc | _cbitmap[componentName], 0)

            const result: Array<ComponentQueriedEntities<K>> = []

            for (let eid = 0; eid < entities.length; eid++) {
                if (entities[eid] & componentBits) {
                    result.push({ eid, datas: componentNames.reduce((acc, name) => { 
                        acc[name] = _ecdata[name][eid]; return acc }, {} as { [Ki in K]: RealtimeComponents[Ki]['data'] }) 
                    })
                }
            }
            return result
        }
    }
}


type RealtimeSystemUnit = {
    register: (system: RealtimeSystem<any>) => void
    tick: (gameState: GameState, delta_t: number) => void
}

function _systems(): RealtimeSystemUnit {
    let _systems: RealtimeSystem<any>[] = []

    return {
        register: (system: RealtimeSystem<any>) => {
            _systems.push(system)
        },
        tick: (gameState: GameState, delta_t: number) => {
            _systems.forEach(system => {
                system.update(gameState, delta_t, gameState.components.query(gameState.entities, ...system.componentNames))
            })
        }
    }
}