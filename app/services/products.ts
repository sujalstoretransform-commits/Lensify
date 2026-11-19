import type { authenticate } from "../shopify.server";
import { fetchProducts } from "app/dao/products";

type Admin = Awaited<ReturnType<typeof authenticate.admin>>["admin"];

export async function getProducts(admin: Admin) {
    return await fetchProducts(admin);
}