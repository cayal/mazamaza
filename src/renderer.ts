import './index.css';

const gameScript: Generator<void | void[]> = (() => {
    const _scr = GameScript()

    return {
        ..._scr, 
        next: () => {
            const res = _scr.next()?.value
            if (typeof res === "object" && 'length' in res) {
                gameState.set('history', [...gameState.get('history'), ...res.filter(x => typeof x !== "undefined")])
            } else if (res) {
                gameState.set('history', [...gameState.get('history'), res])
            }
            return res
        }
    }}
)()

import mainShaderSrc from './vertex.wgsl?raw';

import gooseUrl from './static/Goose/Mesh_Goose.obj?url'

import gooseTexUrl from './static/Goose/Tex_Goose.png'

import glMatrix from './glMatrix';
import { GameScript } from './script';
import {GameState, gameState, EventualStateEntry, AppliedStateEntry,} from './gameState/gameState';
import { GFX } from './gfx/gfx';
import { CanvasSetup } from './setup/canvasSetup';
import { Mesh } from './mesh/mesh';

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
            mvAngleZ: 0
        }
            
        const projectionMatrix = glMatrix.mat4.perspective(
            glMatrix.mat4.create(),
            1.4, 640.0 / 480.0, 0.1, 1000.0) as unknown as Float32Array;
        const projectionMatrixUniformBuffer = GFX.createBuffer(device, projectionMatrix, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'pmUniformBuffer');


        const modelViewMatrix = glMatrix.mat4.lookAt(glMatrix.mat4.create(),
        glMatrix.vec3.fromValues(100 * Math.PI / 2, 70 * Math.sin(viewMatrixData.mvAngleX), 0), 
        glMatrix.vec3.fromValues(0, 0, 0), 
        glMatrix.vec3.fromValues(-1.0, 0.0, 0.0)) as unknown as Float32Array;

        const modelViewMatrixUniformBuffer = GFX.createBuffer(device, modelViewMatrix, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'modelViewMatrixBuf');
        const modelViewMatrixInverse = glMatrix.mat4.invert(glMatrix.mat4.create(), modelViewMatrix);

        const normalMatrix = glMatrix.mat4.transpose(glMatrix.mat4.create(), modelViewMatrixInverse) as unknown as Float32Array;
        const normalMatrixUniformBuffer = GFX.createBuffer(device, normalMatrix, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'normUniformBuffer');

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

type AppStatefulElement = {
    eventualState: object
    immediateState: object
    hostEl: HTMLElement
}

namespace GameElements {
    export class DebugInfo extends HTMLElement {
        hostEl: HTMLElement

        constructor() {
            const _hel = super()

            this.hostEl = _hel as unknown as HTMLElement
        }

        connectedCallback() {
            console.log('DebugInfo connected')
            gameState.useReflex({
                observedSignal: '_dbgUpdate',
                callback: (payload) => {
                    console.log('DebugInfo callback', payload)
                    this.hostEl.innerHTML = JSON.stringify(payload.curState, undefined, 4)
                }
            })
        }
    }

    export class PointerGlass extends HTMLElement implements AppStatefulElement {
        hostEl: HTMLElement
        eventualState = gameState.applyStateEntry({
            key: 'pointerInfo',
            iv: {coords: [0, 0] as [number, number], lastClicked: performance.now()},
            put: (gameState, value) => {
                console.log('put pointer', { ...gameState, pointerInfo: value })
                return { ...gameState, pointerInfo: value }
            },
            pik: (gameState) => gameState?.pointerInfo
        })

        constructor() {
            const _hel = super()

            this.hostEl = _hel as unknown as HTMLElement
        }

        connectedCallback() {
            this.hostEl.addEventListener('mousemove', (e) => {
                this.eventualState.set({ coords: [e.x, e.y], lastClicked: 0 })
            })
        }
    }

    export class ModalDialogue extends HTMLElement implements AppStatefulElement {
        hostEl: HTMLElement
        eventualState: EventualStateEntry<'modalDialogue', string> = {
            key: 'modalDialogue',
            iv: '',
            put: (gameState, value) => {
                const statePrime = {
                    ...gameState,
                    modalDialogue: value
                }
                this.targetText = value
                return statePrime
            },
            pik: (gameState) => gameState.modalDialogue ?? ''
        }

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


        constructor() {
            const _hel = super()

            this.hostEl = _hel as unknown as HTMLElement
        }

