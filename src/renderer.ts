import './index.css';

const gameScript: Generator<void | void[]> = GameScript()

// @ts-ignore
import mainShaderSrc from './vertex.wgsl?raw';

// @ts-ignore
import sketchShaderSrc from './sketch.wgsl?raw';

//@ts-ignore 
import jewelUrl from './static/Jewel/Jewel_05.obj?url'

//@ts-ignore
import gooseUrl from './static/Goose/Mesh_Goose.obj?url'

// @ts-ignore
import gooseTexUrl from './static/Goose/Tex_Goose.png'

// @ts-ignore
import catImg from './static/celeste.png'
import glMatrix from './glMatrix';
import { loadObj } from './objFile';
import { GameScript } from './script';
import { gameState, GameStateUnit } from './gameState/gameState';
import { GFX } from './gfx/gfx';
import { CanvasSetup } from './setup/canvasSetup';
import { components } from './ecs/components';
import { Mesh } from './mesh/mesh';




namespace Location3d {
    export type Location3dData = {
        angleX: number,
        angleY: number,
        angleZ: number,
        positionX: number,
        positionY: number,
        positionZ: number
    }
}

namespace ViewMatrix {
    export type ViewAngles  = {
        mvAngleX: number,
        mvAngleY: number,
        mvAngleZ: number,
    }
    
    export type ViewMatrices = {
        modelViewMatrix: Float32Array,
        modelViewMatrixUniformBuffer: GPUBuffer,
        normalMatrix: Float32Array,
        normalMatrixUniformBuffer: GPUBuffer,
        projectionMatrix: Float32Array,
        projectionMatrixUniformBuffer: GPUBuffer
    }

