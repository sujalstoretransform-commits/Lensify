import type { FaceGeometry } from "../types/face-geometry";

export function getGlassesFit(face: FaceGeometry) {
    return {
        left: `${(face.center.x / face.imageWidth) * 100}%`,
        anchorTop: (face.center.y / face.imageHeight) * 100,
        width: `${(face.eyeDistance * 2.35 / Math.max(0.65, Math.cos(face.yaw)) / face.imageWidth) * 100}%`,
        transform: `translate(-50%, -40%) perspective(700px) rotateX(${face.pitch}rad) rotateY(${face.yaw}rad) rotate(${face.rotation}rad)`,
    };
}
