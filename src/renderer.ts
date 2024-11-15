import './index.css'
import * as os from "node:os";

// eslint-disable-next-line no-constant-condition,@typescript-eslint/no-unused-vars
const dbgInfo = true as
    boolean ? console.debug : () => {};


type ImmediateStateSchema<CompKeys extends string> = {
    maxImmediateEntities: number,
    components: { readonly [csk in CompKeys]: ComponentSchemaEntry<unknown> },
}

type NilData = {
    readonly storage: 'nil'
}

type VariableData<T> = {
    readonly storage: 'variable',
    iv: T
}

type SizedData<T> = {
    readonly storage: 'sized',
    bytesPerElement: number,
    iv: T,
    encode: (data: T) => Uint8Array,
    decode: (view: DataView) => T | null
}

type CompDataType<CompSpec extends ComponentSchemaEntry<unknown>> =
    CompSpec extends VariableData<infer T> | SizedData<infer T> ? T
            : CompSpec extends NilData ? true
                : never

type Query<Q extends string> = {
    all: Q[]
}

type QueriedEIDs<Ks extends string> = {
    compNames: Ks[],
    eids: number[]
}

type QueryF<ISS extends ImmediateStateSchema<string>> = <Qk extends keyof ISS['components'] & string>(query: Query<Qk>) => QueriedEIDs<Qk>

type ImmediateStateInterpreter<CKs extends string, ISS extends ImmediateStateSchema<CKs>> = {
    maxEntities: number,
    entityCount: () => number,
    entityCreate: () => number,
    entityExists: (eid: number) => boolean,
    entityDestroy: (eid: number) => void,
    attachComponent: <CN extends CKs, Comp extends ISS['components'][CN]>(eid: number, compName: CN, ...value: Comp extends NilData ? [] : [CompDataType<Comp>]) => void,
    hasComponent: (eid: number, compName: CKs) => boolean,
    query: QueryF<ISS>,
    applySystem: <
        Qk extends CKs,
        Wk extends CKs,
        ES
    >(system: {
        self: unknown,
        systemName: string,
        query: Query<Qk>,
        willWrite: Wk[],
        cb: SystemFunction<unknown, ES, ISS, Qk, Wk>
    }, eventualState: ES, dt: number) => void
}

function ComponentKeyedStorage<
    CS extends { readonly [k in keyof CS]: ComponentSchemaEntry<unknown>},
    SType extends 'nil' | 'sized' | 'variable'
>(): Map<
    keyof CS,
    SType extends 'nil' ? DataView
        : SType extends 'sized' ? Uint8Array
            : SType extends 'variable' ? unknown[] : never
> {
    return new Map()
}

function ImmediateStates<
    CK extends string,
    ISS extends ImmediateStateSchema<CK>
