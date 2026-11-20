import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision"

let faceLandmarker: FaceLandmarker | null = null;

export const getFaceLandmarker = async () => {
    if (faceLandmarker) return faceLandmarker;

    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    )

    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: "/models/face_landmarker.task",
            delegate: "GPU"
        },
        runningMode: "IMAGE",
        numFaces: 2,
        outputFacialTransformationMatrixes: true,
    })

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
    const noseTip = toPixel(landmarks[1]);

    const center = {
        x: noseBridge.x,
        y: (leftEye.y + rightEye.y) / 2,
    };

    const eyeDistance = Math.hypot(
        rightEye.x - leftEye.x,
        rightEye.y - leftEye.y
    );

    const faceLeft = toPixel(landmarks[234]);
    const faceRight = toPixel(landmarks[454]);
    const leftTemple = toPixel(landmarks[127]);
    const rightTemple = toPixel(landmarks[356]);
    const forehead = toPixel(landmarks[10]);
    const chin = toPixel(landmarks[152]);

    const cheekWidth = Math.hypot(
        faceRight.x - faceLeft.x,
        faceRight.y - faceLeft.y
    );
    const templeWidth = Math.hypot(
        rightTemple.x - leftTemple.x,
        rightTemple.y - leftTemple.y
    );
    const faceHeight = Math.hypot(
        chin.x - forehead.x,
        chin.y - forehead.y
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
        noseBridge,
        noseTip,
        faceWidth: cheekWidth,
        templeWidth,
        faceHeight,
        eyeDistance,
        rotation,
        yaw,
        pitch,
    }
}
