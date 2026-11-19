export interface Product {
  id: string;
  title: string;
  description: string;
  image: {
    url: string;
    altText: string | null;
  } | null;
  price: {
    amount: string;
    currencyCode: string;
  };
}
