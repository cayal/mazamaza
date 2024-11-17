import './index.css'
import {AppState, EventsOf} from "./appState/appState";
import {SizedData, SizedVec3Data, XYZ} from "./appState/sizedDataTypes";
import {ImmediateStates} from "./appState/immediateStates";

// eslint-disable-next-line no-constant-condition,@typescript-eslint/no-unused-vars
const dbgInfo = (true as boolean) ? console.debug : () => {};

function customElement<T extends CustomElementConstructor>(name: string) {
    return (_target: T, context: ClassDecoratorContext<T>) => {
        context.addInitializer(function(): void {
            customElements.define(name, this);
        });
    }
}

const appState = AppState({
    immediateStates: ImmediateStates({
        maxEIDs: 32,
        bitComponents: ['debugRadius'],
        sizedComponents: ['position', 'velocity', 'acceleration', 'foobar'],
        sizedAttachments: {
            position: SizedVec3Data(),
            velocity: SizedVec3Data(),
            acceleration: SizedVec3Data(),
            foobar: SizedData({
                bytesPerElement: 2,
                iv: { foo: 'bar' },
                encode: (_x: {foo: 'bar'}) => new Uint8Array([0, 1]),
                decode: (_view: DataView) => ({foo: 'hello'})
            })
        },
        integrationStages: ['accelIntegration', 'velocityIntegration', 'cullOOB']
    }),
})({
    eventualStates: {
        pointerMove: [0, 0] as [x: number, y: number],
        pointerClick: 0,
        uiMarkup: '',
    }
})

const artSpec = appState.immediate.specifySystem({
    willQuery: ['position'],
    willRead: ['position'],
    willWrite: ['__existence__']
})

class _VelocityIntegrator {
    @appState.useSystemInStage({
        stage: 'accelIntegration',
        systemSpec: appState.immediate.specifySystem({
            willQuery: ['acceleration', 'velocity'],
            willRead: ['acceleration', 'velocity'],
            willWrite: ['velocity']
        })
    })
    static integrateAcceleration(
        eventualState: EventsOf<typeof appState>,
        dt: number,
        eid: number,
        { velocity, acceleration }: { velocity: XYZ, acceleration: XYZ }
    ) {
        const { x: ax, y: ay, z: az } = acceleration
        return {
            velocity: {
                x: velocity.x + (ax * dt),
                y: velocity.y + (ay * dt),
                z: velocity.z + (az * dt)
            },
        }
    }

    @appState.useSystemInStage({
        stage: 'velocityIntegration',
        systemSpec: appState.immediate.specifySystem({
            willQuery: ['position', "velocity"],
            willRead: ['position', 'velocity'],
            willWrite: ['position'],
        }),
    })
    static integrateVelocity(eventualState: EventsOf<typeof appState>,
                             dt: number,
                             eid: number,
                             data: {
                                 position: XYZ,
                                 velocity: XYZ
                             }) {
        const { x: vx, y: vy } = data.velocity
        return {
            position: {
                x: data.position.x + vx * dt,
                y: data.position.y + vy * dt,
                z: 0
            },
        }
    }

    @appState.useSystemInStage({
        stage: 'cullOOB',
        systemSpec: artSpec,
    })
    static cullIfOutOfBounds(eventualState: EventsOf<typeof appState>,
        dt: number,
        eid: number,
        data: { position: XYZ }) {
        const shouldDelete = data.position.x > 2 || data.position.x < -2 || data.position.y > 2 || data.position.y < -2
        return {
            __existence__: !(shouldDelete)
        }
    }

}

@customElement('pointer-pane')
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class PointerPane extends HTMLElement {
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
class DebugInfo extends HTMLElement {
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
class ModalUI extends HTMLElement {
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
class CanvasDisplay extends HTMLElement {
    hostEl: HTMLElement
    canvas: HTMLCanvasElement
    ctx: CanvasRenderingContext2D
    constructor() {
        const _hel = super()
        this.hostEl = _hel as unknown as HTMLElement
    }

    connectedCallback(): void {
        console.log('CanvasDisplay connected')
        this.canvas = this.hostEl.querySelector('canvas')
        this.ctx = this.canvas.getContext('2d')
        this.canvas.setAttribute('style', '')
    }

    wasHere = -1

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
