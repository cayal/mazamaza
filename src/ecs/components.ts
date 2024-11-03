import { Mesh } from "src/mesh/mesh"

export type Components = {
    MeshComponent: {
        bit: 0b00000010,
        data: Mesh.MeshData
    }
}

type ComponentBitmap = { [key in keyof Components]: Components[key]['bit'] }
type ECData = { [key in keyof Components]: { [eid: number]: Components[key]['data'] } }

const _components = () => {
    const _cbitmap: ComponentBitmap = {
        MeshComponent: 0b00000010
    }

    const _ecdata: ECData = {
        MeshComponent: {}
    }

    return {
        attach(
            entities: Uint8Array, 
            eid: number, 
            componentName: keyof Components, 
            data: Components[typeof componentName]['data']
        ) {
            entities[eid] |= _cbitmap[componentName]
            _ecdata[componentName][eid] = data
        },
        
        query(
            entities: Uint8Array, 
            componentName: keyof Components
        ): Array<{ eid: number, data: Components[typeof componentName]['data'] }> {
            const componentBit = _cbitmap[componentName]
            const componentData = _ecdata[componentName]

            const result: Array<{ eid: number, data: Components[typeof componentName]['data'] }> = []

            for (let eid = 0; eid < entities.length; eid++) {
                if (entities[eid] & componentBit) {
                    result.push({ eid, data: componentData[eid] })
                }
            }
            return result
        }
    }
}

export const components = _components()
