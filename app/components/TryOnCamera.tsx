import { useEffect, useRef, useState } from "react";
import { detectFaces, getEyePositions } from "app/services/face-detection.client";

interface TryOnCameraProps {
    onClose: () => void;
    onCapture: (photo: string) => void;
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
    const [error, setError] = useState("")

    const [eyePoints, setEyePoints] = useState<{
        leftEye: { x: number; y: number };
        rightEye: { x: number; y: number };
    } | null>(null);

    const [imageWidth, setImageWidth] = useState(0);
    const [imageHeight, setImageHeight] = useState(0);
    const [faceLandmarks, setFaceLandmarks] = useState<Array<{ x: number; y: number }>>([]);

    useEffect(() => {
        let cancelled = false;

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

                const video = videoRef.current;

                if (!video) {
                    throw new Error("Camera preview could not be initialized.");
                }

                video.srcObject = stream;

                await new Promise<void>((resolve, reject) => {
                    video.onloadedmetadata = () => {
                        video.play().then(resolve).catch(reject);
                    }
                    video.onerror = () => reject(new Error("Unable to display camera preview."))
                })

                if (!cancelled) {
                    setLoading(false);
                }
            } catch (err) {
                if (cancelled) return;

                const cameraError = err as DOMException;

                if (cameraError.name === "NotAllowedError") {
                    setError(
                        "Camera permission denied. Allow camera access in your browser settings and reload Lensify.",
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
        }
    }, [])


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

            await new Promise<void>((resolve, reject) => {
                image.onload = () => resolve();
                image.onerror = () => reject(new Error("Could not load captured photo."))
            })

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
            )

            setEyePoints({
                leftEye: position.leftEye,
                rightEye: position.rightEye
            })
            setFaceLandmarks(
                landmarks.map((landmark) => ({
                    x: landmark.x * image.naturalWidth,
                    y: landmark.y * image.naturalHeight,
                }))
            );

            setImageWidth(image.naturalWidth);
            setImageHeight(image.naturalHeight);

        } catch (error) {
            console.error("Face detection failed:", error);
            setError("Face detection failed. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">
                            Try on your glasses
                        </h2>
                        <p className="mt-1 text-xs text-gray-500">
                            Position your face in the camera frame.
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
                        <p className="text-sm text-white">Starting camera...</p>
                    )}

                    {error && (
                        <div className="max-w-md px-6 py-10 text-center">
                            <p className="text-sm leading-6 text-red-300">{error}</p>
                        </div>
                    )}

                    {!error && (
                        <>
                            <video
                                ref={videoRef}
                                autoPlay
                                muted
                                playsInline
                                className={`max-h-[65vh] w-full rounded-lg object-contain ${photo ? "hidden" : ""
                                    }`}
                                style={{ transform: "scaleX(-1)" }}
                            />

                            {photo && (
                                <div className="relative inline-block max-w-full">
                                    <img
                                        src={photo}
                                        alt="Your captured photo"
                                        className="block max-h-[65vh] w-auto max-w-full rounded-lg object-contain"
                                        onLoad={(event) => {
                                            setImageWidth(event.currentTarget.naturalWidth)
                                            setImageHeight(event.currentTarget.naturalHeight)
                                        }}
                                    />

                                    {faceLandmarks.length > 0 && (
                                        <svg
                                            aria-hidden="true"
                                            className="pointer-events-none absolute inset-0 h-full w-full"
                                            viewBox={`0 0 ${imageWidth} ${imageHeight}`}
                                            preserveAspectRatio="none"
                                        >
                                            {faceLandmarks.map((point, index) => (
                                                <circle
                                                    key={index}
                                                    cx={point.x}
                                                    cy={point.y}
                                                    r={Math.max(2, imageWidth * 0.0018)}
                                                    fill="#5eead4"
                                                    fillOpacity="0.65"
                                                />
                                            ))}
                                        </svg>
                                    )}

                                    {eyePoints && imageWidth > 0 && imageHeight > 0 && (
                                        <>
                                            <div
                                                className="absolute h-4 w-4 rounded-full border-2 border-white bg-green-500"
                                                style={{
                                                    left: `${(eyePoints.leftEye.x / imageWidth) * 100}%`,
                                                    top: `${(eyePoints.leftEye.y / imageHeight) * 100}%`,
                                                    transform: "translate(-50%, -50%)",
                                                }}
                                            />

                                            <div
                                                className="absolute h-4 w-4 rounded-full border-2 border-white bg-green-500"
                                                style={{
                                                    left: `${(eyePoints.rightEye.x / imageWidth) * 100}%`,
                                                    top: `${(eyePoints.rightEye.y / imageHeight) * 100}%`,
                                                    transform: "translate(-50%, -50%)",
                                                }}
                                            />
                                        </>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="flex flex-wrap items-center justify-center gap-3 px-6 py-5">
                    {photo ? (
                        <>
                            <button
                                type="button"
                                onClick={() => {
                                    setPhoto(null)
                                    setEyePoints(null)
                                    setFaceLandmarks([])
                                    setError("")
                                }}
                                className="rounded-full border border-gray-300 px-6 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                            >
                                Retake Photo
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    if (eyePoints) {
                                        onCapture(photo!)
                                        closeCamera();
                                    } else {
                                        handleUsePhoto();
                                    }
                                }}
                                disabled={loading}
                                className="rounded-full bg-teal-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-teal-800"
                            >
                                {loading ? "Checking face..." : eyePoints ? "Confirm Photo" : "Check Face"}
                            </button>
                        </>
                    ) : (
                        <button
                            type="button"
                            onClick={capturePhoto}
                            disabled={loading || Boolean(error)}
                            className="rounded-full bg-teal-700 px-7 py-3 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            Capture Photo
                        </button>
                    )}
                </div>
            </div>
        </div >
    );
}