        connectedCallback() {
            console.log('ModalScene connected')
            gameState.use(this.eventualState)
            gameState.useReflex({
                observedSignal: 'PointerGlass.down',
                callback: (_) => {
                    if (gameState.get('shownScreen') === 'modalDialogue') {
                        gameScript.next()
                    }
                }
            })
            gameState.useReflex({
                observedSignal: 'flappy.gameStart',
                callback: (payload) => {
                    this.hostEl.style.transform = 'translateY(20vw)'
                }
            })
            gameState.useReflex({
                observedSignal: 'visibilityChange',
                callback: (payload) => {
                    if (payload == 'modal-dialogue') {
                        this.hostEl.style.visibility = 'visible'
                    }
                }
            })
        }
    }

    export class Flappy extends HTMLElement {
        hostEl: HTMLElement

        constructor() {
            const _hel = super()
            
            this.hostEl = _hel as unknown as HTMLElement
        }

        connectedCallback() {
            console.log('Flappy Game connected')
            gameState.registerSignal('flappy.gameStart', { 
                boardWidth: undefined as number, 
                boardHeight: undefined as number 
            })
            gameState.registerSignal('flappy.gameOver', {})
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

        drawFrame = async (gameState: GameState) => {
            const commandEncoder: GPUCommandEncoder = this.device.createCommandEncoder()
            
            const depthTexture: GPUTexture | null = null
            const depthAttachment: GPURenderPassDepthStencilAttachment | null = null


            const meshComponents = gameState.components.query(gameState.entities, 'MeshBundle')
            const viewMatrices = await ViewMatrix.getViewMatrices(this.device, 15.0)
            

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

            this.device.queue.submit([commandEncoder.finish()]);
            await this.device.queue.onSubmittedWorkDone();
        }

        constructor() {
            const _hel = super()
            
            this.hostEl = _hel as unknown as HTMLElement
        }

        
        async renderMeshes(
            device: GPUDevice, 
            commandEncoder: GPUCommandEncoder,
            meshComponents: Array<{ eid: number, datas: { [key: string]: any } }>,
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
                meshComponents[0].datas.MeshBundle.texture.createView(),
                meshComponents[0].datas.MeshBundle.sampler
            ]
            
            let attributeList = GFX.MakeAttribInfoList<typeof mainShaderSrc>()
            attributeList = attributeList.add(mainShaderSrc, 'position', 'float32x3', 0)
            attributeList = attributeList.add(mainShaderSrc, 'normal', 'float32x3', 1)
            attributeList = attributeList.add(mainShaderSrc, 'texCoords', 'float32x2', 2)

            const {pipeline, uniformBindGroup} = GFX.MakeShadingStrat('3dStageObject', uLets, uBindingResources, attributeList.entries, mainShaderSrc, this.device, true)

            let pmubu
            meshComponents.forEach(async (mc, i) => {
                const position = gameState.components.query(gameState.entities, 'Position3d')
                    .find(p => p.eid === mc.eid)?.datas.Position3d

                if (!position) { return }
                
                const positionMatrix = glMatrix.mat4.create();
                glMatrix.mat4.translate(positionMatrix, positionMatrix, 
                    [position.positionX, position.positionY, position.positionZ]);
                glMatrix.mat4.rotateX(positionMatrix, positionMatrix, position.angleX);
                glMatrix.mat4.rotateY(positionMatrix, positionMatrix, position.angleY);
                glMatrix.mat4.rotateZ(positionMatrix, positionMatrix, position.angleZ);
                
                const modelPositionMatrix = glMatrix.mat4.create()
                //
                // Combine with view matrix
                glMatrix.mat4.multiply(modelPositionMatrix, viewMatrices.modelViewMatrix, positionMatrix);
    

                const { 
                    positionBuffer,
                    normalBuffer,
                    texCoordBuffer,
                    indexBuffer,
                    indexSize,
                    texture, 
                    sampler 
                } = mc.datas.MeshBundle

                
                device.queue.writeBuffer(viewMatrices.modelViewMatrixUniformBuffer, 0, modelPositionMatrix as unknown as Float32Array, 0, (modelPositionMatrix as unknown as Float32Array).length)
                
                const { depthAttachment, projectionMatrixUniformBufferUpdate } = GFX.recomputeProjectionIfCanvasChanged(
                    device,
                    canvas,
                    depthTexture,
                );
                
                if (depthAttachment) {
                    depthAttachmentNew = depthAttachment
                }
                
                const colorTexture = context.getCurrentTexture();
                const colorTextureView = colorTexture.createView();

                const colorAttachment: GPURenderPassColorAttachment = {
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

                const passEncoder = commandEncoder.beginRenderPass(renderPassDesc);

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
            
            const startingAngle = Math.PI / 2
            gameState.use({
                key: 'globalViewAngle',
                iv: 0,
                put: (gameState, value) => ({ ...gameState, angle: value }),
                pik: (gameState) => gameState.angle
            })

            gameState.set('globalViewAngle', startingAngle)

            this.canvas = canvas

            const { device, context } = await CanvasSetup.getWebGPUContext(canvas)
            this.device = device
            this.context = context
            
            const gooseEid = gameState.addEntity()

            gameState.components.attach(gameState.entities, gooseEid, 'MeshBundle', await Mesh.loadFromObjFile(this.device, gooseUrl, gooseTexUrl))
            gameState.components.attach(gameState.entities, gooseEid, 'Position3d', {
                angleX: 0,
                angleY: 0,
                angleZ: 0,
                positionX: 0,
                positionY: 0,
                positionZ: 0
            })
            // await this.attachComponent(gooseTwoEid, 'mesh', await Mesh.loadFromObjFile(this.device, jewelUrl, gooseTexUrl))
            
            gameState.useReflex({
                observedSignal: 'PointerGlass.down',
                callback: () => {
                    const controlledComponents = gameState.components.query(gameState.entities, 'PlayerControl')
                    controlledComponents.forEach(cc => {
                        const velocityComponent = gameState.components.query(gameState.entities, 'Velocity')
                            .filter(x => x.eid == cc.eid)
                        velocityComponent.forEach(vc => {
                            vc.datas.Velocity.velocityY = cc.datas.PlayerControl.jumpForce * 29
                        })
                    })
                }
            })
            
            gameState.useReflex({
                observedSignal: 'flappy.gameOver',
                callback: () => {
                    console.log("Game over event")
                    document.querySelector('h1').innerHTML = 'game over'
                    gameState.stopRealtime()

                    console.log(gameState.get('history'))
                    gameState.set('history', [...gameState.get('history'), 'flappyGameFailed'])

                    gameScript.next()
                }
            })
            
            gameState.useReflex({
                observedSignal: 'visibilityChange',
                callback: async (payload) => {
                    if (payload == 'flappy-game') {
                        (document.querySelector('flappy-game') as HTMLElement).style.visibility = 'visible'
                    }
                }
            })

            gameState.useReflex({
                observedSignal: 'flappy.gameStart',
                callback: async () => {

                    canvas.style.opacity = '1'

                    console.log('flappy.gameStart observed by canvas')
                    gameState.components.attach(gameState.entities, gooseEid, 'Gravity', { accel: -9.8 })
                    gameState.components.attach(gameState.entities, gooseEid, 'Velocity', { velocityX: 0, velocityY: 0, velocityZ: 0 })
                    gameState.components.attach(gameState.entities, gooseEid, 'Acceleration', { accelX: 0, accelY: 0, accelZ: 0 })
                    gameState.components.attach(gameState.entities, gooseEid, 'PlayerControl', { jumpForce: 3.0 })
                    gameState.systems.register({
                        componentNames: ['Gravity', 'Position3d', 'Velocity', 'Acceleration'],
                        update: (gameState, dt, components) => {
                            components.forEach(c => {
                                if (c.datas.Position3d.positionY > -90.0) {
                                    c.datas.Position3d.positionY += c.datas.Velocity.velocityY * (dt / 1000)
                                    c.datas.Velocity.velocityY += (c.datas.Gravity.accel*20 + c.datas.Acceleration.accelY) * (dt / 1000)
                                } else {
                                    c.datas.Acceleration.accelY = 0
                                    c.datas.Velocity.velocityY = 0
                                    gameState.dispatch('flappy.gameOver', {})
                                }
                            })
                        }
                    })

                    gameState.initRealtime(this.drawFrame)
                }
            })
            gameScript.next()
        }
    }
}



customElements.define('pointer-glass', GameElements.PointerGlass)
customElements.define('debug-info', GameElements.DebugInfo)
customElements.define('modal-dialogue', GameElements.ModalDialogue)
customElements.define('flappy-game', GameElements.Flappy)
customElements.define('three-d-stage', GameElements.ThreeDStage)