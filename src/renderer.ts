import './index.css';

type GameStateUnit<K extends string, T> = {
    key: K,
    put: (gameState: any, value: T) => object & { [key in K]: T }
    pik: (gameState: any) => T
}


type Signal<Ps extends object> = {
    name: string,
    payloadSchema: Ps
}

type Reflex<Pr extends Partial<Signal<any>['payloadSchema']>> = {
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

const gameScript: Generator<void | void[]> = GameScript()

// @ts-ignore
import mainShaderSrc from './vertex.wgsl?raw';

// @ts-ignore
import sketchShaderSrc from './sketch.wgsl?raw';

//@ts-ignore
import gooseUrl from './static/Goose/Mesh_Goose.obj?url'

// @ts-ignore
import gooseTexture from './static/Goose/Tex_Goose.png'

// @ts-ignore
import catImg from './static/celeste.png'
import glMatrix from './glMatrix';
import { loadObj } from './objFile';
import { GameScript } from './script';

namespace CanvasSetup {
    export function attachResizeObserver(canvas: HTMLCanvasElement, render: FrameRequestCallback) {
        let timeId: NodeJS.Timeout = null
        const resizeObserver = new ResizeObserver((_entries) => {
            if (timeId) {
                clearTimeout(timeId);
            }

            timeId = setTimeout(() => {
                requestAnimationFrame(render);
            }, 100)
        })

        requestAnimationFrame(render)
        resizeObserver.observe(canvas)
    }

    export async function getWebGPUContext(canvas: HTMLCanvasElement): Promise<
    {
        context: GPUCanvasContext,
        device: GPUDevice
    }> {
        if (!navigator.gpu) {
            console.error("WebGPU not supported");
            throw new TypeError('WebGPU not supported');
        }

        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            console.error("Failed to get WebGPU adapter");
            throw new TypeError('Failed to get WebGPU adapter');
        }

        const device = await adapter.requestDevice();
        if (!device) {
            console.error("Failed to get WebGPU device");
            throw new TypeError('Failed to get WebGPU device');
        }

        let context = canvas.getContext('webgpu');

        const canvasConfig = {
            device: device,
            format: navigator.gpu.getPreferredCanvasFormat(),
            usage:
                GPUTextureUsage.RENDER_ATTACHMENT,
            alphaMode: 'opaque' as GPUCanvasAlphaMode
        };

        context.configure(canvasConfig);

        return {
            device: device,
            context: context
        }
    }
}

namespace GFX {
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
                format: 'float32x3'
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
        uniformBindGroupLayout: GPUBindGroupLayout,
        uniformBindGroup: GPUBindGroup,
        pipeline: GPURenderPipeline
    }

    export function MakeShadingStrat<Sh extends string>(
        uniformLayoutEntries: GPUBindGroupLayoutEntry[],
        uniformBindingResources: GPUBindingResource[],
        attributes: AttribInfo<Sh>[],
        shaderSrc: string,
        device: GPUDevice
    ): ShadingStrategy {

        if (uniformBindingResources.length !== uniformLayoutEntries.length) {
            throw new RangeError(`MakeShadingStrat() | Can\'t make for ${shaderSrc}: 
                There are ${uniformLayoutEntries.length} uniform layout entries 
                but ${uniformBindingResources.length} uniform resources to bind.`)
        }

        let uniformBindGroupLayout = device.createBindGroupLayout({
            entries: uniformLayoutEntries
        });

        let bindGroupDescriptorEntries = uniformBindingResources.map((br, i) => ({
                binding: i,
                resource: br
        }))

        let uniformBindGroup = device.createBindGroup({
            layout: uniformBindGroupLayout,
            entries: bindGroupDescriptorEntries
        })

        const pipelineLayoutDesc = { bindGroupLayouts: [uniformBindGroupLayout] };
        const pipelineLayout = device.createPipelineLayout(pipelineLayoutDesc);

        const colorState: GPUColorTargetState = {
            format: 'bgra8unorm'
        };

        let label = shaderSrc.split('/').slice(-1).join('')
        let shaderModule = device.createShaderModule({ 
            code: mainShaderSrc,
            label
        })

        const pipelineDesc: GPURenderPipelineDescriptor = {
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
                cullMode: 'none'
            },
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: 'less',
                format: 'depth24plus-stencil8'
            }
        };

        return {
            shaderLabel: label,
            shaderModule,
            uniformBindGroupLayout,
            uniformBindGroup,
            pipeline: device.createRenderPipeline(pipelineDesc)
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

    export function drawCircle(device: GPUDevice,
        encoder: GPURenderPassEncoder, 
        center: [number, number], 
        radius: number, 
        color: [number, number, number, number]) {

            const vertexCount = 12
            
            const positions = Array(vertexCount * 3).fill(0).map((_, i) => {
                const angle = 2 * Math.PI * i / vertexCount
                return [
                    center[0] + radius * Math.cos(angle), 
                    center[1] + radius * Math.sin(angle),
                    0.0
                ]
            })
            
            const vertexArray = new Float32Array(positions.flat())
            const vertexBuffer = GFX.createBuffer(device, vertexArray, GPUBufferUsage.VERTEX)
            
            const vertexBufferLayout: GPUVertexBufferLayout = {
                arrayStride: 4 * 3,
                stepMode: 'vertex',
                attributes: [
                    {
                        shaderLocation: 0,
                        format: 'float32x3',
                        offset: 0
                }]
            }

            // const circleDrawPipelineDesc = {
            //     vertex: {
            //         module: shaderModule,
            //         entryPoint: 'vs_main',
            //         buffers: [vertexBufferLayout]
            //     }
            // }

            // encoder.setVertexBuffer(0, vertexBuffer, 0, vertexBufferLayout)
            encoder.draw(vertexCount)
    }
}

