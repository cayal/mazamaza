export namespace CanvasSetup {
    export async function getWebGPUContext(canvas: HTMLCanvasElement): Promise<
    {
        context: GPUCanvasContext,
        device: GPUDevice
    }> {
        if (!navigator.gpu) {
            console.error("WebGPU not supported");
            throw new TypeError('WebGPU not supported');
        }

        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            console.error("Failed to get WebGPU adapter");
            throw new TypeError('Failed to get WebGPU adapter');
        }

        const device = await adapter.requestDevice();
        if (!device) {
            console.error("Failed to get WebGPU device");
            throw new TypeError('Failed to get WebGPU device');
        }

        let context = canvas.getContext('webgpu');

        const canvasConfig = {
            device: device,
            format: navigator.gpu.getPreferredCanvasFormat(),
            usage:
                GPUTextureUsage.RENDER_ATTACHMENT,
            alphaMode: 'opaque' as GPUCanvasAlphaMode
        };

        context.configure(canvasConfig);

        return {
            device: device,
            context: context
        }
    }    
}