>(schema: ISS): ImmediateStateInterpreter<CK, ISS> {
    if (schema.maxImmediateEntities < 32) {
        throw new RangeError(`ImmediateStates must have at least 32 maxImmediateEntities.`)
    }
    const entityFieldMinBytes = Math.ceil(schema.maxImmediateEntities / 8)

    const eidExistenceField = new DataView(new ArrayBuffer(entityFieldMinBytes))

    const eidComponentAttachments = ComponentKeyedStorage<ISS['components'] & {__existence__: { storage: 'nil' }}, 'nil'>()
    eidComponentAttachments.set('__existence__', eidExistenceField)

    const eidComponentSizedStores = ComponentKeyedStorage<ISS['components'], 'sized'>()
    const eidComponentPlainStores = ComponentKeyedStorage<ISS['components'], 'variable'>()

    for (const componentSpec of Object.entries<ComponentSchemaEntry<unknown>>(schema.components)) {
        const compName = componentSpec[0] as CK
        const spec= componentSpec[1]

        eidComponentAttachments.set(compName, new DataView(new ArrayBuffer(entityFieldMinBytes)))

        if (spec.storage === 'variable') {
            eidComponentPlainStores.set(compName, new Array(schema.maxImmediateEntities).fill(null))
        } else if (spec.storage === 'sized') {
            eidComponentSizedStores.set(compName, new Uint8Array(schema.maxImmediateEntities * spec.bytesPerElement))
        }
    }

    let _lastFreeEid = 0
    function _nextFreeEid(): number {
        const full = 2**32-1
        for (let i = 0; i < entityFieldMinBytes / 4; i++) {
            const point = Math.floor(((i + _lastFreeEid) % schema.maxImmediateEntities) / 32)
            const chunk = eidExistenceField.getUint32(point)
            if (chunk >= full) { continue }
            for (let j = 0; j < 32; j++) {
                if ((chunk & (2 ** j)) === 0) {
                    const found = 32*i + j
                    _lastFreeEid = found
                    return found
                }
            }
        }

        throw new RangeError(`No entities left to allocate (max: ${schema.maxImmediateEntities})`)
    }

    return {
        maxEntities: schema.maxImmediateEntities,
        entityCount(): number {
            return _collectPresentEIDs().length
        },
        entityCreate(): number {
            const point = _nextFreeEid()
            _eidFieldSetTrue(point, eidExistenceField)
            return point
        },
        entityExists: _entityExists,
        entityDestroy: _entityDestroy,
        attachComponent: _attachComponent,
        hasComponent: _hasComponent,
        query: _query,
        componentReader: <Qk extends CK>(queried: QueriedEIDs<Qk>, compName: Qk) => {
            const comp = schema.components[compName]
            const eids = queried.eids.toSorted()

            if (comp.storage === 'nil') {
                return eids.map(_ => true)
            } else if (comp.storage === 'variable') {
                return eids.map(eid => eidComponentPlainStores.get(compName)[eid])
            } else {
                const decode = comp.decode
                return eids.map(eid => {
                    const edv = new DataView(eidComponentSizedStores.get(compName).buffer,
                    comp.bytesPerElement * eid,
                    comp.bytesPerElement)
                    return decode(edv)
                })
            }
        },
        applySystem: <Qk extends CK, Wk extends CK, ES>(
            system: {
                self: unknown,
                systemName: string,
                query: Query<Qk>,
                willWrite: (Wk | '__existence__')[],
                cb: SystemFunction<unknown, ES, ISS, Qk, Wk>
            },
            eventualState: unknown,
            dt: number) => {
            const readSlice: (eid: number) => ImmediateStateSlice<Qk, ISS> = (eid: number) => system.query.all.reduce((acc, compName) => {
                const comp = schema.components[compName]
                if (comp.storage === 'nil') {
                    return {
                        ...acc,
                        [compName]: true
                    }
                } else if (comp.storage === 'variable') {
                    return {
                        ...acc,
                        [compName]: eidComponentPlainStores.get(compName)[eid]
                    }
                } else {
                    const view = new DataView(
                        eidComponentSizedStores.get(compName).buffer,
                        eid * comp.bytesPerElement, comp.bytesPerElement)

                    return {
                        ...acc,
                        [compName]: comp.decode(view)
                    }
                }
            }, {} as ImmediateStateSlice<Qk, ISS>)

            const { eids } = _query(system.query)
            for (const eid of eids) {
                const slice = readSlice(eid)
                const retVal = system.cb.call(self, eventualState, slice, dt) as ImmediateStateSlice<Wk, ISS> & { __existence__?: boolean }
                for (const compName of system.willWrite) {
                    if (compName == '__existence__') {
                        if (retVal[compName] === false) {
                            _entityDestroy(eid)
                        }
                        continue
                    }

                    const comp = schema.components[compName]
                    if (comp.storage === 'nil') {
                        _attachComponent(eid, compName)
                    } else {
                        _attachComponent(eid, compName, retVal[compName])
                    }
                }
            }
        }
    }

    function _entityDestroy(eid: number) {

        _eidFieldSetFalse(eid, eidExistenceField)

        for(const compKey of Object.keys(schema.components)) {
            const ck = compKey as CK
            const comp = schema.components[ck]
            if (comp.storage == 'variable') {
                eidComponentPlainStores.get(ck)[eid] = comp.iv
            } else if(comp.storage == 'sized') {
                const resetValue = comp.encode(comp.iv)
                const compDataView = new DataView(eidComponentSizedStores.get(ck).buffer, eid * comp.bytesPerElement, comp.bytesPerElement)
                for (let i = 0; i < comp.bytesPerElement; i++) {
                    compDataView.setUint8(i, resetValue[i])
                }
            }
        }
    }

    function _attachComponent<
        K extends CK, Comp extends ISS['components'][K]
    >(eid: number, compKey: K, ...value: Comp extends NilData ? [] : [CompDataType<Comp>]) {

        if (!_entityExists(eid)) {
            console.warn(`attachComponent() | Cannot set ${compKey.toString()} to ${value}: EID ${eid} does not exist.`)
            return
        }

        _eidFieldSetTrue(eid, eidComponentAttachments.get(compKey))
        const comp = schema.components[compKey]

        if (comp.storage === 'sized') {
            const v = value[0]
            // console.info(`attachComponent() | Setting ${eid}'s ${compKey} to ${v}-> ${Array.from(comp.encode(v)).map(x => x.toString())}`)
            const compDataView = new DataView(eidComponentSizedStores.get(compKey).buffer, eid * comp.bytesPerElement, comp.bytesPerElement)
            const encoded = comp.encode(v)

            for (let i = 0; i < comp.bytesPerElement; i++) {
                compDataView.setUint8(i, encoded[i])
            }
        } else if (schema.components[compKey].storage === 'variable') {
            eidComponentPlainStores.get(compKey)[eid] = value[0]
        }
    }

    function _hasComponent<K extends CK>(eid: number, compName: K): boolean {
        if (!eidComponentAttachments.has(compName)) {
            console.warn(`hasComponent() | Missing component: ${compName}`)
            return false
        }

        const offset = Math.floor(eid / 32)
        const chunk = eidComponentAttachments.get(compName).getUint32(offset)
        return (chunk & 2**(eid % 32)) !== 0
    }

    function _query<Qk extends CK>(query: Query<Qk>): QueriedEIDs<Qk> {
        const existent: number[] = _collectPresentEIDs()
        return {
            compNames: query.all,
            eids: existent.filter(eid => {
                for (const reqCompName of query.all) {
                    if(!_hasComponent(eid, reqCompName)) { return false }
                }
                return true
            })
        }
    }

    function _eidFieldSetTrue(eid: number, dataview: DataView) {
        const offset = Math.floor(eid / 32)
        const chunk = dataview.getUint32(offset)
        dataview.setUint32(offset, chunk | 2**(eid % 32))
    }

    function _eidFieldSetFalse(eid: number, dataview: DataView) {
        const full = 2**32-1
        const offset = Math.floor(eid / 32)
        const chunk = dataview.getUint32(offset)
        dataview.setUint32(offset, chunk & (full - 2**(eid % 32)))
    }

    function _entityExists(eid: number): boolean {
        const offset = Math.floor(eid / 32)
        const chunk = eidExistenceField.getUint32(offset)
        return (chunk & 2**(eid % 32)) !== 0
    }

    function _collectPresentEIDs<K extends keyof ISS['components']>(compName?: K): number[] {
        const subjectField = typeof compName !== 'undefined' ? eidComponentAttachments.get(compName) : eidExistenceField
        const foundEIDs: number[] = []
        for (let chunkIdx = 0; chunkIdx < entityFieldMinBytes / 4; chunkIdx++) {
            const chunk = subjectField.getUint32(chunkIdx)
            if (chunk === 0) { continue }

            for (let j = 0; j < 32; j++) {
                if (chunk & (2 ** j)) {
                    foundEIDs.push(32*chunkIdx + j)
                }
            }
        }
        return foundEIDs
    }
}

