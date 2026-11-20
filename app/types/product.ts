export interface Product {
  id: string;
  title: string;
  description: string;
  image: {
    url: string;
    altText: string | null;
  } | null;
  images?: Array<{
    url: string;
    altText: string | null;
  }>;
  price: {
    amount: string;
    currencyCode: string;
  };
  tryOnImageUrl?: string | null;
}
