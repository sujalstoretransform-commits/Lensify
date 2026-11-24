import { useCallback, useEffect, useRef, useState } from "react";
import { data, useLoaderData, type LoaderFunctionArgs, type HeadersFunction } from "react-router";
import TryOnCamera from "../components/TryOnCamera";
import type { extractFrontGlasses } from "../services/glasses-extraction.client";
import { getGlassesFit } from "../services/glasses-fit";
import type { FaceGeometry } from "../types/face-geometry";

type StorefrontFrame = { id: string; images: Parameters<typeof extractFrontGlasses>[0] };

function isStorefrontFrame(value: unknown): value is StorefrontFrame {
    if (!value || typeof value !== "object" || !("images" in value) || !("id" in value)) return false;
    return typeof value.id === "string" && /^\d+$/.test(value.id)
        && Array.isArray(value.images) && value.images.length > 0 && value.images.length <= 5
        && value.images.every((image) => image && typeof image.imageUrl === "string"
            && /^https:\/\/[^/]/i.test(image.imageUrl) && typeof image.labeledFront === "boolean");
}

export function loader({ request }: LoaderFunctionArgs) {
    const origin = new URL(request.url).searchParams.get("origin");
    const storefrontOrigin = origin && /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(origin) ? origin : null;
    return data({ storefrontOrigin }, {
        headers: {
            "Cache-Control": "no-store",
            "Content-Security-Policy": storefrontOrigin
                ? `frame-ancestors 'self' ${storefrontOrigin}`
                : "frame-ancestors 'self'",
        },
    });
}

export const headers: HeadersFunction = ({ loaderHeaders }) => loaderHeaders;

export default function StorefrontTryOn() {
    const { storefrontOrigin } = useLoaderData<typeof loader>();
    const [frames, setFrames] = useState<StorefrontFrame[] | null>();
    const [status, setStatus] = useState("");
    const captureAccepted = useRef(false);

    const closeModal = useCallback(() => {
        if (storefrontOrigin) {
            window.parent.postMessage({ type: "LENSIFY_STOREFRONT_CANCEL" }, storefrontOrigin);
        }
    }, [storefrontOrigin]);

    useEffect(() => {
        if (!storefrontOrigin || window.parent === window) {
            setFrames(null);
            return;
        }

        const receiveCatalog = (event: MessageEvent) => {
            if (event.origin !== storefrontOrigin || event.source !== window.parent) return;
            if (event.data?.type !== "LENSIFY_STOREFRONT_CATALOG") return;
            window.removeEventListener("message", receiveCatalog);
            const catalog: unknown = event.data.catalog;
            setFrames(Array.isArray(catalog) && catalog.length <= 2500 && catalog.every(isStorefrontFrame) ? catalog : null);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") closeModal();
        };
        window.addEventListener("message", receiveCatalog);
        window.addEventListener("keydown", closeOnEscape);
        window.parent.postMessage({ type: "LENSIFY_STOREFRONT_READY" }, storefrontOrigin);
        return () => {
            window.removeEventListener("message", receiveCatalog);
            window.removeEventListener("keydown", closeOnEscape);
        };
    }, [closeModal, storefrontOrigin]);

    function preparePreviews(photo: string, geometry: FaceGeometry) {
        if (!storefrontOrigin || !frames) return;
        captureAccepted.current = true;
        setStatus("Preparing try-on previews…");
        window.parent.postMessage({
            type: "LENSIFY_STOREFRONT_PREVIEWS",
            photo,
            aspectRatio: geometry.imageWidth / geometry.imageHeight,
            fit: getGlassesFit(geometry),
            overlays: [],
        }, storefrontOrigin);
    }

    if (frames?.length && !status && storefrontOrigin) {
        return (
            <TryOnCamera
                showBackdrop={false}
                onCapture={preparePreviews}
                onClose={() => {
                    if (!captureAccepted.current) closeModal();
                }}
            />
        );
    }

    return (
        <main className="grid min-h-screen place-items-center p-4">
            <div className="w-full max-w-sm rounded-xl bg-white p-5 text-slate-800 shadow-lg">
                <div className="flex items-center justify-between gap-4">
                    <h1 className="text-base font-semibold">Lensify Try-On</h1>
                    {storefrontOrigin && (
                        <button type="button" onClick={closeModal} className="rounded-full border border-slate-300 px-3 py-1 text-sm">
                            Close
                        </button>
                    )}
                </div>
                <p className="mt-3 text-sm" role="status">
                    {status || (storefrontOrigin && frames === undefined
                        ? "Loading try-on…"
                        : "Open Lensify using the try-on button on the store.")}
                </p>
            </div>
        </main>
    );
}
