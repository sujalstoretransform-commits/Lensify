import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

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
