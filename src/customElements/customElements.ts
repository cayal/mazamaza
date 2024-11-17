import { EventsOf } from "../appState/appStateStore";
import {appState} from "../renderer";

function customElement<T extends CustomElementConstructor>(name: string) {
    return (_target: T, context: ClassDecoratorContext<T>) => {
        context.addInitializer(function(): void {
            customElements.define(name, this);
        });
    }
}

@customElement('pointer-pane')
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export class PointerPane extends HTMLElement {
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
                {
                    x: e.x / rect.width,
                    y: e.y / rect.height,
                    z: 0
                }
            )
            appState.immediate.attachComponent(newE, 'debugRadius')
            appState.immediate.attachComponent(newE, 'velocity', { x: 0.0, y: -1.0, z: 0.0})
            appState.immediate.attachComponent(newE, 'acceleration', { x: 0.0, y: 1.0, z: 0.0 })

            dispatch('pointerClick', performance.now())
            return
        })
    }
}

@customElement('debug-info')
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export class DebugInfo extends HTMLElement {
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
    update(eventualState: EventsOf<typeof appState>, immediateStates: (typeof appState)['immediate']) {
        this.hostEl.innerHTML = JSON.stringify(eventualState, undefined, 4)
        this.hostEl.innerHTML += `<hr>Entities: ${immediateStates.entityCount()} / ${immediateStates.maxEntities}`
    }
}

@customElement('modal-ui')
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export class ModalUI extends HTMLElement {
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
export class CanvasDisplay extends HTMLElement {
    hostEl: HTMLElement
    canvas: HTMLCanvasElement
    ctx: CanvasRenderingContext2D

    constructor() {
        const _hel = super()
        this.hostEl = _hel as unknown as HTMLElement
    }

    // noinspection JSUnusedGlobalSymbols
    connectedCallback() {
        console.log('CanvasDisplay connected')
        this.canvas = this.hostEl.querySelector('canvas')
        this.ctx = this.canvas.getContext('2d')
        this.canvas.setAttribute('style', '')
    }

    @appState.subscribeFrameReady
    drawBalls(immediateStates: typeof appState.immediate) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
        const q = immediateStates.query({ all: ['position'] })

        q.attachments.position.read(...q.eids).forEach(({ x, y }: { x: number, y: number }) => {
            this.ctx.fillStyle = 'blue'
            const sx = (x) * this.canvas.width
            const sy = (y) * this.canvas.height
            this.ctx.beginPath()
            this.ctx.arc(sx-5, sy-5, 10, 0, 2*Math.PI)
            this.ctx.closePath()
            this.ctx.fill()
        })
    }
}
