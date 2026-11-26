import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export async function action({ request }: ActionFunctionArgs) {
    const { session } = await authenticate.public.appProxy(request);
    if (!session) return new Response(null, { status: 403 });

    const body = await request.text();
    if (body.length > 8192) return new Response(null, { status: 413 });
    let entry;
    try {
        entry = JSON.parse(body);
    } catch {
        return new Response(null, { status: 400 });
    }
    if (!entry || !["ready", "failed", "no-images", "unsupported-gallery"].includes(entry.status)
        || !Array.isArray(entry.images) || !Array.isArray(entry.errors)) {
        return new Response(null, { status: 400 });
    }

    const productId = /^\d{1,20}$/.test(entry.productId) ? String(entry.productId) : undefined;
    const images = entry.images.slice(0, 5).flatMap((source: unknown) => {
        if (typeof source !== "string" || !URL.canParse(source)) return [];
        const url = new URL(source);
        return url.protocol === "https:" ? [`${url.origin}${url.pathname}`.slice(0, 512)] : [];
    });
    const errors = entry.errors.slice(0, 10).filter((error: unknown) => typeof error === "string")
        .map((error: string) => error.slice(0, 240));
    console.info("[lensify-preview]", JSON.stringify({
        shop: session.shop, productId, status: entry.status, images, errors,
    }));
    return new Response(null, { status: 204 });
}

export async function loader({ request }: LoaderFunctionArgs) {
    await authenticate.public.appProxy(request);

    const appUrl = process.env.SHOPIFY_APP_URL;
    if (!appUrl || !URL.canParse(appUrl) || new URL(appUrl).protocol !== "https:") {
        return Response.json({ error: "Try-on is unavailable." }, {
            status: 503,
            headers: { "Cache-Control": "no-store" },
        });
    }

    return Response.json({ cameraUrl: new URL("/storefront/try-on", appUrl).href }, {
        headers: { "Cache-Control": "no-store" },
    });
}
