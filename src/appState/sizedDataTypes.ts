export type XYZ = {x: number, y: number, z: number}

export function SizedData<D>(opts: Sizable<D>): Sizable<D> { return opts }
export type Sizable<D> = {
    bytesPerElement: number,
    iv: D,
    encode: (data: D) => Uint8Array,
    decode: (view: DataView) => D | null
}

export function SizedVec3Data() {
    return SizedData({
        bytesPerElement: 12,
        iv: {x: 0, y: 0, z: 0},
        encode: ({x, y, z}: XYZ) => {
            return new Uint8Array(Float32Array.from([x, y, z]).buffer, 0, 12)
        },
        decode: (view: DataView) => ({
            x: view.getFloat32(0, true),
            y: view.getFloat32(4, true),
            z: view.getFloat32(8, true)
        })
    })
}
