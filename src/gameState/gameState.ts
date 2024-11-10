import { Mesh } from "../mesh/mesh"

type EnumMenu<
    Keys extends string,
    KeyOptions extends { [eventName in Keys]: string[] }
> = {
    withExpandedMenu: <K extends string, V extends string>(
        key: K, ...value: V[]
    ) => EnumMenu<Keys | K, KeyOptions & { [k in K]: V }>

    records: Array<{[k in Keys]: KeyOptions[k]}>,
    addRecord: <K extends Keys>(key: K, value: KeyOptions[K]) => void,
    query: <K extends Keys>(key: K) => KeyOptions[K][]
}


function InitEnumMenu<
    Keys extends never,
    KeyOptions extends { [eventName in Keys]: string[] }
>(entries={}) {
    const _menu = entries
    const _records: Array<{[k in Keys]: KeyOptions[k]}> = []

    return {
        withExpandedMenu: <K extends string, V extends string>(
            eventKey: K,
            ...potentialValues: V[]
        ): EnumMenu<Keys | K, KeyOptions & { [k in K]: V }> => {
            return InitEnumMenu({..._menu, [eventKey]: potentialValues}) as EnumMenu<Keys | K, KeyOptions & { [k in K]: V; }>
        },

        records: _records,
        addRecord: <P extends Keys>(x: P, y: KeyOptions[P]) => {
            _records.push({ [x]: y } as { [k in Keys]: KeyOptions[k] })
        },
        query: <K extends Keys>(key: K): KeyOptions[K][] => {
            return _records.filter((x) => key in x).map(x => x[key])
        }
    } as EnumMenu<Keys, KeyOptions>
}

type FlexMenu<
    Dishes extends string,
    Flavors extends { [dishName in Dishes]: unknown },
> = {
    keys: Dishes[],
    getLens: <D extends Dishes>(key: D) => EventualStateEntry<D, Flavors[D]>,
    withExpandedMenu: <
        const K extends string,
        V,
        O extends EventualStateEntry<K, V>
    >(o: O) => FlexMenu<Dishes | O['key'], Flavors & {[o in O['key']]: O['iv']}>,
}

function InitFlexMenu<
    Dishes extends never,
    Flavors extends { [dishName in Dishes]: unknown },
>(entries: { [d in Dishes]: EventualStateEntry<d, Flavors[d]> }={}): FlexMenu<Dishes, Flavors> {
    const _menu = entries

    return {
        keys: Object.keys(_menu) as Dishes[],
        getLens: <D extends Dishes>(key: D) => _menu[key],
        withExpandedMenu: <
            const K extends string,
            V,
            const O extends EventualStateEntry<K, V>
        >(o: O): FlexMenu<Dishes | O['key'], Flavors & {[o in O['key']]: O['iv']}> => {
            return InitFlexMenu({..._menu, [o.key]: o.iv })
        },
    }
}

export type EventualSignal<S extends string, Ps extends object> = {
    readonly name: S,
    payloadSchema: Ps,
}

export type EventualReflex<Pr extends Partial<EventualSignal<any>['payloadSchema']>> = {
    observedSignal: string,
    callback: (payload: Pr) => void,
}


export type EventualStateEntry<K extends string, T> = {
    readonly key: K,
    iv: T,
    put: (gameState: { [k in K]?: T }, value: T) => typeof gameState & { [key in K]: T }
    pik: (gameState: { [k in K]?: T } ) => T
}

export type AppliedStateEntry<GS, K extends string, T> = {
    readonly key: K,
    iv: T,
    set: (value: T) => GS
    get: () => T
}



// { [dishName in Dishes]: EventualStateEntry<dishName, Flavors[dishName]> }