namespace GameElements {
    export class PointerGlass extends HTMLElement {
        hostEl: HTMLElement

        constructor() {
            // @ts-ignore
            const _hel = super()
            //
            // @ts-ignore
            this.hostEl = _hel as HTMLElement
        }

        connectedCallback() {
            console.log('PointerGlass connected')
            this.hostEl.addEventListener('click', (e) => {
                gameScript.next()
            })
        }
    }

    export class ModalDialogue extends HTMLElement {
        hostEl: HTMLElement
        #appendTimeout: NodeJS.Timeout | null = null
        #tt = ''
        get targetText() {
            return this.#tt
        }
        set targetText(newText: string) {
            this.hostEl.innerHTML = ''
            this.#tt = newText
            if (this.#appendTimeout) {
                clearTimeout(this.#appendTimeout)
            }

            const appendQueue = this.#tt.split('').reverse()
            const appendText = () => {
                this.hostEl.innerHTML += appendQueue.pop()
                if (appendQueue.length) {
                    this.#appendTimeout = setTimeout(appendText, 30)
                }
            }

            appendText()
        }

        _stateUnit: GameStateUnit<'modalDialogue', string> = {
            key: 'modalDialogue',
            put: (gameState, value) => {
                let statePrime = {
                    ...gameState,
                    modalDialogue: value
                }
                this.targetText = value
                return statePrime
            },
            pik: (gameState) => gameState?.modalDialogue ?? ''
        }

        constructor() {
            // @ts-ignore
            const _hel = super()
            //
            // @ts-ignore
            this.hostEl = _hel as HTMLElement
        }

        connectedCallback() {
            console.log('ModalScene connected')
            gameState.use(this._stateUnit)
            gameState.useReflex({
                observedSignal: 'match3.gameStart',
                callback: (payload) => {
                    this.hostEl.style.transform = 'translateY(20vw)'
                }
            })
        }
    }

    export class Match3 extends HTMLElement {
        hostEl: HTMLElement

        constructor() {
            // @ts-ignore
            const _hel = super()
            
            // @ts-ignore
            this.hostEl = _hel as HTMLElement
        }

        connectedCallback() {
            console.log('Match3 connected')
            gameState.registerSignal('match3.gameStart', { 
                boardWidth: undefined as number, 
                boardHeight: undefined as number 
            })

        }
    }
    
    type EncodeDrawCallback = (
        encoder: GPURenderPassEncoder,
        pipeline: GPURenderPipeline,
        uniformBindGroup: GPUBindGroup,
        positionBuffer: GPUBuffer,
        normalBuffer: GPUBuffer,
        indexBuffer: GPUBuffer,
        indexSize: number
    ) => void

    export class ThreeDStage extends HTMLElement {
        hostEl: HTMLElement

        context: GPUCanvasContext
        device: GPUDevice

        pipeline: GPURenderPipeline
        positionBuffer: GPUBuffer
        normalBuffer: GPUBuffer
        indexBuffer: GPUBuffer
        uniformBindGroup: GPUBindGroup
        indexSize: number