// type ComponentValueOf<ISS extends ImmediateStateSchema<string, string[]>, K extends keyof ISS['components']> = ISS['components'][K] extends SizedData<infer T> | VariableData<infer T> ? T : ISS['components'][K] extends NilData ? undefined : never
// type ComponentNamesOf<AS> = AS extends AppState<never, infer CK, never, never> ? CK : never
type ImmediateStateInterpreterOf<AS> = AS extends AppState<infer _ES, infer CK, infer ISS, infer _Stages> ? ImmediateStateInterpreter<CK, ISS>: never

function MakeAppState<
    ES extends { readonly [ek in keyof ES]: ES[ek] },
    const CK extends keyof ISS['components'] & string,
    const ISS extends ImmediateStateSchema<CK>,
    const Stages extends string
>(opts: {
    eventualStateSchema: ES,
    immediateStateSchema: ISS,
    immediateStages: readonly Stages[]
}): AppState<ES, CK, ISS, Stages> {
    type ISI = ImmediateStateInterpreter<CK, ISS>

    type StageQueryRequirementMap = {
        [s in Stages]: Set<keyof ISS['components'] & string>
    }
    type SystemMap = {
        [s in Stages]: Array<
            {
                self: unknown,
                systemName: string,
                query: Query<CK>,
                willWrite: ('__existence__' | CK)[],
                cb: SystemFunction<unknown, ES, ISS, CK, CK>
            }
        >
    }

    const _eventualState: ES = opts.eventualStateSchema
    const _eventualStateSubscribers = {
        '_debug': [] // Responds to every dispatch. For debugging use.
    } as { [k in keyof ES | '_debug' | '_frameReady']: Array<{self: object, cb: (curState: ES) => void}> }
    const _frameReadySubscribers = [] as Array<{self: object, cb: (immediateState: ISI, dt: number) => void }>

    const _immediateStates = ImmediateStates<CK, ISS>(opts.immediateStateSchema)
    let _tickStart: number = performance.now();

    const _immediateStageSystems = opts.immediateStages.reduce<SystemMap>(
        (a, s) => (
            {
                ...a,
                [s]: []
            }
        ), {} as SystemMap)

    const _stageQueryRequirements = opts.immediateStages.reduce<StageQueryRequirementMap>(
        (a, s) => (
            {
                ...a,
                [s]: new Set()
            }
        ), {} as StageQueryRequirementMap)

    document.addEventListener('DOMContentLoaded', () => {
        requestAnimationFrame(_tickImmediateStates)
    })

    return {
        useDispatch: _useDispatch,
        subscribe: _subscribe,
        subscribeFrameReady: function<This>(
            target: (this: This, immediateState: ISI, dt: number) => void,
            context: ClassMethodDecoratorContext<HTMLElement, (this: HTMLElement, immediateState: ISI, dt: number) => void>
        ) {
            context.addInitializer(
                function(): void {
                    if (!_frameReadySubscribers.some(({ self }) => self === this)) {
                        _frameReadySubscribers.push({
                            self: this,
                            cb: target
                        })
                    }
                }
            )
        },
        dispatch: _dispatch,
        immediate: _immediateStates,
        useAsSystemOfStage: _useAsSystemOfStage
    }

    async function _dispatch<K extends keyof ES>(name: K, value: ES[K]): Promise<void> {
        _eventualState[name] = value

        _eventualStateSubscribers['_debug'].forEach(s => s.cb.call(s.self,
            _eventualState,
            _immediateStates))

        const subscribers = _eventualStateSubscribers[name] ?? []
        for (const subscriber of subscribers) {
            subscriber.cb.call(subscriber.self, _eventualState)
        }
    }

    function _useAsSystemOfStage<
        WillRead extends CK,
        WillWrite extends CK,
    >(opts: {
        duringStage: Stages ,
        query: Query<WillRead>,
        willWrite: (WillWrite | '__existence__')[],
    }) {

        return function <This>(target: SystemFunction<This, ES, ISS, WillRead, WillWrite>,
                                 context: (
                                     ClassMethodDecoratorContext<
                                         This,
                                         SystemFunction<This, ES, ISS, WillRead, WillWrite>
                                     > & { readonly static: true }
                                     )) {
            context.addInitializer(
                function(): void {
                    let _existing;
                    if ((_existing = _immediateStageSystems[opts.duringStage].find(x => x.systemName == target.name))) {
                        console.warn(`_useAsSystemOfStage(${target.name}) | No-op (already registered by:`, _existing.self)
                        return
                    }

                    _immediateStageSystems[opts.duringStage].push({
                        self: this,
                        cb: target as SystemFunction<This, ES, ISS, CK, CK>,
                        query: opts.query,
                        willWrite: opts.willWrite,
                        systemName: target.name,
                    })
                }
            )
        }
    }

    function _useDispatch<This, Args extends unknown[], Return>(
        target: (this: This, dispatch: Dispatcher<ES>, ...args: Args) => Return
    ): (this: HTMLElement) => Promise<void> {
        return async function(this: HTMLElement): Promise<void> {
            target.call(this, _dispatch)
        }
    }

    function _subscribe<K extends keyof ES>(toEvent: K): SubscribeDecorator<ES> {
        return function _subscribeDecorator<This, Args extends unknown[], Return>(
            target: (this: This, curState: ES, ...args: Args[]) => Return,
            context: ClassMethodDecoratorContext<HTMLElement, (this: HTMLElement, curState: ES) => void>,
        ): void {
            context.addInitializer(
                function(): void {
                    if (typeof _eventualStateSubscribers[toEvent] === 'undefined') {
                        _eventualStateSubscribers[toEvent] = []
                    }
                    if (!_eventualStateSubscribers[toEvent].some(({self}) => self === this)) {
                        _eventualStateSubscribers[toEvent].push({
                            self: this,
                            cb: target
                        })
                    }
                }
            )
        }
    }

    function _tickImmediateStates(time: number) {
        const dt = (time - _tickStart) / 1000;
        _tickStart = time;
        _frameReadySubscribers.forEach(s => s.cb.call(s.self,
            _immediateStates,
            dt))

        opts.immediateStages.forEach(curStage => {
            _immediateStageSystems[curStage].forEach(system => _immediateStates.applySystem(system, _eventualState, dt))
        })

        requestAnimationFrame(_tickImmediateStates)
    }
}

