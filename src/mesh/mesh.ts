import { GFX } from "../gfx/gfx"
import { loadObj } from "../objFile"

export type MeshData = {
    positionBuffer: GPUBuffer,
    normalBuffer: GPUBuffer,
    texCoordBuffer: GPUBuffer,
    indexBuffer: GPUBuffer,
    indexSize: number,
    texture: GPUTexture,
    sampler: GPUSampler
}
export const Mesh = {
    async loadFromObjFile(device: GPUDevice, objUrl: string, texUrl: string): Promise<MeshData> {
        const { positionBuffer, normalBuffer, texCoordBuffer, indexBuffer, indexSize } = await loadObj(device, objUrl)
        const gooseTexRes = await fetch(texUrl)
        const blob = await gooseTexRes.blob()
        const imgBitmap = await createImageBitmap(blob)
        const textureDescriptor: GPUTextureDescriptor = {
            size: { width: imgBitmap.width, height: imgBitmap.height },
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
        };
        const texture = device.createTexture(textureDescriptor);

        device.queue.copyExternalImageToTexture({ source: imgBitmap }, { texture }, textureDescriptor.size);

        const sampler = device.createSampler({
            addressModeU: 'repeat',
            addressModeV: 'repeat',
            magFilter: 'linear',
            minFilter: 'linear',
            mipmapFilter: 'linear',
        });
        
        return {
            positionBuffer,
            normalBuffer,
            texCoordBuffer,
            indexBuffer,
            indexSize,
            texture,
            sampler
        }
    },

    circle(device: GPUDevice,
        encoder: GPURenderPassEncoder, 
        center: [number, number], 
        radius: number, 
        color: [number, number, number]): Partial<MeshData> {

            const vertexCount = 12
            
            const positions = Array(vertexCount * 3).fill(0).map((_, i) => {
                const angle = 2 * Math.PI * i / vertexCount
                const angleEnd = 2 * Math.PI * (i+1) / vertexCount
                return [
                    center[0] + radius * Math.cos(angle), 
                    center[1] + radius * Math.sin(angle),
                    0.0,
                    center[0] + radius * Math.cos(angleEnd),
                    center[1] + radius * Math.sin(angleEnd),
                    0.0,
                    center[0],
                    center[1],
                    0.0
                ]
            }).flat()
            
            const normals = positions.map(posns => {
                return [0, 0, 1]
            }).flat()
            
            const texCoords = positions.map(posns => {
                return [0, 1]
            }).flat()
            
            const vBuffer = GFX.createBuffer(device, Float32Array.from(positions), GPUBufferUsage.VERTEX, 'circleVertexBuffer')
            const nBuffer = GFX.createBuffer(device, Float32Array.from(normals), GPUBufferUsage.VERTEX, 'circleNormalBuffer')
            const tcBuffer = GFX.createBuffer(device, Float32Array.from(texCoords), GPUBufferUsage.VERTEX, 'circleTexCoordBuffer')
            
            const indices = Array(vertexCount*3).fill(0).map((_, i) => i)
            const indexBuffer = GFX.createBuffer(device, Uint16Array.from(indices), GPUBufferUsage.INDEX, 'circleIndexBuffer')
            
            return {
                positionBuffer: vBuffer,
                texCoordBuffer: tcBuffer,
                normalBuffer: nBuffer,
                indexBuffer: indexBuffer,
                indexSize: vertexCount*3
            }
    }
}