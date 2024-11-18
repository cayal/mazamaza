import {AppStateStore} from "./appState/appStateStore";
import {ImmediateStates} from "./appState/immediateStates";
import {SizedData, SizedVec3Data} from "./appState/sizedDataTypes";
import catImgUrl from './static/celeste.png'

export async function MakeAppState() {
    const gooseTexRes = await fetch(catImgUrl)
    const blob = await gooseTexRes.blob()
    const imgBitmap = await createImageBitmap(blob, 0, 0, 256, 256, {
        resizeWidth: 32,
        resizeHeight: 32,
    })

    return AppStateStore({
        eventualStates: {
            pointerMove: [0, 0] as [x: number, y: number],
            pointerClick: 0,
            uiMarkup: '',
            cat: imgBitmap
        },
        immediateStates: ImmediateStates({
            maxEIDs: 128,
            maxResources: 32,
            bitComponents: ['debugRadius', 'cat'],
            sizedComponents: ['position', 'velocity', 'acceleration', 'foobar'],
            sizedAttachments: {
                position: SizedVec3Data(),
                velocity: SizedVec3Data(),
                acceleration: SizedVec3Data(),
                foobar: SizedData({
                    bytesPerElement: 2,
                    iv: {foo: 'bar'},
                    encode: (_x: { foo: 'bar' }) => new Uint8Array([0, 1]),
                    decode: (_view: DataView) => ({foo: 'hello'})
                })
            },
            integrationStages: ['accelIntegration', 'velocityIntegration', 'cullOOB']
        }),
    })
}