type Dispatcher<ES> = <K extends keyof ES>(name: K, value: ES[K]) => Promise<void>

type EventsOf<AS> = AS extends AppState<infer ES, never, never, never> ? ES : never

type ImmediateStateSliceOf<AS, QKs extends string[]> = AS extends AppState<infer _ES, never, infer ISS, never>
    ? QKs[number] extends keyof ISS['components'] & string
        ? ImmediateStateSlice<QKs[number], ISS>
        : never | { __typeDebug__: 'CKs[number] does not extend keyof ISS[\'components\'].' }
    : never | { __typeDebug__: 'AS does not extend AppState.' }

type ImmediateStateSlice<
    CKs extends keyof ISS['components'] & string,
    ISS extends ImmediateStateSchema<unknown & string>
> =  { [qk in CKs]: CompDataType<ISS['components'][qk]> }

type SystemFunction<
    This,
    ES,
    ISS extends ImmediateStateSchema<string>,
    WillRead extends keyof ISS['components'] & string,
    WillWrite extends keyof ISS['components'] & string,
> = (this: This,
     eventualState: ES,
     immediateStates: ImmediateStateSlice<WillRead, ISS>,
     dt: number) => ImmediateStateSlice<WillWrite, ISS> & { __existence__?: boolean }


type SubscribeDecorator<ES> = <This, Args extends unknown[], Return>(
    target: (this: This, curState: ES, ...args: Args[]) => Return,
    context: ClassMethodDecoratorContext<HTMLElement, (this: HTMLElement, curState: unknown, immediateStates: unknown, dt: number) => void>,
) => void

