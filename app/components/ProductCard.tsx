import type { Product } from "../types/product";

interface ProductCardProps {
  product: Product;
  capturedPhoto: string | null;
  isTryOnEnabled: boolean;
}

export default function ProductCard({
  product,
  capturedPhoto,
  isTryOnEnabled,
}: ProductCardProps
) {
  const formattedPrice = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: product.price.currencyCode,
  }).format(Number(product.price.amount));

  const imageToShow =
    isTryOnEnabled && capturedPhoto
      ? capturedPhoto
      : product.image?.url

  return (
    <article className="overflow-hidden rounded-xl border border-gray-200 bg-white transition-shadow duration-200 hover:shadow-md">
      <div className="aspect-square w-full overflow-hidden bg-gray-100">
        {imageToShow ? (
          <img
            src={imageToShow}
            alt={
              isTryOnEnabled && capturedPhoto
                ? "Your captured photo"
                : product.image?.altText || product.title
            }
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
          />
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
