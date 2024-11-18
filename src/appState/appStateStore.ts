import { ImmediateStates} from "./immediateStates";

export type EventsOf<AS extends ReturnType<typeof AppStateStore>> = (
    AS extends ReturnType<typeof AppStateStore> ? AS['eventSchema'] : never)

export type Dispatcher<ES> = <K extends keyof ES>(name: K, value: ES[K]) => Promise<void>

export type SubscribeDecorator<ES> = <This, Args extends unknown[], Return>(
    target: (this: This, curState: ES, ...args: Args[]) => Return,
    context: ClassMethodDecoratorContext<HTMLElement, (this: HTMLElement, curState: unknown, immediateStates: unknown, dt: number) => void>,
) => void

export const AppStateStore = <
    ES extends { readonly [ek in keyof ES]: ES[ek] },
    const IS extends ReturnType<typeof ImmediateStates>
>( { eventualStates, immediateStates }: { eventualStates: ES, immediateStates: IS }) => {
        const _eventualState: ES = { ...eventualStates }
        const _eventualStateSubscribers = {
            '_debug': [] // Responds to every dispatch. For debugging use.
        } as { [k in keyof ES | '_debug' | '_frameReady']: Array<{ self: object, cb: (curState: ES) => void }> }
        const _frameReadySubscribers = [] as Array<{
            self: object,
            cb: (eventualState: ES, immediateState: IS, dt: number) => void,
            hostConnected: boolean
        }>

        let _tickStart: number = performance.now();

        document.addEventListener('frameReadySubscriberConnected', (e: Event & { detail: { self: unknown } }) => {
            _frameReadySubscribers.forEach(subscriber => {
                if (subscriber.self === e.detail.self) {
                    subscriber.hostConnected = true
                }
            })
            if (_frameReadySubscribers.every(subscriber => subscriber.hostConnected)) {
                requestAnimationFrame(_tickImmediateStates)
            }
        })

        return {
            useDispatch: _useDispatch,
            subscribe: _subscribe,
            subscribeFrameReady: function <This>(
                target: (this: This, eventualState: ES, immediateState: IS, dt: number) => void,
                context: ClassMethodDecoratorContext<
                    HTMLElement, (this: HTMLElement, eventualState: ES, immediateState: IS, dt: number) => void
                >
            ) {
                context.addInitializer(
                    function (): void {
                        if (!_frameReadySubscribers.some(({self}) => self === this)) {
                            _frameReadySubscribers.push({
                                self: this,
                                cb: target,
                                hostConnected: false
                            })
                        }
                    }
                )
            },
            dispatch: _dispatch,
            immediate: immediateStates,
            eventSchema: eventualStates,
            useSystemInStage: _useSystemInStage
        }

        async function _dispatch<K extends keyof ES>(name: K, value: ES[K]): Promise<void> {
            _eventualState[name] = value

            _eventualStateSubscribers['_debug'].forEach(s => s.cb.call(s.self,
                _eventualState,
                immediateStates))

            const subscribers = _eventualStateSubscribers[name] ?? []
            for (const subscriber of subscribers) {
                subscriber.cb.call(subscriber.self, _eventualState)
            }
        }

        function _useSystemInStage<SS extends ReturnType<typeof immediateStates.specifySystem>>({ systemSpec, stage }: {
            stage: IS['integrationStages'][number],
            systemSpec: SS
        }) {
            return function <This>(target: ReturnType<SS>['cb'],
                                   context: (
                                       ClassMethodDecoratorContext<
                                           This,
                                           ReturnType<typeof systemSpec>['cb']
                                       > & { readonly static: true }
                                       )) {
                context.addInitializer(
                    function (): void {
                        systemSpec(this, stage, target);
                    }
                )
            }
        }

        function _useDispatch<This, Args extends unknown[], Return>(
            target: (this: This, dispatch: Dispatcher<ES>, ...args: Args) => Return
        ): (this: HTMLElement) => Promise<void> {
            return async function (this: HTMLElement): Promise<void> {
                target.call(this, _dispatch)
            }
        }

        function _subscribe<K extends keyof ES>(toEvent: K): SubscribeDecorator<ES> {
            return function _subscribeDecorator<This, Args extends unknown[], Return>(
                target: (this: This, curState: ES, ...args: Args[]) => Return,
                context: ClassMethodDecoratorContext<HTMLElement, (this: HTMLElement, curState: ES) => void>,
            ): void {
                context.addInitializer(
                    function (): void {
                        if (typeof _eventualStateSubscribers[toEvent] === 'undefined') {
                            _eventualStateSubscribers[toEvent] = []
                        }
                        if (!_eventualStateSubscribers[toEvent].some(({self}) => self === this)) {
                            _eventualStateSubscribers[toEvent].push({
                                self: this,
                                cb: target
                            })
                        }
                    }
                )
            }
        }

        function _tickImmediateStates(time: number) {
            const dt = (time - _tickStart) / 1000;
            _tickStart = time;
            _frameReadySubscribers.forEach(s => s.cb.call(s.self,
                _eventualState,
                immediateStates,
                dt))

            immediateStates.advanceStages(_eventualState, dt)

            requestAnimationFrame(_tickImmediateStates)
        }
}