type FrameReadyDecorator<ISS extends ImmediateStateSchema<CK>, CK extends keyof ISS['components'] & string> = <This>(
    target: (this: This, immediateStates: ImmediateStateInterpreter<CK, ISS>, dt: number) => void,
    context: ClassMethodDecoratorContext<HTMLElement, (this: HTMLElement, immediateStates: ImmediateStateInterpreter<CK, ISS>, dt: number) => void>,
) => void

function customElement<T extends CustomElementConstructor>(name: string) {
    return (_target: T, context: ClassDecoratorContext<T>) => {
        context.addInitializer(function(): void {
            customElements.define(name, this);
        });
    }
}



type AppState<
    ES extends { readonly [ek in keyof ES]: ES[ek] },
    CK extends keyof ISS['components'] & string,
    ISS extends ImmediateStateSchema<CK>,
    Stages extends string
> = {
    dispatch: Dispatcher<ES>

    subscribe: <Ev extends (keyof ES)>(toEvent: Ev) => SubscribeDecorator<ES>

    subscribeFrameReady: FrameReadyDecorator<ISS, CK>

    useDispatch: <
        This, Args extends unknown[], Return
    >(
        target: (this: This, dispatch: Dispatcher<ES>, ...args: Args) => Return,
        context: ClassMethodDecoratorContext<This, (this: This, dispatch: Dispatcher<ES>, ...args: Args) => Return>
    ) =>
        () => Promise<void>

    immediate: ImmediateStateInterpreter<CK, ISS>

    useAsSystemOfStage: <
        const WillRead extends CK,
        const WillWrite extends CK | '__existence__',
    >(opts: {
        duringStage: Stages,
        query: Query<WillRead>,
        willWrite: WillWrite[]
    }) => <This>(target: (this: This,
                        eventualState: ES,
                        immediateStates: ImmediateStateSlice<WillRead, ISS>,
                        dt: number) => ImmediateStateSlice<Exclude<WillWrite, '__existence__'>, ISS> & {[ex in Extract<WillWrite, '__existence'>]: boolean},
               context: (
                   ClassMethodDecoratorContext<
                       This, (this: This,
                              eventualState: ES,
                              immediateStates: ImmediateStateSlice<WillRead, ISS>,
                              dt: number) => ImmediateStateSlice<Exclude<WillWrite, '__existence__'>, ISS> & {[ex in Extract<WillWrite, '__existence'>]: boolean}
                   > & { readonly static: true } )
        ) => void
}

