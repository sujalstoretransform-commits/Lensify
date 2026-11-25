import { useEffect, useRef, useState } from "react";
import { detectFaces, getEyePositions, isStraightFace, isWearingGlasses, preloadFaceDetection, STRAIGHT_FACE_ERROR } from "app/services/face-detection.client";
import type { FaceGeometry } from "../types/face-geometry";

interface TryOnCameraProps {
    onClose: () => void;
    onCapture: (photo: string, geometry: FaceGeometry) => void;
}

export default function TryOnCamera({
    onClose,
    onCapture,
}: TryOnCameraProps
) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const [photo, setPhoto] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [cameraAttempt, setCameraAttempt] = useState(0);
    const [error, setError] = useState("")

    const [faceCheck, setFaceCheck] = useState<{
        eyes: { x: number; y: number }[];
        geometry: FaceGeometry;
        landmarks: { x: number; y: number }[];
    } | null>(null);

    useEffect(() => {
        let cancelled = false;
        const video = videoRef.current;

        const startCamera = async () => {
            try {
                if (!navigator.mediaDevices?.getUserMedia) {
                    throw new Error("Camera access is not supported by this browser.");
                }

                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: "user",
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                    },
                    audio: false,
                })

                if (cancelled) {
                    stream.getTracks().forEach((track) => track.stop())
                    return;
                }

                streamRef.current = stream

                if (!video) {
                    throw new Error("Camera preview could not be initialized.");
                }

                video.srcObject = stream;

                await video.play();

                if (!cancelled) {
                    setLoading(false);
                    preloadFaceDetection();
                }
            } catch (err) {
                if (cancelled) return;

                streamRef.current?.getTracks().forEach((track) => track.stop());
                streamRef.current = null;
                if (video) video.srcObject = null;

                const cameraError = err as DOMException;

                if (cameraError.name === "NotAllowedError") {
                    setError(
                        "Camera permission denied. Allow camera access in your browser settings, then retry.",
                    );
                } else if (cameraError.name === "NotFoundError") {
                    setError("No camera was found on this device.");
                } else if (cameraError.name === "NotReadableError") {
                    setError("Your camera may already be in use by another application.");
                } else {
                    setError(
                        err instanceof Error
                            ? err.message
                            : "Unable to access your camera.",
                    );
                }
                setLoading(false);
            }
        }

        startCamera();

        return () => {
            cancelled = true;
            streamRef.current?.getTracks().forEach((track) => track.stop())
            streamRef.current = null;
            if (video) video.srcObject = null;
        }
    }, [cameraAttempt])

    const retryCamera = () => {
        setError("");
        setLoading(true);
        setCameraAttempt((attempt) => attempt + 1);
    };


    const capturePhoto = () => {
        const video = videoRef.current

        if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
            setError("Camera is not ready. Please wait and try again.");
            return;
        }

        const canvas = document.createElement("canvas")
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight

        const context = canvas.getContext("2d")

        if (!context) {
            setError("Unable to capture photo. Please try again.");
            return;
        }

        context.translate(canvas.width, 0)
        context.scale(-1, 1)
        context.drawImage(video, 0, 0, canvas.width, canvas.height)

        setPhoto(canvas.toDataURL("image/jpeg", 0.9))
        setError("");
    }

    const closeCamera = () => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        onClose();
    }

    const handleUsePhoto = async () => {
        if (!photo) return;

        try {
            setLoading(true);
            setError("");

            const image = new Image()

            image.src = photo;
            await image.decode();

            const result = await detectFaces(image)
            const faceCount = result.faceLandmarks.length;

            if (faceCount === 0) {
                setError("No face detected. Please capture your face clearly again.");
                return;
            }

            if (faceCount > 1) {
                setError("Multiple faces detected. Please capture only your face.");
                return;
            }

            const landmarks = result.faceLandmarks[0]

            const position = getEyePositions(
                landmarks,
                image.naturalWidth,
                image.naturalHeight,
                result.facialTransformationMatrixes?.[0]?.data,
            )

            if (!isStraightFace(position.yaw)) {
                setError(STRAIGHT_FACE_ERROR);
                return;
            }

            if (await isWearingGlasses(image, landmarks)) {
                setError("Please remove your glasses and retake your photo.");
                return;
            }

            setFaceCheck({
                eyes: [position.leftEye, position.rightEye],
                geometry: {
                    center: position.center,
                    eyeDistance: position.eyeDistance,
                    rotation: position.rotation,
                    yaw: position.yaw,
                    pitch: position.pitch,
                    imageWidth: image.naturalWidth,
                    imageHeight: image.naturalHeight,
                },
                landmarks: landmarks.map((landmark) => ({
                    x: landmark.x * image.naturalWidth,
                    y: landmark.y * image.naturalHeight,
                })),
            });

        } catch (error) {
            console.error("Face detection failed:", error);
            setError("Face detection failed. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">
                            Try on your glasses
                        </h2>
                        <p className="mt-1 text-xs text-gray-500">
                            Remove your glasses and look straight at the camera.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={closeCamera}
                        aria-label="Close camera"
                        className="rounded-full p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
                    >
                        ✕
                    </button>
                </div>

                <div className="relative flex min-h-64 items-center justify-center bg-gray-950 p-3">
                    {loading && !error && (
                        <p className="text-sm text-white">{photo ? "Checking photo..." : "Starting camera..."}</p>
                    )}

                    {error && (
                        <div className="max-w-md px-6 py-10 text-center">
                            <p role="alert" className="text-sm leading-6 text-red-300">{error}</p>
                        </div>
                    )}

                    <video
                        ref={videoRef}
                        autoPlay
                        muted
                        playsInline
                        className={`max-h-[65vh] w-full rounded-lg object-contain ${photo || error ? "hidden" : ""
                            }`}
                        style={{ transform: "scaleX(-1)" }}
                    />

                    {photo && !error && (
                        <div className="relative inline-block max-w-full">
                            <img
                                src={photo}
                                alt="Your camera capture"
                                className="block max-h-[65vh] w-auto max-w-full rounded-lg object-contain"
                            />

                            {faceCheck && (
                                <svg
                                    aria-hidden="true"
                                    className="pointer-events-none absolute inset-0 h-full w-full"
                                    viewBox={`0 0 ${faceCheck.geometry.imageWidth} ${faceCheck.geometry.imageHeight}`}
                                    preserveAspectRatio="none"
                                >
                                    {faceCheck.landmarks.map((point, index) => (
                                        <circle
                                            key={index}
                                            cx={point.x}
                                            cy={point.y}
                                            r={Math.max(2, faceCheck.geometry.imageWidth * 0.0018)}
                                            fill="#5eead4"
                                            fillOpacity="0.65"
                                        />
                                    ))}
                                </svg>
                            )}

                            {faceCheck?.eyes.map((eye, index) => (
                                <div
                                    key={index}
                                    className="absolute h-4 w-4 rounded-full border-2 border-white bg-green-500"
                                    style={{
                                        left: `${(eye.x / faceCheck.geometry.imageWidth) * 100}%`,
                                        top: `${(eye.y / faceCheck.geometry.imageHeight) * 100}%`,
                                        transform: "translate(-50%, -50%)",
                                    }}
                                />
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex flex-wrap items-center justify-center gap-3 px-6 py-5">
                    {photo ? (
                        <>
                            <button
                                type="button"
                                disabled={loading}
                                onClick={() => {
                                    setPhoto(null)
                                    setFaceCheck(null)
                                    setError("")
                                }}
                                className="rounded-full border border-gray-300 px-6 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                            >
                                Retake Photo
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    if (faceCheck) {
                                        onCapture(photo, faceCheck.geometry)
                                        closeCamera();
                                    } else {
                                        handleUsePhoto();
                                    }
                                }}
                                disabled={loading}
                                className="rounded-full bg-teal-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-teal-800"
                            >
                                {loading ? "Checking face..." : faceCheck ? "Confirm Photo" : "Check Face"}
                            </button>
                        </>
                    ) : (
                        <button
                            type="button"
                            onClick={error ? retryCamera : capturePhoto}
                            disabled={loading}
                            className="rounded-full bg-teal-700 px-7 py-3 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {error ? "Retry Camera" : "Capture Photo"}
                        </button>
                    )}
                </div>
            </div>
        </div >
    );
}
