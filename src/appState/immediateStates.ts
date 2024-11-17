import {Sizable, SizedData} from "./sizedDataTypes";

export function CompBuiltIns<const X extends string>(list: X[]) { return list }

export const compBuiltins = CompBuiltIns(['__existence__'])

export type BuiltinKeys = (typeof compBuiltins)[number]

export function ImmediateComponentSet<Names extends string>(
    eidMaxCount: number,
    ...zeroToNNames: Names[]
) {
    type NamesXL = Names | BuiltinKeys

    const BYTES_PER_EID = 4

    if (zeroToNNames.length > BYTES_PER_EID * 8) {
        throw new RangeError(`Can't use > ${BYTES_PER_EID * 8} names (provided: ${zeroToNNames.length}).`)
    }

    const presenceField = new DataView(new ArrayBuffer(BYTES_PER_EID * eidMaxCount))

    const masks = new Map<NamesXL, number>()
    masks.set('__existence__', 0b00000000_00000000_00000000_0000001)
    zeroToNNames.forEach((compName, i) => {
        masks.set(compName, 2 ** (i+1))
    })

    const compNum = (...compNames: NamesXL[]) => compNames.reduce((acc, cn) => (acc | masks.get(cn)), 0)

    const allEIDs = Array(eidMaxCount).fill(0).map((_, i) => i)

    return {
        eidMaxCount,
        names: zeroToNNames,
        count:  _count,
        haveAll: _haveAll,
        haveAny: _haveAny,
        include: _include,
        declude: _declude
    }

    function _count(compName: NamesXL) {
        return _haveAny(allEIDs, compName).length
    }

    function _haveAll(eids: number[], ...compNames: NamesXL[]) {
        const _eids = eids.length == 0 ? allEIDs : eids
        return _eids.filter(eid => (presenceField.getUint32(BYTES_PER_EID * eid, true) & compNum(...compNames)) !== 0)
    }

    function _haveAny(eids: number[], ...compNames: NamesXL[]) {
        const _eids = eids.length == 0 ? allEIDs : eids
        return _eids.filter(eid => {
            const subject = presenceField.getUint32(BYTES_PER_EID * eid, true)
            return compNames.some(cn => (subject & masks.get(cn)) > 0)
        })
    }

    function _include(eids: number[], ...compNames: NamesXL[]) {
        const _eids = eids.length == 0 ? allEIDs : eids
        _eids.filter(eid => {
            const existing = presenceField.getUint32(BYTES_PER_EID * eid, true)
            const mask = compNum(...compNames)
            presenceField.setUint32(BYTES_PER_EID * eid, existing | mask, true)
        })
    }

    function _declude(eids: number[], ...compNames: NamesXL[]) {
        const _eids = eids.length == 0 ? allEIDs : eids
        return _eids.filter(eid => {
            const existing = presenceField.getUint32(BYTES_PER_EID * eid, true)
            return presenceField.setUint32(BYTES_PER_EID * eid, existing & ~(compNum(...compNames)), true)
        })
    }
}

export function ImmediateSizedAttachment<D>(
    componentSet: ReturnType<typeof ImmediateComponentSet<string>>,
    name: (typeof componentSet)['names'][number],
    sizable: Sizable<D>
) {
    const storageField = new DataView(new ArrayBuffer(sizable.bytesPerElement * componentSet.eidMaxCount))

    return {
        name,
        read(...eids: number[]): D[] {
            return eids.map(eid => {
                const edv = new DataView(storageField.buffer,
                    sizable.bytesPerElement * eid,
                    sizable.bytesPerElement)
                return sizable.decode(edv)
            })
        },
        write(...eidVals:[eid: number, value: D][]) {
            componentSet.include(eidVals.map(([eid, _]) => eid), name)
            eidVals.forEach(([eid, value]) => {
                const encoded = sizable.encode(value)
                const edv = new DataView(storageField.buffer, eid * sizable.bytesPerElement, sizable.bytesPerElement)

                for (let i = 0; i < sizable.bytesPerElement; i++) {
                    edv.setUint8(i, encoded[i])
                }
            })
        },
    }
}

export function ImmediateStates<
    const BC extends string[],
    const SC extends string[],
    const BitKeys extends BC[number] extends BuiltinKeys ? never : BC[number],
    const SizedKeys extends SC[number] extends BuiltinKeys ? never : SC[number],
    const SizedCompSpecs extends { [sk in SizedKeys]: ReturnType<typeof SizedData> },
    const Stages extends string
