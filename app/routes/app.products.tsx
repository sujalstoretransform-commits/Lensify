import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getProducts } from "app/services/products";
import ProductListing from "app/components/ProductListing";

export async function loader({ request }: LoaderFunctionArgs) {
    const { admin } = await authenticate.admin(request)

    const products = await getProducts(admin)

    return { products }
}

export default function ProductPage() {
    const { products } = useLoaderData<typeof loader>();

    return <ProductListing products={products} />
}