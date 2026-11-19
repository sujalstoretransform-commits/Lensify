import { useState } from "react";
import type { Product } from "../types/product";
import Header from "./Header";
import ProductCard from "./ProductCard";
import TryOnCamera from "./TryOnCamera";

interface ProductListingProps {
    products: Product[];
}

export default function ProductListing({
    products,
}: ProductListingProps) {

    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
    const [isTryOnEnabled, setIsTryOnEnabled] = useState(false);

    return (
        <div className="min-h-screen bg-gray-50">
            <Header
                hasPhoto={Boolean(capturedPhoto)}
                isTryOnEnabled={isTryOnEnabled}
                onTryOnClick={() => setIsCameraOpen(true)}
                onToggleTryOn={() => setIsTryOnEnabled((previous) => !previous)}
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
                            <ProductCard key={product.id} product={product} />
                        ))}
                    </div>
                )}
            </main>

            {isCameraOpen && (
                <TryOnCamera
                    onClose={() => setIsCameraOpen(false)}
                    onCapture={(photo) => {
                        setCapturedPhoto(photo)
                        setIsTryOnEnabled(false)
                    }}
                />
            )}
        </div >

    );
}
