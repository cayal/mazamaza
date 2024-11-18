import { EventsOf } from "../appState/appStateStore";
import { XYZ } from "../appState/sizedDataTypes";

import { MakeAppState } from "../appState";

export function MakeDynamicsIntegrator(appState: Awaited<ReturnType<typeof MakeAppState>>) {
    // noinspection JSUnusedGlobalSymbols
    return class DynamicsIntegrator {
        @appState.useSystemInStage({
            stage: 'accelIntegration',
            systemSpec: appState.immediate.specifySystem({
                willQuery: ['acceleration', 'velocity'],
                willRead: ['acceleration', 'velocity'],
                willWrite: ['velocity']
            })
        })

        static integrateAcceleration(
            _eventualState: EventsOf<typeof appState>,
            dt: number,
            _eid: number,
            {velocity, acceleration}: { velocity: XYZ, acceleration: XYZ }
        ) {
            const {x: ax, y: ay, z: az} = acceleration
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
                willQuery: ['position', 'velocity'],
                willRead: ['position', 'velocity'],
                willWrite: ['position'],
            }),
        })
        static integrateVelocity(_eventualState: EventsOf<typeof appState>,
                                 dt: number,
                                 _eid: number,
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
            systemSpec: appState.immediate.specifySystem({
                willQuery: ['position'],
                willRead: ['position'],
                willWrite: ['__existence__']
            }),
        })
        static cullIfOutOfBounds(_eventualState: EventsOf<typeof appState>,
                                 _dt: number,
                                 _eid: number,
                                 data: { position: XYZ }) {
            const shouldDelete = data.position.x > 2 || data.position.x < -2 || data.position.y > 2 || data.position.y < -2
            return {
                __existence__: !(shouldDelete)
            }
        }

    }
}