const _gameState = () => {
    let _nextRealtimeEntity = 0
    const _realtimeEntities = new BigUint64Array(8192)

    const _eventualStateUnits: Record<string, EventualStateEntry<any, any>> = {}
    let _residualState: any = {}

    const _eventualStateSignals: Record<string, EventualSignal<string, any>> = {
        _dbgUpdate: { name: '_dbgUpdate', payloadSchema: { message: '', curState: {} } }
    }
    
    const _dbgDispatch = (message: string) => {
        _eventualReflexes.forEach(reflex => {
            if (reflex.observedSignal === '_dbgUpdate') {
                _eventualStateUnits['history'].put(_residualState, [..._residualState.history, { message, curState: _residualState }])
                reflex.callback({ message, curState: _residualState })
            }
        })
    }
    
    const _eventualReflexes: EventualReflex<any>[] = []

    let _timeId: NodeJS.Timeout | null = null;
    let _shouldRunGame = false
    let _t_last = performance.now()
    
    return ({
        applyStateEntry: <K extends string, T>({key, iv, put, pik}: {
                                                          key: K
                                                       iv: T,
            put: (gameState: { [k in K]?: T }, value: T) => typeof gameState & { [key in K]: T },
            pik: (gameState: { [k in K]?: T }) => T | null
        }) => {
            const wrappedPik = () => {
                return pik(_residualState) ?? iv
            }
            const wrappedPut = (value: T) => {
                const statePrime = put(_residualState, value)
                _dbgDispatch('_dbgUpdate')
                _dispatch(key, pik(statePrime))
                return statePrime
            }

            return {key, iv, get: wrappedPik, set: wrappedPut } satisfies AppliedStateEntry<typeof _residualState, K, T>
        },

        registerSignal: <P>(message: string, payload: P) => {
            _dbgDispatch(`registerSignal: ${message}`)

            _eventualStateSignals[message] = {
                name: message,
                payloadSchema: payload,
            }
        },
        dispatch: _dispatch,
        useReflex: (reflex: EventualReflex<any>) => {
            _dbgDispatch(`useReflex: ${reflex.observedSignal}`)

            _eventualReflexes.push(reflex)
        },
        use: (unit: EventualStateEntry<any, any>) => {
            _dbgDispatch(`use: ${unit.key}`)

            if (!_eventualStateUnits[unit.key]) {
                _eventualStateUnits[unit.key] = unit
            }
        },
        set: (key: string, value: any) => {
            _dbgDispatch(`set: ${key}`)

            let u = _eventualStateUnits[key]
            if (!u) {
                throw new RangeError(`No unit found for key ${key}`)
            }
            _residualState = u.put(_residualState, value)
        },
        get: (key: string) => {
            _dbgDispatch(`get: ${key}`)

            let _unit = _eventualStateUnits[key]
            if (!_unit) {
                throw new RangeError(`No unit found for key ${key}`)
            }
            return _unit.pik(_residualState)
        },
        entities: _realtimeEntities,
        addEntity() {
            _dbgDispatch(`addEntity`)

            const eid = _nextRealtimeEntity
            _realtimeEntities[eid] = 1n
            _nextRealtimeEntity++
            return eid
        },
        components: _components(),
        systems: _systems(),
        initRealtime: (drawFrame: any) => {
            _dbgDispatch(`initRealtime`)

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
            _dbgDispatch(`stopRealtime`)

            clearTimeout(_timeId)
            _shouldRunGame = false
        }
    })

    function _dispatch(message: string, payload: unknown) {
        _dbgDispatch(`dispatch: ${message}`)

        _eventualReflexes.forEach(reflex => {
            if (reflex.observedSignal === message) {
                reflex.callback(payload)
            }
        })
    }
}

const _gs = _gameState()
_gs.registerSignal('visibilityChange', '')
_gs.use({ key: 'shownScreen', put: (state, value) => ({...state, shownScreen: value }), pik: (state) => state.shownScreen })
_gs.use({ key: 'history', put: (state, value) => ({...state, history: value }), pik: (state) => state.history })
_gs.set('history', [])

export const gameState = _gs
export type GameState = ReturnType<typeof _gameState>

export type RealtimeSystemUnit<K extends keyof RealtimeComponents> = {
    componentNames: K[],
    update: (gameState: GameState, delta_t: number, components: ComponentQueriedEntities<K>[]) => void
}

export type RealtimeComponentUnit<N extends bigint, T> = { bit: N, data: T }

export type RealtimeComponents = {
    MeshBundle: RealtimeComponentUnit<0b00000010n, Mesh.MeshData>,
    Position3d: {
        bit: 0b00000100n,
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
        bit: 0b00001000n,
        data: { accel: number }
    },
    PlayerControl: {
        bit: 0b00010000n,
        data: { jumpForce: number }
    },
    Velocity: {
        bit: 0b00100000n,
        data: { velocityX: number, velocityY: number, velocityZ: number }
    },
    Acceleration: {
        bit: 0b01000000n,
        data: { accelX: number, accelY: number, accelZ: number }
    }
}

type RealtimeComponentBitmap = { [key in keyof RealtimeComponents]: RealtimeComponents[key]['bit'] }
type RealtimeEntityComponentData = { [key in keyof RealtimeComponents]: { [eid: number]: RealtimeComponents[key]['data'] } }
type ComponentQueriedEntities<K extends keyof RealtimeComponents> = { eid: number, datas: { [Ki in K]: RealtimeComponents[Ki]['data'] } }
type RealtimeCompsh = {
    attach: (entities: BigUint64Array, eid: number, componentName: keyof RealtimeComponents, data: RealtimeComponents[typeof componentName]['data']) => void
    query: <K extends keyof RealtimeComponents>(entities: BigUint64Array, ...componentNames: K[]) => Array<ComponentQueriedEntities<K>>
}

function _components(): RealtimeCompsh {
    const _cbitmap: RealtimeComponentBitmap = {
        MeshBundle: 0b00000010n,
        Position3d: 0b00000100n,
        Gravity:    0b00001000n,
        PlayerControl: 0b00010000n,
        Velocity:      0b00100000n,
        Acceleration:  0b01000000n
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
            entities: BigUint64Array, 
            eid: number, 
            componentName: keyof RealtimeComponents, 
            data: RealtimeComponents[typeof componentName]['data']
        ) {
            entities[eid] |= _cbitmap[componentName]
            _ecdata[componentName][eid] = data
        },
        
        query<K extends keyof RealtimeComponents>(
            entities: BigUint64Array, 
            ...componentNames: K[]
        ): Array<ComponentQueriedEntities<K>> {
            const componentBits = componentNames.reduce((acc, componentName) => acc | _cbitmap[componentName], 0n)

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


type RealtimeSystems = {
    register: (system: RealtimeSystemUnit<any>) => void
    tick: (gameState: GameState, delta_t: number) => void
}

function _systems(): RealtimeSystems {
    let _systems: RealtimeSystemUnit<any>[] = []

    return {
        register: (system: RealtimeSystemUnit<any>) => {
            _systems.push(system)
        },
        tick: (gameState: GameState, delta_t: number) => {
            _systems.forEach(system => {
                system.update(gameState, delta_t, gameState.components.query(gameState.entities, ...system.componentNames))
            })
        }
    }
}