        initMainPipeline = async (
            modelViewMatrixUniformBuffer: GPUBuffer, 
            projectionMatrixUniformBuffer: GPUBuffer, 
            normalMatrixUniformBuffer: GPUBuffer,
        ) => {
            const uLets = [
                    {
                        binding: 0,
                        visibility: GPUShaderStage.VERTEX,
                        buffer: {}
                    },
                    {
                        binding: 1,
                        visibility: GPUShaderStage.VERTEX,
                        buffer: {}
                    },
                    {
                        binding: 2,
                        visibility: GPUShaderStage.VERTEX,
                        buffer: {}
                    }
                ]
                
            const uBindingResources: GPUBindingResource[] = [
                { buffer: modelViewMatrixUniformBuffer },
                { buffer: projectionMatrixUniformBuffer },
                { buffer: normalMatrixUniformBuffer }
            ]
                
            let attributeList = GFX.MakeAttribInfoList<typeof mainShaderSrc>()
            attributeList = attributeList.add(mainShaderSrc, 'position', 'float32x3', 0)
            attributeList = attributeList.add(mainShaderSrc, 'normal', 'float32x3', 1)

            return GFX.MakeShadingStrat(uLets, uBindingResources, attributeList.entries, mainShaderSrc, this.device)
        }
        
        encodeMainDraw: EncodeDrawCallback = (
                encoder: GPURenderPassEncoder,
                pipeline: GPURenderPipeline,
                uniformBindGroup: GPUBindGroup,
                positionBuffer: GPUBuffer,
                normalBuffer: GPUBuffer,
                indexBuffer: GPUBuffer,
                indexSize: number
            ) => {
            encoder.setPipeline(pipeline)
            encoder.setBindGroup(0, uniformBindGroup)
            encoder.setVertexBuffer(0, positionBuffer)
            encoder.setVertexBuffer(1, normalBuffer)
            encoder.setIndexBuffer(indexBuffer, 'uint16')
            encoder.drawIndexed(indexSize)
        }

        render = async (angle: number, 
                        encodeMainDraw: EncodeDrawCallback,
                        pipeline: GPURenderPipeline,
                        uniformBindGroup: GPUBindGroup,
                        positionBuffer: GPUBuffer,
                        normalBuffer: GPUBuffer,
                        indexBuffer: GPUBuffer,
                        indexSize: number,
                        device: GPUDevice,
                        modelViewMatrixUniformBuffer: GPUBuffer,
                        modelViewMatrix: Float32Array,
                        projectionMatrixUniformBuffer: GPUBuffer,
                        projectionMatrix: Float32Array,
                        canvas: HTMLCanvasElement,
                        depthTexture: GPUTexture,
                        depthAttachmentOld: GPURenderPassDepthStencilAttachment,
                        context: GPUCanvasContext,
                        commandEncoder: GPUCommandEncoder,
                        passEncoder: GPURenderPassEncoder
                    ) => {
            
            let depthAttachmentNew = depthAttachmentOld
                        
            let mvmUpdate = glMatrix.mat4.lookAt(glMatrix.mat4.create(),
                glMatrix.vec3.fromValues(20 * Math.sin(angle),30,80 * Math.cos(angle)), 
                glMatrix.vec3.fromValues(0, 20, 0), 
                glMatrix.vec3.fromValues(0.0, 0.0, 1.0)) as unknown as Float32Array;

            device.queue.writeBuffer(modelViewMatrixUniformBuffer, 0, mvmUpdate, 0, modelViewMatrix.length)

            
            const { depthAttachment, projectionMatrixUniformBufferUpdate } = GFX.recomputeProjectionIfCanvasChanged(
                device,
                canvas,
                depthTexture,
            );
            
            if (depthAttachment) {
                depthAttachmentNew = depthAttachment
            }

            let colorTexture = context.getCurrentTexture();
            let colorTextureView = colorTexture.createView();

            let colorAttachment: GPURenderPassColorAttachment = {
                view: colorTextureView,
                clearValue: { r: 0.3, g: 0.7, b: 1.0, a: 1 },
                loadOp: 'clear',
                storeOp: 'store'
            };

            const renderPassDesc: GPURenderPassDescriptor = {
                colorAttachments: [colorAttachment],
                depthStencilAttachment: depthAttachmentNew
            };

            commandEncoder = device.createCommandEncoder();
            if (projectionMatrixUniformBufferUpdate !== null) {
                commandEncoder.copyBufferToBuffer(projectionMatrixUniformBufferUpdate, 0,
                    projectionMatrixUniformBuffer, 0, projectionMatrix.byteLength);
            }

            passEncoder = commandEncoder.beginRenderPass(renderPassDesc);
            passEncoder.setViewport(0, 0, canvas.width, canvas.height, 0, 1);
            encodeMainDraw(passEncoder, pipeline, uniformBindGroup, positionBuffer, normalBuffer, indexBuffer, indexSize);
            passEncoder.end();
            device.queue.submit([commandEncoder.finish()]);

            await device.queue.onSubmittedWorkDone();

            if (projectionMatrixUniformBufferUpdate !== null) {
                projectionMatrixUniformBufferUpdate.destroy();
            }
        }

