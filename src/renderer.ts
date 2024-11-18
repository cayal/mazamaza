/* eslint-disable */
/* @ts-nocheck */
// noinspection BadExpressionStatementJS,CommaExpressionJS

import './index.css'
import { MakeDebugInfo, MakeModalUI, MakePointerPane, MakeCanvasDisplay2D } from "./customElements/customElements";
// import { CanvasDisplayWebGPU } from "./customElements/canvasDisplayWebGPU";
import { MakeDynamicsIntegrator  } from "./stateIntegrators/dynamicsIntegrator";
import {MakeAppState} from "./appState";

const appState = MakeAppState().then(appState => {

    customElements.define('pointer-pane', MakePointerPane(appState));
    customElements.define('debug-info', MakeDebugInfo(appState));
    customElements.define('modal-ui', MakeModalUI(appState));
    customElements.define('canvas-display', MakeCanvasDisplay2D(appState));

    MakeDynamicsIntegrator(appState);
})