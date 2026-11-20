export interface FacePoint {
  x: number;
  y: number;
  z: number;
}


export interface FaceGeometry {
  center: {
    x: number;
    y: number;
  };
  eyeDistance: number;
  faceWidth: number;
  templeWidth: number;
  faceHeight: number;
  rotation: number;
  yaw: number;
  pitch: number;
  imageWidth: number;
  imageHeight: number;
}
