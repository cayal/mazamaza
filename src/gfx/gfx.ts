import glMatrix from "../glMatrix"

export namespace GFX {
    export const VAttrSizes: {[s in GPUVertexFormat]: number} = {
        unorm8x2:  1 * 2,
        unorm8x4:  1 * 4,
        uint8x2:   1 * 2,
        uint8x4:   1 * 4,
        sint8x2:   1 * 2,
        sint8x4:   1 * 4,
        snorm8x2:  1 * 2,
        snorm8x4:  1 * 4,
        unorm16x2: 2 * 2,
        unorm16x4: 2 * 4,
        uint16x2:  2 * 2,
        uint16x4:  2 * 4,
        sint16x2:  2 * 2,
        sint16x4:  2 * 4,
        snorm16x2: 2 * 2,
        snorm16x4: 2 * 4,
        float16x2: 2 * 2,
        float16x4: 2 * 4,
        float32:   4 * 1,
        float32x2: 4 * 2,
        float32x3: 4 * 3,
        float32x4: 4 * 4,
        uint32:    4 * 1,
        uint32x2:  4 * 2,
        uint32x3:  4 * 3,
        uint32x4:  4 * 4,
        sint32:    4 * 1,
        sint32x2:  4 * 2,
        sint32x3:  4 * 3,
        sint32x4:  4 * 4,
        "unorm10-10-10-2": 4,
    }

    export type AttribInfo<Sh extends string> = {
        label: `${Sh}->${string}`,
        attribDesc: GPUVertexAttribute,
        bufferLayoutDesc: GPUVertexBufferLayout
    }
    
    export type AttribInfoList<Sh extends string> = {
        readonly entries: AttribInfo<Sh>[],
        add: (shaderSrc: Sh, attrName: string, format: GPUVertexFormat, location: number) => AttribInfoList<Sh>
    }
    export function MakeAttribInfoList<Sh extends string>(): AttribInfoList<Sh> {
        let _lastLocation = 0
        let _offset = 0

        const _add = function MakeAttribInfoList_Add(
            shaderSrc: Sh, 
            attrName: string,
            format: GPUVertexFormat,
            location: number
        ): AttribInfoList<Sh> {
            if (location !== _lastLocation) {
                _offset = 0
            }

            const attribDesc: GPUVertexAttribute = {
                shaderLocation: location,
                offset: _offset,
                format: format
            }

            const nextEntries = [...this.entries, {
                label: `${shaderSrc}->${attrName}`,
                attribDesc,
                bufferLayoutDesc: {
                    attributes: [ attribDesc ],
                    arrayStride: VAttrSizes[format],
                }
            }]

            _offset += VAttrSizes[format]
            _lastLocation = location

            return {
                entries: nextEntries,
                add: _add
            }
        }
        
        return {
            entries: [],
            add: _add
        }
    }


    export type ShadingStrategy = {
        shaderLabel: string,
        shaderModule: GPUShaderModule,
        uniformBindGroup: GPUBindGroup,
        pipeline: GPURenderPipeline
    }

    export function MakeShadingStrat<Sh extends string>(
        label: string,
        uniformLayoutEntries: GPUBindGroupLayoutEntry[],
        uniformBindingResources: GPUBindingResource[],
        attributes: AttribInfo<Sh>[],
        shaderSrc: string,
        device: GPUDevice,
        useDepth: boolean=false
    ): ShadingStrategy {
        if (uniformBindingResources.length !== uniformLayoutEntries.length) {
            throw new RangeError(`MakeShadingStrat() | Can\'t make for ${shaderSrc}: 
                There are ${uniformLayoutEntries.length} uniform layout entries 
                but ${uniformBindingResources.length} uniform resources to bind.`)
        }

        let uniformBindGroup: GPUBindGroup
        let pipelineLayoutDesc: GPUPipelineLayoutDescriptor;

        if (uniformLayoutEntries.length == 0) {
            pipelineLayoutDesc = { 
                label: `${label}.pipelineLayoutDesc_nullUniforms`,
                bindGroupLayouts: []
            }
        } else {
            const uniformBindGroupLayout = device.createBindGroupLayout({
                entries: uniformLayoutEntries,
                label: `${label}.uniformBindGroupLayout`
            });

            const bindGroupDescriptorEntries = uniformBindingResources.map((br, i) => ({
                    binding: i,
                    resource: br
            }))

            uniformBindGroup = device.createBindGroup({
                entries: bindGroupDescriptorEntries,
                layout: uniformBindGroupLayout,
                label: `${label}.uniformBindGroup`
            })

            pipelineLayoutDesc = { 
                bindGroupLayouts: [uniformBindGroupLayout],
                label: `${label}.pipelineLayoutDesc`
            };
        }

        const pipelineLayout = device.createPipelineLayout(pipelineLayoutDesc);

        const colorState: GPUColorTargetState = {
            format: 'bgra8unorm'
        };

        const shaderModule = device.createShaderModule({ 
            code: shaderSrc,
            label: `${label}.shaderModule`
        })

        const pipeline = device.createRenderPipeline({
            label: `${label}.pipeline`,
            layout: pipelineLayout,
            vertex: {
                module: shaderModule,
                entryPoint: 'vs_main',
                buffers: attributes.map(x => x.bufferLayoutDesc)
            },
            fragment: {
                module: shaderModule,
                entryPoint: 'fs_main',
                targets: [ colorState ]
            },
            primitive: {
                topology: 'triangle-list',
                frontFace: 'ccw',
                cullMode: 'back'
            },
            depthStencil: useDepth ? {
                depthWriteEnabled: true,
                depthCompare: 'less',
                format: 'depth24plus-stencil8'
            } : undefined
        });

        return {
            shaderLabel: label,
            shaderModule,
            uniformBindGroup,
            pipeline
        }
    }

