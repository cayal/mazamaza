import { MakeAppState } from "../appState";

export function MakeCanvasDisplayWebGPU(appState: Awaited<ReturnType<typeof MakeAppState>>) {
    return class CanvasDisplayWebGPU extends HTMLElement {

        hostEl: HTMLElement
        canvas: HTMLCanvasElement
        ctx: GPUCanvasContext
        device: GPUDevice

        constructor() {
            const _hel = super()
            this.hostEl = _hel as unknown as HTMLElement
        }

        // noinspection JSUnusedGlobalSymbols
        async connectedCallback() {
            console.log('CanvasDisplayWebGPU connected')
            this.canvas = this.hostEl.querySelector('canvas')
            const adapter = await navigator.gpu.requestAdapter();
            if (!adapter) {
                throw new Error('No graphics adapter found.')
            }

            this.device = await adapter.requestDevice();
            if (!this.device) {
                throw new Error(`Failed to create a GPUDevice.`);
            }

            this.ctx = this.canvas.getContext('webgpu')
            this.canvas.setAttribute('style', '')

            const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
            this.ctx.configure({
                device: this.device,
                format: canvasFormat,
            });

            const connectedEv = new CustomEvent('frameReadySubscriberConnected', { detail: { self: this } })
            document.dispatchEvent(connectedEv)
        }

        @appState.subscribeFrameReady
        drawBalls(_immediateStates: typeof appState.immediate) {
            const encoder = this.device.createCommandEncoder()

            const renderPass = encoder.beginRenderPass({
                colorAttachments: [{
                    view: this.ctx.getCurrentTexture().createView(),
                    loadOp: 'clear',
                    clearValue: { r: 0.5, g: 0.5, b: 1.0, a: 1.0 },
                    storeOp: 'store'
                }]
            })

            const vertexData = new Float32Array([
                0.0, 0.5, 0.0, 1.0, 0.0,
                -0.5, -0.5, 1.0, 0.0, 0.0,
                0.5, -0.5, 0.0, 0.0, 1.0
            ])

            const vertexBuffer = this.device.createBuffer({
                label: 'vBuf',
                size: vertexData.byteLength,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
            })

            this.device.queue.writeBuffer(vertexBuffer, 0, vertexData)

            const bufferLayout = {
                arrayStride: 20,
                attributes: [
                    { format: 'float32x2', offset: 0, shaderLocation: 0 },
                    { format: 'float32x3', offset: 8, shaderLocation: 1 },
                ]
            }

            // const renderPipeline = this.device.createRenderPipeline({
            //     label: '_drawBalls.renderPipeline',
            //     layout: 'auto',
            //     vertex: {
            //         module: ...,
            //         entryPoint: ...,
            //         buffers: bufferLayout,
            //     },
            //     fragment: {
            //
            //     },
            //     primitive: {
            //         topology: 'triangle-strip',
            //         stripIndexFormat: 'uint32',
            //         frontFace: 'cw',
            //         cullMode: 'back'
            //     }
            //
            // })
            //
            // const cellPipeline = this.device.createRenderPipeline

            renderPass.end()
            this.device.queue.submit([encoder.finish()])
            // this.ctx(0, 0, this.canvas.width, this.canvas.height)
            // const q = immediateStates.query({ all: ['position'] })
            //
            // q.attachments.position.read(...q.eids).forEach(({ x, y }: { x: number, y: number }) => {
            //     this.ctx.fillStyle = 'blue'
            //     const sx = (x) * this.canvas.width
            //     const sy = (y) * this.canvas.height
            //     this.ctx.beginPath()
            //     this.ctx.arc(sx-5, sy-5, 10, 0, 2*Math.PI)
            //     this.ctx.closePath()
            //     this.ctx.fill()
            // })
        }
    }
}