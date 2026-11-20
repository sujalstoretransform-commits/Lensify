import type { authenticate } from '../shopify.server'

type Admin = Awaited<ReturnType<typeof authenticate.admin>>["admin"];

interface ProductNode {
    id: string;
    title: string;
    description: string;
    media: {
        nodes: Array<{
            alt: string | null;
            image: {
                url: string;
                altText: string | null;
            } | null;
        }>;
    };
    priceRangeV2: {
        minVariantPrice: {
            amount: string;
            currencyCode: string;
        };
    };
}

interface GetProductsResponse {
    data?: {
        products: {
            edges: Array<{
                cursor: string;
                node: ProductNode;
            }>;
            pageInfo: {
                hasNextPage: boolean;
                endCursor: string | null;
            };
        };
    };
    errors?: Array<{ message: string }>;
}

export interface FormattedProduct {
    id: string;
    title: string;
    description: string;
    image: {
        url: string;
        altText: string | null;
    } | null;
    images: Array<{
        url: string;
        altText: string | null;
    }>;
    price: {
        amount: string;
        currencyCode: string;
    };
}

const PRODUCTS_QUERY = `#graphql
  query GetProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      edges {
        cursor
        node {
          id
          title
          description
          media(first: 4, query: "media_type:IMAGE", sortKey: POSITION) {
            nodes {
              alt
              ... on MediaImage {
                image {
                  url
                  altText
                }
              }
            }
          }
          priceRangeV2 {
            minVariantPrice {
              amount
              currencyCode
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export async function fetchProducts(admin: Admin): Promise<FormattedProduct[]> {
    const products: FormattedProduct[] = [];
    let hasNextPage = true;
    let cursor: string | null = null

    while (hasNextPage) {
        const response = await admin.graphql(PRODUCTS_QUERY, {
            variables: {
                first: 250,
                after: cursor,
            },
        })

        const result = (await response.json()) as GetProductsResponse;

        if (result.errors?.length) {
            throw new Error("Failed to fetch products from Shopify");
        }

        const connection = result.data?.products
        if (!connection) {
            break;
        }

        products.push(
            ...connection.edges.map(({ node }: { node: ProductNode }): FormattedProduct => {
                const images = node.media.nodes.flatMap(({ alt, image }) =>
                    image
                        ? [{
                            url: image.url,
                            altText: image.altText ?? alt,
                        }]
                        : []
                );

                return {
                    id: node.id,
                    title: node.title,
                    description: node.description,
                    image: images[0] ?? null,
                    images,
                    price: {
                        amount: node.priceRangeV2.minVariantPrice.amount,
                        currencyCode: node.priceRangeV2.minVariantPrice.currencyCode,
                    },
                };
            }),
        );
        hasNextPage = connection.pageInfo.hasNextPage;
        cursor = connection.pageInfo.endCursor;
    }
    return products;
} 