    export function createBuffer(device: GPUDevice, buffer: Float32Array | Uint32Array | Uint16Array | Uint8Array, usage: GPUBufferUsageFlags, label?: string) {
        const bufferDesc: GPUBufferDescriptor = {
            label,
            size: buffer.byteLength,
            usage: usage,
            mappedAtCreation: true
        };

        let gpuBuffer = device.createBuffer(bufferDesc);

        if (buffer instanceof Float32Array) {
            const writeArrayNormal = new Float32Array(gpuBuffer.getMappedRange());
            writeArrayNormal.set(buffer);
        }
        else if (buffer instanceof Uint16Array) {
            const writeArrayNormal = new Uint16Array(gpuBuffer.getMappedRange());
            writeArrayNormal.set(buffer);
        }
        else if (buffer instanceof Uint8Array) {
            const writeArrayNormal = new Uint8Array(gpuBuffer.getMappedRange());
            writeArrayNormal.set(buffer);
        }
        else if (buffer instanceof Uint32Array) {
            const writeArrayNormal = new Uint32Array(gpuBuffer.getMappedRange());
            writeArrayNormal.set(buffer);
        }
        else {
            const writeArrayNormal = new Float32Array(gpuBuffer.getMappedRange());
            writeArrayNormal.set(buffer);
            console.error("Unhandled buffer format ", typeof gpuBuffer);
        }

        gpuBuffer.unmap();
        return gpuBuffer;
    }

    export function recomputeProjectionIfCanvasChanged(
        device: GPUDevice,
        canvas: HTMLCanvasElement,
        depthTexture: GPUTexture
    ): {
        projectionMatrixUniformBufferUpdate: GPUBuffer,
        depthAttachment: GPURenderPassDepthStencilAttachment
     } | null {
        const devicePixelRatio = window.devicePixelRatio || 1;
        let currentCanvasWidth = canvas.clientWidth * devicePixelRatio;
        let currentCanvasHeight = canvas.clientHeight * devicePixelRatio;
        let projectionMatrixUniformBufferUpdate = null;
        if (!(depthTexture === null || currentCanvasWidth != canvas.width || currentCanvasHeight != canvas.height)) {
            return null
        }
        else {
            canvas.width = currentCanvasWidth;
            canvas.height = currentCanvasHeight;

            const depthTextureDesc: GPUTextureDescriptor = {
                size: [canvas.width, canvas.height, 1],
                dimension: '2d',
                format: 'depth24plus-stencil8',
                usage: GPUTextureUsage.RENDER_ATTACHMENT
            };

            if (depthTexture !== null) {
                depthTexture.destroy();
            }

            depthTexture = device.createTexture(depthTextureDesc);
            let depthTextureView = depthTexture.createView();

            let depthAttachment: GPURenderPassDepthStencilAttachment = {
                view: depthTextureView,
                depthClearValue: 1,
                depthLoadOp: 'clear',
                depthStoreOp: 'store',
                stencilClearValue: 0,
                stencilLoadOp: 'clear',
                stencilStoreOp: 'store'
            };

            let projectionMatrix = glMatrix.mat4.perspective(glMatrix.mat4.create(),
                1.4, canvas.width / canvas.height, 0.1, 1000.0) as unknown as Float32Array;

            projectionMatrixUniformBufferUpdate = GFX.createBuffer(device, projectionMatrix, GPUBufferUsage.COPY_SRC, 'projectionMatrixUniformBufferUpdate');

            return {
                depthAttachment,
                projectionMatrixUniformBufferUpdate
            }
        }
    }


}