type ComponentSchemaEntry<T> = VariableData<T> | SizedData<T> | NilData

const appState = MakeAppState({
    eventualStateSchema: {
        pointerMove: [0, 0] as [x: number, y: number],
        pointerClick: 0,
        uiMarkup: '',
    },
    immediateStateSchema: {
        maxImmediateEntities: 32,
        components: {
            position: {
                storage: 'sized',
                bytesPerElement: 8,
                iv: [0, 0] as [number, number],
                encode: (pos: [x: number, y: number]) => {
                    const [x, y] = pos
                    return new Uint8Array(Float32Array.from([x, y]).buffer, 0, 8)
                },
                decode: (view: DataView) => [
                    view.getFloat32(0, true),
                    view.getFloat32(4, true)
                ] as [number, number]
            },
            velocity: {
                storage: 'sized',
                bytesPerElement: 8,
                iv: [0, 0] as [number, number],
                encode: (vel: [x: number, y: number]) => {
                    const [x, y] = vel
                    return new Uint8Array(Float32Array.from([x, y]).buffer, 0, 8)
                },
                decode: (view: DataView) => [
                    view.getFloat32(0, true),
                    view.getFloat32(4, true)
                ] as [number, number]
            },
            acceleration: {
                storage: 'sized',
                bytesPerElement: 8,
                iv: [0, 0] as [number, number],
                encode: (acc: [x: number, y: number]) => {
                    const [x, y] = acc
                    return new Uint8Array(Float32Array.from([x, y]).buffer)
                },
                decode: (view: DataView) => [
                    view.getFloat32(0, true), view
                        .getFloat32(4, true)
                ] as [number, number]
            },
            debugRadius: {
                storage: 'nil'
            }
        },
    },
    immediateStages: ['accelIntegration', 'velocityIntegration', 'cullOOB']
})



class _VelocityIntegrator {
    @appState.useAsSystemOfStage({ duringStage: 'accelIntegration', query: { all: ['acceleration', 'velocity'] }, willWrite: ['velocity'] })
    static integrateAcceleration(eventualState: EventsOf<typeof appState>,
                             queriedState: ImmediateStateSliceOf<typeof appState, ['acceleration', 'velocity']>,
                             dt: number) {
        const [ax, ay] = queriedState.acceleration
        return {
            velocity: [
                queriedState.velocity[0] + (ax*dt),
                queriedState.velocity[1] + (ay*dt),
            ] as [number, number],
        }
    }

    @appState.useAsSystemOfStage({ duringStage: 'velocityIntegration', query: { all: ['position', "velocity"] }, willWrite: ['position'], })
    static integrateVelocity(eventualState: EventsOf<typeof appState>,
                             queriedState: ImmediateStateSliceOf<typeof appState, ['position', 'velocity']>,
                             dt: number) {
        const [vx, vy] = queriedState.velocity
        return {
            position: [queriedState.position[0] + vx*dt, queriedState.position[1] + vy*dt] as [number, number],
        }
    }

