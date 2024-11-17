import './index.css'
import {AppStateStore} from "./appState/appStateStore";
import {SizedData, SizedVec3Data} from "./appState/sizedDataTypes";
import {ImmediateStates} from "./appState/immediateStates";

export const appState = AppStateStore({
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



