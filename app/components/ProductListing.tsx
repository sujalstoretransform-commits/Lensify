import { useEffect, useRef, useState } from "react";
import type { Product } from "../types/product";
import Header from "./Header";
import ProductCard from "./ProductCard";
import { detectFaces, getEyePositions, isStraightFace, STRAIGHT_FACE_ERROR } from "../services/face-detection.client";
import type { FaceGeometry } from "../types/face-geometry";

interface ProductListingProps {
    products: Product[];
}

export default function ProductListing({
    products,
}: ProductListingProps) {
    const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
    const [isTryOnEnabled, setIsTryOnEnabled] = useState(false);
    const [faceGeometry, setFaceGeometry] = useState<FaceGeometry | null>(null);
    const [faceError, setFaceError] = useState("");

    const tryOnWindowRef = useRef<Window | null>(null);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return;
            if (event.source !== tryOnWindowRef.current) return;

            const data = event.data as {
                type?: string;
                photo?: string;
            };

            if (
                data?.type !== "LENSIFY_PHOTO_CAPTURED" ||
                typeof data.photo !== "string"
            ) {
                return;
            }

            setCapturedPhoto(data.photo);
            setIsTryOnEnabled(false);
            setFaceGeometry(null);
            setFaceError("");

            tryOnWindowRef.current?.close();
            tryOnWindowRef.current = null;
        };

        window.addEventListener("message", handleMessage);

        return () => {
            window.removeEventListener("message", handleMessage);
        };
    }, []);

    // Calculate face geometry from the captured photo.
    useEffect(() => {
        if (!capturedPhoto) return;

        let cancelled = false;

        const calculateFaceGeometry = async () => {
            try {
                const image = new Image();

                await new Promise<void>((resolve, reject) => {
                    image.onload = () => resolve();
                    image.onerror = () =>
                        reject(new Error("Could not load captured photo."));

                    image.src = capturedPhoto;
                });

                const result = await detectFaces(image);

                if (cancelled) return;

                if (result.faceLandmarks.length !== 1) {
                    setIsTryOnEnabled(false);
                    setFaceError("Please capture a photo with exactly one face.");
                    return;
                }

                const positions = getEyePositions(
                    result.faceLandmarks[0],
                    image.naturalWidth,
                    image.naturalHeight,
                    result.facialTransformationMatrixes?.[0]?.data
                );

                if (!isStraightFace(positions.yaw)) {
                    setFaceError(STRAIGHT_FACE_ERROR);
                    return;
                }

                setFaceGeometry({
                    center: positions.center,
                    eyeDistance: positions.eyeDistance,
                    faceWidth: positions.faceWidth,
                    templeWidth: positions.templeWidth,
                    faceHeight: positions.faceHeight,
                    rotation: positions.rotation,
                    yaw: positions.yaw,
                    pitch: positions.pitch,
                    imageWidth: image.naturalWidth,
                    imageHeight: image.naturalHeight,
                });
            } catch (error) {
                console.error("Face geometry calculation failed:", error);
                if (!cancelled) {
                    setFaceError("Unable to calculate face position. Please retake your photo.");
                }
            }
        };

        calculateFaceGeometry();

        return () => {
            cancelled = true;
        };
    }, [capturedPhoto]);

    const openTryOnCamera = () => {
        const cameraWindow = window.open("/tryon", "_blank");

        if (!cameraWindow) {
            alert("Please allow pop-ups for Lensify to open the camera.");
            return;
        }

        tryOnWindowRef.current = cameraWindow;
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <Header
                hasPhoto={Boolean(capturedPhoto)}
                isTryOnAvailable={Boolean(faceGeometry)}
                isTryOnEnabled={isTryOnEnabled}
                onTryOnClick={openTryOnCamera}
                onToggleTryOn={() =>
                    setIsTryOnEnabled((previous) => !previous)
                }
            />

            <main className="w-full px-4 py-6 md:px-6">
                <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
                            Products
                        </h1>

                        <p className="mt-1 text-sm text-gray-500">
                            Browse eyewear products from your Shopify store.
                        </p>
                    </div>

                    <span className="rounded-full bg-white px-4 py-2 text-sm font-medium text-gray-700 ring-1 ring-gray-200">
                        {products.length} products
                    </span>
                </div>

                {faceError && (
                    <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                        {faceError}
                    </p>
                )}

                {products.length === 0 ? (
                    <div className="rounded-xl border border-gray-200 bg-white px-6 py-16 text-center">
                        <h2 className="text-lg font-semibold text-gray-900">
                            No products found
                        </h2>
                        <p className="mt-2 text-sm text-gray-500">
                            Your store doesn't have any products yet.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                        {products.map((product) => (
                            <ProductCard
                                key={product.id}
                                product={product}
                                capturedPhoto={capturedPhoto}
                                isTryOnEnabled={isTryOnEnabled}
                                faceGeometry={faceGeometry}
                            />
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