    @appState.useAsSystemOfStage({ duringStage: 'cullOOB', query: { all: ['position'] }, willWrite: ['__existence__'] })
    static cullIfOutOfBounds(eventualState: EventsOf<typeof appState>,
                             queriedState: ImmediateStateSliceOf<typeof appState, ['position']>,
                             dt: number) {
        return {
            __existence__: !(
                queriedState.position[0] > 2
                || queriedState.position[0] < -2
                || queriedState.position[1] > 2
                || queriedState.position[1] < -2
            )
        }
    }

}

@customElement('pointer-pane')
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class PointerPane extends HTMLElement {
    hostEl: HTMLElement
    constructor() {
        const _hel = super()
        this.hostEl = _hel as unknown as HTMLElement
    }

    @appState.useDispatch
    async connectedCallback(dispatch: typeof appState['dispatch']) {
        this.hostEl.addEventListener('mousemove', (e: MouseEvent): Promise<void> => dispatch('pointerMove', [e.x, e.y]))
        this.hostEl.addEventListener('mousedown', (e): Promise<void> => {
            const rect = this.hostEl.getBoundingClientRect()
            const newE = appState.immediate.entityCreate()
            appState.immediate.attachComponent(newE, 'position',
                [
                    e.x / rect.width,
                    e.y / rect.height
                ]
            )
            appState.immediate.attachComponent(newE, 'debugRadius')
            appState.immediate.attachComponent(newE, 'velocity', [0.0, -1.0])
            appState.immediate.attachComponent(newE, 'acceleration', [0.0, 1.0])

            dispatch('pointerClick', performance.now())
            return
        })
    }
}

@customElement('debug-info')
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class DebugInfo extends HTMLElement {
    hostEl: HTMLElement
    constructor() {
        const _hel = super()
        this.hostEl = _hel as unknown as HTMLElement
    }

    // noinspection JSUnusedGlobalSymbols
    connectedCallback(): void {
        console.log('DebugInfo connected')
    }

    // @ts-expect-error The _debug event is on the secret menu.
    @appState.subscribe('_debug')
    update(eventualState: EventsOf<typeof appState>, immediateStates: ImmediateStateInterpreterOf<typeof appState>) {
        this.hostEl.innerHTML = JSON.stringify(eventualState, undefined, 4)
        this.hostEl.innerHTML += `<hr>Entities: ${immediateStates.entityCount()} / ${immediateStates.maxEntities}`
    }
}

@customElement('modal-ui')
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class ModalUI extends HTMLElement {
    hostEl: HTMLElement
    constructor() {
        const _hel = super()
        this.hostEl = _hel as unknown as HTMLElement
    }

    // noinspection JSUnusedGlobalSymbols
    connectedCallback(): void {
        console.log('ModalUI connected')
    }

    @appState.subscribe('uiMarkup')
    update(eventualState: EventsOf<typeof appState>) {
        this.hostEl.innerHTML = eventualState.uiMarkup
    }
}

@customElement('canvas-display')
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class CanvasDisplay extends HTMLElement {
    hostEl: HTMLElement
    canvas: HTMLCanvasElement
    ctx: CanvasRenderingContext2D
    constructor() {
        const _hel = super()
        this.hostEl = _hel as unknown as HTMLElement
    }

    connectedCallback(): void {
        console.log('CanvasDisplay connected')
        this.canvas = this.hostEl.querySelector('canvas')
        this.ctx = this.canvas.getContext('2d')
        this.canvas.setAttribute('style', '')
    }

    @appState.subscribeFrameReady
    drawBalls(immediateStates: ImmediateStateInterpreterOf<typeof appState>, dt: number) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
        const eids = immediateStates.query({ all: ['position'] })
        const positions = immediateStates.componentReader(eids, 'position')
        positions.forEach((value) => {
            this.ctx.fillStyle = 'blue'
            const x = (value[0]) * this.canvas.width
            const y = (value[1]) * this.canvas.height
            this.ctx.beginPath()
            this.ctx.arc(x-5, y-5, 10, 0, 2*Math.PI)
            this.ctx.closePath()
            this.ctx.fill()
        })
    }
}