        constructor() {
            // @ts-ignore
            const _hel = super()
            
            // @ts-ignore
            this.hostEl = _hel as HTMLElement
        }
        
        async connectedCallback() {
            console.log('ThreeDStage connected')
            const canvas: HTMLCanvasElement | null = document.getElementById("canvas") as HTMLCanvasElement | null;
            if (!canvas) {
                console.error("Failed to get canvas");
                return;
            }

            let { device, context } = await CanvasSetup.getWebGPUContext(canvas)
            this.device = device
            this.context = context

            const { positionBuffer, normalBuffer, texCoordBuffer, indexBuffer, indexSize } = await loadObj(this.device, gooseUrl)
            const gooseTexRes = await fetch(gooseTexture)
            const blob = await gooseTexRes.blob()
            const imgBitmap = await createImageBitmap(blob)

            gameState.useReflex({
                observedSignal: 'match3.gameStart',
                callback: async () => {
                
                    canvas.style.opacity = '1'
                    console.log('match3.gameStart observed by canvas')

                    let startingAngle = 70.0;
                    let modelViewMatrix = glMatrix.mat4.lookAt(glMatrix.mat4.create(),
                    glMatrix.vec3.fromValues(50 * Math.sin(startingAngle),50 * Math.cos(startingAngle),50), 
                    glMatrix.vec3.fromValues(0, 0, 0), 
                    glMatrix.vec3.fromValues(0.0, 0.0, 1.0)) as unknown as Float32Array;
        
                    let modelViewMatrixUniformBuffer = GFX.createBuffer(device, modelViewMatrix, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'modelViewMatrixBuf');
            
            
                    let modelViewMatrixInverse = glMatrix.mat4.invert(glMatrix.mat4.create(), modelViewMatrix);
            
                    let normalMatrix = glMatrix.mat4.transpose(glMatrix.mat4.create(), modelViewMatrixInverse) as unknown as Float32Array;
            
                    let normalMatrixUniformBuffer = GFX.createBuffer(device, normalMatrix, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'normUniformBuffer');
            
                    let projectionMatrix = glMatrix.mat4.perspective(glMatrix.mat4.create(),
                        1.4, 640.0 / 480.0, 0.1, 1000.0) as unknown as Float32Array;
            
                    let projectionMatrixUniformBuffer = GFX.createBuffer(device, projectionMatrix, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'pmUniformBuffer');
        
                    let { 
                        shaderModule, 
                        uniformBindGroupLayout, 
                        uniformBindGroup, 
                        pipeline 
                    } = await this.initMainPipeline(modelViewMatrixUniformBuffer, 
                        projectionMatrixUniformBuffer, 
                        normalMatrixUniformBuffer);

                    let depthTexture: GPUTexture | null = null
                    let depthAttachment: GPURenderPassDepthStencilAttachment | null = null
                    let commandEncoder: GPUCommandEncoder | null = null
                    let passEncoder: GPURenderPassEncoder | null = null

                    let timeId: NodeJS.Timeout | null = null;
                    let angle = startingAngle
                    const reRender = () => {
                        this.render(angle+=0.005, 
                            this.encodeMainDraw, 
                            pipeline, 
                            uniformBindGroup, 
                            positionBuffer, 
                            normalBuffer, 
                            indexBuffer, 
                            indexSize, 
                            this.device, 
                            modelViewMatrixUniformBuffer, 
                            modelViewMatrix, 
                            projectionMatrixUniformBuffer, 
                            projectionMatrix, 
                            canvas, 
                            depthTexture, 
                            depthAttachment, 
                            this.context, 
                            commandEncoder, 
                            passEncoder)
                        if (timeId) {
                            clearTimeout(timeId);
                        }
                        timeId = setTimeout(() => {
                            requestAnimationFrame(reRender);
                        }, 17);
                    }

                    requestAnimationFrame(reRender);
                }
            })
            gameScript.next()
        }
    }
}


customElements.define('pointer-glass', GameElements.PointerGlass)
customElements.define('modal-dialogue', GameElements.ModalDialogue)
customElements.define('match-three', GameElements.Match3)
customElements.define('three-d-stage', GameElements.ThreeDStage)