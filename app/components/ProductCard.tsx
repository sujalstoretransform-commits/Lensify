import { useEffect, useState } from "react";
import type { Product } from "../types/product";
import type { FaceGeometry } from "../types/face-geometry";
import { extractGlasses } from "../services/glasses-extraction.client";

interface ProductCardProps {
  product: Product;
  capturedPhoto: string | null;
  isTryOnEnabled: boolean;
  faceGeometry: FaceGeometry | null;
}

export default function ProductCard({
  product,
  capturedPhoto,
  isTryOnEnabled,
  faceGeometry,
}: ProductCardProps
) {
  const [tryOnImage, setTryOnImage] = useState<string | null>(null);
  const formattedPrice = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: product.price.currencyCode,
  }).format(Number(product.price.amount));

  const showTryOn = isTryOnEnabled && Boolean(capturedPhoto);
  const productViews = product.images?.length
    ? product.images
    : product.image
      ? [product.image]
      : [];
  const alternateImage = product.images?.find(
    (image) => image.url !== product.image?.url
  );
  const faceYaw = faceGeometry?.yaw ?? 0;
  const requestedViewIndex = Math.abs(faceYaw) < 0.3 ? 0 : faceYaw > 0 ? 2 : 1;
  const viewIndex = productViews[requestedViewIndex] ? requestedViewIndex : 0;
  const tryOnSourceImage = productViews[viewIndex] ?? product.image;
  const sourceViewYaw = viewIndex === 1 ? -Math.PI / 4 : viewIndex === 2 ? Math.PI / 4 : 0;
  const remainingYaw = faceYaw - sourceViewYaw;
  const softenedStick = viewIndex === 0 ? "both" : viewIndex === 2 ? "right" : "left";

  useEffect(() => {
    let cancelled = false;
    let extractedImageUrl: string | null = null;

    setTryOnImage(null);
    if (!showTryOn || !tryOnSourceImage?.url) return;

    extractGlasses(tryOnSourceImage.url, softenedStick)
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        extractedImageUrl = url;
        if (cancelled) {
          URL.revokeObjectURL(url);
        } else {
          setTryOnImage(url);
        }
      })
      .catch((error) => {
        console.error("Could not prepare product image for try-on:", error);
      });

    return () => {
      cancelled = true;
      if (extractedImageUrl) URL.revokeObjectURL(extractedImageUrl);
    };
  }, [showTryOn, tryOnSourceImage?.url, softenedStick]);

  const overlayWidth = faceGeometry
    ? (faceGeometry.eyeDistance * 2.35 / Math.max(0.65, Math.cos(remainingYaw)) / faceGeometry.imageWidth) * 100
    : 0;

  const overlayLeft = faceGeometry
    ? (faceGeometry.center.x / faceGeometry.imageWidth) * 100.7
    : 0;

  const overlayTop = faceGeometry
    ? (faceGeometry.center.y / faceGeometry.imageHeight) * 103.5
    : 0;

   return (
    <article className="overflow-hidden rounded-xl border border-gray-200 bg-white transition-shadow hover:shadow-md">
      <div
        className="group relative aspect-square w-full overflow-hidden bg-gray-100"
        style={
          showTryOn && faceGeometry
            ? {
                aspectRatio: `${faceGeometry.imageWidth}/${faceGeometry.imageHeight}`,
              }
            : undefined
        }
      >
        {showTryOn ? (
          <>
            <img
              src={capturedPhoto!}
              alt="Your virtual try-on"
              className="block h-full w-full object-fill"
            />

            {faceGeometry && tryOnSourceImage?.url && tryOnImage && (
              <img
                src={tryOnImage}
                alt={`${product.title} try-on`}
                draggable={false}
                className="pointer-events-none absolute max-w-none"
                style={{
                  left: `${overlayLeft}%`,
                  top: `${overlayTop}%`,
                  width: `${overlayWidth}%`,
                  height: "auto",
                  transform: `translate(-50%, -50%) perspective(700px) rotateX(${faceGeometry.pitch}rad) rotateY(${remainingYaw}rad) rotate(${faceGeometry.rotation}rad)`,
                  transformOrigin: "center",
                }}
              />
            )}
          </>
        ) : product.image?.url ? (
          <>
            <img
              src={product.image.url}
              alt={product.image.altText || product.title}
              loading="lazy"
              className="h-full w-full object-cover transition-opacity duration-300"
            />
            {alternateImage && (
              <img
                src={alternateImage.url}
                alt={alternateImage.altText || `${product.title} alternate view`}
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              />
            )}
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            No image available
          </div>
        )}
      </div>

      <div className="space-y-2 p-4">
        <h3 className="line-clamp-1 text-base font-semibold text-gray-900">
          {product.title}
        </h3>

        <p className="text-sm font-semibold text-gray-800">
          {formattedPrice}
        </p>

        {product.description && (
          <p className="line-clamp-3 text-sm leading-relaxed text-gray-500">
            {product.description}
          </p>
        )}
      </div>
    </article>
  );
}
