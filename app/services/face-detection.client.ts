import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import type { GlassesDetector } from "@framefind/core";

let faceLandmarker: Promise<FaceLandmarker> | undefined;
let glassesDetector: Promise<GlassesDetector> | undefined;

export const STRAIGHT_FACE_ERROR = "Please look straight at the camera and retake your photo.";

export const isStraightFace = (yaw: number) => Math.abs(yaw) < 0.3;

async function loadFaceLandmarker() {
    const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    )

    return FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: "/models/face_landmarker.task",
            delegate: "GPU"
        },
        runningMode: "IMAGE",
        numFaces: 2,
        outputFacialTransformationMatrixes: true,
    })

}

function getFaceLandmarker() {
    faceLandmarker ??= loadFaceLandmarker().catch((error) => {
        faceLandmarker = undefined;
        throw error;
    });
    return faceLandmarker;
}

export const detectFaces = async (image: HTMLImageElement) => {
    const landMarker = await getFaceLandmarker();
    return landMarker.detect(image);
}

type NormalizedLandmark = {
    x: number;
    y: number;
    z: number;
};

async function loadGlassesDetector() {
    const { GlassesDetector } = await import("@framefind/core");
    const detector = new GlassesDetector({
        modelUrl: "/models/glasses.onnx",
        // Vite bundles the WASM for production. Its dev optimizer rewrites module URLs.
        wasmPaths: import.meta.env.DEV
            ? "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/"
            : "",
        autoLandmarks: false,
        smoothingWindow: 1,
    });
    await detector.load();
    return detector;
}

function getGlassesDetector() {
    glassesDetector ??= loadGlassesDetector().catch((error) => {
        glassesDetector = undefined;
        throw error;
    });
    return glassesDetector;
}

export function preloadFaceDetection() {
    void Promise.allSettled([getFaceLandmarker(), getGlassesDetector()]);
}

export async function isWearingGlasses(image: HTMLImageElement, landmarks: NormalizedLandmark[]) {
    const detector = await getGlassesDetector();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Could not read the captured photo");
    context.drawImage(image, 0, 0);
    const result = await detector.detectFromCanvas(canvas, landmarks);
    return result.glasses;
}

export const getEyePositions = (
    landmarks: NormalizedLandmark[],
    imageWidth: number,
    imageHeight: number,
    faceMatrix?: ArrayLike<number>
) => {
    const toPixel = (point: NormalizedLandmark) => ({
        x: point.x * imageWidth,
        y: point.y * imageHeight,
        z: point.z * imageWidth,
    });

    // Face Landmarker returns normalized coordinates. Convert every point to
    // image pixels before combining them; mixing normalized and pixel values
    // shifts the glasses toward the top-left after capture.
    const leftEyeOuter = toPixel(landmarks[33]);
    const leftEyeInner = toPixel(landmarks[133]);
    const rightEyeInner = toPixel(landmarks[362]);
    const rightEyeOuter = toPixel(landmarks[263]);

    const leftEye = {
        x: (leftEyeOuter.x + leftEyeInner.x) / 2,
        y: (leftEyeOuter.y + leftEyeInner.y) / 2,
        z: (leftEyeOuter.z + leftEyeInner.z) / 2,
    };

    const rightEye = {
        x: (rightEyeInner.x + rightEyeOuter.x) / 2,
        y: (rightEyeInner.y + rightEyeOuter.y) / 2,
        z: (rightEyeInner.z + rightEyeOuter.z) / 2,
    };

    const noseBridge = toPixel(landmarks[168]);
    const center = {
        x: noseBridge.x,
        y: (leftEye.y + rightEye.y) / 2,
    };

    const eyeDistance = Math.hypot(
        rightEye.x - leftEye.x,
        rightEye.y - leftEye.y
    );

    const rotation = Math.atan2(
        rightEye.y - leftEye.y,
        rightEye.x - leftEye.x
    );

    let yaw = Math.atan2(
        rightEye.z - leftEye.z,
        Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y)
    );
    let pitch = 0;

    // Face Landmarker matrices are column-major 4x4 transforms from the
    // canonical face to the detected face.
    if (faceMatrix && faceMatrix.length >= 16) {
        const rotationY = -faceMatrix[2];
        yaw = Math.asin(Math.max(-1, Math.min(1, rotationY)));
        pitch = Math.atan2(faceMatrix[6], faceMatrix[10]);
    }

    return {
        leftEye,
        rightEye,
        center,
        eyeDistance,
        rotation,
        yaw,
        pitch,
    }
}