    export async function getViewMatrices(device: GPUDevice, angle: number): Promise<ViewMatrix.ViewMatrices> {
        const viewMatrixData: ViewMatrix.ViewAngles = {
            mvAngleX: angle,
            mvAngleY: angle,
            mvAngleZ: 1
        }
            
        let projectionMatrix = glMatrix.mat4.perspective(
            glMatrix.mat4.create(),
            1.4, 640.0 / 480.0, 0.1, 1000.0) as unknown as Float32Array;
        let projectionMatrixUniformBuffer = GFX.createBuffer(device, projectionMatrix, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'pmUniformBuffer');


        let modelViewMatrix = glMatrix.mat4.lookAt(glMatrix.mat4.create(),
        glMatrix.vec3.fromValues(70 * Math.sin(viewMatrixData.mvAngleX), 30 * Math.cos(viewMatrixData.mvAngleY), 30 * (viewMatrixData.mvAngleZ)), 
        glMatrix.vec3.fromValues(0, 0, 0), 
        glMatrix.vec3.fromValues(0.0, 0.0, 1.0)) as unknown as Float32Array;

        let modelViewMatrixUniformBuffer = GFX.createBuffer(device, modelViewMatrix, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'modelViewMatrixBuf');
        let modelViewMatrixInverse = glMatrix.mat4.invert(glMatrix.mat4.create(), modelViewMatrix);

        let normalMatrix = glMatrix.mat4.transpose(glMatrix.mat4.create(), modelViewMatrixInverse) as unknown as Float32Array;
        let normalMatrixUniformBuffer = GFX.createBuffer(device, normalMatrix, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'normUniformBuffer');

        return {
            modelViewMatrix,
            modelViewMatrixUniformBuffer,
            normalMatrix,
            normalMatrixUniformBuffer,
            projectionMatrix,
            projectionMatrixUniformBuffer
        }

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
                observedSignal: 'flappy.gameStart',
                callback: (payload) => {
                    this.hostEl.style.transform = 'translateY(20vw)'
                }
            })
        }
    }

    export class Flappy extends HTMLElement {
        hostEl: HTMLElement

        constructor() {
            // @ts-ignore
            const _hel = super()
            
            // @ts-ignore
            this.hostEl = _hel as HTMLElement
        }

        connectedCallback() {
            console.log('Flappy Game connected')
            gameState.registerSignal('flappy.gameStart', { 
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
        texCoordBuffer: GPUBuffer,
        indexBuffer: GPUBuffer,
        indexSize: number
    ) => void

    export class ThreeDStage extends HTMLElement {
        hostEl: HTMLElement

        canvas: HTMLCanvasElement
        context: GPUCanvasContext
        device: GPUDevice

        pipeline: GPURenderPipeline
        positionBuffer: GPUBuffer
        normalBuffer: GPUBuffer
        indexBuffer: GPUBuffer
        uniformBindGroup: GPUBindGroup
        indexSize: number
        
        encodeMainDraw: EncodeDrawCallback = (
                encoder: GPURenderPassEncoder,
                pipeline: GPURenderPipeline,
                uniformBindGroup: GPUBindGroup,
                positionBuffer: GPUBuffer,
                normalBuffer: GPUBuffer,
                texCoordBuffer: GPUBuffer,
                indexBuffer: GPUBuffer,
                indexSize: number
            ) => {
            encoder.setPipeline(pipeline)
            encoder.setBindGroup(0, uniformBindGroup)
            encoder.setVertexBuffer(0, positionBuffer)
            encoder.setVertexBuffer(1, normalBuffer)
            encoder.setVertexBuffer(2, texCoordBuffer)
            encoder.setIndexBuffer(indexBuffer, 'uint16')
            encoder.drawIndexed(indexSize)
        }

        render = async (viewMatrices: ViewMatrix.ViewMatrices,
                        device: GPUDevice
                    ) => {
            
            let depthTexture: GPUTexture | null = null
            let depthAttachment: GPURenderPassDepthStencilAttachment | null = null


            const meshComponents = components.query(this.entities, 'MeshComponent')
            
            let commandEncoder: GPUCommandEncoder = device.createCommandEncoder()
            await this.renderMeshes(this.device, 
                commandEncoder,
                meshComponents, 
                viewMatrices, 
                this.canvas, 
                this.context, 
                depthAttachment, 
                depthTexture,
                this.encodeMainDraw
            );

            device.queue.submit([commandEncoder.finish()]);

            await device.queue.onSubmittedWorkDone();
            
            /** Circle drawing */

            // let circleColorTexture = context.getCurrentTexture();
            // let circleColorTextureView = circleColorTexture.createView();

            // let circleColorAttachment: GPURenderPassColorAttachment = {
            //     view: circleColorTextureView,
            //     loadOp: 'load',
            //     storeOp: 'store'
            // };

            // const circleRenderPassDesc: GPURenderPassDescriptor = {
            //     colorAttachments: [circleColorAttachment],
            //     label: 'circleRenderPassDescriptor'
            // };

            // let circleCommandEncoder = device.createCommandEncoder({ label: 'circleCommandEncoder' });

            // let circlePassEncoder = circleCommandEncoder.beginRenderPass(circleRenderPassDesc);

            // circlePassEncoder.setViewport(0, 0, canvas.width, canvas.height, 0, 1);

            // GFX.drawCircle(device, circlePassEncoder, [0, 0], 1, [1, 0, 0,])

            // circlePassEncoder.end();

            // device.queue.submit([circleCommandEncoder.finish()]);

            // await device.queue.onSubmittedWorkDone();

            /** End circle */

        }

        constructor() {
            // @ts-ignore
            const _hel = super()
            
            // @ts-ignore
            this.hostEl = _hel as HTMLElement
        }

        #nextEntity = 0
        entities = new Uint8Array(8192)
        #entityComponentData: any[][] = Array(7).fill(Array(8192).fill(null))

        addEntity() {
            const eid = this.#nextEntity
            this.entities[eid] = 1
            this.#nextEntity++
            return eid
        }
        
        async renderMeshes(
            device: GPUDevice, 
            commandEncoder: GPUCommandEncoder,
            meshComponents: Array<{ eid: number, data: any }>,
            viewMatrices: ViewMatrix.ViewMatrices,
            canvas: HTMLCanvasElement,
            context: GPUCanvasContext,
            depthAttachmentOld: GPURenderPassDepthStencilAttachment,
            depthTexture: GPUTexture,
            encodeMainDraw: EncodeDrawCallback
        ): Promise<void> {

            let depthAttachmentNew = depthAttachmentOld

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
                    },
                    {
                        binding: 3,
                        visibility: GPUShaderStage.FRAGMENT,
                        texture: {}
                    },
                    {
                        binding: 4,
                        visibility: GPUShaderStage.FRAGMENT,
                        sampler: {}
                    }
                ]

            const uBindingResources: GPUBindingResource[] = [
                { buffer: viewMatrices.modelViewMatrixUniformBuffer },
                { buffer: viewMatrices.projectionMatrixUniformBuffer },
                { buffer: viewMatrices.normalMatrixUniformBuffer },
                meshComponents[0].data.texture.createView(),
                meshComponents[0].data.sampler
            ]
            
            let attributeList = GFX.MakeAttribInfoList<typeof mainShaderSrc>()
            attributeList = attributeList.add(mainShaderSrc, 'position', 'float32x3', 0)
            attributeList = attributeList.add(mainShaderSrc, 'normal', 'float32x3', 1)
            attributeList = attributeList.add(mainShaderSrc, 'texCoords', 'float32x2', 2)

            const {pipeline, uniformBindGroup} = GFX.MakeShadingStrat('3dStageObject', uLets, uBindingResources, attributeList.entries, mainShaderSrc, this.device, true)

            let pmubu
            meshComponents.forEach(async (mc, i) => {
                const { 
                    positionBuffer,
                    normalBuffer,
                    texCoordBuffer,
                    indexBuffer,
                    indexSize,
                    texture, 
                    sampler 
                } = mc.data

                
                device.queue.writeBuffer(viewMatrices.modelViewMatrixUniformBuffer, 0, viewMatrices.modelViewMatrix, 0, viewMatrices.modelViewMatrix.length)
                
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

                if (projectionMatrixUniformBufferUpdate !== null) {
                    commandEncoder.copyBufferToBuffer(projectionMatrixUniformBufferUpdate, 0,
                        viewMatrices.projectionMatrixUniformBuffer, 0, viewMatrices.projectionMatrix.byteLength);
                }

                let passEncoder = commandEncoder.beginRenderPass(renderPassDesc);

                passEncoder.setViewport(0, 0, canvas.width, canvas.height, 0, 1);

                encodeMainDraw(passEncoder, pipeline, uniformBindGroup, positionBuffer, normalBuffer, texCoordBuffer, indexBuffer, indexSize);

                passEncoder.end();

            })
        }
        
        async connectedCallback() {
            console.log('ThreeDStage connected')
            const canvas: HTMLCanvasElement | null = document.getElementById("canvas") as HTMLCanvasElement | null;
            if (!canvas) {
                console.error("Failed to get canvas");
                return;
            }
            
            let startingAngle = 15
            let angle = startingAngle

            this.canvas = canvas

            let { device, context } = await CanvasSetup.getWebGPUContext(canvas)
            this.device = device
            this.context = context
            
            let gooseEid = this.addEntity()

            components.attach(this.entities, gooseEid, 'MeshComponent', await Mesh.loadFromObjFile(this.device, gooseUrl, gooseTexUrl))
            // await this.attachComponent(gooseTwoEid, 'mesh', await Mesh.loadFromObjFile(this.device, jewelUrl, gooseTexUrl))

            gameState.useReflex({
                observedSignal: 'flappy.gameStart',
                callback: async () => {

                    canvas.style.opacity = '1'

                    console.log('flappy.gameStart observed by canvas')

                    let timeId: NodeJS.Timeout | null = null;

                    const reRender = async () => {
                        angle += 0.001
                        const viewMatrices = await ViewMatrix.getViewMatrices(this.device, angle)

                        this.render(viewMatrices, 
                            this.device)
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
customElements.define('flappy-game', GameElements.Flappy)
customElements.define('three-d-stage', GameElements.ThreeDStage)