>(schema: {
    maxEIDs: number,
    bitComponents: BC,
    sizedComponents: SC,
    sizedAttachments: ((keyof SizedCompSpecs & string) extends SizedKeys
        ? (SizedKeys extends (keyof SizedCompSpecs & string)
            ? SizedCompSpecs
            : never & { _debugInfo: 'Some members listed in `sizedComponents` are missing attachments.' })
        : never & { _debugInfo: 'Too many attachments provided relative to the `sizedComponents` option.' })
    integrationStages: readonly Stages[]
}) {
    if (schema.maxEIDs < 32) {
        throw new RangeError(`ImmediateStates must have at least 32 maxImmediateEntities.`)
    }

    const allComponents: (BitKeys | SizedKeys)[] = [
        ...schema.bitComponents as unknown as BitKeys[],
        ...Object.keys(schema.sizedAttachments) as SizedKeys[]
    ]

    const componentSet = ImmediateComponentSet(schema.maxEIDs, ...allComponents)
    const sizedAttachments = Object.keys(schema.sizedAttachments)
        .reduce<Record<SizedKeys, ReturnType<typeof ImmediateSizedAttachment>>>((acc, k: SizedKeys) => ({
            ...acc,
            [k]: ImmediateSizedAttachment(componentSet, k, schema.sizedAttachments[k])
        }) , {} as Record<SizedKeys, ReturnType<typeof ImmediateSizedAttachment>>)

    let _lastFreeEid = 0
    function _nextFreeEid(): number {
        for (let i = 0; i < schema.maxEIDs; i++) {
            const curEid = (_lastFreeEid + i) % schema.maxEIDs
            if (componentSet.haveAny([curEid], '__existence__').length == 0) {
                _lastFreeEid = curEid
                return curEid
            }
        }

        throw new RangeError(`No entities left to allocate (max: ${schema.maxEIDs})`)
    }

    type SystemSpecification = {
        self: unknown
        systemName: string
        willRead: (SizedKeys & (SizedKeys | BitKeys))[]
        willWrite: (SizedKeys | BitKeys)[] | BuiltinKeys[]
        query: { all: (SizedKeys | BitKeys)[] }
        cb: (
            (eventualState: unknown,
             dt: number,
             eid: number,
             data: {[rk in SizedKeys]: SizedCompSpecs[rk]['iv']}
            ) => {
                [wk in (BuiltinKeys | BitKeys | SizedKeys)]: wk extends BitKeys | BuiltinKeys
                    ? boolean
                    : wk extends SizedKeys
                        ? SizedCompSpecs[wk]['iv']
                        : never
            }
        )}

    const _systemsForIntegrationStages = new Map<
        Stages, SystemSpecification[]
    >

    for (const stage of schema.integrationStages) {
        _systemsForIntegrationStages.set(stage, [])
    }

    return {
        maxEntities: schema.maxEIDs,
        integrationStages: schema.integrationStages,
        bitKeys: schema.bitComponents,
        sizedKeys: schema.sizedComponents,
        sizedAttachments: schema.sizedAttachments,
        entityExists: _entityExists,
        entityCount(): number { return componentSet.count('__existence__') },
        entityCreate(): number {
            const point = _nextFreeEid()
            componentSet.include([point], '__existence__')
            return point
        },
        attachComponent: _attachComponent,
        hasComponent: _hasComponent,
        query: _query,
        applySystem: _applySystem,
        specifySystem: _specifySystem,
        advanceStages: _advanceStages
    }

    function _advanceStages<ES>(eventualState: ES, dt: number) {
        _systemsForIntegrationStages.forEach(systems => {
            systems.forEach(system =>
                _applySystem(system, eventualState, dt))
        })
    }

    function _applySystem<
        WillQuery extends SizedKeys | BitKeys,
        WillRead extends WillQuery & SizedKeys,
        WillWrite extends SizedKeys | BitKeys
    >(
        system: ReturnType<ReturnType<typeof _specifySystem<WillQuery, WillRead, WillWrite[] | BuiltinKeys[]>>>,
        eventualState: unknown,
        dt: number) {
        const qRes = _query(system.query)


        for (const eid of qRes.eids) {
            const attachmentData = system.willRead.reduce<{[wr in WillRead]: SizedCompSpecs[WillRead]['iv']}>(
                (acc, wr) => {
                    const at = sizedAttachments[wr]
                    const atDat = at.read(eid)[0]
                    return {...acc, [wr]: atDat }
                }, {} as {[wr in WillRead]: SizedCompSpecs[WillRead]['iv']})

            const result = system.cb.call(self,
                eventualState,
                dt,
                eid,
                attachmentData
            ) as Record<WillWrite | BuiltinKeys, unknown>

            componentSet.include([eid], ...(Object.keys(result) as (BitKeys | SizedKeys | BuiltinKeys)[]))
            for (const compName of Object.keys(result)) {
                if (compName == '__existence__') {
                    if (result['__existence__'] === false) {
                        componentSet.declude([eid], '__existence__')
                    }
                    continue
                }

                if (compName in sizedAttachments) {
                    sizedAttachments[compName as SizedKeys].write([eid, result[compName as WillWrite]])
                }
            }
        }
    }

    function _attachComponent<K extends BitKeys | SizedKeys>(
        eid: number,
        compKey: K,
        ...value: K extends SizedKeys ? [SizedCompSpecs[K]['iv']] : []
    ) {

        if (!_entityExists(eid)) {
            console.warn(`attachComponent() | Cannot set ${compKey} to ${value}: EID ${eid} does not exist.`)
            return
        }

        componentSet.include([eid])
        if (value.length && compKey in sizedAttachments) {
            sizedAttachments[compKey as SizedKeys].write([eid, value[0]])
        }
    }

    function _hasComponent<K extends BitKeys | SizedKeys>(eid: number, compName: K): boolean {
        if (!componentSet.names.includes(compName)) {
            console.warn(`hasComponent() | Missing component: ${compName}`)
            return false
        }

        return componentSet.haveAny([eid], compName).length > 0
    }

    function _query<
        Qk extends BitKeys | SizedKeys,
        AT extends {[sk in Qk & SizedKeys]: typeof sizedAttachments[sk]}
    >(query: { all: Qk[] }) {
        const matchedEids = componentSet.haveAll([], '__existence__', ...query.all)
        return {
            compNames: query.all,
            eids: matchedEids,
            attachments: Object.entries<Sizable<unknown>>(schema.sizedAttachments).reduce<AT>((acc, spec) => {
                const sk: SizedKeys = spec[0] as SizedKeys

                if (!query.all.includes(sk as Qk)) { return acc }

                return {
                    ...acc,
                    [sk]: sizedAttachments[sk]
                }
            }, {} as AT)
        }
    }

    function _specifySystem<
        WillQuery extends SizedKeys | BitKeys,
        WillRead extends WillQuery & SizedKeys,
        WillWrites extends (SizedKeys | BitKeys)[] | BuiltinKeys[],
        >({willQuery, willRead, willWrite}: {
            willQuery: WillQuery[],
            willRead: WillRead[],
            willWrite: WillWrites,
        }) {
            return function _supplySpec<CB extends (eventualState: unknown,
                                                    dt: number,
                                                    eid: number,
                                                    data: {[rk in WillRead]: SizedCompSpecs[rk]['iv']}
            ) => {
                [wk in WillWrites[number]]: wk extends BitKeys | BuiltinKeys
                    ? boolean
                    : wk extends SizedKeys
                        ? SizedCompSpecs[wk]['iv']
                        : never
                 }>(
                self: unknown,
                duringStage: Stages,
                callback: CB) {
                const fullSpec = {
                    self: self,
                    systemName: callback.name,
                    willRead: willRead,
                    willWrite: willWrite,
                    query: { all: willQuery },
                    cb: callback
                }

                let _existing;
                if ((_existing = _systemsForIntegrationStages.get(duringStage).find(x => x.systemName == fullSpec.systemName))) {
                    console.warn(`_specifySystem->_supplySpec(${fullSpec.systemName}) | No-op (already registered by:`, _existing.self)
                    return
                }

                _systemsForIntegrationStages.get(duringStage).push(fullSpec as unknown as SystemSpecification)

                return fullSpec
        }
    }

    function _entityExists(eid: number) { return componentSet.haveAny([eid], '__existence__').length > 0 }

}