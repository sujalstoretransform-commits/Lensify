import type { FaceGeometry } from "../types/face-geometry";

export function getGlassesFit(face: FaceGeometry) {
    return {
        left: `${(face.center.x / face.imageWidth) * 100}%`,
        top: `${(face.center.y / face.imageHeight) * 103.5}%`,
        width: `${(face.eyeDistance * 2.35 / Math.max(0.65, Math.cos(face.yaw)) / face.imageWidth) * 100}%`,
        transform: `translate(-50%, -50%) perspective(700px) rotateX(${face.pitch}rad) rotateY(${face.yaw}rad) rotate(${face.rotation}rad)`,
    };
}
